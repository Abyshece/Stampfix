-- =====================================================================
-- Deals: shops list deals, and the public /deals page shows them.
--
-- A shop owner creates a deal in the dashboard (Deals in the sidebar):
-- title, kind (percent off, amount off, free item, 2 for 1, other), value,
-- description, promo code, fine print, business type, city, branch,
-- start and end, days of the week and hours. It shows on stampfix.app/deals
-- from its start until its end, unless the owner pauses it or a Stampfix
-- admin hides it. Every plan can list deals; at most 25 that have not ended.
--
-- Only approved shops that are not deleted are shown. No one reads the
-- table directly; everything goes through the functions below.
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.deals (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  location_id   uuid references public.locations(id) on delete set null,
  title         text not null check (char_length(btrim(title)) between 3 and 80),
  deal_type     text not null check (deal_type in ('percent', 'amount', 'free', 'bogo', 'other')),
  value         numeric(10, 2) check (value is null or (value > 0 and value <= 100000)),
  currency      text check (currency is null or currency in ('CAD', 'EUR', 'USD')),
  description   text check (description is null or char_length(description) <= 500),
  code          text check (code is null or code ~ '^[A-Z0-9_-]{2,30}$'),
  terms         text check (terms is null or char_length(terms) <= 300),
  category      text not null check (category in (
                  'cafe', 'restaurant', 'bakery', 'iceCream', 'snackBar', 'pizzeria', 'bar', 'florist',
                  'nailStudio', 'hairdresser', 'barbershop', 'tattoo', 'gym', 'retail', 'doner', 'bubbleTea',
                  'foodTruck', 'lashBrow', 'spa', 'carWash', 'dogGrooming', 'dryCleaner', 'yoga', 'other')),
  city          text not null check (char_length(btrim(city)) between 2 and 60),
  country       text check (country is null or country ~ '^[A-Z]{2}$'),
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz not null,
  days          smallint[],                      -- ISO weekdays 1 (Mon) to 7 (Sun); empty = every day
  start_minute  smallint check (start_minute between 0 and 1439),
  end_minute    smallint check (end_minute between 1 and 1440),
  timezone      text not null default 'UTC',
  status        text not null default 'active' check (status in ('active', 'paused')),
  hidden        boolean not null default false,
  hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint deals_dates check (ends_at > starts_at),
  constraint deals_hours check ((start_minute is null) = (end_minute is null) and (start_minute is null or start_minute <> end_minute))
);
create index if not exists deals_campaign_idx on public.deals (campaign_id);
create index if not exists deals_public_idx on public.deals (ends_at) where status = 'active' and not hidden;
alter table public.deals enable row level security;
revoke all on public.deals from anon, authenticated;

-- A time zone name Postgres knows, or null.
create or replace function public.deal_valid_tz(p_tz text)
returns text language sql stable set search_path = public as $$
  select case when exists (select 1 from pg_timezone_names where name = btrim(p_tz)) then btrim(p_tz) else null end;
$$;

-- On right now: inside its dates, on one of its days and inside its hours (in the shop's time zone).
create or replace function public.deal_live_now(p_starts timestamptz, p_ends timestamptz, p_days smallint[],
                                                p_start smallint, p_end smallint, p_tz text)
returns boolean language sql stable set search_path = public as $$
  with z as (select now() at time zone coalesce(nullif(p_tz, ''), 'UTC') as t),
       m as (select t, (extract(hour from t) * 60 + extract(minute from t))::int as mins from z)
  select p_starts <= now() and p_ends > now()
     and (p_days is null or cardinality(p_days) = 0 or extract(isodow from m.t)::smallint = any(p_days))
     and (p_start is null
          or (p_start < p_end and m.mins >= p_start and m.mins < p_end)
          or (p_start > p_end and (m.mins >= p_start or m.mins < p_end)))
    from m;
$$;

-- The state the owner sees.
create or replace function public.deal_state(d public.deals)
returns text language sql stable set search_path = public as $$
  select case when d.hidden then 'hidden'
              when d.status = 'paused' then 'paused'
              when d.ends_at <= now() then 'ended'
              when d.starts_at > now() then 'scheduled'
              else 'live' end;
$$;

-- One deal as JSON. p_owner adds what only the owner and admins see.
create or replace function public.deal_json(d public.deals, p_owner boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'id', d.id, 'title', d.title, 'deal_type', d.deal_type, 'value', d.value, 'currency', d.currency,
           'description', d.description, 'code', d.code, 'terms', d.terms, 'category', d.category,
           'city', d.city, 'country', d.country, 'starts_at', d.starts_at, 'ends_at', d.ends_at,
           'days', coalesce(to_jsonb(d.days), '[]'::jsonb), 'start_minute', d.start_minute, 'end_minute', d.end_minute,
           'timezone', d.timezone, 'live_now', public.deal_live_now(d.starts_at, d.ends_at, d.days, d.start_minute, d.end_minute, d.timezone),
           'location', case when l.id is null then null else jsonb_build_object('id', l.id, 'name', l.name, 'address', l.address) end,
           'business', jsonb_build_object('name', c.business_name, 'logo_image', c.logo_image, 'logo_text', c.logo_text,
                                          'color', coalesce(c.card_color, c.primary_color), 'text_color', c.card_text_color,
                                          'link', case when bp.slug is not null then '/v/' || bp.slug else '/?campaign=' || c.id::text end))
         || case when p_owner then jsonb_build_object('status', d.status, 'state', public.deal_state(d), 'hidden', d.hidden,
                                                      'hidden_reason', d.hidden_reason, 'location_id', d.location_id,
                                                      'created_at', d.created_at, 'updated_at', d.updated_at)
                 else '{}'::jsonb end
    from public.campaigns c
    left join public.business_pages bp on bp.campaign_id = c.id
    left join public.locations l on l.id = d.location_id and l.archived is not true
   where c.id = d.campaign_id;
$$;

-- ---- Owner ---------------------------------------------------------------

create or replace function public.my_deals(p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(public.deal_json(d, true) order by (d.ends_at <= now()), d.starts_at desc, d.created_at desc)
                     from public.deals d where d.campaign_id = p_campaign), '[]'::jsonb);
end $$;

-- Create (no "id") or change (with "id") a deal. Errors name the field: deal_title, deal_value, ...
create or replace function public.save_deal(p_campaign uuid, p_deal jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_id       uuid := nullif(p_deal->>'id', '')::uuid;
  v_title    text := btrim(coalesce(p_deal->>'title', ''));
  v_type     text := coalesce(p_deal->>'deal_type', '');
  v_value    numeric;
  v_currency text := nullif(upper(btrim(coalesce(p_deal->>'currency', ''))), '');
  v_desc     text := nullif(btrim(coalesce(p_deal->>'description', '')), '');
  v_code     text := nullif(upper(regexp_replace(btrim(coalesce(p_deal->>'code', '')), '\s+', '', 'g')), '');
  v_terms    text := nullif(btrim(coalesce(p_deal->>'terms', '')), '');
  v_cat      text := coalesce(p_deal->>'category', '');
  v_city     text := btrim(regexp_replace(coalesce(p_deal->>'city', ''), '\s+', ' ', 'g'));
  v_loc      uuid := nullif(p_deal->>'location_id', '')::uuid;
  v_starts   timestamptz;
  v_ends     timestamptz;
  v_days     smallint[];
  v_sm       smallint := nullif(p_deal->>'start_minute', '')::smallint;
  v_em       smallint := nullif(p_deal->>'end_minute', '')::smallint;
  v_tz       text := coalesce(public.deal_valid_tz(p_deal->>'timezone'), 'UTC');
  v_status   text := coalesce(nullif(p_deal->>'status', ''), 'active');
  v_country  text;
  d          public.deals;
begin
  select m.country into v_country
    from public.campaigns c join public.merchants m on m.id = c.merchant_id
   where c.id = p_campaign and c.merchant_id = auth.uid();
  if not found then raise exception 'not_owner' using errcode = '42501'; end if;

  if char_length(v_title) not between 3 and 80 then raise exception 'deal_title'; end if;
  if v_type not in ('percent', 'amount', 'free', 'bogo', 'other') then raise exception 'deal_type'; end if;
  begin v_value := nullif(p_deal->>'value', '')::numeric; exception when others then raise exception 'deal_value'; end;
  if v_type = 'percent' and (v_value is null or v_value < 1 or v_value > 100) then raise exception 'deal_value'; end if;
  if v_type = 'amount' and (v_value is null or v_value <= 0 or v_value > 100000) then raise exception 'deal_value'; end if;
  if v_type not in ('percent', 'amount') then v_value := null; end if;
  if v_type = 'amount' then
    v_currency := coalesce(v_currency, case upper(coalesce(v_country, '')) when 'DE' then 'EUR' when 'CA' then 'CAD' else 'USD' end);
    if v_currency not in ('CAD', 'EUR', 'USD') then raise exception 'deal_value'; end if;
  else
    v_currency := null;
  end if;
  if v_desc is not null and char_length(v_desc) > 500 then raise exception 'deal_description'; end if;
  if v_code is not null and v_code !~ '^[A-Z0-9_-]{2,30}$' then raise exception 'deal_code'; end if;
  if v_terms is not null and char_length(v_terms) > 300 then raise exception 'deal_terms'; end if;
  if v_cat not in ('cafe', 'restaurant', 'bakery', 'iceCream', 'snackBar', 'pizzeria', 'bar', 'florist',
                   'nailStudio', 'hairdresser', 'barbershop', 'tattoo', 'gym', 'retail', 'doner', 'bubbleTea',
                   'foodTruck', 'lashBrow', 'spa', 'carWash', 'dogGrooming', 'dryCleaner', 'yoga', 'other') then
    raise exception 'deal_category';
  end if;
  if char_length(v_city) not between 2 and 60 then raise exception 'deal_city'; end if;
  if v_loc is not null and not exists (select 1 from public.locations l where l.id = v_loc and l.campaign_id = p_campaign and l.archived is not true) then
    raise exception 'deal_location';
  end if;
  begin
    v_starts := coalesce(nullif(p_deal->>'starts_at', '')::timestamptz, now());
    v_ends := nullif(p_deal->>'ends_at', '')::timestamptz;
  exception when others then raise exception 'deal_dates';
  end;
  if v_ends is null or v_ends <= v_starts or v_ends <= now() or v_ends > v_starts + interval '366 days'
     or v_starts > now() + interval '366 days' then
    raise exception 'deal_dates';
  end if;
  begin
    select array_agg(distinct x::smallint order by x::smallint) into v_days
      from jsonb_array_elements_text(coalesce(p_deal->'days', '[]'::jsonb)) x;
  exception when others then raise exception 'deal_days';
  end;
  if v_days is not null and exists (select 1 from unnest(v_days) x where x not between 1 and 7) then raise exception 'deal_days'; end if;
  if v_days is not null and cardinality(v_days) = 7 then v_days := null; end if;
  if (v_sm is null) <> (v_em is null) or (v_sm is not null and (v_sm not between 0 and 1439 or v_em not between 1 and 1440 or v_sm = v_em)) then
    raise exception 'deal_hours';
  end if;
  if v_status not in ('active', 'paused') then raise exception 'deal_status'; end if;

  -- One change at a time per shop, so two quick saves can't both pass the limit.
  perform pg_advisory_xact_lock(hashtext('deals:' || p_campaign::text));
  if (select count(*) from public.deals x where x.campaign_id = p_campaign and x.ends_at > now()
        and (v_id is null or x.id <> v_id)) >= 25 then
    raise exception 'deal_limit';
  end if;

  if v_id is null then
    insert into public.deals (campaign_id, location_id, title, deal_type, value, currency, description, code, terms,
                              category, city, country, starts_at, ends_at, days, start_minute, end_minute, timezone, status)
    values (p_campaign, v_loc, v_title, v_type, v_value, v_currency, v_desc, v_code, v_terms,
            v_cat, v_city, upper(nullif(v_country, '')), v_starts, v_ends, v_days, v_sm, v_em, v_tz, v_status)
    returning * into d;
  else
    update public.deals set location_id = v_loc, title = v_title, deal_type = v_type, value = v_value, currency = v_currency,
           description = v_desc, code = v_code, terms = v_terms, category = v_cat, city = v_city,
           country = upper(nullif(v_country, '')), starts_at = v_starts, ends_at = v_ends, days = v_days,
           start_minute = v_sm, end_minute = v_em, timezone = v_tz, status = v_status, updated_at = now()
     where id = v_id and campaign_id = p_campaign
    returning * into d;
    if not found then raise exception 'deal_not_found'; end if;
  end if;
  return public.deal_json(d, true);
end $$;

create or replace function public.set_deal_status(p_id uuid, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare d public.deals;
begin
  if p_status not in ('active', 'paused') then raise exception 'deal_status'; end if;
  update public.deals x set status = p_status, updated_at = now()
    from public.campaigns c
   where x.id = p_id and c.id = x.campaign_id and c.merchant_id = auth.uid()
  returning x.* into d;
  if not found then raise exception 'not_owner' using errcode = '42501'; end if;
  return public.deal_json(d, true);
end $$;

create or replace function public.delete_deal(p_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  delete from public.deals x using public.campaigns c
   where x.id = p_id and c.id = x.campaign_id and c.merchant_id = auth.uid();
  if not found then raise exception 'not_owner' using errcode = '42501'; end if;
  return true;
end $$;

-- ---- Public marketplace -----------------------------------------------------

-- The deals anyone can see: active, not hidden, not ended, from approved shops that are not deleted.
create or replace function public.deals_visible()
returns setof public.deals language sql stable security definer set search_path = public as $$
  select d.* from public.deals d
    join public.campaigns c on c.id = d.campaign_id
    join public.merchants m on m.id = c.merchant_id
   where d.status = 'active' and not d.hidden and d.ends_at > now()
     and coalesce(c.approval_status, 'approved') = 'approved'
     and coalesce(m.status, 'active') = 'active';
$$;

-- p_when: 'all' (on now or coming up), 'now' (on right now), 'week' (on at some point in the next 7 days), 'upcoming' (not started).
-- p_sort: 'ending' (ends soonest first), 'newest', 'starting' (starts soonest first).
create or replace function public.public_deals(p_country text default null, p_city text default null, p_category text default null,
                                               p_type text default null, p_when text default 'all', p_search text default null,
                                               p_sort text default 'ending', p_limit integer default 24, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_q   text := nullif(btrim(left(coalesce(p_search, ''), 80)), '');
  v_lim integer := greatest(1, least(coalesce(p_limit, 24), 60));
  v_off integer := greatest(0, least(coalesce(p_offset, 0), 5000));
  v_res jsonb;
begin
  with v as (
    select d as deal, d.starts_at, d.ends_at, d.created_at,
           public.deal_live_now(d.starts_at, d.ends_at, d.days, d.start_minute, d.end_minute, d.timezone) as live
      from public.deals_visible() d
      join public.campaigns c on c.id = d.campaign_id
     where (p_country is null or d.country = upper(p_country))
       and (p_city is null or lower(d.city) = lower(btrim(p_city)))
       and (p_category is null or d.category = p_category)
       and (p_type is null or d.deal_type = p_type)
       and (v_q is null or d.title ilike '%' || v_q || '%' or coalesce(d.description, '') ilike '%' || v_q || '%'
            or c.business_name ilike '%' || v_q || '%' or d.city ilike '%' || v_q || '%')
  ), f as (
    select * from v
     where case coalesce(p_when, 'all')
             when 'now' then v.live
             when 'week' then v.starts_at < now() + interval '7 days'
             when 'upcoming' then v.starts_at > now()
             else true end
  ), pg as (
    select f.deal, row_number() over (
             order by case when coalesce(p_sort, 'ending') = 'newest' then null::timestamptz
                           when p_sort = 'starting' then f.starts_at
                           else f.ends_at end asc nulls last,
                      f.created_at desc) as rn
      from f
  )
  select jsonb_build_object(
           'total', (select count(*) from f),
           'deals', coalesce((select jsonb_agg(public.deal_json(pg.deal, false) order by pg.rn)
                                from pg where pg.rn > v_off and pg.rn <= v_off + v_lim), '[]'::jsonb))
    into v_res;
  return v_res;
end $$;

-- What the filters can offer: countries, cities, business types and deal kinds that have deals now or coming up.
create or replace function public.public_deal_filters()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', (select count(*) from public.deals_visible()),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'n', n) order by n desc, country)
                             from (select country, count(*) n from public.deals_visible() where country is not null group by country) x), '[]'::jsonb),
    'cities', coalesce((select jsonb_agg(jsonb_build_object('city', city, 'country', country, 'n', n) order by n desc, city)
                          from (select min(city) as city, country, count(*) n from public.deals_visible()
                                 group by lower(city), country) x), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('key', category, 'n', n) order by n desc, category)
                              from (select category, count(*) n from public.deals_visible() group by category) x), '[]'::jsonb),
    'types', coalesce((select jsonb_agg(jsonb_build_object('key', deal_type, 'n', n) order by n desc, deal_type)
                         from (select deal_type, count(*) n from public.deals_visible() group by deal_type) x), '[]'::jsonb));
$$;

-- ---- Admin ------------------------------------------------------------------

-- p_view: 'all', 'live' (on the marketplace now or coming up), 'hidden'.
create or replace function public.admin_deals(p_view text default 'all', p_search text default null, p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  return coalesce((
    select jsonb_agg(public.deal_json(s.deal, true) || jsonb_build_object('campaign_id', (s.deal).campaign_id) order by s.created_at desc)
      from (select d as deal, d.created_at from public.deals d join public.campaigns c on c.id = d.campaign_id
             where case coalesce(p_view, 'all')
                     when 'hidden' then d.hidden
                     when 'live' then d.id in (select v.id from public.deals_visible() v)
                     else true end
               and (v_q is null or d.title ilike '%' || v_q || '%' or c.business_name ilike '%' || v_q || '%' or d.city ilike '%' || v_q || '%')
             order by d.created_at desc
             limit greatest(1, least(coalesce(p_limit, 300), 1000))) s), '[]'::jsonb);
end $$;

create or replace function public.admin_set_deal_hidden(p_id uuid, p_hidden boolean, p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare d public.deals; v_name text;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  update public.deals set hidden = coalesce(p_hidden, false),
         hidden_reason = case when coalesce(p_hidden, false) then nullif(btrim(left(coalesce(p_reason, ''), 300)), '') else null end,
         updated_at = now()
   where id = p_id returning * into d;
  if not found then raise exception 'deal_not_found'; end if;
  select business_name into v_name from public.campaigns where id = d.campaign_id;
  perform public.admin_audit(case when d.hidden then 'deal_hide' else 'deal_unhide' end, 'deal', d.id::text,
                             coalesce(v_name, '') || ': ' || d.title, jsonb_build_object('reason', d.hidden_reason));
  return public.deal_json(d, true);
end $$;

-- ---- Access -----------------------------------------------------------------
revoke execute on function public.deal_valid_tz(text) from public, anon, authenticated;
revoke execute on function public.deal_live_now(timestamptz, timestamptz, smallint[], smallint, smallint, text) from public, anon, authenticated;
revoke execute on function public.deal_state(public.deals) from public, anon, authenticated;
revoke execute on function public.deal_json(public.deals, boolean) from public, anon, authenticated;
revoke execute on function public.deals_visible() from public, anon, authenticated;
revoke execute on function public.my_deals(uuid) from public, anon;
revoke execute on function public.save_deal(uuid, jsonb) from public, anon;
revoke execute on function public.set_deal_status(uuid, text) from public, anon;
revoke execute on function public.delete_deal(uuid) from public, anon;
revoke execute on function public.admin_deals(text, text, integer) from public, anon;
revoke execute on function public.admin_set_deal_hidden(uuid, boolean, text) from public, anon;
revoke execute on function public.public_deals(text, text, text, text, text, text, text, integer, integer) from public;
revoke execute on function public.public_deal_filters() from public;
grant execute on function public.my_deals(uuid) to authenticated;
grant execute on function public.save_deal(uuid, jsonb) to authenticated;
grant execute on function public.set_deal_status(uuid, text) to authenticated;
grant execute on function public.delete_deal(uuid) to authenticated;
grant execute on function public.admin_deals(text, text, integer) to authenticated;
grant execute on function public.admin_set_deal_hidden(uuid, boolean, text) to authenticated;
grant execute on function public.public_deals(text, text, text, text, text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.public_deal_filters() to anon, authenticated;
