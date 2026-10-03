-- Private shop fields, part 1 of 2 (safe to apply before the app update).
--
-- campaigns is publicly readable (the join page needs the shop's name and
-- branding), but three of its columns must not be: the cashier code for extra
-- self-serve stamps, the owner-PIN hash and Stampfix's review note. Part 2
-- hides them from the browser roles; this part gets everything ready so that
-- nothing breaks when it does.

-- 1) The shop owner (or a Stampfix admin) reads their own private fields here.
create or replace function public.campaign_private(p_campaign uuid)
returns table (stamp_code text, rejection_reason text)
language sql
stable
security definer
set search_path = public
as $$
  select c.stamp_code, c.rejection_reason
    from public.campaigns c
   where c.id = p_campaign
     and (c.merchant_id = auth.uid() or public.is_platform_admin());
$$;
revoke all on function public.campaign_private(uuid) from public, anon;
grant execute on function public.campaign_private(uuid) to authenticated;

-- 2) The sign-up guard runs as the customer, so it may only read the shop
--    columns that stay public. Same logic as before, named columns instead of *.
create or replace function public.cards_customer_insert_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_camp record;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  select c.merchant_id, c.approval_status, c.offer_title, c.max_stamps, c.custom_icon
    into v_camp
    from public.campaigns c where c.id = new.campaign_id;
  if not found then
    raise exception 'This loyalty program is no longer available.' using errcode = 'P0001';
  end if;
  -- The shop's owner (adding a customer by hand) and platform admins keep
  -- full control over the new card.
  if v_camp.merchant_id = auth.uid() or public.is_platform_admin() then
    return new;
  end if;

  if coalesce(v_camp.approval_status, 'approved') <> 'approved' then
    raise exception 'This loyalty program isn''t open for sign-ups yet.' using errcode = 'P0001';
  end if;
  -- A blocked or deleted shop takes no new customers.
  if not public.merchant_takes_signups(v_camp.merchant_id) then
    raise exception 'This loyalty program is no longer available.' using errcode = 'P0001';
  end if;

  -- A customer's own new card always starts clean.
  new.customer_id := auth.uid();
  new.email := lower(coalesce(auth.email(), new.email));
  new.current_stamps := 0;
  new.rewards_redeemed := 0;
  new.status := 'ACTIVE';
  new.joined_at := now();
  new.deletion_requested_at := null;
  new.offer_title_snapshot := v_camp.offer_title;
  new.max_stamps_snapshot := v_camp.max_stamps;
  new.custom_icon_snapshot := v_camp.custom_icon;
  new.customer_code := null;        -- assigned by assign_customer_code_trigger
  new.recovery_code_hash := null;   -- set by trg_set_card_recovery
  new.apple_auth_token := null;
  new.passkit_last_updated := now();
  new.wallet_message := null;
  new.wallet_message_at := null;
  new.wallet_message_until := null;
  new.unsubscribe_token := gen_random_uuid();
  new.marketing_opt_out_at := null;
  if new.joined_at_location_id is not null and not exists (
    select 1 from public.locations l where l.id = new.joined_at_location_id and l.campaign_id = new.campaign_id
  ) then
    new.joined_at_location_id := null;
  end if;
  return new;
end $function$;

-- 3) Cashier-code guesses are limited: 5 tries per card per 15 minutes, then a
--    30-minute pause. A correct code resets the count. Otherwise unchanged.
create or replace function public.self_serve_stamp(p_campaign uuid, p_location uuid, p_lat double precision, p_lng double precision, p_email text default null::text, p_code text default null::text, p_count integer default 1, p_tz text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_campaign  public.campaigns%rowtype;
  v_card      public.cards%rowtype;
  v_loc       public.locations%rowtype;
  v_card_max  int;
  v_radius    int;
  v_dist      double precision;
  v_last      timestamptz;
  v_to_add    int;
  v_multi     boolean;
  v_cap       int;
  v_today     int;
  v_day_start timestamptz;
begin
  select * into v_campaign from public.campaigns where id = p_campaign;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if coalesce(v_campaign.stamping_mode, 'scanner') <> 'self_serve' then
    return jsonb_build_object('ok', false, 'error', 'self_serve_off');
  end if;
  -- A frozen, blocked or deleted shop gives out no stamps.
  if exists (select 1 from public.merchants m
              where m.id = v_campaign.merchant_id and coalesce(m.status, 'active') <> 'active') then
    return jsonb_build_object('ok', false, 'error', 'self_serve_off');
  end if;

  -- Where: the QR's location must belong to this shop, be open, and be on the map.
  select * into v_loc from public.locations where id = p_location and campaign_id = p_campaign;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if coalesce(v_loc.archived, false) then
    return jsonb_build_object('ok', false, 'error', 'location_archived');
  end if;
  if v_loc.latitude is null or v_loc.longitude is null then
    return jsonb_build_object('ok', false, 'error', 'no_location');
  end if;
  v_radius := coalesce(v_campaign.self_serve_radius, 100);
  v_dist := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - v_loc.latitude) / 2), 2)
    + cos(radians(v_loc.latitude)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_loc.longitude) / 2), 2)));
  if v_dist > v_radius then
    return jsonb_build_object('ok', false, 'error', 'too_far', 'distance', round(v_dist)::int, 'radius', v_radius);
  end if;

  -- Who: the signed-in customer's card, else the card under the given email.
  -- Locked so simultaneous taps are handled one after the other.
  if auth.uid() is not null then
    select * into v_card from public.cards
     where campaign_id = p_campaign and customer_id = auth.uid()
     order by (status = 'ACTIVE') desc, joined_at desc limit 1
     for update;
  end if;
  if v_card.id is null and p_email is not null and length(trim(p_email)) > 0 then
    select * into v_card from public.cards
     where campaign_id = p_campaign and lower(email) = lower(trim(p_email))
     order by (status = 'ACTIVE') desc, joined_at desc limit 1
     for update;
  end if;
  if v_card.id is null then return jsonb_build_object('ok', false, 'error', 'card_not_found'); end if;
  if v_card.status <> 'ACTIVE' then return jsonb_build_object('ok', false, 'error', 'card_inactive'); end if;

  v_card_max := coalesce(v_card.max_stamps_snapshot, v_campaign.max_stamps, 6);
  if v_card.current_stamps >= v_card_max then
    return jsonb_build_object('ok', false, 'error', 'card_full', 'currentStamps', v_card.current_stamps, 'maxStamps', v_card_max);
  end if;

  -- Stamps already collected today, in the shop's local day.
  begin
    v_day_start := date_trunc('day', now() at time zone coalesce(nullif(trim(p_tz), ''), 'UTC'))
                   at time zone coalesce(nullif(trim(p_tz), ''), 'UTC');
  exception when others then
    v_day_start := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  end;
  v_cap := coalesce(v_campaign.max_stamps_per_day, 1);
  select count(*) into v_today from public.activities
   where card_id = v_card.id and type = 'STAMP' and created_at >= v_day_start;

  v_multi := coalesce(p_count, 1) > 1 or (p_code is not null and length(trim(p_code)) > 0);

  if v_multi then
    -- Extra stamps for a group order: only with the code the cashier gives out.
    if coalesce(v_campaign.stamp_code, '') = '' then
      return jsonb_build_object('ok', false, 'error', 'no_code_set');
    end if;
    if not public.rate_limit_hit('stamp_code', v_card.id::text, 5, 900, 1800) then
      return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
    end if;
    if trim(coalesce(p_code, '')) <> v_campaign.stamp_code then
      return jsonb_build_object('ok', false, 'error', 'bad_code');
    end if;
    perform public.rate_limit_clear('stamp_code', v_card.id::text);
    v_to_add := least(greatest(coalesce(p_count, 1), 1), v_card_max - v_card.current_stamps);
  else
    select max(created_at) into v_last from public.activities where card_id = v_card.id and type = 'STAMP';
    if v_last is not null and v_last > now() - interval '45 minutes' then
      return jsonb_build_object('ok', false, 'error', 'cooldown', 'currentStamps', v_card.current_stamps, 'maxStamps', v_card_max);
    end if;
    if v_cap > 0 and v_today >= v_cap then
      return jsonb_build_object('ok', false, 'error', 'daily_cap', 'currentStamps', v_card.current_stamps, 'maxStamps', v_card_max);
    end if;
    v_to_add := 1;
  end if;

  update public.cards set current_stamps = current_stamps + v_to_add, updated_at = now()
   where id = v_card.id returning * into v_card;
  insert into public.activities (campaign_id, card_id, customer_name, type, location_id, source, reason, is_override)
    select p_campaign, v_card.id, v_card.customer_name, 'STAMP', p_location, 'self_serve',
           case when v_multi then 'Multiple purchases in one visit (cashier code)' end,
           v_multi and v_cap > 0 and v_today + g > v_cap
      from generate_series(1, v_to_add) as g;

  return jsonb_build_object('ok', true, 'currentStamps', v_card.current_stamps, 'maxStamps', v_card_max,
    'added', v_to_add, 'customerName', v_card.customer_name);
end $function$;
