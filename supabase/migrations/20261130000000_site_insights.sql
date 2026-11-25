-- Website insights: our own visitor analytics for stampfix.app.
--
-- Collected only from visitors who allow "Analytics" in the cookie banner.
-- No IP addresses, no user agents, no names or emails: a random visitor id
-- kept in the visitor's browser, the public pages they view, how long and how
-- far they read, and what they click. Nothing is shared with anyone else.
-- Everything is deleted after 13 months.
--
--   site_sessions   one visit (ends after 30 minutes without activity)
--   site_pageviews  one page in a visit
--   site_events     clicks, rage and dead clicks, video plays, form steps
--
-- The browser writes only through site_track(); the admin panel reads only
-- through admin_site_insights() and admin_site_heatmap().

create table if not exists public.site_sessions (
  id            uuid primary key,
  visitor_id    uuid not null,
  is_new        boolean not null default false,      -- the visitor's first visit
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  duration_ms   integer not null default 0,          -- first page to last activity
  landing_path  text not null,
  exit_path     text,
  source        text not null default 'direct',
  referrer_host text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  device        text not null default 'desktop',
  lang          text,
  pageviews     integer not null default 0,
  engaged_ms    bigint not null default 0,
  actions       integer not null default 0,
  events        integer not null default 0,
  converted     boolean not null default false,      -- sent the signup or contact form
  constraint site_sessions_source check (source in ('direct', 'search', 'social', 'referral', 'email', 'campaign')),
  constraint site_sessions_device check (device in ('mobile', 'tablet', 'desktop'))
);
create index if not exists site_sessions_started on public.site_sessions (started_at);
create index if not exists site_sessions_visitor on public.site_sessions (visitor_id, started_at);

create table if not exists public.site_pageviews (
  id          uuid primary key,
  session_id  uuid not null references public.site_sessions (id) on delete cascade,
  seq         integer not null default 1,
  path        text not null,
  started_at  timestamptz not null default now(),
  engaged_ms  integer not null default 0,   -- on screen, in focus, someone there (max 30 min)
  visible_ms  integer not null default 0,   -- on screen (max 30 min): "time on page"
  scroll_pct  smallint not null default 0,  -- furthest point reached, 0..100
  actions     integer not null default 0,   -- clicks on buttons and links
  page_h      integer,
  view_w      integer,
  sections    jsonb                         -- [{k, h, v, m}]: key, heading, ms on screen, ms under the cursor
);
create index if not exists site_pageviews_session on public.site_pageviews (session_id, seq);

create table if not exists public.site_events (
  id           uuid primary key,
  session_id   uuid not null references public.site_sessions (id) on delete cascade,
  pageview_id  uuid not null references public.site_pageviews (id) on delete cascade,
  path         text not null,
  at           timestamptz not null default now(),
  kind         text not null,
  label        text,      -- button or link text, video file, form name
  href         text,
  sel          text,      -- where on the page (for the heatmap)
  rx           real,      -- click point inside that element, 0..1
  ry           real,
  fx           real,      -- click point on the whole page, 0..1
  fy           real,
  n            integer,   -- video: 0 play, 25/50/75/100 watched; form_done: ms to fill in; rage: clicks
  interactive  boolean not null default false,
  constraint site_events_kind check (kind in ('click', 'rage', 'dead', 'video', 'form_start', 'form_submit', 'form_done'))
);
create index if not exists site_events_session on public.site_events (session_id);
create index if not exists site_events_pageview on public.site_events (pageview_id);

alter table public.site_sessions enable row level security;
alter table public.site_pageviews enable row level security;
alter table public.site_events enable row level security;
revoke all on table public.site_sessions, public.site_pageviews, public.site_events from public, anon, authenticated;

-- ---- Cleaning what the browser sends ---------------------------------------------------

create or replace function public.site_int(j jsonb, lo bigint, hi bigint)
returns bigint language sql immutable set search_path = public as $$
  select case when jsonb_typeof(j) = 'number' then least(greatest(round((j #>> '{}')::numeric), lo), hi)::bigint else lo end
$$;

create or replace function public.site_real(j jsonb)
returns real language sql immutable set search_path = public as $$
  select case when jsonb_typeof(j) = 'number' then least(greatest((j #>> '{}')::numeric, 0), 1)::real end
$$;

create or replace function public.site_text(t text, n integer)
returns text language sql immutable set search_path = public as $$
  select nullif(left(btrim(regexp_replace(coalesce(t, ''), '[[:space:]]+', ' ', 'g')), n), '')
$$;

-- A page address on our site: "/", "/pricing", "/blog/some-post". Anything else is dropped.
create or replace function public.site_clean_path(t text)
returns text language sql immutable set search_path = public as $$
  select case when t ~ '^/[A-Za-z0-9/_.~%-]{0,199}$' and t !~ '//' then t end
$$;

create or replace function public.site_sections(j jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select case when jsonb_typeof(j) = 'array' then (
    select coalesce(jsonb_agg(jsonb_build_object(
      'k', left(e ->> 'k', 40),
      'h', public.site_text(e ->> 'h', 80),
      'v', public.site_int(e -> 'v', 0, 1800000),
      'm', public.site_int(e -> 'm', 0, 1800000)) order by o), '[]'::jsonb)
    from jsonb_array_elements(j) with ordinality as t(e, o)
    where o <= 40 and jsonb_typeof(e) = 'object' and coalesce(e ->> 'k', '') <> '')
  end
$$;

-- ---- The browser's one way in -----------------------------------------------------------
--
-- p = { s: {id, v, new, land, src, ref, us, um, uc, dev, lang, d},
--       pv: [{id, seq, path, e, vis, sc, a, h, w, sec}],
--       ev: [{id, pv, k, l, href, sel, rx, ry, fx, fy, n, i}] }
-- Numbers only ever grow (a later message never undoes an earlier one), so
-- messages may arrive in any order. Bad input is dropped without an error.

create or replace function public.site_track(p jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_s jsonb;
  v_sid uuid;
  v_vid uuid;
  v_row public.site_sessions%rowtype;
  v_land text;
  v_ref text;
  v_lang text;
  v_item jsonb;
  v_pid uuid;
  v_eid uuid;
  v_path text;
  v_kind text;
  v_pvs integer;
  v_events integer;
  v_converted boolean := false;
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 60000 then return; end if;
  v_s := p -> 's';
  if jsonb_typeof(v_s) is distinct from 'object' then return; end if;
  if jsonb_typeof(p -> 'pv') is distinct from 'array' or jsonb_array_length(p -> 'pv') > 10 then return; end if;
  if p ? 'ev' and (jsonb_typeof(p -> 'ev') <> 'array' or jsonb_array_length(p -> 'ev') > 100) then return; end if;
  begin
    v_sid := (v_s ->> 'id')::uuid;
    v_vid := (v_s ->> 'v')::uuid;
  exception when others then return;
  end;
  if v_sid is null or v_vid is null then return; end if;

  select * into v_row from public.site_sessions where id = v_sid for update;
  if not found then
    v_land := public.site_clean_path(v_s ->> 'land');
    if v_land is null then return; end if;
    -- A flood of new visits is refused: at most 300 a minute and 20,000 a day.
    if (select count(*) from public.site_sessions where started_at > now() - interval '1 minute') >= 300
       or (select count(*) from public.site_sessions where started_at > now() - interval '1 day') >= 20000 then return; end if;
    v_ref := lower(public.site_text(v_s ->> 'ref', 100));
    if v_ref !~ '^[a-z0-9.-]+$' then v_ref := null; end if;
    v_lang := lower(public.site_text(v_s ->> 'lang', 5));
    if v_lang !~ '^[a-z]{2}(-[a-z]{2})?$' then v_lang := null; end if;
    insert into public.site_sessions (id, visitor_id, is_new, landing_path, exit_path, source, referrer_host,
      utm_source, utm_medium, utm_campaign, device, lang)
    values (v_sid, v_vid, coalesce((v_s ->> 'new') = 'true', false), v_land, v_land,
      case when v_s ->> 'src' in ('direct', 'search', 'social', 'referral', 'email', 'campaign') then v_s ->> 'src' else 'direct' end,
      v_ref, lower(public.site_text(v_s ->> 'us', 80)), lower(public.site_text(v_s ->> 'um', 80)), public.site_text(v_s ->> 'uc', 80),
      case when v_s ->> 'dev' in ('mobile', 'tablet', 'desktop') then v_s ->> 'dev' else 'desktop' end,
      v_lang)
    on conflict (id) do nothing;
    select * into v_row from public.site_sessions where id = v_sid for update;
    if not found then return; end if;
  end if;
  -- Someone else's visit, or one that ended hours ago: ignored.
  if v_row.visitor_id <> v_vid or v_row.last_seen_at < now() - interval '6 hours' then return; end if;

  v_pvs := (select count(*) from public.site_pageviews where session_id = v_sid);
  for v_item in select e from jsonb_array_elements(p -> 'pv') as t(e) loop
    if jsonb_typeof(v_item) <> 'object' then continue; end if;
    begin v_pid := (v_item ->> 'id')::uuid; exception when others then continue; end;
    v_path := public.site_clean_path(v_item ->> 'path');
    if v_pid is null or v_path is null then continue; end if;
    if not exists (select 1 from public.site_pageviews where id = v_pid) then
      if v_pvs >= 300 then continue; end if;
      v_pvs := v_pvs + 1;
    end if;
    insert into public.site_pageviews as pv (id, session_id, seq, path, engaged_ms, visible_ms, scroll_pct, actions, page_h, view_w, sections)
    values (v_pid, v_sid, public.site_int(v_item -> 'seq', 1, 1000), v_path,
      public.site_int(v_item -> 'e', 0, 1800000), public.site_int(v_item -> 'vis', 0, 1800000),
      public.site_int(v_item -> 'sc', 0, 100), public.site_int(v_item -> 'a', 0, 10000),
      nullif(public.site_int(v_item -> 'h', 0, 500000), 0), nullif(public.site_int(v_item -> 'w', 0, 20000), 0),
      public.site_sections(v_item -> 'sec'))
    on conflict (id) do update set
      engaged_ms = greatest(pv.engaged_ms, excluded.engaged_ms),
      visible_ms = greatest(pv.visible_ms, excluded.visible_ms),
      scroll_pct = greatest(pv.scroll_pct, excluded.scroll_pct),
      actions = greatest(pv.actions, excluded.actions),
      page_h = coalesce(excluded.page_h, pv.page_h),
      view_w = coalesce(excluded.view_w, pv.view_w),
      sections = coalesce(excluded.sections, pv.sections)
    where pv.session_id = v_sid;
  end loop;

  v_events := v_row.events;
  for v_item in select e from jsonb_array_elements(coalesce(p -> 'ev', '[]'::jsonb)) as t(e) loop
    exit when v_events >= 3000;
    if jsonb_typeof(v_item) <> 'object' then continue; end if;
    v_kind := v_item ->> 'k';
    if v_kind is null or v_kind not in ('click', 'rage', 'dead', 'video', 'form_start', 'form_submit', 'form_done') then continue; end if;
    begin
      v_eid := (v_item ->> 'id')::uuid;
      v_pid := (v_item ->> 'pv')::uuid;
    exception when others then continue;
    end;
    if v_eid is null or v_pid is null then continue; end if;
    select path into v_path from public.site_pageviews where id = v_pid and session_id = v_sid;
    if not found then continue; end if;
    insert into public.site_events (id, session_id, pageview_id, path, kind, label, href, sel, rx, ry, fx, fy, n, interactive)
    values (v_eid, v_sid, v_pid, v_path, v_kind,
      public.site_text(v_item ->> 'l', 80), public.site_text(v_item ->> 'href', 200), public.site_text(v_item ->> 'sel', 300),
      public.site_real(v_item -> 'rx'), public.site_real(v_item -> 'ry'), public.site_real(v_item -> 'fx'), public.site_real(v_item -> 'fy'),
      case when v_item ? 'n' then public.site_int(v_item -> 'n', 0, 3600000)::integer end,
      coalesce((v_item ->> 'i') = 'true', false))
    on conflict (id) do nothing;
    if found then
      v_events := v_events + 1;
      if v_kind = 'form_done' then v_converted := true; end if;
    end if;
  end loop;

  update public.site_sessions s set
    last_seen_at = now(),
    duration_ms = greatest(s.duration_ms, least(public.site_int(v_s -> 'd', 0, 21600000),
      (extract(epoch from now() - s.started_at) * 1000)::bigint + 60000)::integer),
    pageviews = a.n,
    engaged_ms = a.e,
    actions = a.a,
    exit_path = coalesce(a.last_path, s.exit_path),
    events = v_events,
    converted = s.converted or v_converted
  from (
    select count(*)::integer as n, coalesce(sum(engaged_ms), 0) as e, coalesce(sum(actions), 0)::integer as a,
      (select path from public.site_pageviews where session_id = v_sid order by seq desc, started_at desc limit 1) as last_path
    from public.site_pageviews where session_id = v_sid
  ) a
  where s.id = v_sid;
end $$;

-- ---- The admin panel ---------------------------------------------------------------------

-- One period's totals; averages and rates are worked out from these.
create or replace function public.site_summary(p_from timestamptz, p_to timestamptz, p_device text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sessions', count(*),
    'visitors', count(distinct visitor_id),
    'new_visitors', count(distinct visitor_id) filter (where is_new),
    'returning_visitors', count(distinct visitor_id) filter (where not is_new),
    'new_sessions', count(*) filter (where is_new),
    'engaged_sessions', count(*) filter (where engaged_ms >= 10000 or pageviews >= 2 or converted),
    'pageviews', coalesce(sum(pageviews), 0),
    'actions', coalesce(sum(actions), 0),
    'engaged_ms', coalesce(sum(engaged_ms), 0),
    'duration_ms', coalesce(sum(duration_ms), 0),
    'conversions', count(*) filter (where converted))
  from public.site_sessions
  where started_at >= p_from and started_at < p_to and pageviews > 0
    and (p_device is null or device = p_device)
$$;

create or replace function public.site_range(p_from date, p_to date, p_tz text, out v_from timestamptz, out v_to timestamptz, out v_tz text)
language plpgsql stable set search_path = public as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'bad_range'; end if;
  v_tz := coalesce(p_tz, 'UTC');
  if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'UTC'; end if;
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;
end $$;

create or replace function public.admin_site_insights(p_from date, p_to date, p_device text default null, p_tz text default 'UTC')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v_prev timestamptz;
  v_out jsonb;
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  if p_device is not null and p_device not in ('mobile', 'tablet', 'desktop') then raise exception 'bad_device'; end if;
  select * into r from public.site_range(p_from, p_to, p_tz);
  v_prev := (p_from - (p_to - p_from + 1))::timestamp at time zone r.v_tz;

  with s as (
    select *, (engaged_ms >= 10000 or pageviews >= 2 or converted) as engaged
    from public.site_sessions
    where started_at >= r.v_from and started_at < r.v_to and pageviews > 0
      and (p_device is null or device = p_device)
  ),
  pv as (select pv.* from public.site_pageviews pv join s on s.id = pv.session_id),
  ev as (select e.* from public.site_events e join s on s.id = e.session_id),
  pages as (
    select path, count(*) as views, count(distinct session_id) as sessions,
      round(avg(engaged_ms))::integer as avg_engaged_ms, round(avg(visible_ms))::integer as avg_visible_ms,
      count(*) filter (where scroll_pct >= 25) as s25, count(*) filter (where scroll_pct >= 50) as s50,
      count(*) filter (where scroll_pct >= 75) as s75, count(*) filter (where scroll_pct >= 100) as s100,
      coalesce(sum(actions), 0) as actions
    from pv group by path
  ),
  entries as (select landing_path as path, count(*) as entrances, count(*) filter (where not engaged) as bounces from s group by landing_path),
  exits as (select exit_path as path, count(*) as exits from s where exit_path is not null group by exit_path),
  dwell as (
    select s.landing_path as path, pv.visible_ms
    from s join pv on pv.session_id = s.id
    where s.source = 'search' and s.pageviews = 1
  )
  select jsonb_build_object(
    'tz', r.v_tz,
    'summary', public.site_summary(r.v_from, r.v_to, p_device),
    'previous', public.site_summary(v_prev, r.v_from, p_device),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'sessions', n, 'engaged', e, 'visitors', v, 'pageviews', pg) order by d), '[]'::jsonb)
      from (select (started_at at time zone r.v_tz)::date as d, count(*) as n, count(*) filter (where engaged) as e,
              count(distinct visitor_id) as v, sum(pageviews) as pg from s group by 1) x),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object(
        'path', p.path, 'views', p.views, 'sessions', p.sessions, 'avg_engaged_ms', p.avg_engaged_ms, 'avg_visible_ms', p.avg_visible_ms,
        's25', p.s25, 's50', p.s50, 's75', p.s75, 's100', p.s100, 'actions', p.actions,
        'entrances', coalesce(en.entrances, 0), 'bounces', coalesce(en.bounces, 0), 'exits', coalesce(ex.exits, 0)) order by p.views desc, p.path), '[]'::jsonb)
      from (select * from pages order by views desc, path limit 100) p
      left join entries en on en.path = p.path left join exits ex on ex.path = p.path),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'sessions', n, 'engaged', e, 'engaged_ms', ms, 'conversions', c) order by n desc), '[]'::jsonb)
      from (select source, count(*) as n, count(*) filter (where engaged) as e, sum(engaged_ms) as ms, count(*) filter (where converted) as c from s group by source) x),
    'referrers', (select coalesce(jsonb_agg(jsonb_build_object('host', referrer_host, 'sessions', n) order by n desc, referrer_host), '[]'::jsonb)
      from (select referrer_host, count(*) as n from s where referrer_host is not null group by referrer_host order by n desc, referrer_host limit 15) x),
    'campaigns', (select coalesce(jsonb_agg(jsonb_build_object('source', utm_source, 'medium', utm_medium, 'campaign', utm_campaign, 'sessions', n, 'engaged', e, 'conversions', c) order by n desc), '[]'::jsonb)
      from (select utm_source, utm_medium, utm_campaign, count(*) as n, count(*) filter (where engaged) as e, count(*) filter (where converted) as c
            from s where utm_source is not null or utm_campaign is not null group by 1, 2, 3 order by n desc limit 15) x),
    'devices', (select coalesce(jsonb_object_agg(device, n), '{}'::jsonb) from (select device, count(*) as n from s group by device) x),
    'dwell', jsonb_build_object(
      'search_sessions', (select count(*) from s where source = 'search'),
      'one_page', (select count(*) from dwell),
      'avg_visible_ms', (select round(avg(visible_ms))::integer from dwell),
      'pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'sessions', n, 'avg_visible_ms', ms) order by n desc, path), '[]'::jsonb)
        from (select path, count(*) as n, round(avg(visible_ms))::integer as ms from dwell group by path order by n desc, path limit 10) x)),
    'ctas', (select coalesce(jsonb_agg(jsonb_build_object('path', x.path, 'label', x.label, 'href', x.href, 'clicks', x.clicks, 'views_clicked', x.vc, 'views', p.views) order by x.vc desc, x.clicks desc), '[]'::jsonb)
      from (select path, label, href, count(*) as clicks, count(distinct pageview_id) as vc
            from ev where kind = 'click' and interactive and label is not null
            group by path, label, href order by count(distinct pageview_id) desc, count(*) desc limit 60) x
      join pages p on p.path = x.path),
    'videos', (select coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'path', x.path, 'views', p.views,
        'plays', x.p0, 'p25', x.p25, 'p50', x.p50, 'p75', x.p75, 'p100', x.p100) order by x.p0 desc), '[]'::jsonb)
      from (select label, path,
              count(distinct pageview_id) filter (where n = 0) as p0, count(distinct pageview_id) filter (where n = 25) as p25,
              count(distinct pageview_id) filter (where n = 50) as p50, count(distinct pageview_id) filter (where n = 75) as p75,
              count(distinct pageview_id) filter (where n = 100) as p100
            from ev where kind = 'video' and label is not null group by label, path) x
      join pages p on p.path = x.path),
    'forms', (select coalesce(jsonb_agg(jsonb_build_object('form', x.label, 'path', x.path, 'views', p.views, 'started', x.st, 'submitted', x.sub, 'completed', x.done, 'avg_ms', x.ms) order by x.st desc), '[]'::jsonb)
      from (select label, path,
              count(distinct pageview_id) filter (where kind = 'form_start') as st,
              count(distinct pageview_id) filter (where kind = 'form_submit') as sub,
              count(distinct pageview_id) filter (where kind = 'form_done') as done,
              round(avg(n) filter (where kind = 'form_done' and n > 0))::integer as ms
            from ev where kind in ('form_start', 'form_submit', 'form_done') and label is not null group by label, path) x
      join pages p on p.path = x.path),
    'friction', jsonb_build_object(
      'rage_sessions', (select count(distinct session_id) from ev where kind = 'rage'),
      'dead_sessions', (select count(distinct session_id) from ev where kind = 'dead'),
      'rage', (select count(*) from ev where kind = 'rage'),
      'dead', (select count(*) from ev where kind = 'dead'),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'path', path, 'target', target, 'count', n, 'sessions', ss) order by n desc), '[]'::jsonb)
        from (select kind, path, coalesce(label, sel, '(unknown)') as target, count(*) as n, count(distinct session_id) as ss
              from ev where kind in ('rage', 'dead') group by 1, 2, 3 order by n desc limit 40) x))
  ) into v_out;
  return v_out;
end $$;

-- Clicks and section attention for one page, for the heatmap.
create or replace function public.admin_site_heatmap(p_path text, p_from date, p_to date, p_device text default null, p_tz text default 'UTC')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v_out jsonb;
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  if p_device is not null and p_device not in ('mobile', 'tablet', 'desktop') then raise exception 'bad_device'; end if;
  if public.site_clean_path(p_path) is null then raise exception 'bad_path'; end if;
  select * into r from public.site_range(p_from, p_to, p_tz);

  with s as (
    select id from public.site_sessions
    where started_at >= r.v_from and started_at < r.v_to and pageviews > 0 and (p_device is null or device = p_device)
  ),
  pv as (select pv.* from public.site_pageviews pv join s on s.id = pv.session_id where pv.path = p_path)
  select jsonb_build_object(
    'views', (select count(*) from pv),
    'clicks', (select coalesce(jsonb_agg(jsonb_build_object('k', kind, 'sel', sel, 'rx', rx, 'ry', ry, 'fx', fx, 'fy', fy, 'i', interactive, 'l', label)), '[]'::jsonb)
      from (select e.kind, e.sel, e.rx, e.ry, e.fx, e.fy, e.interactive, e.label
            from public.site_events e join pv on pv.id = e.pageview_id
            where e.kind in ('click', 'rage', 'dead') order by e.at desc limit 5000) x),
    'sections', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'h', h, 'seen', seen, 'avg_visible_ms', vis, 'avg_hover_ms', hov) order by ord), '[]'::jsonb)
      from (select sec ->> 'k' as k, mode() within group (order by sec ->> 'h') as h,
              count(*) filter (where (sec ->> 'v')::integer >= 1000) as seen,
              round(avg((sec ->> 'v')::integer))::integer as vis, round(avg((sec ->> 'm')::integer))::integer as hov,
              min(o) as ord
            from pv cross join lateral jsonb_array_elements(coalesce(pv.sections, '[]'::jsonb)) with ordinality as t(sec, o)
            group by sec ->> 'k') x)
  ) into v_out;
  return v_out;
end $$;

-- ---- Deleting old data --------------------------------------------------------------------

create or replace function public.site_insights_cleanup()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare v_n integer;
begin
  delete from public.site_sessions where started_at < now() - interval '13 months';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'stampfix-site-insights-cleanup';
    perform cron.schedule('stampfix-site-insights-cleanup', '23 4 * * *', 'select public.site_insights_cleanup()');
  end if;
end $$;

-- ---- Grants ---------------------------------------------------------------------------------

revoke execute on function public.site_int(jsonb, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.site_real(jsonb) from public, anon, authenticated;
revoke execute on function public.site_text(text, integer) from public, anon, authenticated;
revoke execute on function public.site_clean_path(text) from public, anon, authenticated;
revoke execute on function public.site_sections(jsonb) from public, anon, authenticated;
revoke execute on function public.site_summary(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.site_range(date, date, text) from public, anon, authenticated;
revoke execute on function public.site_insights_cleanup() from public, anon, authenticated;
revoke execute on function public.site_track(jsonb) from public;
grant execute on function public.site_track(jsonb) to anon, authenticated;
revoke execute on function public.admin_site_insights(date, date, text, text) from public, anon;
grant execute on function public.admin_site_insights(date, date, text, text) to authenticated;
revoke execute on function public.admin_site_heatmap(text, date, date, text, text) from public, anon;
grant execute on function public.admin_site_heatmap(text, date, date, text, text) to authenticated;
