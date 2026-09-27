-- =====================================================================
-- Security and data-integrity fixes found in the merchant-tool audit.
--
--  1. merchants: a signed-in merchant could update ANY column of their own
--     row, including is_platform_admin (-> full admin access to every shop's
--     customers) and plan (-> Pro without paying). Privileged columns are now
--     locked for browser sessions; server code (service role, SECURITY
--     DEFINER functions, Stripe webhook) is unaffected. Also adds the missing
--     INSERT policy the app's "heal" path needs (Google sign-up for
--     merchants was signing people straight back out).
--  2. campaigns: a merchant could approve their own shop by writing
--     approval_status. Approval columns are locked for browser sessions.
--  3. cards: a signed-in customer could insert their own card already full
--     of stamps, under any email. Customer-created cards now always start
--     clean (0 stamps, own email, current offer) and only for approved shops.
--     A card the shop added by hand is linked to the customer when they sign
--     up (claim_my_card) instead of failing on the one-card-per-email rule.
--  4. Signup details (recovery code, phone) never reached the database: the
--     page upserted into pending_customer_signups, which RLS rejects, so 31
--     of 32 customer cards have no recovery code. stash_pending_signup()
--     stores them; set_card_recovery only applies them to the customer's own
--     new card.
--  5. notification_reads: marking an already-read notification failed (the
--     upsert needs an UPDATE policy).
--  6. merchant_scan(): one atomic server-side step for every staff stamp and
--     reward redemption (scanner, manual code, customer list, stamp token).
--     It enforces the daily limit (with a recorded reason to override),
--     checks ownership / blocked cards / frozen merchants, locks the card so
--     double scans can't double-count, and writes the activity row in the
--     same transaction (it used to be a separate browser request that could
--     fail and leave a stamp with no log).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. merchants
-- ---------------------------------------------------------------------
create or replace function public.merchants_protect_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only browser sessions are restricted. The service role, SECURITY DEFINER
  -- functions (admin RPCs, delete_my_account) and auth triggers run as other
  -- roles and keep full access.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.id := auth.uid();
    new.email := coalesce(auth.email(), new.email);
    new.plan := 'free';
    new.plan_started_at := null;
    new.is_platform_admin := false;
    new.status := 'active';
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.stripe_subscription_status := null;
    new.admin_notes := null;
    new.deleted_at := null;
    new.merchant_code := null;  -- assigned by assign_merchant_code_trigger
    if new.country is not null and new.country !~ '^[A-Z]{2}$' then
      new.country := null;
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at
     or new.is_platform_admin is distinct from old.is_platform_admin
     or new.plan is distinct from old.plan
     or new.plan_started_at is distinct from old.plan_started_at
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.stripe_subscription_status is distinct from old.stripe_subscription_status
     or new.status is distinct from old.status
     or new.deleted_at is distinct from old.deleted_at
     or new.admin_notes is distinct from old.admin_notes
     or new.merchant_code is distinct from old.merchant_code
     or (old.country is not null and new.country is distinct from old.country)
  then
    raise exception 'These account details can only be changed by Stampfix support.'
      using errcode = '42501';
  end if;
  -- Country (it sets the billing currency) can be filled in once, not changed.
  if old.country is null and new.country is not null and new.country !~ '^[A-Z]{2}$' then
    raise exception 'Unsupported country.' using errcode = '22023';
  end if;
  return new;
end $$;

-- "a0_" sorts first, so this runs before assign_merchant_code_trigger.
drop trigger if exists a0_merchants_protect_columns on public.merchants;
create trigger a0_merchants_protect_columns
  before insert or update on public.merchants
  for each row execute function public.merchants_protect_columns();

drop policy if exists "merchants self insert" on public.merchants;
create policy "merchants self insert" on public.merchants
  for insert to authenticated
  with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. campaigns
-- ---------------------------------------------------------------------
create or replace function public.campaigns_protect_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_platform_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.approval_status := 'pending';
    new.rejection_reason := null;
    return new;
  end if;
  if new.approval_status is distinct from old.approval_status
     or new.rejection_reason is distinct from old.rejection_reason
  then
    raise exception 'Approval is set by Stampfix after review.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists a0_campaigns_protect_columns on public.campaigns;
create trigger a0_campaigns_protect_columns
  before insert or update on public.campaigns
  for each row execute function public.campaigns_protect_columns();

-- ---------------------------------------------------------------------
-- 3. cards created by customers
-- ---------------------------------------------------------------------
-- Runs with the caller's rights (not SECURITY DEFINER) so current_user tells
-- a browser session apart from trusted server code. It only reads campaigns
-- and locations, which are publicly readable.
create or replace function public.cards_customer_insert_guard()
returns trigger
language plpgsql
set search_path = public
as $$
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
end $$;

drop trigger if exists a0_cards_customer_insert_guard on public.cards;
create trigger a0_cards_customer_insert_guard
  before insert on public.cards
  for each row execute function public.cards_customer_insert_guard();

-- A card the shop created by hand (no customer yet) is linked to the
-- customer who signs up with that email, instead of the signup failing on
-- the one-card-per-email rule.
create or replace function public.claim_my_card(p_campaign uuid)
returns setof public.cards
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.email() is null then
    return;
  end if;
  return query
    with claimed as (
      update public.cards c
         set customer_id = auth.uid(), updated_at = now()
       where c.id = (
         select c2.id from public.cards c2
          where c2.campaign_id = p_campaign
            and c2.customer_id is null
            and lower(c2.email) = lower(auth.email())
          order by c2.joined_at
          limit 1
       )
      returning c.*
    )
    select * from claimed;
end $$;

revoke all on function public.claim_my_card(uuid) from public;
grant execute on function public.claim_my_card(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Signup details: recovery code and phone
-- ---------------------------------------------------------------------
create or replace function public.stash_pending_signup(
  p_email text,
  p_campaign uuid,
  p_first_name text,
  p_surname text default null,
  p_phone text default null,
  p_code text default null,
  p_location uuid default null,
  p_terms boolean default false,
  p_marketing boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_code  text := nullif(btrim(coalesce(p_code, '')), '');
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Please enter a valid email address.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campaigns where id = p_campaign) then
    raise exception 'This loyalty program is no longer available.' using errcode = 'P0001';
  end if;
  if v_code is not null and v_code !~ '^[0-9]{6}$' then
    raise exception 'The recovery code must be 6 digits.' using errcode = '22023';
  end if;
  if p_location is not null and not exists (
    select 1 from public.locations where id = p_location and campaign_id = p_campaign
  ) then
    p_location := null;
  end if;

  insert into public.pending_customer_signups
    (email, campaign_id, first_name, surname, phone, recovery_code, joined_location_id,
     terms_accepted, marketing_opt_in, created_at, expires_at)
  values
    (v_email, p_campaign, left(btrim(coalesce(p_first_name, '')), 100), nullif(left(btrim(coalesce(p_surname, '')), 100), ''),
     nullif(left(btrim(coalesce(p_phone, '')), 40), ''), v_code, p_location,
     coalesce(p_terms, false), coalesce(p_marketing, false), now(), now() + interval '24 hours')
  on conflict (email, campaign_id) do update set
    first_name = excluded.first_name,
    surname = excluded.surname,
    phone = excluded.phone,
    recovery_code = excluded.recovery_code,
    joined_location_id = excluded.joined_location_id,
    terms_accepted = excluded.terms_accepted,
    marketing_opt_in = excluded.marketing_opt_in,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at;
end $$;

revoke all on function public.stash_pending_signup(text, uuid, text, text, text, text, uuid, boolean, boolean) from public;
grant execute on function public.stash_pending_signup(text, uuid, text, text, text, text, uuid, boolean, boolean) to anon, authenticated;

-- Direct inserts are no longer needed (and let anyone pre-seed a recovery
-- code for someone else's email).
drop policy if exists "pending_signups public insert" on public.pending_customer_signups;

-- Apply the stashed code/phone only to the customer's OWN new card, and only
-- while the stash is fresh. search_path now includes `extensions`, where
-- pgcrypto's crypt()/gen_salt() live: with 'public' alone this trigger would
-- have failed every card insert the moment a stashed code existed.
create or replace function public.set_card_recovery()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  p_phone text;
  p_code  text;
begin
  if NEW.recovery_code_hash is not null then
    return NEW; -- already set, leave alone
  end if;
  if NEW.customer_id is null or NEW.customer_id is distinct from auth.uid() then
    return NEW; -- not the customer creating their own card
  end if;

  select phone, recovery_code
    into p_phone, p_code
    from public.pending_customer_signups
   where lower(email) = lower(NEW.email)
     and campaign_id = NEW.campaign_id
     and expires_at > now()
   order by created_at desc
   limit 1;

  if p_code is not null and length(trim(p_code)) > 0 then
    NEW.recovery_code_hash := crypt(trim(p_code), gen_salt('bf'));
  end if;
  if NEW.customer_phone is null and p_phone is not null and length(trim(p_phone)) > 0 then
    NEW.customer_phone := trim(p_phone);
  end if;

  -- Clear the plaintext code from staging now that it is hashed onto the card.
  if p_code is not null then
    update public.pending_customer_signups
       set recovery_code = null
     where lower(email) = lower(NEW.email) and campaign_id = NEW.campaign_id;
  end if;

  return NEW;
end $$;

-- ---------------------------------------------------------------------
-- 5. notification_reads
-- ---------------------------------------------------------------------
drop policy if exists "reads own update" on public.notification_reads;
create policy "reads own update" on public.notification_reads
  for update
  using (merchant_id = auth.uid())
  with check (merchant_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. merchant_scan: every staff stamp / reward redemption
-- ---------------------------------------------------------------------
create or replace function public.merchant_scan(
  p_card_id     uuid,
  p_action      text    default 'auto',              -- 'auto' | 'stamp' | 'redeem'
  p_location_id uuid    default null,
  p_source      text    default 'manual_dashboard',  -- 'qr' | 'manual_dashboard'
  p_reason      text    default null,                -- required to go past the daily limit
  p_override    boolean default false,
  p_staff_id    uuid    default null,
  p_staff_name  text    default null,
  p_tz          text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card      public.cards%rowtype;
  v_camp      public.campaigns%rowtype;
  v_mstatus   text;
  v_max       int;
  v_action    text;
  v_cap       int;
  v_today     int;
  v_day_start timestamptz;
  v_location  uuid;
  v_staff     uuid;
  v_staff_nm  text;
  v_reason    text := nullif(btrim(coalesce(p_reason, '')), '');
  v_override  boolean := false;
  v_source    text := case when p_source in ('qr', 'manual_dashboard') then p_source else 'manual_dashboard' end;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select * into v_card from public.cards where id = p_card_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_camp from public.campaigns where id = v_card.campaign_id;
  if v_camp.merchant_id is distinct from auth.uid() and not public.is_platform_admin() then
    -- Same answer as a missing card: don't reveal other shops' cards.
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select status into v_mstatus from public.merchants where id = v_camp.merchant_id;
  if v_mstatus is not null and v_mstatus <> 'active' then
    return jsonb_build_object('ok', false, 'error', case when v_mstatus = 'frozen' then 'merchant_frozen' else 'merchant_inactive' end);
  end if;
  if v_card.status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  v_max := coalesce(v_card.max_stamps_snapshot, v_camp.max_stamps, 6);
  v_action := case
    when p_action = 'redeem' then 'REDEEM'
    when p_action = 'stamp' then 'STAMP'
    when v_card.current_stamps >= v_max then 'REDEEM'
    else 'STAMP'
  end;

  -- Only record a location / staff member that belongs to this shop.
  select id into v_location from public.locations where id = p_location_id and campaign_id = v_card.campaign_id;
  select id, name into v_staff, v_staff_nm from public.staff where id = p_staff_id and campaign_id = v_card.campaign_id;

  if v_action = 'REDEEM' then
    if v_card.current_stamps < v_max then
      return jsonb_build_object('ok', false, 'error', 'not_full',
        'card', jsonb_build_object('id', v_card.id, 'customerName', v_card.customer_name,
          'currentStamps', v_card.current_stamps, 'maxStamps', v_max));
    end if;
    -- The next cycle follows the shop's current offer.
    update public.cards
       set current_stamps = 0,
           rewards_redeemed = rewards_redeemed + 1,
           offer_title_snapshot = coalesce(v_camp.offer_title, offer_title_snapshot),
           max_stamps_snapshot = coalesce(v_camp.max_stamps, max_stamps_snapshot),
           custom_icon_snapshot = coalesce(v_camp.custom_icon, custom_icon_snapshot),
           updated_at = now()
     where id = v_card.id
     returning * into v_card;
  else
    if v_card.current_stamps >= v_max then
      return jsonb_build_object('ok', false, 'error', 'card_full',
        'card', jsonb_build_object('id', v_card.id, 'customerName', v_card.customer_name,
          'currentStamps', v_card.current_stamps, 'maxStamps', v_max));
    end if;
    begin
      v_day_start := date_trunc('day', now() at time zone coalesce(nullif(btrim(p_tz), ''), 'UTC'))
                     at time zone coalesce(nullif(btrim(p_tz), ''), 'UTC');
    exception when others then
      v_day_start := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
    end;
    v_cap := coalesce(v_camp.max_stamps_per_day, 1);
    select count(*) into v_today from public.activities
     where card_id = v_card.id and type = 'STAMP' and created_at >= v_day_start;
    if v_cap > 0 and v_today >= v_cap then
      if not coalesce(p_override, false) or v_reason is null then
        return jsonb_build_object('ok', false, 'error', 'daily_cap', 'stampsToday', v_today, 'cap', v_cap,
          'card', jsonb_build_object('id', v_card.id, 'customerName', v_card.customer_name,
            'currentStamps', v_card.current_stamps, 'maxStamps', v_max));
      end if;
      v_override := true;
    end if;
    update public.cards
       set current_stamps = current_stamps + 1, updated_at = now()
     where id = v_card.id
     returning * into v_card;
  end if;

  insert into public.activities
    (campaign_id, card_id, customer_name, type, source, actor_user_id, location_id, staff_id, staff_name, reason, is_override)
  values
    (v_card.campaign_id, v_card.id, v_card.customer_name, v_action, v_source, auth.uid(), v_location,
     v_staff, case when v_staff is not null then v_staff_nm end, v_reason, v_override);

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'override', v_override,
    'card', jsonb_build_object(
      'id', v_card.id,
      'customerName', v_card.customer_name,
      'email', v_card.email,
      'currentStamps', v_card.current_stamps,
      'rewardsRedeemed', v_card.rewards_redeemed,
      'status', v_card.status,
      'maxStamps', coalesce(v_card.max_stamps_snapshot, v_camp.max_stamps, 6),
      'offerTitle', coalesce(v_card.offer_title_snapshot, v_camp.offer_title)
    ),
    'businessName', v_camp.business_name
  );
end $$;

revoke all on function public.merchant_scan(uuid, text, uuid, text, text, boolean, uuid, text, text) from public;
grant execute on function public.merchant_scan(uuid, text, uuid, text, text, boolean, uuid, text, text) to authenticated;
