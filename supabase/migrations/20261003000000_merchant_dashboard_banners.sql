-- Merchant dashboard banners: announcements from Stampfix shown at the top of
-- the merchant dashboard (like the promo banners on the public site, but for
-- merchants). Managed in Admin → Merchant Banners.
--
-- A banner can target a plan (all / free / pro) and a minimum number of
-- active customers, run in a date window, carry an English and an optional
-- German text, and have a button that opens a dashboard page or a link.
-- Closing a banner (or clicking its button) is saved per merchant, so it
-- doesn't come back on another device. The dashboard shows it to the owner
-- only (not in staff mode) and never on the scanner screen.

create table if not exists public.merchant_banners (
  id            uuid primary key default gen_random_uuid(),
  headline      text not null check (char_length(btrim(headline)) between 1 and 160),
  body          text check (body is null or char_length(body) <= 300),
  headline_de   text check (headline_de is null or char_length(headline_de) <= 160),
  body_de       text check (body_de is null or char_length(body_de) <= 300),
  cta_label     text check (cta_label is null or char_length(cta_label) <= 40),
  cta_label_de  text check (cta_label_de is null or char_length(cta_label_de) <= 40),
  -- The button opens either a dashboard page or a web link (not both).
  cta_tab       text check (cta_tab is null or cta_tab in
                  ('CUSTOMERS', 'ACTIVITY', 'ANALYTICS', 'OFFERS', 'VALUE', 'STAFF', 'PREVIEW', 'SETTINGS', 'SHARE', 'HELP')),
  cta_url       text check (cta_url is null or cta_url ~* '^https?://[^[:space:]]+$'),
  variant       text not null default 'blue' check (variant in ('red', 'blue', 'green', 'amber')),
  audience      text not null default 'all' check (audience in ('all', 'free', 'pro')),
  min_customers integer not null default 0 check (min_customers between 0 and 100000),
  is_active     boolean not null default false,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (cta_tab is null or cta_url is null)
);
alter table public.merchant_banners enable row level security;
revoke all on public.merchant_banners from anon, authenticated;

create table if not exists public.merchant_banner_dismissals (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  banner_id   uuid not null references public.merchant_banners(id) on delete cascade,
  clicked     boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (merchant_id, banner_id)
);
create index if not exists merchant_banner_dismissals_banner_idx on public.merchant_banner_dismissals (banner_id);
alter table public.merchant_banner_dismissals enable row level security;
revoke all on public.merchant_banner_dismissals from anon, authenticated;

-- ---------------------------------------------------------------- merchant side
-- The banners the signed-in merchant should see now: active, in their date
-- window, for their plan, with enough customers, not closed yet. Newest first.
create or replace function public.my_dashboard_banners()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_plan      text;
  v_customers integer;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select coalesce(plan, 'free') into v_plan
    from public.merchants where id = v_uid and coalesce(status, 'active') <> 'deleted';
  if not found then return '[]'::jsonb; end if;
  select count(*) into v_customers
    from public.cards c join public.campaigns ca on ca.id = c.campaign_id
   where ca.merchant_id = v_uid and c.status = 'ACTIVE';

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'headline', b.headline, 'body', b.body,
             'headline_de', b.headline_de, 'body_de', b.body_de,
             'cta_label', b.cta_label, 'cta_label_de', b.cta_label_de,
             'cta_tab', b.cta_tab, 'cta_url', b.cta_url, 'variant', b.variant)
           order by coalesce(b.starts_at, b.created_at) desc)
      from public.merchant_banners b
     where b.is_active
       and (b.starts_at is null or b.starts_at <= now())
       and (b.ends_at is null or b.ends_at > now())
       and (b.audience = 'all' or b.audience = v_plan)
       and v_customers >= b.min_customers
       and not exists (select 1 from public.merchant_banner_dismissals d
                        where d.banner_id = b.id and d.merchant_id = v_uid)
  ), '[]'::jsonb);
end $$;

-- Closes a banner for the signed-in merchant (for good, on every device).
-- p_clicked = they pressed the banner's button rather than the ×.
create or replace function public.dismiss_dashboard_banner(p_banner uuid, p_clicked boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.merchants where id = auth.uid()) then return; end if;
  if not exists (select 1 from public.merchant_banners where id = p_banner) then return; end if;
  insert into public.merchant_banner_dismissals (merchant_id, banner_id, clicked)
  values (auth.uid(), p_banner, coalesce(p_clicked, false))
  on conflict (merchant_id, banner_id)
  do update set clicked = public.merchant_banner_dismissals.clicked or excluded.clicked;
end $$;
revoke execute on function public.my_dashboard_banners() from public, anon;
revoke execute on function public.dismiss_dashboard_banner(uuid, boolean) from public, anon;
grant execute on function public.my_dashboard_banners() to authenticated;
grant execute on function public.dismiss_dashboard_banner(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- admin side
-- All banners, with how many merchants it reaches right now and how many
-- clicked its button / closed it.
create or replace function public.admin_list_merchant_banners()
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
      select b.*,
             (select count(*) from public.merchant_banner_dismissals d where d.banner_id = b.id and d.clicked) as clicked_count,
             (select count(*) from public.merchant_banner_dismissals d where d.banner_id = b.id and not d.clicked) as closed_count,
             (select count(*) from public.merchants m
               where m.status = 'active'
                 and (b.audience = 'all' or coalesce(m.plan, 'free') = b.audience)
                 and (select count(*) from public.cards c join public.campaigns ca on ca.id = c.campaign_id
                       where ca.merchant_id = m.id and c.status = 'ACTIVE') >= b.min_customers) as eligible_count
        from public.merchant_banners b
    ) t
  ), '[]'::jsonb);
end $$;

-- Creates (p_id null) or updates a banner. Returns its id.
create or replace function public.admin_upsert_merchant_banner(p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_start timestamptz := nullif(p_data ->> 'starts_at', '')::timestamptz;
  v_end   timestamptz := nullif(p_data ->> 'ends_at', '')::timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  if nullif(btrim(p_data ->> 'headline'), '') is null then
    raise exception 'The headline is required.' using errcode = '22023';
  end if;
  if v_start is not null and v_end is not null and v_end <= v_start then
    raise exception 'The end must be after the start.' using errcode = '22023';
  end if;
  if nullif(btrim(p_data ->> 'cta_tab'), '') is not null and nullif(btrim(p_data ->> 'cta_url'), '') is not null then
    raise exception 'Choose either a dashboard page or a link for the button, not both.' using errcode = '22023';
  end if;
  if (nullif(btrim(p_data ->> 'cta_tab'), '') is not null or nullif(btrim(p_data ->> 'cta_url'), '') is not null)
     and nullif(btrim(p_data ->> 'cta_label'), '') is null then
    raise exception 'Give the button a label.' using errcode = '22023';
  end if;
  if nullif(btrim(p_data ->> 'cta_url'), '') is not null and btrim(p_data ->> 'cta_url') !~* '^https?://[^[:space:]]+$' then
    raise exception 'The link must start with https://' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.merchant_banners
      (headline, body, headline_de, body_de, cta_label, cta_label_de, cta_tab, cta_url,
       variant, audience, min_customers, is_active, starts_at, ends_at)
    values
      (btrim(p_data ->> 'headline'), nullif(btrim(p_data ->> 'body'), ''),
       nullif(btrim(p_data ->> 'headline_de'), ''), nullif(btrim(p_data ->> 'body_de'), ''),
       nullif(btrim(p_data ->> 'cta_label'), ''), nullif(btrim(p_data ->> 'cta_label_de'), ''),
       nullif(btrim(p_data ->> 'cta_tab'), ''), nullif(btrim(p_data ->> 'cta_url'), ''),
       coalesce(nullif(p_data ->> 'variant', ''), 'blue'), coalesce(nullif(p_data ->> 'audience', ''), 'all'),
       greatest(0, coalesce(nullif(p_data ->> 'min_customers', '')::integer, 0)),
       coalesce((p_data ->> 'is_active')::boolean, false), v_start, v_end)
    returning id into v_id;
  else
    update public.merchant_banners set
      headline      = btrim(p_data ->> 'headline'),
      body          = nullif(btrim(p_data ->> 'body'), ''),
      headline_de   = nullif(btrim(p_data ->> 'headline_de'), ''),
      body_de       = nullif(btrim(p_data ->> 'body_de'), ''),
      cta_label     = nullif(btrim(p_data ->> 'cta_label'), ''),
      cta_label_de  = nullif(btrim(p_data ->> 'cta_label_de'), ''),
      cta_tab       = nullif(btrim(p_data ->> 'cta_tab'), ''),
      cta_url       = nullif(btrim(p_data ->> 'cta_url'), ''),
      variant       = coalesce(nullif(p_data ->> 'variant', ''), 'blue'),
      audience      = coalesce(nullif(p_data ->> 'audience', ''), 'all'),
      min_customers = greatest(0, coalesce(nullif(p_data ->> 'min_customers', '')::integer, 0)),
      is_active     = coalesce((p_data ->> 'is_active')::boolean, false),
      starts_at     = v_start,
      ends_at       = v_end,
      updated_at    = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Banner not found.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.admin_delete_merchant_banner(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  delete from public.merchant_banners where id = p_id;
end $$;

-- Admin action log.
create or replace function public.audit_merchant_banners_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then return null; end if;
  if tg_op = 'INSERT' then
    perform public.admin_audit('merchant_banner.create', 'merchant_banner', new.id::text, new.headline, null);
  elsif tg_op = 'UPDATE' then
    perform public.admin_audit('merchant_banner.update', 'merchant_banner', new.id::text, new.headline,
      case when old.is_active is distinct from new.is_active
           then jsonb_build_object('active', new.is_active) else '{}'::jsonb end);
  else
    perform public.admin_audit('merchant_banner.delete', 'merchant_banner', old.id::text, old.headline, null);
  end if;
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists zz_audit_admin on public.merchant_banners;
create trigger zz_audit_admin after insert or update or delete on public.merchant_banners
  for each row execute function public.audit_merchant_banners_admin();

-- The Campaigns announcement, live for shops with 3+ customers.
insert into public.merchant_banners
  (headline, body, headline_de, body_de, cta_label, cta_label_de, cta_tab, variant, audience, min_customers, is_active)
select
  'New: send a message straight to your customers'' wallet cards',
  'Like “Double stamps this weekend” — it pops up on their lock screen.',
  'Neu: Senden Sie eine Nachricht direkt an die Wallet-Karten Ihrer Kunden',
  'Zum Beispiel „Doppelte Stempel dieses Wochenende“ – sie erscheint auf dem Sperrbildschirm.',
  'Try Campaigns', 'Kampagnen ausprobieren', 'OFFERS', 'blue', 'all', 3, true
where not exists (select 1 from public.merchant_banners where cta_tab = 'OFFERS' and headline like 'New: send a message%');
