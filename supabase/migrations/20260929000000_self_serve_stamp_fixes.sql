-- =====================================================================
-- Self-serve stamping fixes (self_serve_stamp).
--
--  * Daily limit. The shop's "max stamps per day" (campaigns.max_stamps_per_day,
--    0 = unlimited) was only enforced by the staff scanner; a self-serve
--    customer could collect a stamp every 45 minutes. A single tap now stops
--    at the limit ('daily_cap'). The day is the shop's local day: the page
--    sends the phone's time zone (the customer is at the shop), UTC if absent.
--    A cashier's 4-digit code still adds stamps past the limit (group orders);
--    those rows are marked is_override so the activity log shows them.
--  * Card size. Uses the card's own max_stamps_snapshot, as the scanner does,
--    so a card joined before the shop changed its card size fills to the size
--    shown on the customer's pass.
--  * Location. Checked before looking up the card, and an archived location's
--    QR no longer gives stamps ('location_archived').
--  * Double taps. The card row is locked, so two taps at the same moment
--    can't both pass the 45-minute check and add two stamps.
--  * A full card says so ('card_full') before any limit is checked.
--  * Activity rows record the location and source 'self_serve'.
--  * With several cards under one login/email, an ACTIVE one is preferred.
-- =====================================================================

drop function if exists public.self_serve_stamp(uuid, uuid, double precision, double precision, text, text, integer);
drop function if exists public.self_serve_stamp(uuid, uuid, double precision, double precision, text, text, integer, text);

create function public.self_serve_stamp(
  p_campaign uuid, p_location uuid, p_lat double precision, p_lng double precision,
  p_email text default null, p_code text default null, p_count integer default 1,
  p_tz text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
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
    if trim(coalesce(p_code, '')) <> v_campaign.stamp_code then
      return jsonb_build_object('ok', false, 'error', 'bad_code');
    end if;
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
end $$;

revoke all on function public.self_serve_stamp(uuid, uuid, double precision, double precision, text, text, integer, text) from public;
grant execute on function public.self_serve_stamp(uuid, uuid, double precision, double precision, text, text, integer, text) to anon, authenticated;
