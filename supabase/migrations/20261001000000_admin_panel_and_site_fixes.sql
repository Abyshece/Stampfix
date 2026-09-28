-- Admin panel + public site audit fixes.
--
-- 1. admin_edit_customer: the phone was written to a table that doesn't exist
--    (public.customers) and silently dropped. It now goes where the app reads
--    it (auth user metadata for the admin list, cards.customer_phone for card
--    recovery). Blank fields keep the current value instead of wiping it.
-- 2. admin_set_merchant_status('deleted') now does what the merchant's own
--    "delete my account" does: stamps deleted_at (so the 30-day cleanup job
--    can erase it) and blocks the shop's active cards. It refuses while a paid
--    Stripe subscription is still running.
-- 3. Frozen / blocked / deleted shops no longer hand out self-serve stamps, and
--    blocked / deleted shops no longer take new sign-ups.
-- 4. admin_list_customers: each card in cards_detail now carries its id, join
--    date, rewards, deletion flag, the shop's current offer and whether it is
--    installed in Apple Wallet. Return columns are unchanged.
-- 5. admin_list_merchants: Canadian Pro estimate is CA$29.99 (was 28.00).
-- 6. Rate-limit helpers and the unguarded phone recovery were callable by
--    anyone, which let a caller reset PIN / recovery lockouts. Only the
--    SECURITY DEFINER wrappers (owned by postgres) use them.
-- 7. Email + code card recovery gets the same lockout as phone recovery.
-- 8. Backfill: merchants already set to 'deleted' by an admin get deleted_at
--    and their active cards blocked, like a self-deleted account.
-- 9. admin_kpi_range: the daily bars were bucketed by UTC calendar day, so in
--    Germany "Today" showed yesterday's numbers and the last day of any range
--    was missing. Each bar is now one day from the admin's own midnight (the
--    from_date the panel sends). Totals are unchanged.

-- ---------------------------------------------------------------- 1
create or replace function public.admin_edit_customer(customer_id_in uuid, name_in text, email_in text, phone_in text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := nullif(btrim(coalesce(name_in, '')), '');
  v_email text := lower(nullif(btrim(coalesce(email_in, '')), ''));
  v_phone text := nullif(btrim(coalesce(phone_in, '')), '');
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That email address doesn''t look right.' using errcode = '22023';
  end if;

  update public.cards
     set customer_name  = coalesce(v_name, customer_name),
         email          = coalesce(v_email, email),
         customer_phone = coalesce(v_phone, customer_phone)
   where customer_id = customer_id_in;

  if v_phone is not null then
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('phone', v_phone)
     where id = customer_id_in;
  end if;
end $$;

-- ---------------------------------------------------------------- 2
create or replace function public.admin_set_merchant_status(merchant_id_in uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  if new_status not in ('active', 'frozen', 'blocked', 'deleted') then
    raise exception 'Invalid status: %', new_status;
  end if;

  if new_status = 'deleted' then
    if exists (select 1 from merchants
                where id = merchant_id_in
                  and stripe_subscription_status in ('active', 'trialing', 'past_due')) then
      raise exception 'This merchant still has a paid Stripe subscription. Cancel it in Stripe first, then delete the account.';
    end if;
    update merchants set status = 'deleted', deleted_at = coalesce(deleted_at, now())
     where id = merchant_id_in;
    update cards set status = 'BLOCKED'
     where campaign_id in (select id from campaigns where merchant_id = merchant_id_in)
       and status = 'ACTIVE';
  else
    update merchants set status = new_status, deleted_at = null where id = merchant_id_in;
  end if;
end;
$$;

-- ---------------------------------------------------------------- 3
create or replace function public.self_serve_stamp(p_campaign uuid, p_location uuid, p_lat double precision, p_lng double precision, p_email text DEFAULT NULL::text, p_code text DEFAULT NULL::text, p_count integer DEFAULT 1, p_tz text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

-- The sign-up guard runs as the customer, who can't read the merchants table,
-- so the shop's status is checked through this helper.
create or replace function public.merchant_takes_signups(p_merchant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from merchants where id = p_merchant and status in ('blocked', 'deleted'));
$$;

create or replace function public.cards_customer_insert_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_camp public.campaigns%rowtype;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  select * into v_camp from public.campaigns where id = new.campaign_id;
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

-- ---------------------------------------------------------------- 4
create or replace function public.admin_list_customers(search_term text DEFAULT NULL::text, merchant_filter uuid DEFAULT NULL::uuid, limit_to integer DEFAULT 100)
 RETURNS TABLE(customer_id uuid, customer_code text, customer_name text, email text, active_since timestamp with time zone, cards_in_wallet bigint, total_stamps bigint, total_rewards_redeemed bigint, last_stamp_at timestamp with time zone, last_stamp_merchant text, last_login_at timestamp with time zone, merchants_list text, cards_detail jsonb, any_deletion_pending boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_platform_admin() THEN RETURN; END IF;

  RETURN QUERY
  WITH customer_cards AS (
    SELECT c.customer_id, c.id AS card_id, c.customer_name, c.email,
           c.joined_at, c.current_stamps, c.rewards_redeemed,
           c.customer_code, c.deletion_requested_at,
           c.offer_title_snapshot, c.max_stamps_snapshot,
           ca.offer_title AS live_offer,
           EXISTS (SELECT 1 FROM apple_wallet_registrations r
                    WHERE r.serial_number = c.id::text) AS in_apple_wallet,
           m.id AS m_id, m.business_name AS m_name
    FROM cards c
    JOIN campaigns ca ON ca.id = c.campaign_id
    JOIN merchants m ON m.id = ca.merchant_id
    WHERE c.customer_id IS NOT NULL
      AND (search_term IS NULL OR search_term = ''
           OR c.email ILIKE '%' || search_term || '%'
           OR c.customer_name ILIKE '%' || search_term || '%'
           OR c.customer_code ILIKE '%' || search_term || '%')
      AND (merchant_filter IS NULL
           OR c.customer_id IN (
             SELECT c2.customer_id FROM cards c2
             JOIN campaigns ca2 ON ca2.id = c2.campaign_id
             WHERE ca2.merchant_id = merchant_filter
           ))
      AND m.status != 'deleted'
  ),
  last_stamps AS (
    SELECT DISTINCT ON (cc.customer_id)
      cc.customer_id,
      a.created_at AS last_stamp_at,
      cc.m_name AS last_stamp_merchant
    FROM customer_cards cc
    JOIN activities a ON a.card_id = cc.card_id
    WHERE a.type = 'STAMP'
    ORDER BY cc.customer_id, a.created_at DESC
  )
  SELECT
    cc.customer_id,
    (SELECT cc2.customer_code FROM customer_cards cc2
       WHERE cc2.customer_id = cc.customer_id
       ORDER BY cc2.joined_at ASC LIMIT 1) AS customer_code,
    (array_agg(cc.customer_name ORDER BY cc.joined_at DESC))[1] AS customer_name,
    (array_agg(cc.email ORDER BY cc.joined_at DESC))[1] AS email,
    min(cc.joined_at) AS active_since,
    count(DISTINCT cc.card_id) AS cards_in_wallet,
    sum(cc.current_stamps)::bigint AS total_stamps,
    sum(cc.rewards_redeemed)::bigint AS total_rewards_redeemed,
    (SELECT ls.last_stamp_at FROM last_stamps ls WHERE ls.customer_id = cc.customer_id) AS last_stamp_at,
    (SELECT ls.last_stamp_merchant FROM last_stamps ls WHERE ls.customer_id = cc.customer_id) AS last_stamp_merchant,
    (SELECT u.last_sign_in_at FROM auth.users u WHERE u.id = cc.customer_id) AS last_login_at,
    string_agg(DISTINCT cc.m_name, ', ' ORDER BY cc.m_name) AS merchants_list,
    -- cards_detail: one object per card, used by the admin UI's
    -- "Current campaigns" column, the card-by-card panel and the funnel.
    -- current_offer = what this card was issued under; campaign_offer = the
    -- shop's offer today.
    jsonb_agg(
      jsonb_build_object(
        'card_id', cc.card_id,
        'merchant_name', cc.m_name,
        'current_offer', cc.offer_title_snapshot,
        'campaign_offer', cc.live_offer,
        'current_stamps', cc.current_stamps,
        'max_stamps', cc.max_stamps_snapshot,
        'rewards_redeemed', cc.rewards_redeemed,
        'joined_at', cc.joined_at,
        'deletion_pending', cc.deletion_requested_at IS NOT NULL,
        'in_apple_wallet', cc.in_apple_wallet
      ) ORDER BY cc.joined_at DESC
    ) AS cards_detail,
    bool_or(cc.deletion_requested_at IS NOT NULL) AS any_deletion_pending
  FROM customer_cards cc
  GROUP BY cc.customer_id
  ORDER BY max(cc.joined_at) DESC
  LIMIT limit_to;
END;
$function$;

-- ---------------------------------------------------------------- 5
create or replace function public.admin_list_merchants(search_term text DEFAULT NULL::text, limit_to integer DEFAULT 100)
 RETURNS TABLE(id uuid, merchant_code text, email text, business_name text, registered_company_name text, country text, plan text, status text, is_platform_admin boolean, created_at timestamp with time zone, card_count bigint, recent_activity_count bigint, last_login_at timestamp with time zone, first_activity_at timestamp with time zone, plan_started_at timestamp with time zone, estimated_mrr_cents bigint, estimated_total_cents bigint, admin_notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_platform_admin() THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    m.id,
    m.merchant_code,
    m.email,
    m.business_name,
    m.registered_company_name,
    m.country,
    coalesce(m.plan, 'free') AS plan,
    m.status,
    m.is_platform_admin,
    m.created_at,
    coalesce((SELECT count(*) FROM cards c JOIN campaigns ca ON ca.id = c.campaign_id
              WHERE ca.merchant_id = m.id AND c.status = 'ACTIVE'), 0) AS card_count,
    coalesce((SELECT count(*) FROM activities a JOIN campaigns ca ON ca.id = a.campaign_id
              WHERE ca.merchant_id = m.id AND a.created_at > now() - interval '7 days'), 0) AS recent_activity_count,
    (SELECT u.last_sign_in_at FROM auth.users u WHERE u.id = m.id) AS last_login_at,
    (SELECT min(a.created_at) FROM activities a JOIN campaigns ca ON ca.id = a.campaign_id
       WHERE ca.merchant_id = m.id) AS first_activity_at,
    m.plan_started_at,
    CASE WHEN m.plan = 'pro' THEN
      CASE m.country WHEN 'DE' THEN 1999 WHEN 'CA' THEN 2999 ELSE 1999 END
    ELSE 0 END::bigint AS estimated_mrr_cents,
    CASE WHEN m.plan = 'pro' AND m.plan_started_at IS NOT NULL THEN
      greatest(1, ceil(extract(epoch FROM (now() - m.plan_started_at)) / (86400 * 30))::int)::bigint *
      CASE m.country WHEN 'DE' THEN 1999::bigint WHEN 'CA' THEN 2999::bigint ELSE 1999::bigint END
    ELSE 0::bigint END AS estimated_total_cents,
    m.admin_notes
  FROM merchants m
  WHERE (search_term IS NULL OR search_term = ''
         OR m.email ILIKE '%' || search_term || '%'
         OR m.business_name ILIKE '%' || search_term || '%'
         OR m.merchant_code ILIKE '%' || search_term || '%'
         OR m.registered_company_name ILIKE '%' || search_term || '%')
    AND m.status != 'deleted'
  ORDER BY m.created_at DESC
  LIMIT limit_to;
END;
$function$;

-- ---------------------------------------------------------------- 6
revoke execute on function public.rate_limit_hit(text, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.rate_limit_clear(text, text) from public, anon, authenticated;
revoke execute on function public.recover_cards(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 7
create or replace function public.recover_cards_by_email(p_email text, p_code text)
 RETURNS TABLE(card jsonb, campaign jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_key  text := lower(btrim(coalesce(p_email, '')));
        v_rows int;
begin
  if not public.rate_limit_hit('card_recovery_email', v_key, 5, 900, 3600) then
    raise exception 'Too many attempts for this email. Please wait an hour and try again.'
      using errcode = 'P0001';
  end if;

  return query
  select to_jsonb(c.*), to_jsonb(camp.*)
  from public.cards c
  join public.campaigns camp on camp.id = c.campaign_id
  where lower(c.email) = lower(trim(p_email))
    and c.recovery_code_hash is not null
    and c.recovery_code_hash = crypt(p_code, c.recovery_code_hash);
  get diagnostics v_rows = row_count;

  -- Correct code: forget the failed attempts so a real customer is never locked out.
  if v_rows > 0 then
    perform public.rate_limit_clear('card_recovery_email', v_key);
  end if;
end $function$;

-- ---------------------------------------------------------------- 8
update public.cards set status = 'BLOCKED'
 where status = 'ACTIVE'
   and campaign_id in (select c.id from public.campaigns c
                         join public.merchants m on m.id = c.merchant_id
                        where m.status = 'deleted');
update public.merchants set deleted_at = now()
 where status = 'deleted' and deleted_at is null;

-- ---------------------------------------------------------------- 9
create or replace function public.admin_kpi_range(from_date timestamp with time zone, to_date timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
  prev_from timestamptz;
  prev_to timestamptz;
  range_days integer;
begin
  if not is_platform_admin() then return null; end if;

  range_days := greatest(1, ceil(extract(epoch from (to_date - from_date)) / 86400)::int);
  prev_to := from_date;
  prev_from := from_date - (to_date - from_date);

  -- One bucket per day of the range, starting at the caller's local midnight
  -- (from_date). The label is that day's calendar date: noon of the bucket
  -- falls on the same date in UTC for any offset between -12h and +12h.
  with days as (
    select s as day_start, s + interval '1 day' as day_end,
           ((s + interval '12 hours') at time zone 'UTC')::date as d
    from generate_series(from_date, to_date, interval '1 day') as s
  ),
  signup_series as (
    select ds.d,
      (select count(*) from merchants
        where created_at >= ds.day_start and created_at < ds.day_end
          and status != 'deleted') as count
    from days ds
  ),
  customer_series as (
    select ds.d,
      (select count(*) from cards where joined_at >= ds.day_start and joined_at < ds.day_end) as count
    from days ds
  ),
  activity_series as (
    select ds.d,
      (select count(*) from activities where created_at >= ds.day_start and created_at < ds.day_end) as count
    from days ds
  ),
  reward_series as (
    select ds.d,
      (select count(*) from activities
        where created_at >= ds.day_start and created_at < ds.day_end and type = 'REDEEM') as count
    from days ds
  )
  select jsonb_build_object(
    'range_days', range_days,
    'signups', jsonb_build_object(
      'total',     (select count(*) from merchants where created_at >= from_date and created_at <= to_date and status != 'deleted'),
      'prev',      (select count(*) from merchants where created_at >= prev_from and created_at < prev_to and status != 'deleted'),
      'daily',     (select jsonb_agg(jsonb_build_object('date', d, 'count', count) order by d) from signup_series)
    ),
    'customers', jsonb_build_object(
      'total',     (select count(*) from cards where joined_at >= from_date and joined_at <= to_date),
      'prev',      (select count(*) from cards where joined_at >= prev_from and joined_at < prev_to),
      'daily',     (select jsonb_agg(jsonb_build_object('date', d, 'count', count) order by d) from customer_series)
    ),
    'activity', jsonb_build_object(
      'total',     (select count(*) from activities where created_at >= from_date and created_at <= to_date),
      'prev',      (select count(*) from activities where created_at >= prev_from and created_at < prev_to),
      'daily',     (select jsonb_agg(jsonb_build_object('date', d, 'count', count) order by d) from activity_series)
    ),
    'rewards', jsonb_build_object(
      'total',     (select count(*) from activities where type = 'REDEEM' and created_at >= from_date and created_at <= to_date),
      'prev',      (select count(*) from activities where type = 'REDEEM' and created_at >= prev_from and created_at < prev_to),
      'daily',     (select jsonb_agg(jsonb_build_object('date', d, 'count', count) order by d) from reward_series)
    ),
    'open_tickets', (select count(*) from support_tickets where status = 'open'),
    'new_contact_messages', (select count(*) from contact_messages where status = 'new')
  ) into result;
  return result;
end;
$function$;
