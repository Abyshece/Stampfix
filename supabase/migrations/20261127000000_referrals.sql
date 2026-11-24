-- =====================================================================
-- Referrals: "Give a month, get a month".
--
-- Every Pro shop (paying or comped) can invite: its link is
-- stampfix.app/r/CODE. A shop that signs up through that link is recorded as
-- invited by the code's shop (only while that shop is on Pro). When the
-- invited shop makes a real Pro payment, both shops get one month of Pro
-- free, as a Stripe credit that Stripe uses on their next bill (the
-- referral-credit function puts it on their Stripe customer).
--
--   referrals         who invited whom, and where it stands:
--                     signed_up -> rewarded            (paid, checks passed)
--                     signed_up -> flagged -> rewarded (admin approved)
--                     any       -> rejected            (admin, or refunded)
--   referral_rewards  one row per shop and invite: pending (waiting to be
--                     credited, e.g. the inviter isn't on Pro yet), credited,
--                     capped (inviter had 12 free months this year) or
--                     cancelled.
--
-- Checks before rewarding (a hit flags it for an admin instead): the same
-- company email domain, phone, card, business address or Stripe customer
-- on both shops, or a blocked inviter.
--
-- Shops see only their own code, who invited them and the shops they
-- invited. Safe to run more than once.
-- =====================================================================

create table if not exists public.referral_codes (
  merchant_id uuid primary key references public.merchants(id) on delete cascade,
  code        text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  created_at  timestamptz not null default now()
);

create table if not exists public.referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid references public.merchants(id) on delete set null,
  referred_id  uuid not null unique references public.merchants(id) on delete cascade,
  code         text not null,
  source       text not null default 'link' check (source in ('link', 'admin')),
  status       text not null default 'signed_up' check (status in ('signed_up', 'flagged', 'rewarded', 'rejected')),
  reason       text,
  paid_invoice text,
  paid_at      timestamptz,
  decided_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (referrer_id is distinct from referred_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);
create index if not exists referrals_paid_invoice_idx on public.referrals (paid_invoice) where paid_invoice is not null;

create table if not exists public.referral_rewards (
  id            uuid primary key default gen_random_uuid(),
  referral_id   uuid not null references public.referrals(id) on delete cascade,
  merchant_id   uuid references public.merchants(id) on delete set null,
  role          text not null check (role in ('referrer', 'referred')),
  status        text not null default 'pending' check (status in ('pending', 'credited', 'capped', 'cancelled')),
  amount_cents  integer,
  currency      text,
  stripe_txn_id text,
  attempts      integer not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  credited_at   timestamptz,
  unique (referral_id, role)
);
create index if not exists referral_rewards_merchant_idx on public.referral_rewards (merchant_id, status);

-- Card fingerprints Stripe reports on paid invoices (not card numbers), to
-- spot one person paying for "two" shops.
create table if not exists public.referral_card_prints (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  fingerprint text not null,
  created_at  timestamptz not null default now(),
  primary key (merchant_id, fingerprint)
);
create index if not exists referral_card_prints_fp_idx on public.referral_card_prints (fingerprint);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.referral_card_prints enable row level security;
revoke all on public.referral_codes, public.referrals, public.referral_rewards, public.referral_card_prints from anon, authenticated;

-- ---- Codes -----------------------------------------------------------------------

-- The shop's code, made on first use. No 0/O/1/I/L, so it reads out loud.
create or replace function public.referral_code_for(p_merchant uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
  i integer;
begin
  select code into c from public.referral_codes where merchant_id = p_merchant;
  if c is not null then return c; end if;
  for attempt in 1..20 loop
    c := '';
    for i in 1..6 loop c := c || substr(a, 1 + floor(random() * length(a))::integer, 1); end loop;
    begin
      insert into public.referral_codes (merchant_id, code) values (p_merchant, c);
      return c;
    exception when unique_violation then
      -- Another request made this shop's code first, or the code is taken.
      select code into c from public.referral_codes where merchant_id = p_merchant;
      if c is not null then return c; end if;
    end;
  end loop;
  raise exception 'referral_code_failed';
end $$;

-- The inviting shop's name for "Invited by …" on the sign-up page. Only
-- Pro shops (paying or comped) can invite.
create or replace function public.referral_lookup(p_code text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(m.business_name), ''),
                  (select c.business_name from public.campaigns c where c.merchant_id = m.id order by c.created_at limit 1))
    from public.referral_codes rc join public.merchants m on m.id = rc.merchant_id
   where rc.code = upper(btrim(p_code)) and m.status = 'active' and m.plan = 'pro';
$$;

-- ---- Sign-up: record who invited the new shop ------------------------------------

-- The code travels in the sign-up's user data (referral_code). Never
-- blocks a sign-up: any problem is only logged.
create or replace function public.referral_on_merchant_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_ref  uuid;
begin
  begin
    select upper(btrim(u.raw_user_meta_data->>'referral_code')) into v_code from auth.users u where u.id = new.id;
    if v_code ~ '^[A-Z2-9]{6}$' then
      select rc.merchant_id into v_ref
        from public.referral_codes rc join public.merchants m on m.id = rc.merchant_id
       where rc.code = v_code and m.status = 'active' and m.plan = 'pro';
      if v_ref is not null and v_ref <> new.id then
        insert into public.referrals (referrer_id, referred_id, code) values (v_ref, new.id, v_code)
        on conflict (referred_id) do nothing;
      end if;
    end if;
  exception when others then
    raise warning 'referral_on_merchant_created: % - %', sqlstate, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists zz_referral_on_insert on public.merchants;
create trigger zz_referral_on_insert after insert on public.merchants
  for each row execute function public.referral_on_merchant_created();

-- ---- Rules -----------------------------------------------------------------------

-- Why this invite needs a person to look at it, or null when it's fine.
create or replace function public.referral_flag_reason(p_referral uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  r  public.referrals;
  a  public.merchants;   -- inviter
  b  public.merchants;   -- invited
  da text; db text; pa text; pb text;
begin
  select * into r from public.referrals where id = p_referral;
  select * into a from public.merchants where id = r.referrer_id;
  select * into b from public.merchants where id = r.referred_id;
  if a.id is null or b.id is null then return null; end if;   -- inviter gone: the invited shop still gets its month
  if a.status = 'blocked' then return 'inviter_blocked'; end if;
  if a.stripe_customer_id is not null and a.stripe_customer_id = b.stripe_customer_id then return 'same_stripe_customer'; end if;
  da := split_part(lower(btrim(a.email)), '@', 2);
  db := split_part(lower(btrim(b.email)), '@', 2);
  if da <> '' and da = db and da !~ ('^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|pm'
       || '|gmx|web|t-online|freenet|posteo|mailbox|arcor|online|vodafone|1und1|shaw|telus|rogers|sympatico|bell|videotron|cogeco'
       || '|zoho|yandex|mail|email|duck|hey|fastmail|tutanota|tuta)\.') then
    return 'same_email_domain';
  end if;
  select right(regexp_replace(coalesce(nullif(u.phone, ''), u.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), 9) into pa from auth.users u where u.id = a.id;
  select right(regexp_replace(coalesce(nullif(u.phone, ''), u.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), 9) into pb from auth.users u where u.id = b.id;
  if length(pa) >= 7 and pa = pb then return 'same_phone'; end if;
  if exists (select 1 from public.referral_card_prints x join public.referral_card_prints y on y.fingerprint = x.fingerprint
              where x.merchant_id = a.id and y.merchant_id = b.id) then
    return 'same_card';
  end if;
  if length(regexp_replace(lower(coalesce(a.business_address, '')), '[^a-z0-9]', '', 'g')) >= 8
     and regexp_replace(lower(a.business_address), '[^a-z0-9]', '', 'g') = regexp_replace(lower(coalesce(b.business_address, '')), '[^a-z0-9]', '', 'g') then
    return 'same_address';
  end if;
  return null;
end $$;

-- Gives both months: the invited shop's always; the inviter's unless it's
-- blocked or gone (cancelled) or already had 12 this year (capped).
create or replace function public.referral_grant(p_referral uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  r public.referrals;
  v_status text;
begin
  select * into r from public.referrals where id = p_referral for update;
  insert into public.referral_rewards (referral_id, merchant_id, role, status) values (r.id, r.referred_id, 'referred', 'pending')
  on conflict (referral_id, role) do update set status = 'pending', error = null, attempts = 0
    where public.referral_rewards.status = 'cancelled';
  if r.referrer_id is null or not exists (select 1 from public.merchants m where m.id = r.referrer_id and m.status in ('active', 'frozen')) then
    v_status := 'cancelled';
  elsif (select count(*) from public.referral_rewards w
          where w.merchant_id = r.referrer_id and w.role = 'referrer' and w.status in ('pending', 'credited')
            and w.referral_id <> r.id and w.created_at > now() - interval '365 days') >= 12 then
    v_status := 'capped';
  else
    v_status := 'pending';
  end if;
  insert into public.referral_rewards (referral_id, merchant_id, role, status) values (r.id, r.referrer_id, 'referrer', v_status)
  on conflict (referral_id, role) do update set status = excluded.status, error = null, attempts = 0
    where public.referral_rewards.status = 'cancelled';
  update public.referrals set status = 'rewarded', updated_at = now() where id = r.id;
end $$;

-- ---- Stripe (stripe-webhook and referral-credit, service role only) --------------

-- A paid invoice (amount > 0) of a shop. The first one of an invited shop
-- rewards the invite, or flags it.
create or replace function public.referral_invoice_paid(p_merchant uuid, p_invoice text, p_fingerprint text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r public.referrals;
  v_reason text;
begin
  if p_fingerprint ~ '^[A-Za-z0-9_-]{4,64}$' then
    insert into public.referral_card_prints (merchant_id, fingerprint) values (p_merchant, p_fingerprint) on conflict do nothing;
  end if;
  select * into r from public.referrals where referred_id = p_merchant and status = 'signed_up' for update;
  if found then
    v_reason := public.referral_flag_reason(r.id);
    update public.referrals
       set paid_invoice = left(p_invoice, 100), paid_at = now(), updated_at = now(),
           status = case when v_reason is null then status else 'flagged' end, reason = v_reason
     where id = r.id;
    if v_reason is null then perform public.referral_grant(r.id); end if;
  end if;
  return jsonb_build_object('due', exists (
    select 1 from public.referral_rewards w join public.merchants m on m.id = w.merchant_id
     where w.status = 'pending' and w.attempts < 3 and m.stripe_customer_id is not null));
end $$;

-- The invited shop got its first payment back: the invite no longer counts.
create or replace function public.referral_invoice_refunded(p_invoice text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  with x as (
    update public.referrals set status = 'rejected', reason = 'refunded', updated_at = now()
     where paid_invoice = p_invoice and status <> 'rejected'
    returning id)
  update public.referral_rewards w set status = 'cancelled'
    from x where w.referral_id = x.id and w.status = 'pending';
end $$;

-- Months waiting to go onto a Stripe customer. p_force also retries ones
-- that failed 3 times.
create or replace function public.referral_rewards_due(p_force boolean default false)
returns table (id uuid, merchant_id uuid, role text, customer text, country text, other_name text)
language sql stable security definer set search_path = public as $$
  select w.id, w.merchant_id, w.role, m.stripe_customer_id, m.country,
         coalesce(nullif(btrim(o.business_name), ''), 'a Stampfix shop')
    from public.referral_rewards w
    join public.referrals r on r.id = w.referral_id
    join public.merchants m on m.id = w.merchant_id
    left join public.merchants o on o.id = case when w.role = 'referrer' then r.referred_id else r.referrer_id end
   where w.status = 'pending' and m.stripe_customer_id is not null and (p_force or w.attempts < 3)
   order by w.created_at
   limit 50;
$$;

create or replace function public.referral_reward_done(p_id uuid, p_txn text, p_amount integer, p_currency text, p_error text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if p_error is null then
    update public.referral_rewards
       set status = 'credited', credited_at = now(), stripe_txn_id = p_txn, amount_cents = p_amount,
           currency = lower(p_currency), error = null
     where id = p_id and status = 'pending';
  else
    update public.referral_rewards set attempts = attempts + 1, error = left(p_error, 500)
     where id = p_id and status = 'pending';
  end if;
end $$;

-- ---- The shop's own view ---------------------------------------------------------

create or replace function public.my_referral()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not exists (select 1 from public.merchants where id = v_me and status <> 'deleted') then
    raise exception 'Not authorised';
  end if;
  return jsonb_build_object(
    'code', public.referral_code_for(v_me),
    -- Only Pro shops (paying or comped) can invite.
    'can_invite', exists (select 1 from public.merchants where id = v_me and plan = 'pro' and status = 'active'),
    'invited_by', (
      select jsonb_build_object('name', coalesce(nullif(btrim(m.business_name), ''), 'a Stampfix shop'), 'status', r.status)
        from public.referrals r left join public.merchants m on m.id = r.referrer_id
       where r.referred_id = v_me and r.status <> 'rejected'),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(nullif(btrim(m.business_name), ''), 'A new shop'),
               'status', case r.status when 'rewarded' then 'rewarded' when 'rejected' then 'rejected' else 'joined' end,
               'joined_at', r.created_at) order by r.created_at desc)
        from (select * from public.referrals where referrer_id = v_me order by created_at desc limit 50) r
        join public.merchants m on m.id = r.referred_id), '[]'::jsonb),
    'months_credited', (select count(*) from public.referral_rewards where merchant_id = v_me and status = 'credited'),
    'months_waiting', (select count(*) from public.referral_rewards where merchant_id = v_me and status = 'pending'));
end $$;

-- ---- Admin -----------------------------------------------------------------------

create or replace function public.admin_referrals_list(p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select r.id, r.status, r.reason, r.source, r.code, r.created_at, r.paid_at, r.paid_invoice,
             a.id as referrer_id, a.business_name as referrer_name, a.email as referrer_email, a.merchant_code as referrer_code, a.plan as referrer_plan,
             b.id as referred_id, b.business_name as referred_name, b.email as referred_email, b.merchant_code as referred_code, b.plan as referred_plan,
             coalesce((select jsonb_agg(jsonb_build_object('role', w.role, 'status', w.status, 'amount_cents', w.amount_cents,
                                                          'currency', w.currency, 'credited_at', w.credited_at, 'error', w.error,
                                                          'has_customer', (select m.stripe_customer_id is not null from public.merchants m where m.id = w.merchant_id))
                                       order by w.role desc)
                         from public.referral_rewards w where w.referral_id = r.id), '[]'::jsonb) as rewards
        from public.referrals r
        left join public.merchants a on a.id = r.referrer_id
        join public.merchants b on b.id = r.referred_id
       order by r.created_at desc
       limit greatest(1, least(coalesce(p_limit, 300), 1000))) x), '[]'::jsonb);
end $$;

-- Approve: give both months (also for an invite that wasn't paid yet: a
-- deal you made by hand). Then press "Credit now" to put them on Stripe.
create or replace function public.admin_referral_approve(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare r public.referrals;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  select * into r from public.referrals where id = p_id for update;
  if r.id is null then raise exception 'not_found'; end if;
  if r.status = 'rewarded' then return; end if;
  perform public.referral_grant(r.id);
  update public.referrals set decided_by = auth.uid(), reason = case when r.reason is null then null else 'approved: ' || r.reason end where id = r.id;
  perform public.admin_audit('referral.approve', 'referral', r.id::text, null, jsonb_build_object('was', r.status, 'reason', r.reason));
end $$;

-- Reject: no months (months already on Stripe stay there).
create or replace function public.admin_referral_reject(p_id uuid, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare r public.referrals;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  select * into r from public.referrals where id = p_id for update;
  if r.id is null then raise exception 'not_found'; end if;
  update public.referrals set status = 'rejected', reason = coalesce(nullif(btrim(p_reason), ''), r.reason, 'rejected by admin'),
         decided_by = auth.uid(), updated_at = now() where id = r.id;
  update public.referral_rewards set status = 'cancelled' where referral_id = r.id and status = 'pending';
  perform public.admin_audit('referral.reject', 'referral', r.id::text, null, jsonb_build_object('was', r.status, 'reason', p_reason));
end $$;

-- Record an invite by hand (the shop signed up without the link). It is
-- rewarded at the shop's next Pro payment, like any other.
create or replace function public.admin_referral_link(p_code text, p_referred_email text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_ref uuid;
  v_new uuid;
  v_id  uuid;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  select merchant_id into v_ref from public.referral_codes where code = upper(btrim(p_code));
  if v_ref is null then raise exception 'code_not_found'; end if;
  select id into v_new from public.merchants where lower(btrim(email)) = lower(btrim(p_referred_email)) and status <> 'deleted';
  if v_new is null then raise exception 'shop_not_found'; end if;
  if v_new = v_ref then raise exception 'same_shop'; end if;
  if exists (select 1 from public.referrals where referred_id = v_new) then raise exception 'already_invited'; end if;
  insert into public.referrals (referrer_id, referred_id, code, source) values (v_ref, v_new, upper(btrim(p_code)), 'admin')
  returning id into v_id;
  perform public.admin_audit('referral.link', 'referral', v_id::text, null, jsonb_build_object('code', upper(btrim(p_code)), 'referred', v_new));
  return v_id;
end $$;

-- ---- Access ----------------------------------------------------------------------

revoke execute on function public.referral_code_for(uuid) from public, anon, authenticated;
revoke execute on function public.referral_on_merchant_created() from public, anon, authenticated;
revoke execute on function public.referral_flag_reason(uuid) from public, anon, authenticated;
revoke execute on function public.referral_grant(uuid) from public, anon, authenticated;
revoke execute on function public.referral_invoice_paid(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.referral_invoice_refunded(text) from public, anon, authenticated;
revoke execute on function public.referral_rewards_due(boolean) from public, anon, authenticated;
revoke execute on function public.referral_reward_done(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.referral_invoice_paid(uuid, text, text) to service_role;
grant execute on function public.referral_invoice_refunded(text) to service_role;
grant execute on function public.referral_rewards_due(boolean) to service_role;
grant execute on function public.referral_reward_done(uuid, text, integer, text, text) to service_role;

revoke execute on function public.referral_lookup(text) from public;
grant execute on function public.referral_lookup(text) to anon, authenticated;
revoke execute on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;
revoke execute on function public.admin_referrals_list(integer) from public, anon;
revoke execute on function public.admin_referral_approve(uuid) from public, anon;
revoke execute on function public.admin_referral_reject(uuid, text) from public, anon;
revoke execute on function public.admin_referral_link(text, text) from public, anon;
grant execute on function public.admin_referrals_list(integer) to authenticated;
grant execute on function public.admin_referral_approve(uuid) to authenticated;
grant execute on function public.admin_referral_reject(uuid, text) to authenticated;
grant execute on function public.admin_referral_link(text, text) to authenticated;
