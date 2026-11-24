-- =====================================================================
-- Admin: Email shops. The team writes to a shop owner from the admin panel
-- (templates for the usual cases); the admin-send-email function sends it
-- through Resend from hello@stampfix.app. The address always comes from
-- the shop's account, never typed in.
--
-- Every email is logged (who sent what to whom, and whether Resend took
-- it). The same subject to the same shop within 10 minutes is refused, so
-- a double click never sends twice. Shops that asked for no marketing
-- emails are marked; the panel then only offers service emails for them.
--
-- Only platform admins send; view-only admins can read the log.
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.admin_sent_emails (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid references public.merchants(id) on delete set null,
  to_email      text not null,
  business_name text,
  template      text check (template is null or template ~ '^[a-z_]{1,40}$'),
  subject       text not null check (length(btrim(subject)) between 1 and 200),
  body          text not null check (length(btrim(body)) between 1 and 10000),
  status        text not null default 'sending' check (status in ('sending','sent','failed')),
  resend_id     text,
  error         text,
  sent_by       uuid,
  sent_by_email text,
  created_at    timestamptz not null default now()
);
create index if not exists admin_sent_emails_merchant_idx on public.admin_sent_emails (merchant_id, created_at desc);
create index if not exists admin_sent_emails_created_idx on public.admin_sent_emails (created_at desc);

-- Shops that asked for no marketing emails (service emails still go out).
create table if not exists public.admin_email_optouts (
  merchant_id uuid primary key references public.merchants(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.admin_sent_emails enable row level security;
alter table public.admin_email_optouts enable row level security;
revoke all on public.admin_sent_emails, public.admin_email_optouts from anon, authenticated;

-- The shop's name: from its account, else from its first stamp card.
create or replace function public.admin_shop_name(p_merchant uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(btrim(m.business_name), '') from public.merchants m where m.id = p_merchant),
    (select c.business_name from public.campaigns c where c.merchant_id = p_merchant order by c.created_at limit 1));
$$;

-- What the composer needs about one shop: where the email goes, whether it
-- opted out of marketing, and the last email we sent it.
create or replace function public.admin_email_shop_info(p_merchant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  return (
    select jsonb_build_object(
      'to', nullif(lower(btrim(m.email)), ''),
      'business_name', public.admin_shop_name(m.id),
      'opted_out', exists (select 1 from public.admin_email_optouts o where o.merchant_id = m.id),
      'last', (select jsonb_build_object('subject', e.subject, 'created_at', e.created_at, 'status', e.status)
                 from public.admin_sent_emails e where e.merchant_id = m.id order by e.created_at desc limit 1))
      from public.merchants m where m.id = p_merchant);
end $$;

-- Called by admin-send-email with the admin's own login. Looks the address
-- up on the server and logs the email as 'sending'.
create or replace function public.admin_email_start(p_merchant uuid, p_template text, p_subject text, p_body text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_email text;
  v_name  text;
  v_id    uuid;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  select m.email into v_email from public.merchants m where m.id = p_merchant and m.status is distinct from 'deleted';
  if v_email is null or btrim(v_email) = '' then raise exception 'no_email'; end if;
  -- One send per shop at a time, so two quick clicks can't both pass the check below.
  perform pg_advisory_xact_lock(hashtext('admin_email:' || p_merchant::text));
  if exists (select 1 from public.admin_sent_emails e
              where e.merchant_id = p_merchant and e.subject = btrim(p_subject)
                and e.status <> 'failed' and e.created_at > now() - interval '10 minutes') then
    raise exception 'duplicate_recent';
  end if;
  if (select count(*) from public.admin_sent_emails where created_at > now() - interval '24 hours') >= 200 then
    raise exception 'daily_limit';
  end if;
  v_name := public.admin_shop_name(p_merchant);
  insert into public.admin_sent_emails (merchant_id, to_email, business_name, template, subject, body, sent_by, sent_by_email)
  values (p_merchant, lower(btrim(v_email)), v_name, nullif(p_template, ''), btrim(p_subject), p_body, auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()))
  returning id into v_id;
  perform public.admin_audit('shop_email.send', 'merchant', p_merchant::text, coalesce(v_name, v_email),
                             jsonb_build_object('subject', btrim(p_subject), 'template', p_template));
  return jsonb_build_object('id', v_id, 'to', lower(btrim(v_email)));
end $$;

create or replace function public.admin_email_finish(p_id uuid, p_resend_id text, p_error text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  update public.admin_sent_emails
     set status = case when p_error is null then 'sent' else 'failed' end,
         resend_id = nullif(p_resend_id, ''), error = left(p_error, 500)
   where id = p_id and status = 'sending';
end $$;

create or replace function public.admin_sent_emails_list(p_merchant uuid default null, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (select e.id, e.merchant_id, e.to_email, e.business_name, e.template, e.subject, e.body, e.status,
                   e.error, e.sent_by_email, e.created_at
              from public.admin_sent_emails e
             where p_merchant is null or e.merchant_id = p_merchant
             order by e.created_at desc
             limit greatest(1, least(coalesce(p_limit, 100), 500))) x), '[]'::jsonb);
end $$;

create or replace function public.admin_email_set_optout(p_merchant uuid, p_opted_out boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_opted_out then
    insert into public.admin_email_optouts (merchant_id) values (p_merchant) on conflict (merchant_id) do nothing;
  else
    delete from public.admin_email_optouts where merchant_id = p_merchant;
  end if;
  perform public.admin_audit('shop_email.optout', 'merchant', p_merchant::text, public.admin_shop_name(p_merchant),
                             jsonb_build_object('opted_out', p_opted_out));
end $$;

revoke execute on function public.admin_shop_name(uuid) from public, anon, authenticated;
revoke execute on function public.admin_email_shop_info(uuid) from public, anon;
revoke execute on function public.admin_email_start(uuid, text, text, text) from public, anon;
revoke execute on function public.admin_email_finish(uuid, text, text) from public, anon;
revoke execute on function public.admin_sent_emails_list(uuid, integer) from public, anon;
revoke execute on function public.admin_email_set_optout(uuid, boolean) from public, anon;
grant execute on function public.admin_email_shop_info(uuid) to authenticated;
grant execute on function public.admin_email_start(uuid, text, text, text) to authenticated;
grant execute on function public.admin_email_finish(uuid, text, text) to authenticated;
grant execute on function public.admin_sent_emails_list(uuid, integer) to authenticated;
grant execute on function public.admin_email_set_optout(uuid, boolean) to authenticated;
