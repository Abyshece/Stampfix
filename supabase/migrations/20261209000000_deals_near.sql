-- =====================================================================
-- Deals page for customers: "Near me", distance, and one deal by its id.
--
-- public_deals() gets four optional inputs:
--   p_lat, p_lng    the visitor's location (from their browser, only when
--                   they tap "Near me"; it is used for this one answer and
--                   never stored)
--   p_radius_km     only deals within this distance
--   p_id            just this one deal (for a shared link)
-- and a new sort, 'nearest'. Each deal also says where it is ("place":
-- the deal's branch, or else the shop's branch nearest the visitor) and,
-- with a location, how far away it is ("distance_km").
--
-- The old function is replaced; calls without the new inputs work as before.
-- Safe to run more than once.
-- =====================================================================

-- Distance in km between two points (haversine).
create or replace function public.deal_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 6371.0 * 2 * asin(sqrt(
           power(sin(radians(p_lat2 - p_lat1) / 2), 2)
           + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)));
$$;

drop function if exists public.public_deals(text, text, text, text, text, text, text, integer, integer);

create or replace function public.public_deals(p_country text default null, p_city text default null, p_category text default null,
                                               p_type text default null, p_when text default 'all', p_search text default null,
                                               p_sort text default 'ending', p_limit integer default 24, p_offset integer default 0,
                                               p_lat double precision default null, p_lng double precision default null,
                                               p_radius_km numeric default null, p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_q   text := nullif(btrim(left(coalesce(p_search, ''), 80)), '');
  v_lim integer := greatest(1, least(coalesce(p_limit, 24), 60));
  v_off integer := greatest(0, least(coalesce(p_offset, 0), 5000));
  v_geo boolean := p_lat is not null and p_lng is not null and p_lat between -90 and 90 and p_lng between -180 and 180;
  v_rad double precision := case when coalesce(p_radius_km, 0) > 0 then least(p_radius_km, 20000)::double precision end;
  v_res jsonb;
begin
  with v as (
    select d as deal, d.starts_at, d.ends_at, d.created_at,
           public.deal_live_now(d.starts_at, d.ends_at, d.days, d.start_minute, d.end_minute, d.timezone) as live,
           pl.id as place_id, pl.name as place_name, pl.address as place_address, pl.latitude as place_lat, pl.longitude as place_lng,
           case when v_geo and pl.latitude is not null and pl.longitude is not null
                then public.deal_km(p_lat, p_lng, pl.latitude, pl.longitude) end as km
      from public.deals_visible() d
      join public.campaigns c on c.id = d.campaign_id
      -- Where the deal is: its branch, or else the shop's branch nearest the visitor (or the oldest one).
      left join lateral (
        select l.id, l.name, l.address, l.latitude, l.longitude
          from public.locations l
         where l.campaign_id = d.campaign_id and l.archived is not true
           and (d.location_id is null or l.id = d.location_id)
         order by case when v_geo and l.latitude is not null and l.longitude is not null
                       then public.deal_km(p_lat, p_lng, l.latitude, l.longitude) end asc nulls last,
                  l.created_at asc
         limit 1) pl on true
     where (p_id is null or d.id = p_id)
       and (p_country is null or d.country = upper(p_country))
       and (p_city is null or lower(d.city) = lower(btrim(p_city)))
       and (p_category is null or d.category = p_category)
       and (p_type is null or d.deal_type = p_type)
       and (v_q is null or d.title ilike '%' || v_q || '%' or coalesce(d.description, '') ilike '%' || v_q || '%'
            or c.business_name ilike '%' || v_q || '%' or d.city ilike '%' || v_q || '%')
  ), f as (
    select * from v
     where (p_id is not null or case coalesce(p_when, 'all')
             when 'now' then v.live
             when 'week' then v.starts_at < now() + interval '7 days'
             when 'upcoming' then v.starts_at > now()
             else true end)
       and (v_rad is null or not v_geo or (v.km is not null and v.km <= v_rad))
  ), pg as (
    select f.*, row_number() over (
             order by case when coalesce(p_sort, 'ending') = 'nearest' and v_geo then f.km end asc nulls last,
                      case when coalesce(p_sort, 'ending') in ('newest', 'nearest') then null::timestamptz
                           when p_sort = 'starting' then f.starts_at
                           else f.ends_at end asc nulls last,
                      f.created_at desc) as rn
      from f
  )
  select jsonb_build_object(
           'total', (select count(*) from f),
           'deals', coalesce((select jsonb_agg(public.deal_json(pg.deal, false)
                                               || jsonb_build_object(
                                                    'distance_km', case when pg.km is not null then round(pg.km::numeric, 1) end,
                                                    'place', case when pg.place_id is null then null else jsonb_build_object(
                                                      'name', pg.place_name, 'address', pg.place_address,
                                                      'lat', round(pg.place_lat::numeric, 5), 'lng', round(pg.place_lng::numeric, 5)) end)
                                               order by pg.rn)
                                from pg where pg.rn > v_off and pg.rn <= v_off + v_lim), '[]'::jsonb))
    into v_res;
  return v_res;
end $$;

revoke execute on function public.deal_km(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.public_deals(text, text, text, text, text, text, text, integer, integer, double precision, double precision, numeric, uuid) from public;
grant execute on function public.public_deals(text, text, text, text, text, text, text, integer, integer, double precision, double precision, numeric, uuid) to anon, authenticated;
