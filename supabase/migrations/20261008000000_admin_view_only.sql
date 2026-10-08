-- View-only admins, enforced by the database (not just hidden buttons).
--
-- A viewer can open /admin and read everything the admin panel shows, but
-- cannot change anything: they do NOT get merchants.is_platform_admin, and
-- every admin write (RPCs, blog/notification edits, scans, approvals, plan
-- changes ...) still requires is_platform_admin(). Only the read-only admin
-- functions below accept can_view_admin().

create table if not exists public.admin_viewers (
  email    text primary key check (email = lower(email)),
  note     text,
  added_at timestamptz not null default now()
);
alter table public.admin_viewers enable row level security;  -- no policies: server-side only
revoke all on public.admin_viewers from anon, authenticated;

-- The signed-in user is on the viewer list (verified email only).
create or replace function public.is_admin_viewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_viewers v
      join auth.users u on lower(u.email) = v.email
     where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

-- Full admins and viewers may READ the admin panel.
create or replace function public.can_view_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or public.is_stampfix_admin() or public.is_admin_viewer();
$$;

revoke all on function public.is_admin_viewer() from public, anon;
revoke all on function public.can_view_admin() from public, anon;
grant execute on function public.is_admin_viewer() to authenticated;
grant execute on function public.can_view_admin() to authenticated;

-- The read-only admin functions accept viewers too. Each has exactly one
-- access check at the top; only that check changes (to a superset, so full
-- admins see no difference). Functions that change data are not touched.
do $$
declare
  r record;
  def text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'admin_activity_log', 'admin_customer_activity', 'admin_extended_kpis',
         'admin_get_digest_settings', 'admin_get_merchant_approval', 'admin_get_rejection_reason',
         'admin_job_runs', 'admin_kpi_buckets', 'admin_kpi_range', 'admin_list_audit_log',
         'admin_list_contact_messages', 'admin_list_customers', 'admin_list_deleted_merchants',
         'admin_list_merchant_banners', 'admin_list_merchants', 'admin_list_promo_banners',
         'admin_list_tickets', 'admin_merchant_snapshot', 'admin_platform_stats',
         'admin_recent_activity', 'admin_recent_signups', 'admin_suspicious_stamping',
         'admin_user_phones', 'admin_wallet_errors'])
  loop
    def := pg_get_functiondef(r.oid);
    def := regexp_replace(def, '(public\.)?is_(platform|stampfix)_admin\(\)', 'public.can_view_admin()', 'g');
    execute def;
  end loop;
end $$;

-- Admin panel tabs that read tables directly.
drop policy if exists "blog admin viewer read" on public.blog_posts;
create policy "blog admin viewer read" on public.blog_posts for select using (public.can_view_admin());
drop policy if exists "notif admin viewer read" on public.notifications;
create policy "notif admin viewer read" on public.notifications for select using (public.can_view_admin());
alter policy merchant_activity_read on public.merchant_activity
  using ((merchant_id = auth.uid()) or public.can_view_admin());

-- View-only admin access requested by the owner.
insert into public.admin_viewers (email, note)
values ('rawat.akshaye@gmail.com', 'View-only admin')
on conflict (email) do nothing;
