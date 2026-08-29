-- =====================================================================
-- Consolidated migration — schema applied via the Supabase SQL editor.
--
-- This captures the recent, verified additions so they live in the repo:
--   * location coordinates (geo)
--   * self-serve stamping columns + the self_serve_stamp RPC
--   * the card-recovery function (recover_cards_by_email)
--   * the recovery-code reset RPC (set_recovery_code)
--   * the recovery_code_hash / deletion_requested_at card columns they rely on
--
-- Every statement is idempotent (IF NOT EXISTS / CREATE OR REPLACE), so it is
-- safe to run against your live database and will simply match what's there.
--
-- NOT included: older direct-SQL changes (notifications, admin RPCs, consents,
-- realtime, Stripe/pro triggers, etc.). Those are too many to reproduce by hand
-- accurately. For a COMPLETE, guaranteed-correct baseline, dump the live schema
-- (see the command in the chat) — that captures everything in one shot.
-- =====================================================================

-- ---- Columns the recovery flow depends on ----
alter table public.cards add column if not exists recovery_code_hash text;
alter table public.cards add column if not exists deletion_requested_at timestamptz;

-- ---- Location coordinates (geo) ----
alter table public.locations add column if not exists latitude double precision;
alter table public.locations add column if not exists longitude double precision;

-- ---- Self-serve stamping columns ----
alter table public.campaigns add column if not exists stamping_mode text default 'scanner';
alter table public.campaigns add column if not exists self_serve_radius integer default 100;
alter table public.campaigns add column if not exists stamp_code text;

-- ---- Card recovery (verified from the live definition) ----
create or replace function public.recover_cards_by_email(p_email text, p_code text)
 returns table(card jsonb, campaign jsonb)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
begin
  return query
  select to_jsonb(c.*), to_jsonb(camp.*)
  from public.cards c
  join public.campaigns camp on camp.id = c.campaign_id
  where lower(c.email) = lower(trim(p_email))
    and c.recovery_code_hash is not null
    and c.recovery_code_hash = crypt(p_code, c.recovery_code_hash);
end $function$;

-- ---- Reset recovery code RPC ----
-- =====================================================================
-- Reset the 6-digit recovery code (no plaintext ever stored).
--
-- Re-hashes a new code into cards.recovery_code_hash using the SAME scheme
-- recover_cards_by_email verifies against (pgcrypto crypt / bcrypt), so the
-- customer can immediately recover with the new code. Because recovery matches
-- by email, we update every card under the customer's email.
--
-- Who can call it:
--   * a signed-in customer resets THEIR OWN cards (auth.uid())
--   * a platform admin resets any customer's cards by passing p_customer_id
-- =====================================================================

create or replace function public.set_recovery_code(
  p_new_code text,
  p_customer_id uuid default null
) returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_uid   uuid;
  v_email text;
  v_count integer;
begin
  if p_new_code !~ '^[0-9]{6}$' then
    raise exception 'Code must be exactly 6 digits';
  end if;

  -- Admin may target any customer; otherwise the caller resets their own.
  if p_customer_id is not null and public.is_platform_admin() then
    v_uid := p_customer_id;
  else
    v_uid := auth.uid();
  end if;
  if v_uid is null then
    raise exception 'Not authorised';
  end if;

  -- Resolve the customer's email, then re-hash the code onto every card under
  -- it (recovery is email-based, so all their cards share the new code).
  select lower(email) into v_email
    from public.cards where customer_id = v_uid limit 1;
  if v_email is null then
    raise exception 'No card found for this customer';
  end if;

  update public.cards
    set recovery_code_hash = crypt(p_new_code, gen_salt('bf'))
    where lower(email) = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.set_recovery_code(text, uuid) to authenticated;

-- ---- Self-serve stamp RPC ----
-- Self-serve stamping. Single tap = 1 free stamp (45-min cooldown guards against
-- repeat taps). Multiple stamps (group orders) require the merchant's 4-digit
-- stamp_code, which the cashier only gives for what was actually paid.
drop function if exists public.self_serve_stamp(uuid, uuid, double precision, double precision, text, text);
create or replace function public.self_serve_stamp(
  p_campaign uuid, p_location uuid, p_lat double precision, p_lng double precision,
  p_email text default null, p_code text default null, p_count integer default 1
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_card     public.cards%rowtype;
  v_loc      public.locations%rowtype;
  v_card_max int; v_radius int; v_dist double precision; v_last timestamptz;
  v_to_add int; v_multi boolean;
begin
  select * into v_campaign from public.campaigns where id = p_campaign;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if coalesce(v_campaign.stamping_mode, 'scanner') <> 'self_serve' then
    return jsonb_build_object('ok', false, 'error', 'self_serve_off');
  end if;

  if auth.uid() is not null then
    select * into v_card from public.cards where campaign_id = p_campaign and customer_id = auth.uid() order by joined_at desc limit 1;
  end if;
  if v_card.id is null and p_email is not null and length(trim(p_email)) > 0 then
    select * into v_card from public.cards where campaign_id = p_campaign and lower(email) = lower(trim(p_email)) order by joined_at desc limit 1;
  end if;
  if v_card.id is null then return jsonb_build_object('ok', false, 'error', 'card_not_found'); end if;
  if v_card.status <> 'ACTIVE' then return jsonb_build_object('ok', false, 'error', 'card_inactive'); end if;

  select * into v_loc from public.locations where id = p_location and campaign_id = p_campaign;
  if not found or v_loc.latitude is null or v_loc.longitude is null then
    return jsonb_build_object('ok', false, 'error', 'no_location');
  end if;
  v_radius := coalesce(v_campaign.self_serve_radius, 100);
  v_dist := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - v_loc.latitude) / 2), 2)
    + cos(radians(v_loc.latitude)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_loc.longitude) / 2), 2)));
  if v_dist > v_radius then
    return jsonb_build_object('ok', false, 'error', 'too_far', 'distance', round(v_dist)::int);
  end if;

  v_card_max := coalesce(v_campaign.max_stamps, 6);
  v_multi := coalesce(p_count, 1) > 1 or (p_code is not null and length(trim(p_code)) > 0);

  if v_multi then
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
    v_to_add := least(1, v_card_max - v_card.current_stamps);
  end if;

  if v_to_add <= 0 then
    return jsonb_build_object('ok', false, 'error', 'card_full', 'currentStamps', v_card.current_stamps, 'maxStamps', v_card_max);
  end if;

  update public.cards set current_stamps = current_stamps + v_to_add, updated_at = now() where id = v_card.id returning * into v_card;
  insert into public.activities (campaign_id, card_id, customer_name, type)
    select p_campaign, v_card.id, v_card.customer_name, 'STAMP' from generate_series(1, v_to_add);

  return jsonb_build_object('ok', true, 'currentStamps', v_card.current_stamps, 'maxStamps', v_card_max, 'added', v_to_add, 'customerName', v_card.customer_name);
end $$;
grant execute on function public.self_serve_stamp(uuid, uuid, double precision, double precision, text, text, integer) to anon, authenticated;
