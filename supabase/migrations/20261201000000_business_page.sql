-- =====================================================================
-- Business page: one page, and one QR code, per shop.
--
-- stampfix.app/v/<address> shows the shop's card (join, or open my card),
-- self-serve stamping, the menu when ordering is on, and the shop's links.
--
-- Only adds new tables and functions. Nothing that exists changes: the old
-- join (/?campaign=), counter stamp (/stamp?campaign=) and table order
-- (/order/) links keep working exactly as before.
--
-- Guests never read the tables: they go through business_page() and
-- page_stamp(). The shop goes through my_business_page(), save_business_page()
-- and set_counter_code(), which check it owns the shop.
--
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.business_pages (
  campaign_id  uuid primary key references public.campaigns(id) on delete cascade,
  -- The page address: stampfix.app/v/<slug>. 3 to 40 of a-z, 0-9 and "-".
  slug         text not null unique
               check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and slug !~ '--'),
  about        text check (about is null or length(about) <= 300),
  -- The code at the till that guests type to collect a stamp from the page.
  -- Separate from the private cashier code (campaigns.stamp_code), which adds
  -- extra stamps and goes past the daily limit.
  counter_code text check (counter_code is null or counter_code ~ '^[0-9]{4}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Addresses a shop used before. A renamed page keeps its printed QR codes working.
create table if not exists public.business_page_aliases (
  slug        text primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists business_page_aliases_campaign_idx on public.business_page_aliases (campaign_id);

alter table public.business_pages enable row level security;
alter table public.business_page_aliases enable row level security;
revoke all on public.business_pages, public.business_page_aliases from anon, authenticated;

-- ---- Helpers (not callable from the browser) --------------------------------

-- "Café Müller & Söhne" -> "cafe-mueller-soehne"
create or replace function public.business_page_slugify(p_name text)
returns text language sql immutable set search_path = public as $$
  select trim(both '-' from left(trim(both '-' from regexp_replace(
           translate(
             replace(replace(replace(replace(replace(replace(lower(coalesce(p_name, '')),
               'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'),
             'àáâãåāăąçćčďèéêëēęěğìíîïıłñńňòóôõøōřśšşťùúûůūýÿžźż',
             'aaaaaaaacccdeeeeeeegiiiiilnnnoooooorssstuuuuuyyzzz'),
           '[^a-z0-9]+', '-', 'g')), 35));
$$;

-- The first free address starting with p_base ("cafe-luna", "cafe-luna-2", ...).
create or replace function public.business_page_free_slug(p_base text, p_campaign uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_base text := p_base;
  v      text;
  i      int := 1;
begin
  if v_base is null or length(v_base) < 3 then
    v_base := 'shop-' || substr(replace(p_campaign::text, '-', ''), 1, 6);
  end if;
  v := v_base;
  loop
    exit when not exists (select 1 from public.business_pages where slug = v and campaign_id <> p_campaign)
          and not exists (select 1 from public.business_page_aliases where slug = v and campaign_id <> p_campaign);
    i := i + 1;
    v := case when i <= 50 then v_base || '-' || i
              else v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4) end;
  end loop;
  return v;
end $$;

-- A random 4-digit code that differs from p_avoid (the cashier code).
create or replace function public.business_page_new_code(p_avoid text)
returns text language plpgsql volatile set search_path = public as $$
declare v text;
begin
  loop
    v := lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when v is distinct from p_avoid;
  end loop;
  return v;
end $$;

revoke execute on function public.business_page_slugify(text) from public, anon, authenticated;
revoke execute on function public.business_page_free_slug(text, uuid) from public, anon, authenticated;
revoke execute on function public.business_page_new_code(text) from public, anon, authenticated;

-- ---- The shop ---------------------------------------------------------------

-- The shop's page; made on first use with an address from the shop's name.
create or replace function public.my_business_page(p_campaign uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v       public.business_pages%rowtype;
  v_name  text;
  v_stamp text;
begin
  select c.business_name, c.stamp_code into v_name, v_stamp
    from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid();
  if not found then raise exception 'not_owner' using errcode = '42501'; end if;

  select * into v from public.business_pages where campaign_id = p_campaign;
  if not found then
    insert into public.business_pages (campaign_id, slug, counter_code)
    values (p_campaign,
            public.business_page_free_slug(public.business_page_slugify(v_name), p_campaign),
            public.business_page_new_code(v_stamp))
    on conflict (campaign_id) do nothing;
    select * into v from public.business_pages where campaign_id = p_campaign;
  end if;
  return jsonb_build_object('slug', v.slug, 'about', v.about, 'counter_code', v.counter_code);
end $$;

-- Change the address and the short description.
create or replace function public.save_business_page(p_campaign uuid, p_slug text, p_about text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v       public.business_pages%rowtype;
  v_slug  text := lower(btrim(coalesce(p_slug, '')));
  v_about text := nullif(btrim(coalesce(p_about, '')), '');
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  select * into v from public.business_pages where campaign_id = p_campaign for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_page'); end if;

  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' or v_slug ~ '--' then
    return jsonb_build_object('ok', false, 'error', 'bad_slug');
  end if;
  if v_about is not null and length(v_about) > 300 then
    return jsonb_build_object('ok', false, 'error', 'about_too_long');
  end if;

  if v_slug <> v.slug then
    if exists (select 1 from public.business_pages where slug = v_slug and campaign_id <> p_campaign)
       or exists (select 1 from public.business_page_aliases where slug = v_slug and campaign_id <> p_campaign) then
      return jsonb_build_object('ok', false, 'error', 'slug_taken');
    end if;
    -- Moving back to an address this shop used before is fine; otherwise
    -- keep the number of old addresses small.
    if not exists (select 1 from public.business_page_aliases where slug = v_slug and campaign_id = p_campaign)
       and (select count(*) from public.business_page_aliases where campaign_id = p_campaign) >= 10 then
      return jsonb_build_object('ok', false, 'error', 'too_many_changes');
    end if;
    insert into public.business_page_aliases (slug, campaign_id) values (v.slug, p_campaign)
      on conflict (slug) do nothing;
    delete from public.business_page_aliases where slug = v_slug and campaign_id = p_campaign;
  end if;

  update public.business_pages set slug = v_slug, about = v_about, updated_at = now()
   where campaign_id = p_campaign returning * into v;
  return jsonb_build_object('ok', true, 'slug', v.slug, 'about', v.about, 'counter_code', v.counter_code);
end $$;

-- Set the counter code, or pick a new random one (p_code null).
create or replace function public.set_counter_code(p_campaign uuid, p_code text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_stamp text;
  v_code  text := nullif(btrim(coalesce(p_code, '')), '');
begin
  select c.stamp_code into v_stamp from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid();
  if not found then raise exception 'not_owner' using errcode = '42501'; end if;
  if v_code is not null and v_code !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;
  -- The cashier code adds extra stamps; it must never be the one at the till.
  if v_code is not null and v_code = v_stamp then
    return jsonb_build_object('ok', false, 'error', 'same_as_cashier_code');
  end if;
  update public.business_pages
     set counter_code = coalesce(v_code, public.business_page_new_code(v_stamp)), updated_at = now()
   where campaign_id = p_campaign
  returning counter_code into v_code;
  if v_code is null then return jsonb_build_object('ok', false, 'error', 'no_page'); end if;
  return jsonb_build_object('ok', true, 'counter_code', v_code);
end $$;

revoke execute on function public.my_business_page(uuid) from public, anon;
revoke execute on function public.save_business_page(uuid, text, text) from public, anon;
revoke execute on function public.set_counter_code(uuid, text) from public, anon;
grant execute on function public.my_business_page(uuid) to authenticated;
grant execute on function public.save_business_page(uuid, text, text) to authenticated;
grant execute on function public.set_counter_code(uuid, text) to authenticated;

-- ---- Guests -----------------------------------------------------------------

-- What the page shows. Null when there is no such page.
create or replace function public.business_page(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_slug     text := lower(btrim(coalesce(p_slug, '')));
  v_campaign uuid;
begin
  if length(v_slug) = 0 or length(v_slug) > 60 then return null; end if;
  select bp.campaign_id into v_campaign from public.business_pages bp where bp.slug = v_slug;
  if v_campaign is null then
    select a.campaign_id into v_campaign from public.business_page_aliases a where a.slug = v_slug;
  end if;
  if v_campaign is null then return null; end if;

  return (
    select jsonb_build_object(
      'campaign_id',     c.id,
      'merchant_id',     c.merchant_id,
      'slug',            bp.slug,
      'business_name',   c.business_name,
      'offer_title',     c.offer_title,
      'max_stamps',      c.max_stamps,
      'logo_image',      c.logo_image,
      'logo_mode',       c.logo_mode,
      'custom_icon',     c.custom_icon,
      'primary_color',   c.primary_color,
      'card_color',      c.card_color,
      'card_text_color', c.card_text_color,
      'about',           bp.about,
      'links',           coalesce(c.social_links, '{}'::jsonb),
      'approved',        c.approval_status = 'approved',
      'available',       coalesce(m.status, 'active') = 'active',
      'self_serve',      coalesce(c.stamping_mode, 'scanner') = 'self_serve' and bp.counter_code is not null,
      'ordering_open',   public.ordering_open(c.id),
      'locations',       coalesce((
        select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.created_at, l.id)
          from public.locations l
         where l.campaign_id = c.id and not coalesce(l.archived, false)), '[]'::jsonb))
      from public.campaigns c
      join public.merchants m on m.id = c.merchant_id
      join public.business_pages bp on bp.campaign_id = c.id
     where c.id = v_campaign);
end $$;

-- A stamp from the page: the counter code first, then exactly the checks of
-- the counter stamp QR (at the shop, 45 minutes apart, the daily limit).
create or replace function public.page_stamp(
  p_campaign uuid, p_location uuid, p_lat double precision, p_lng double precision,
  p_email text default null, p_counter_code text default null, p_tz text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_mode text;
  v_code text;
  v_key  text;
begin
  select c.stamping_mode into v_mode from public.campaigns c where c.id = p_campaign;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if coalesce(v_mode, 'scanner') <> 'self_serve' then
    return jsonb_build_object('ok', false, 'error', 'self_serve_off');
  end if;
  -- Nobody to stamp yet: ask who they are before trying the code.
  if auth.uid() is null and length(btrim(coalesce(p_email, ''))) = 0 then
    return jsonb_build_object('ok', false, 'error', 'card_not_found');
  end if;

  select bp.counter_code into v_code from public.business_pages bp where bp.campaign_id = p_campaign;
  if v_code is null then return jsonb_build_object('ok', false, 'error', 'no_counter_code'); end if;

  v_key := p_campaign::text || ':' || coalesce(auth.uid()::text, lower(btrim(p_email)));
  if not public.rate_limit_hit('page_counter_code', v_key, 5, 900, 1800) then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;
  if btrim(coalesce(p_counter_code, '')) <> v_code then
    return jsonb_build_object('ok', false, 'error', 'bad_counter_code');
  end if;
  perform public.rate_limit_clear('page_counter_code', v_key);

  -- One stamp, no cashier code: the single-stamp path with all its limits.
  return public.self_serve_stamp(p_campaign, p_location, p_lat, p_lng, p_email, null, 1, p_tz);
end $$;

grant execute on function public.business_page(text) to anon, authenticated;
grant execute on function public.page_stamp(uuid, uuid, double precision, double precision, text, text, text) to anon, authenticated;
