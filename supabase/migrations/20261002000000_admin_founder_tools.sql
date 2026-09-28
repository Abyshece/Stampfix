-- Founder tools for the admin panel.
--
-- 1. Admin action log: every change an admin makes (merchant status / plan /
--    notes / approval, customer edit / freeze / delete / code reset, tickets,
--    contact inquiries, banners, blog posts, notifications, digest settings)
--    is recorded with who did it and when.
-- 2. Undo a deleted merchant within the 30 days before the cleanup job erases
--    it: deletion now remembers which customer cards it blocked, and bringing
--    the merchant back re-opens exactly those cards. delete_my_account's
--    "cancel your subscription first" check now looks at the subscription id
--    the Stripe webhook actually stores (it read a column nothing sets).
-- 3. admin_list_merchants gains is_comped (Pro without a Stripe subscription;
--    its revenue estimate is 0), first_stamp_at and onboarding_state, for the
--    "Comped" badge and the "Stuck" list.
-- 4. admin_merchant_snapshot: a read-only picture of one merchant's account
--    (card design, settings, locations, staff, stats, recent activity,
--    customers) for "View as merchant".
-- 5. Daily email digest + alerts: settings, the numbers, and the scheduled
--    calls to the admin-digest edge function (which sends through Resend).

-- ================================================================ 1. audit log
create table if not exists public.admin_audit_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  admin_id     uuid,
  admin_email  text,
  action       text not null,
  target_type  text,
  target_id    text,
  target_label text,
  detail       jsonb
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_id, created_at desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

-- Records one admin action. Does nothing unless the caller is a platform
-- admin, and never makes the action itself fail.
create or replace function public.admin_audit(p_action text, p_target_type text, p_target_id text, p_label text, p_detail jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then return; end if;
  insert into public.admin_audit_log (admin_id, admin_email, action, target_type, target_id, target_label, detail)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_action, p_target_type, p_target_id, p_label, p_detail);
exception when others then
  raise warning 'admin_audit failed: %', sqlerrm;
end $$;
revoke execute on function public.admin_audit(text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.admin_customer_label(p_customer uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when nullif(btrim(c.customer_name), '') is null then coalesce(c.email, 'Customer')
              else btrim(c.customer_name) || coalesce(' · ' || c.email, '') end
    from public.cards c
   where c.customer_id = p_customer
   order by c.joined_at
   limit 1;
$$;
revoke execute on function public.admin_customer_label(uuid) from public, anon, authenticated;

create or replace function public.admin_list_audit_log(p_limit integer default 200, p_target_id text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
      select l.id, l.created_at, l.admin_email, l.action, l.target_type, l.target_id, l.target_label, l.detail
        from public.admin_audit_log l
       where p_target_id is null or l.target_id = p_target_id
       order by l.created_at desc
       limit greatest(1, least(coalesce(p_limit, 200), 1000))
    ) t
  ), '[]'::jsonb);
end $$;

-- Table triggers: these tables are only changed in these ways by admins, so
-- the trigger fires only when the signed-in caller is a platform admin.
create or replace function public.audit_merchants_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  if auth.uid() is null or not public.is_platform_admin() then return null; end if;
  v_label := coalesce(nullif(btrim(new.business_name), ''), new.email) || ' (' || coalesce(new.merchant_code, '?') || ')';
  if old.status is distinct from new.status then
    perform public.admin_audit('merchant.status', 'merchant', new.id::text, v_label, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if old.plan is distinct from new.plan then
    perform public.admin_audit('merchant.plan', 'merchant', new.id::text, v_label, jsonb_build_object('from', old.plan, 'to', new.plan));
  end if;
  if old.admin_notes is distinct from new.admin_notes then
    perform public.admin_audit('merchant.notes', 'merchant', new.id::text, v_label, jsonb_build_object('notes', left(coalesce(new.admin_notes, ''), 300)));
  end if;
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists zz_audit_admin on public.merchants;
create trigger zz_audit_admin after update on public.merchants
  for each row
  when (old.status is distinct from new.status or old.plan is distinct from new.plan or old.admin_notes is distinct from new.admin_notes)
  execute function public.audit_merchants_admin();

create or replace function public.audit_campaigns_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then return null; end if;
  perform public.admin_audit('merchant.approval', 'merchant', new.merchant_id::text,
    coalesce(nullif(btrim(new.business_name), ''), 'Merchant')
      || coalesce(' (' || (select merchant_code from public.merchants where id = new.merchant_id) || ')', ''),
    jsonb_build_object('from', old.approval_status, 'to', new.approval_status)
      || case when new.approval_status = 'rejected' then jsonb_build_object('reason', new.rejection_reason) else '{}'::jsonb end);
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists zz_audit_admin on public.campaigns;
create trigger zz_audit_admin after update on public.campaigns
  for each row
  when (old.approval_status is distinct from new.approval_status)
  execute function public.audit_campaigns_admin();

create or replace function public.audit_tickets_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then return null; end if;
  perform public.admin_audit('ticket.status', 'ticket', new.id::text, new.subject,
    jsonb_build_object('from', old.status, 'to', new.status));
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists zz_audit_admin on public.support_tickets;
create trigger zz_audit_admin after update on public.support_tickets
  for each row
  when (old.status is distinct from new.status)
  execute function public.audit_tickets_admin();

create or replace function public.audit_contact_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then return null; end if;
  perform public.admin_audit('contact.status', 'contact', new.id::text,
    coalesce(nullif(btrim(new.name), ''), new.email) || coalesce(' · ' || new.email, ''),
    jsonb_build_object('from', old.status, 'to', new.status));
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists zz_audit_admin on public.contact_messages;
create trigger zz_audit_admin after update on public.contact_messages
  for each row
  when (old.status is distinct from new.status)
  execute function public.audit_contact_admin();

create or replace function public.audit_banners_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then return null; end if;
  if tg_op = 'INSERT' then
    perform public.admin_audit('banner.create', 'banner', new.id::text, new.headline, jsonb_build_object('active', new.is_active));
  elsif tg_op = 'UPDATE' then
    perform public.admin_audit('banner.update', 'banner', new.id::text, new.headline,
      case when old.is_active is distinct from new.is_active
           then jsonb_build_object('active', new.is_active) else '{}'::jsonb end);
  else
    perform public.admin_audit('banner.delete', 'banner', old.id::text, old.headline, null);
  end if;
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists zz_audit_admin on public.promo_banners;
create trigger zz_audit_admin after insert or update or delete on public.promo_banners
  for each row execute function public.audit_banners_admin();

create or replace function public.audit_blog_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then return null; end if;
  if tg_op = 'INSERT' then
    perform public.admin_audit(case when new.published then 'blog.publish' else 'blog.draft' end, 'blog', new.id::text, new.title, jsonb_build_object('slug', new.slug));
  elsif tg_op = 'UPDATE' then
    perform public.admin_audit(
      case when new.published and not old.published then 'blog.publish'
           when old.published and not new.published then 'blog.unpublish'
           else 'blog.edit' end,
      'blog', new.id::text, new.title, jsonb_build_object('slug', new.slug));
  else
    perform public.admin_audit('blog.delete', 'blog', old.id::text, old.title, jsonb_build_object('slug', old.slug));
  end if;
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists zz_audit_admin on public.blog_posts;
create trigger zz_audit_admin after insert or update or delete on public.blog_posts
  for each row execute function public.audit_blog_admin();

-- Only notifications an admin sends by hand: the approval / rejection messages
-- are inserted by another trigger (depth > 1) and are covered by
-- merchant.approval already.
create or replace function public.audit_notifications_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to text;
  v_mid uuid;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or not public.is_platform_admin() then return null; end if;
  v_mid := case when tg_op = 'DELETE' then old.merchant_id else new.merchant_id end;
  v_to := case when v_mid is null then 'All merchants'
               else coalesce((select coalesce(nullif(btrim(business_name), ''), email) || ' (' || coalesce(merchant_code, '?') || ')'
                                from public.merchants where id = v_mid), 'One merchant') end;
  if tg_op = 'INSERT' then
    perform public.admin_audit('notification.send', 'notification', new.id::text, new.title, jsonb_build_object('to', v_to));
  else
    perform public.admin_audit('notification.delete', 'notification', old.id::text, old.title, jsonb_build_object('to', v_to));
  end if;
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists zz_audit_admin on public.notifications;
create trigger zz_audit_admin after insert or delete on public.notifications
  for each row execute function public.audit_notifications_admin();

-- Customer actions (cards are the hot table, so these are logged from the
-- admin functions instead of a trigger).
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
  v_label text;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That email address doesn''t look right.' using errcode = '22023';
  end if;
  v_label := public.admin_customer_label(customer_id_in);

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

  perform public.admin_audit('customer.edit', 'customer', customer_id_in::text, v_label,
    jsonb_strip_nulls(jsonb_build_object('name', v_name, 'email', v_email, 'phone', v_phone)));
end $$;

create or replace function public.admin_freeze_customer(customer_id_in uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  update public.cards
  set status = 'BLOCKED'
  where customer_id = customer_id_in
    and deletion_requested_at is null
    and status = 'ACTIVE';
  get diagnostics v_n = row_count;
  perform public.admin_audit('customer.freeze', 'customer', customer_id_in::text, public.admin_customer_label(customer_id_in), jsonb_build_object('cards', v_n));
end $$;

create or replace function public.admin_unfreeze_customer(customer_id_in uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  update public.cards
  set status = 'ACTIVE'
  where customer_id = customer_id_in
    and deletion_requested_at is null
    and status = 'BLOCKED';
  get diagnostics v_n = row_count;
  perform public.admin_audit('customer.unfreeze', 'customer', customer_id_in::text, public.admin_customer_label(customer_id_in), jsonb_build_object('cards', v_n));
end $$;

create or replace function public.admin_delete_customer(customer_id_in uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  update public.cards
  set deletion_requested_at = now(), status = 'BLOCKED'
  where customer_id = customer_id_in
    and deletion_requested_at is null;
  get diagnostics v_n = row_count;
  perform public.admin_audit('customer.delete', 'customer', customer_id_in::text, public.admin_customer_label(customer_id_in), jsonb_build_object('cards', v_n));
end $$;

create or replace function public.set_recovery_code(p_new_code text, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  if p_customer_id is not null and v_uid = p_customer_id and v_uid is distinct from auth.uid() then
    perform public.admin_audit('customer.reset_code', 'customer', v_uid::text, public.admin_customer_label(v_uid), jsonb_build_object('cards', v_count));
  end if;
  return v_count;
end $function$;

-- ================================================================ 2. undo delete
-- Which cards a deletion blocked, so bringing the merchant back re-opens those
-- and not cards the shop had blocked itself.
create table if not exists public.merchant_deletion_blocked_cards (
  card_id     uuid primary key references public.cards(id) on delete cascade,
  merchant_id uuid not null,
  blocked_at  timestamptz not null default now()
);
create index if not exists merchant_deletion_blocked_cards_merchant_idx on public.merchant_deletion_blocked_cards (merchant_id);
alter table public.merchant_deletion_blocked_cards enable row level security;
revoke all on public.merchant_deletion_blocked_cards from anon, authenticated;

create or replace function public.admin_set_merchant_status(merchant_id_in uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not is_platform_admin() then raise exception 'Not authorized'; end if;
  if new_status not in ('active', 'frozen', 'blocked', 'deleted') then
    raise exception 'Invalid status: %', new_status;
  end if;
  select status into v_old from merchants where id = merchant_id_in;

  if new_status = 'deleted' then
    -- The Stripe webhook stores the subscription id; stripe_subscription_status
    -- is kept for older rows.
    if exists (select 1 from merchants
                where id = merchant_id_in
                  and (stripe_subscription_status in ('active', 'trialing', 'past_due')
                       or (plan = 'pro' and stripe_subscription_id is not null))) then
      raise exception 'This merchant still has a paid Stripe subscription. Cancel it in Stripe first, then delete the account.';
    end if;
    update merchants set status = 'deleted', deleted_at = coalesce(deleted_at, now())
     where id = merchant_id_in;
    with blocked as (
      update cards set status = 'BLOCKED'
       where campaign_id in (select id from campaigns where merchant_id = merchant_id_in)
         and status = 'ACTIVE'
      returning id
    )
    insert into merchant_deletion_blocked_cards (card_id, merchant_id)
    select id, merchant_id_in from blocked
    on conflict (card_id) do nothing;
  else
    update merchants set status = new_status, deleted_at = null where id = merchant_id_in;
    -- Bringing a deleted merchant back: re-open the cards the deletion closed.
    if v_old = 'deleted' then
      update cards c set status = 'ACTIVE'
        from merchant_deletion_blocked_cards b
       where b.card_id = c.id
         and b.merchant_id = merchant_id_in
         and c.status = 'BLOCKED'
         and c.deletion_requested_at is null;
      delete from merchant_deletion_blocked_cards where merchant_id = merchant_id_in;
    end if;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  my_id uuid := auth.uid();
  v_paid boolean;
BEGIN
  IF my_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Block while a Stripe subscription is still running. The webhook stores
  -- the subscription id; stripe_subscription_status is kept for older rows.
  SELECT stripe_subscription_status IN ('active', 'trialing', 'past_due')
         OR (plan = 'pro' AND stripe_subscription_id IS NOT NULL)
    INTO v_paid
    FROM merchants WHERE id = my_id;
  IF coalesce(v_paid, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'subscription_active',
      'message', 'Please cancel your subscription before deleting your account.'
    );
  END IF;

  -- Soft-delete the merchant
  UPDATE merchants
     SET status = 'deleted',
         deleted_at = now()
   WHERE id = my_id;

  -- Block all of the merchant's customers' cards so customers see
  -- a clear "closed" state. We don't scrub the data yet — that
  -- happens 30 days later via the cleanup cron, giving the merchant
  -- time to undo via support if it was a mistake (the blocked cards are
  -- remembered so an undo re-opens exactly these).
  WITH blocked AS (
    UPDATE cards
       SET status = 'BLOCKED'
     WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = my_id)
       AND status = 'ACTIVE'
    RETURNING id
  )
  INSERT INTO merchant_deletion_blocked_cards (card_id, merchant_id)
  SELECT id, my_id FROM blocked
  ON CONFLICT (card_id) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END $function$;

-- The two merchants already deleted had their only cards blocked by the
-- deletion backfill (2026-09-28); remember them so an undo re-opens them.
insert into public.merchant_deletion_blocked_cards (card_id, merchant_id)
select c.id, ca.merchant_id
  from public.cards c
  join public.campaigns ca on ca.id = c.campaign_id
  join public.merchants m on m.id = ca.merchant_id
 where m.status = 'deleted'
   and c.status = 'BLOCKED'
   and c.deletion_requested_at is null
on conflict (card_id) do nothing;

create or replace function public.admin_list_deleted_merchants()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.deleted_at desc nulls last) from (
      select m.id, m.merchant_code, m.business_name, m.email, m.plan, m.country, m.created_at, m.deleted_at,
             m.deleted_at + interval '30 days' as purge_after,
             (select count(*) from cards c join campaigns ca on ca.id = c.campaign_id where ca.merchant_id = m.id) as card_count,
             (select count(*) from merchant_deletion_blocked_cards b where b.merchant_id = m.id) as cards_to_reopen
        from merchants m
       where m.status = 'deleted'
    ) t
  ), '[]'::jsonb);
end $$;

-- ================================================================ 3. merchants list
-- New columns at the end (changing a function's result columns needs a drop).
drop function if exists public.admin_list_merchants(text, integer);
create function public.admin_list_merchants(search_term text DEFAULT NULL::text, limit_to integer DEFAULT 100)
 RETURNS TABLE(id uuid, merchant_code text, email text, business_name text, registered_company_name text, country text, plan text, status text, is_platform_admin boolean, created_at timestamp with time zone, card_count bigint, recent_activity_count bigint, last_login_at timestamp with time zone, first_activity_at timestamp with time zone, plan_started_at timestamp with time zone, estimated_mrr_cents bigint, estimated_total_cents bigint, admin_notes text, is_comped boolean, first_stamp_at timestamp with time zone, onboarding_state jsonb)
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
    -- Comped Pro (no Stripe subscription) brings in nothing.
    CASE WHEN m.plan = 'pro' AND m.stripe_subscription_id IS NOT NULL THEN
      CASE m.country WHEN 'DE' THEN 1999 WHEN 'CA' THEN 2999 ELSE 1999 END
    ELSE 0 END::bigint AS estimated_mrr_cents,
    CASE WHEN m.plan = 'pro' AND m.stripe_subscription_id IS NOT NULL AND m.plan_started_at IS NOT NULL THEN
      greatest(1, ceil(extract(epoch FROM (now() - m.plan_started_at)) / (86400 * 30))::int)::bigint *
      CASE m.country WHEN 'DE' THEN 1999::bigint WHEN 'CA' THEN 2999::bigint ELSE 1999::bigint END
    ELSE 0::bigint END AS estimated_total_cents,
    m.admin_notes,
    (m.plan = 'pro' AND m.stripe_subscription_id IS NULL) AS is_comped,
    (SELECT min(a.created_at) FROM activities a JOIN campaigns ca ON ca.id = a.campaign_id
       WHERE ca.merchant_id = m.id AND a.type = 'STAMP') AS first_stamp_at,
    coalesce(m.onboarding_state, '{}'::jsonb) AS onboarding_state
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

-- ================================================================ 4. view as merchant
create or replace function public.admin_merchant_snapshot(p_merchant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m   public.merchants%rowtype;
  v_c   public.campaigns%rowtype;
  v_ids uuid[];
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  select * into v_m from public.merchants where id = p_merchant;
  if not found then return null; end if;
  select * into v_c from public.campaigns where merchant_id = p_merchant order by created_at limit 1;
  select coalesce(array_agg(id), '{}') into v_ids from public.campaigns where merchant_id = p_merchant;

  return jsonb_build_object(
    'merchant', jsonb_build_object(
      'id', v_m.id, 'merchant_code', v_m.merchant_code, 'business_name', v_m.business_name, 'email', v_m.email,
      'plan', coalesce(v_m.plan, 'free'), 'status', v_m.status, 'country', v_m.country, 'created_at', v_m.created_at,
      'is_comped', (v_m.plan = 'pro' and v_m.stripe_subscription_id is null),
      'onboarding_state', coalesce(v_m.onboarding_state, '{}'::jsonb),
      'legal_entity_name', v_m.legal_entity_name, 'business_address', v_m.business_address),
    -- Never the owner PIN hash or the cashier code itself.
    'campaign', case when v_c.id is null then null else
      (to_jsonb(v_c) - 'owner_pin_hash' - 'stamp_code')
        || jsonb_build_object('has_owner_pin', v_c.owner_pin_hash is not null,
                              'has_stamp_code', coalesce(v_c.stamp_code, '') <> '') end,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'address', l.address, 'archived', l.archived,
                                          'has_coordinates', l.latitude is not null and l.longitude is not null)
                       order by l.archived, l.created_at)
        from public.locations l where l.campaign_id = any(v_ids)), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'active', s.active, 'last_login_at', s.last_login_at, 'created_at', s.created_at)
                       order by s.created_at)
        from public.staff s where s.campaign_id = any(v_ids)), '[]'::jsonb),
    'stats', jsonb_build_object(
      'customers_active',  (select count(*) from public.cards c where c.campaign_id = any(v_ids) and c.status = 'ACTIVE'),
      'customers_blocked', (select count(*) from public.cards c where c.campaign_id = any(v_ids) and c.status <> 'ACTIVE'),
      'joins_30d',         (select count(*) from public.cards c where c.campaign_id = any(v_ids) and c.joined_at > now() - interval '30 days'),
      'stamps_total',      (select count(*) from public.activities a where a.campaign_id = any(v_ids) and a.type = 'STAMP'),
      'stamps_7d',         (select count(*) from public.activities a where a.campaign_id = any(v_ids) and a.type = 'STAMP' and a.created_at > now() - interval '7 days'),
      'stamps_30d',        (select count(*) from public.activities a where a.campaign_id = any(v_ids) and a.type = 'STAMP' and a.created_at > now() - interval '30 days'),
      'rewards_total',     (select coalesce(sum(c.rewards_redeemed), 0) from public.cards c where c.campaign_id = any(v_ids)),
      'in_apple_wallet',   (select count(distinct r.serial_number) from public.apple_wallet_registrations r
                              join public.cards c on c.id::text = r.serial_number where c.campaign_id = any(v_ids)),
      'last_activity_at',  (select max(a.created_at) from public.activities a where a.campaign_id = any(v_ids))),
    'recent_activity', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select a.created_at, a.type, a.customer_name, a.source, a.staff_name, a.reason, a.is_override, l.name as location_name
          from public.activities a left join public.locations l on l.id = a.location_id
         where a.campaign_id = any(v_ids)
         order by a.created_at desc limit 25) x), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.joined_at desc) from (
        select c.customer_name, c.email, c.customer_code, c.current_stamps,
               coalesce(c.max_stamps_snapshot, v_c.max_stamps) as max_stamps, c.rewards_redeemed, c.status,
               c.joined_at, c.deletion_requested_at is not null as deletion_pending
          from public.cards c where c.campaign_id = any(v_ids)
         order by c.joined_at desc limit 50) x), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select n.title, n.created_at,
               exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.merchant_id = p_merchant) as read
          from public.notifications n
         where n.published and (n.merchant_id = p_merchant or n.merchant_id is null)
         order by n.created_at desc limit 10) x), '[]'::jsonb)
  );
end $$;

-- ================================================================ 5. digest + alerts
create table if not exists public.admin_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.admin_settings enable row level security;
revoke all on public.admin_settings from anon, authenticated;
insert into public.admin_settings (key, value)
values ('digest', jsonb_build_object('enabled', true, 'alerts', true, 'recipients', jsonb_build_array('abyshece@gmail.com')))
on conflict (key) do nothing;
insert into public.admin_settings (key, value) values ('digest_state', '{}'::jsonb) on conflict (key) do nothing;

-- Shared secret between the scheduled job and the admin-digest function.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'admin_digest_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'admin_digest_secret',
      'Shared secret: pg_cron -> admin-digest edge function');
  end if;
end $$;

create or replace function public.admin_get_digest_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  return coalesce((select value from public.admin_settings where key = 'digest'), '{}'::jsonb)
      || jsonb_build_object('state', coalesce((select value from public.admin_settings where key = 'digest_state'), '{}'::jsonb));
end $$;

create or replace function public.admin_set_digest_settings(p_enabled boolean, p_alerts boolean, p_recipients text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text[];
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  select coalesce(array_agg(distinct lower(btrim(r))), '{}') into v_clean
    from unnest(coalesce(p_recipients, '{}')) as r
   where btrim(r) <> '';
  if exists (select 1 from unnest(v_clean) e where e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'One of the email addresses doesn''t look right.' using errcode = '22023';
  end if;
  if (coalesce(p_enabled, false) or coalesce(p_alerts, false)) and cardinality(v_clean) = 0 then
    raise exception 'Add at least one email address.' using errcode = '22023';
  end if;
  if cardinality(v_clean) > 10 then
    raise exception 'Up to 10 email addresses.' using errcode = '22023';
  end if;
  update public.admin_settings
     set value = jsonb_build_object('enabled', coalesce(p_enabled, false), 'alerts', coalesce(p_alerts, false), 'recipients', to_jsonb(v_clean)),
         updated_at = now()
   where key = 'digest';
  perform public.admin_audit('digest.settings', 'settings', 'digest', 'Email digest',
    jsonb_build_object('enabled', coalesce(p_enabled, false), 'alerts', coalesce(p_alerts, false), 'recipients', to_jsonb(v_clean)));
  return public.admin_get_digest_settings();
end $$;

-- The numbers for one period. Called by the edge function (service role).
create or replace function public.admin_digest_data(p_since timestamptz, p_until timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_http int := 0;
  v_wallet int := 0;
begin
  select count(*) into v_wallet
    from public.wallet_debug_log
   where created_at >= p_since and created_at < p_until and (status >= 400 or status = 207);
  if to_regclass('net._http_response') is not null then
    execute 'select count(*) from net._http_response where created >= $1 and created < $2
               and (status_code is null or status_code >= 400 or error_msg is not null)'
      into v_http using p_since, p_until;
  end if;

  return jsonb_build_object(
    'period_start', p_since,
    'period_end', p_until,
    'new_merchants', (select count(*) from public.merchants where created_at >= p_since and created_at < p_until and status <> 'deleted'),
    'new_merchant_list', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at) from (
        select business_name, email, country, merchant_code, created_at from public.merchants
         where created_at >= p_since and created_at < p_until and status <> 'deleted'
         order by created_at limit 20) x), '[]'::jsonb),
    'new_customers', (select count(*) from public.cards where joined_at >= p_since and joined_at < p_until),
    'stamps', (select count(*) from public.activities where type = 'STAMP' and created_at >= p_since and created_at < p_until),
    'rewards', (select count(*) from public.activities where type = 'REDEEM' and created_at >= p_since and created_at < p_until),
    'active_merchants', (select count(distinct ca.merchant_id) from public.activities a join public.campaigns ca on ca.id = a.campaign_id
                          where a.type = 'STAMP' and a.created_at >= p_since and a.created_at < p_until),
    'wallet_errors', v_wallet + v_http,
    'failed_jobs_count', (select count(*) from cron.job_run_details d where d.status = 'failed' and d.start_time >= p_since and d.start_time < p_until),
    'failed_jobs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.start_time desc) from (
        select j.jobname, left(d.return_message, 200) as message, d.start_time
          from cron.job_run_details d left join cron.job j on j.jobid = d.jobid
         where d.status = 'failed' and d.start_time >= p_since and d.start_time < p_until
         order by d.start_time desc limit 10) x), '[]'::jsonb),
    'open_tickets', (select count(*) from public.support_tickets where status = 'open'),
    'new_contact_messages', (select count(*) from public.contact_messages where status = 'new'),
    'stuck_merchants', (
      select count(*) from public.merchants m
       where m.status = 'active' and not coalesce(m.is_platform_admin, false)
         and m.created_at < now() - interval '3 days'
         and coalesce((m.onboarding_state ->> 'first_stamp_given')::boolean, false) = false
         and not exists (select 1 from public.activities a join public.campaigns ca on ca.id = a.campaign_id
                          where ca.merchant_id = m.id and a.type = 'STAMP')),
    'purge_soon', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.purge_after) from (
        select merchant_code, business_name, deleted_at + interval '30 days' as purge_after
          from public.merchants
         where status = 'deleted' and deleted_at is not null
           and deleted_at + interval '30 days' < now() + interval '7 days'
         order by deleted_at limit 10) x), '[]'::jsonb),
    'merchants_total', (select count(*) from public.merchants where status <> 'deleted'),
    'pro_paid', (select count(*) from public.merchants where status <> 'deleted' and plan = 'pro' and stripe_subscription_id is not null),
    'pro_comped', (select count(*) from public.merchants where status <> 'deleted' and plan = 'pro' and stripe_subscription_id is null)
  );
end $$;

-- Decides whether to send, to whom, and with which numbers.
--   daily: the last 24 hours, if the digest is on.
--   test:  the same, whether or not the digest is on (the admin's button).
--   alert: the last hour; only when 5+ wallet errors or a failed job, and at
--          most once every 6 hours per kind.
create or replace function public.admin_digest_build(p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set     jsonb := coalesce((select value from public.admin_settings where key = 'digest'), '{}'::jsonb);
  v_state   jsonb := coalesce((select value from public.admin_settings where key = 'digest_state'), '{}'::jsonb);
  v_rec     jsonb := coalesce(v_set -> 'recipients', '[]'::jsonb);
  v_data    jsonb;
  v_reasons jsonb := '[]'::jsonb;
begin
  if p_mode in ('daily', 'test') then
    if p_mode = 'daily' and not coalesce((v_set ->> 'enabled')::boolean, false) then
      return jsonb_build_object('send', false, 'why', 'The daily digest is switched off.');
    end if;
    v_data := public.admin_digest_data(now() - interval '24 hours', now());
    return jsonb_build_object('send', jsonb_array_length(v_rec) > 0, 'why', case when jsonb_array_length(v_rec) = 0 then 'No recipients.' end,
                              'mode', p_mode, 'recipients', v_rec, 'data', v_data);
  elsif p_mode = 'alert' then
    if not coalesce((v_set ->> 'alerts')::boolean, false) then
      return jsonb_build_object('send', false, 'why', 'Alerts are switched off.');
    end if;
    v_data := public.admin_digest_data(now() - interval '1 hour', now());
    if (v_data ->> 'wallet_errors')::int >= 5
       and coalesce((v_state ->> 'last_wallet_alert_at')::timestamptz, '-infinity') < now() - interval '6 hours' then
      v_reasons := v_reasons || to_jsonb('wallet'::text);
    end if;
    if (v_data ->> 'failed_jobs_count')::int > 0
       and coalesce((v_state ->> 'last_jobs_alert_at')::timestamptz, '-infinity') < now() - interval '6 hours' then
      v_reasons := v_reasons || to_jsonb('jobs'::text);
    end if;
    return jsonb_build_object('send', jsonb_array_length(v_reasons) > 0 and jsonb_array_length(v_rec) > 0,
                              'mode', p_mode, 'reasons', v_reasons, 'recipients', v_rec, 'data', v_data);
  end if;
  raise exception 'Unknown digest mode: %', p_mode;
end $$;

-- Remembers what was sent (for the admin panel, and to space out alerts).
create or replace function public.admin_digest_mark(p_mode text, p_ok boolean, p_reasons jsonb default '[]'::jsonb, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patch jsonb := jsonb_build_object('last_' || p_mode || '_at', now(), 'last_' || p_mode || '_ok', p_ok,
                                      'last_error', case when p_ok then null else left(p_error, 300) end);
begin
  if p_ok and p_mode = 'alert' then
    if coalesce(p_reasons, '[]'::jsonb) ? 'wallet' then v_patch := v_patch || jsonb_build_object('last_wallet_alert_at', now()); end if;
    if coalesce(p_reasons, '[]'::jsonb) ? 'jobs' then v_patch := v_patch || jsonb_build_object('last_jobs_alert_at', now()); end if;
  end if;
  update public.admin_settings set value = value || v_patch, updated_at = now() where key = 'digest_state';
end $$;

create or replace function public.admin_digest_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from vault.decrypted_secrets where name = 'admin_digest_secret' and decrypted_secret = p_secret);
$$;

-- Called by pg_cron: asks the admin-digest function to run.
create or replace function public.admin_digest_run(p_mode text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'admin_digest_secret';
  if v_url is null or v_secret is null then return null; end if;
  return net.http_post(
    url     := v_url || '/functions/v1/admin-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-digest-secret', v_secret),
    body    := jsonb_build_object('mode', p_mode)
  );
end $$;

revoke execute on function public.admin_digest_data(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_digest_build(text) from public, anon, authenticated;
revoke execute on function public.admin_digest_mark(text, boolean, jsonb, text) from public, anon, authenticated;
revoke execute on function public.admin_digest_secret_ok(text) from public, anon, authenticated;
revoke execute on function public.admin_digest_run(text) from public, anon, authenticated;
grant execute on function public.admin_digest_data(timestamptz, timestamptz) to service_role;
grant execute on function public.admin_digest_build(text) to service_role;
grant execute on function public.admin_digest_mark(text, boolean, jsonb, text) to service_role;
grant execute on function public.admin_digest_secret_ok(text) to service_role;

-- 07:00 in Germany during summer time (06:00 in winter), and the hourly alert check.
select cron.schedule('stampfix-admin-digest', '0 5 * * *', $cron$select public.admin_digest_run('daily')$cron$);
select cron.schedule('stampfix-admin-alerts', '20 * * * *', $cron$select public.admin_digest_run('alert')$cron$);
