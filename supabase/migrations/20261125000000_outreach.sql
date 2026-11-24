-- =====================================================================
-- Admin: Outreach. Cold email and Instagram messages to shops.
--
-- The Stampfix team finds shops anywhere in the world (cafés, bubble tea,
-- salons, ... the 23 kinds of shop on the landing page) from map data or a
-- pasted list, finds the email address and Instagram account each shop
-- publishes on its own website, and reaches out:
--   * Email: queued here, sent one at a time by the outreach-send function
--     (through Resend, from hello@stampfix.app) within a daily cap, on
--     weekday afternoons in each shop's own time zone. Bounces and spam
--     reports come back through the outreach-webhook function, block the
--     address for good and pause sending when they pile up.
--   * Instagram: Instagram doesn't allow tools to send the first message,
--     so the admin panel prepares the message, copies it and opens the
--     shop's chat; the team presses send and marks it sent here.
--
-- Email is never sent where cold email to businesses needs the owner's
-- consent first (Germany, Austria, Italy, Denmark, Poland) or must be in
-- French (Quebec); Instagram works everywhere. Every email carries the
-- sender's name, postal address and an opt-out (Canada's CASL, the US
-- CAN-SPAM Act), plus a one-click unsubscribe header. Anyone with a
-- Stampfix account, existing shops' domains and anyone who opted out are
-- never emailed.
--
-- Only platform admins write; view-only admins can look. Nothing here is
-- reachable by shops or guests except outreach_unsubscribe(token).
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.outreach_leads (
  id                 uuid primary key default gen_random_uuid(),
  business_name      text not null check (length(btrim(business_name)) between 1 and 200),
  -- The kind of shop (landing page key, e.g. "bubbleTea") and how messages
  -- say it, plural: "cafés", "bubble tea shops".
  category_key       text check (category_key is null or category_key ~ '^[A-Za-z]{1,30}$'),
  category           text check (category is null or length(category) <= 60),
  city               text check (city is null or length(city) <= 80),
  -- ISO country code ("CA") and state or province as the map names it.
  country            text not null check (country ~ '^[A-Z]{2}$'),
  region             text check (region is null or length(region) <= 80),
  -- The shop's time zone, for sending in its own afternoon; null = UTC.
  timezone           text check (timezone is null or length(timezone) <= 60),
  lat                double precision check (lat is null or lat between -90 and 90),
  lon                double precision check (lon is null or lon between -180 and 180),
  address            text check (address is null or length(address) <= 200),
  website            text check (website is null or length(website) <= 500),
  phone              text check (phone is null or length(phone) <= 60),
  email              text check (email is null or (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  -- Where the address was published (the page it was found on, "map listing" or "added by hand").
  email_source       text check (email_source is null or length(email_source) <= 500),
  instagram          text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  osm_ref            text check (osm_ref is null or length(osm_ref) <= 40),
  -- The personal opening line; blank = the default line from the settings.
  first_line         text check (first_line is null or length(first_line) <= 300),
  notes              text check (notes is null or length(notes) <= 2000),
  email_status       text not null default 'new' check (email_status in
                       ('new','queued','sent','followup_queued','followed_up','replied',
                        'not_interested','bounced','complained','unsubscribed','skipped')),
  ig_status          text not null default 'new' check (ig_status in ('new','sent','replied','not_interested','skipped')),
  email_sent_at      timestamptz,
  ig_sent_at         timestamptz,
  website_checked_at timestamptz,
  unsub_token        uuid not null default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists outreach_leads_email_key on public.outreach_leads (lower(email)) where email is not null;
create unique index if not exists outreach_leads_instagram_key on public.outreach_leads (lower(instagram)) where instagram is not null;
create unique index if not exists outreach_leads_osm_key on public.outreach_leads (osm_ref) where osm_ref is not null;
create unique index if not exists outreach_leads_token_key on public.outreach_leads (unsub_token);
create index if not exists outreach_leads_created_idx on public.outreach_leads (created_at desc);

create table if not exists public.outreach_messages (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.outreach_leads(id) on delete cascade,
  kind        text not null check (kind in ('first','followup')),
  to_email    text not null,
  subject     text not null,
  body        text not null,
  status      text not null default 'queued' check (status in ('queued','sending','sent','failed','cancelled','bounced','complained')),
  attempts    integer not null default 0,
  resend_id   text,
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  updated_at  timestamptz not null default now()
);
-- One first email and one follow-up per shop, ever (cancelled or failed ones don't count).
create unique index if not exists outreach_messages_once on public.outreach_messages (lead_id, kind) where status not in ('cancelled','failed');
create index if not exists outreach_messages_status_idx on public.outreach_messages (status, created_at);
create unique index if not exists outreach_messages_resend_key on public.outreach_messages (resend_id) where resend_id is not null;

-- Addresses never to email again.
create table if not exists public.outreach_suppressions (
  email      text primary key check (email = lower(email)),
  reason     text not null check (reason in ('unsubscribed','bounced','complained','not_interested','manual')),
  created_at timestamptz not null default now()
);

create table if not exists public.outreach_settings (
  id                    integer primary key default 1 check (id = 1),
  -- Nothing is sent until an admin switches sending on.
  paused                boolean not null default true,
  -- Why it paused itself: 'bounces' or 'complaint'; null when paused by hand.
  pause_reason          text check (pause_reason is null or pause_reason in ('bounces','complaint')),
  -- Resend's free plan is 100 a day for everything (the app's own emails too).
  daily_cap             integer not null default 10 check (daily_cap between 1 and 30),
  window_start          integer not null default 14 check (window_start between 0 and 23),
  window_end            integer not null default 17 check (window_end between 1 and 24),
  weekdays_only         boolean not null default true,
  followup_days         integer not null default 5 check (followup_days between 2 and 30),
  from_name             text not null default 'Abhishek from Stampfix' check (length(btrim(from_name)) between 1 and 60),
  default_first_line    text not null default 'I came across {business} while looking at {category} in {city}.'
                          check (length(default_first_line) <= 300),
  subject_tpl           text not null default 'a stamp card for {business}''s regulars' check (length(subject_tpl) between 1 and 150),
  body_tpl              text not null default $tpl$Hi there,

{first_line} Places like {business} run on their regulars.

Do you use a stamp card for them at the moment?

I run Stampfix, here in Surrey. Your stamp card goes into your customers' Apple Wallet or Google Wallet: they scan a QR code at the counter, nothing to download, and you can send them an offer when it's quiet. It's free for your first 5 customers, so you can see if your regulars actually use it.

If you're curious: stampfix.app

Abhishek
Stampfix$tpl$ check (length(body_tpl) between 1 and 3000),
  followup_subject_tpl  text not null default 'a stamp card for {business}''s regulars' check (length(followup_subject_tpl) between 1 and 150),
  followup_tpl          text not null default $tpl$Hi again,

Just following up on my note from last week. Would a digital stamp card be useful at {business}? If it's not a fit, no worries at all.

Abhishek
Stampfix$tpl$ check (length(followup_tpl) between 1 and 3000),
  -- Added under every email. Canada's anti-spam law needs the sender's
  -- postal address and a way to opt out.
  footer                text not null default $tpl$Stampfix (17999658 Canada Inc.), 28-16223 23A Ave, Surrey, BC V3Z 6P4, Canada
Not interested? Reply "no thanks" and I won't email again.$tpl$ check (length(footer) between 20 and 500),
  ig_tpl                text not null default $tpl$Hi! {first_line} Do you use a stamp card for your regulars? I run Stampfix in Surrey, BC: your stamp card lives in your customers' Apple Wallet or Google Wallet, no app needed, and it's free for your first 5 customers. Happy to show you how it would look for {business}. (Not interested? Just reply no and I won't message again.)$tpl$
                          check (length(ig_tpl) between 1 and 1000),
  -- Our own Instagram account, for the links in the admin panel.
  ig_account            text check (ig_account is null or ig_account ~ '^[A-Za-z0-9._]{1,30}$'),
  ig_daily_limit        integer not null default 20 check (ig_daily_limit between 1 and 100),
  updated_at            timestamptz not null default now(),
  check (window_end > window_start)
);
insert into public.outreach_settings (id) values (1) on conflict (id) do nothing;

alter table public.outreach_leads enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.outreach_suppressions enable row level security;
alter table public.outreach_settings enable row level security;
-- No policies: only the functions below (and the service role) touch these.
revoke all on public.outreach_leads, public.outreach_messages, public.outreach_suppressions,
              public.outreach_settings from anon, authenticated;

-- ---- Helpers ----------------------------------------------------------------------

-- Where cold email to businesses needs the owner's consent first, or must
-- be in French (Quebec), email is off; Instagram still works.
create or replace function public.outreach_country_block(p_country text, p_region text)
returns text language sql immutable set search_path = public as $$
  select case
    when upper(coalesce(p_country, '')) in ('DE','AT','IT','DK','PL') then 'consent_country'
    when upper(coalesce(p_country, '')) = 'CA'
         and lower(btrim(coalesce(p_region, ''))) in ('qc','quebec','québec') then 'french_required'
    else null end;
$$;

-- A real IANA time zone name, or null.
create or replace function public.outreach_valid_tz(p_tz text)
returns text language sql stable set search_path = public as $$
  select case when exists (select 1 from pg_timezone_names where name = btrim(p_tz)) then btrim(p_tz) else null end;
$$;

-- Fills {first_line} first (the default line has fields of its own), then
-- {business}, {city} and {category}.
create or replace function public.outreach_render(p_tpl text, p_lead public.outreach_leads, p_default_first text)
returns text language sql stable set search_path = public as $$
  select replace(replace(replace(replace(coalesce(p_tpl, ''),
           '{first_line}', coalesce(nullif(btrim(p_lead.first_line), ''), coalesce(p_default_first, ''))),
           '{business}', btrim(p_lead.business_name)),
           '{city}', coalesce(nullif(btrim(p_lead.city), ''), 'your area')),
           '{category}', coalesce(nullif(btrim(p_lead.category), ''), 'local shops'));
$$;

-- Why this address must not be emailed, or null when it may be.
create or replace function public.outreach_blocked_reason(p_email text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_domain text := split_part(lower(btrim(coalesce(p_email, ''))), '@', 2);
begin
  if v_email = '' then return 'no_email'; end if;
  if exists (select 1 from public.outreach_suppressions s where s.email = v_email) then return 'opted_out'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email)
     or exists (select 1 from public.merchants m where lower(m.email) = v_email) then
    return 'has_account';
  end if;
  -- A shop already on Stampfix with its own domain: don't email its colleagues.
  if v_domain <> '' and v_domain not in (
       'gmail.com','googlemail.com','hotmail.com','hotmail.ca','outlook.com','live.com','live.ca','msn.com',
       'yahoo.com','yahoo.ca','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com',
       'shaw.ca','telus.net','rogers.com','sympatico.ca','bell.net','gmx.com','gmx.de','web.de')
     and exists (select 1 from public.merchants m where split_part(lower(m.email), '@', 2) = v_domain) then
    return 'customer_domain';
  end if;
  return null;
end $$;

create or replace function public.outreach_clean_instagram(p text)
returns text language sql immutable set search_path = public as $$
  -- "@shop", "instagram.com/shop/", "https://www.instagram.com/shop?hl=en" -> "shop"
  select nullif(rtrim(substring(
           regexp_replace(regexp_replace(btrim(coalesce(p, '')), '^.*instagram\.com/', '', 'i'), '^@', '')
           from '^[A-Za-z0-9._]{1,30}'), '.'), '');
$$;

-- One lead as the admin panel shows it, with its Instagram message ready.
create or replace function public.outreach_lead_json(p_lead public.outreach_leads, p_settings public.outreach_settings)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p_lead) - 'unsub_token'
         || jsonb_build_object(
              'ig_message', public.outreach_render(p_settings.ig_tpl, p_lead, p_settings.default_first_line),
              'blocked', coalesce(public.outreach_country_block(p_lead.country, p_lead.region),
                                  case when p_lead.email is null then null else public.outreach_blocked_reason(p_lead.email) end),
              'followup_due', p_lead.email_status = 'sent'
                              and p_lead.email_sent_at < now() - make_interval(days => p_settings.followup_days)
                              and not exists (select 1 from public.outreach_messages m
                                               where m.lead_id = p_lead.id and m.kind = 'followup' and m.status not in ('cancelled','failed')),
              'last_error', (select m.error from public.outreach_messages m
                              where m.lead_id = p_lead.id and m.status = 'failed' order by m.updated_at desc limit 1));
$$;

-- ---- Admin: read ----------------------------------------------------------------

create or replace function public.admin_outreach_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s public.outreach_settings;
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  select * into s from public.outreach_settings where id = 1;
  return jsonb_build_object(
    'settings', to_jsonb(s),
    'leads', (select count(*) from public.outreach_leads),
    'with_email', (select count(*) from public.outreach_leads where email is not null),
    'with_instagram', (select count(*) from public.outreach_leads where instagram is not null),
    'unchecked', (select count(*) from public.outreach_leads where website is not null and website_checked_at is null),
    'email', coalesce((select jsonb_object_agg(email_status, n) from
                (select email_status, count(*) n from public.outreach_leads group by 1) x), '{}'::jsonb),
    'ig', coalesce((select jsonb_object_agg(ig_status, n) from
                (select ig_status, count(*) n from public.outreach_leads group by 1) x), '{}'::jsonb),
    'sent_24h', (select count(*) from public.outreach_messages
                  where status in ('sent','bounced','complained','sending') and coalesce(sent_at, updated_at) > now() - interval '24 hours'),
    'queued', (select count(*) from public.outreach_messages where status = 'queued'),
    'followups_due', (select count(*) from public.outreach_leads l
                       where l.email_status = 'sent' and l.email_sent_at < now() - make_interval(days => s.followup_days)
                         and not exists (select 1 from public.outreach_messages m
                                          where m.lead_id = l.id and m.kind = 'followup' and m.status not in ('cancelled','failed'))),
    'ig_24h', (select count(*) from public.outreach_leads where ig_sent_at > now() - interval '24 hours'),
    'bounced', (select count(*) from public.outreach_messages where status = 'bounced'),
    'complained', (select count(*) from public.outreach_messages where status = 'complained'),
    'sent_total', (select count(*) from public.outreach_messages where status in ('sent','bounced','complained')));
end $$;

-- p_view: all | unchecked | email_ready | email_queued | email_sent | email_followup |
--         email_replied | email_stopped | ig_ready | ig_sent | ig_replied | ig_stopped
create or replace function public.admin_outreach_leads(p_view text default 'all', p_search text default null, p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s public.outreach_settings;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  select * into s from public.outreach_settings where id = 1;
  return coalesce((
    select jsonb_agg(public.outreach_lead_json(x.lead, s) order by (x.lead).created_at desc)
      from (select l as lead from public.outreach_leads l
             where (v_q is null or l.business_name ilike '%' || v_q || '%' or l.city ilike '%' || v_q || '%'
                    or l.email ilike '%' || v_q || '%' or l.instagram ilike '%' || v_q || '%')
               and case coalesce(p_view, 'all')
                     when 'all' then true
                     when 'unchecked' then l.website is not null and l.website_checked_at is null
                     when 'email_ready' then l.email is not null and l.email_status = 'new'
                     when 'email_queued' then l.email_status in ('queued','followup_queued')
                     when 'email_sent' then l.email_status in ('sent','followed_up')
                     when 'email_followup' then l.email_status = 'sent'
                          and l.email_sent_at < now() - make_interval(days => s.followup_days)
                          and not exists (select 1 from public.outreach_messages m
                                           where m.lead_id = l.id and m.kind = 'followup' and m.status not in ('cancelled','failed'))
                     when 'email_replied' then l.email_status = 'replied'
                     when 'email_stopped' then l.email_status in ('not_interested','bounced','complained','unsubscribed','skipped')
                     when 'ig_ready' then l.instagram is not null and l.ig_status = 'new'
                     when 'ig_sent' then l.ig_status = 'sent'
                     when 'ig_replied' then l.ig_status = 'replied'
                     when 'ig_stopped' then l.ig_status in ('not_interested','skipped')
                     else false end
             order by l.created_at desc
             limit greatest(1, least(coalesce(p_limit, 300), 1000))) x), '[]'::jsonb);
end $$;

-- The exact email a shop would get (subject, body with footer).
create or replace function public.admin_outreach_preview(p_id uuid, p_kind text default 'first')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s public.outreach_settings;
  l public.outreach_leads;
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  select * into s from public.outreach_settings where id = 1;
  select * into l from public.outreach_leads where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'to', l.email,
    'from_name', s.from_name,
    'subject', public.outreach_render(case when p_kind = 'followup' then s.followup_subject_tpl else s.subject_tpl end, l, s.default_first_line),
    'body', public.outreach_render(case when p_kind = 'followup' then s.followup_tpl else s.body_tpl end, l, s.default_first_line)
            || E'\n\n' || s.footer,
    'blocked', coalesce(public.outreach_country_block(l.country, l.region),
                        case when l.email is null then 'no_email' else public.outreach_blocked_reason(l.email) end));
end $$;

-- ---- Admin: write ---------------------------------------------------------------

-- Adds shops (from the map search or a pasted list). Shops already in the
-- list (same map entry, email or Instagram) are skipped.
-- p_leads: [{business_name, category_key, category, city, region, country, timezone, lat, lon,
--            address, website, phone, email, email_source, instagram, osm_ref}]
create or replace function public.admin_outreach_add_leads(p_leads jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r       jsonb;
  v_added integer := 0;
  v_dupes integer := 0;
  v_bad   integer := 0;
  v_email text;
  v_ig    text;
  v_id    uuid;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if jsonb_typeof(p_leads) <> 'array' or jsonb_array_length(p_leads) > 2000 then raise exception 'invalid_leads'; end if;
  for r in select * from jsonb_array_elements(p_leads) loop
    v_email := nullif(lower(btrim(coalesce(r->>'email', ''))), '');
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
    v_ig := public.outreach_clean_instagram(r->>'instagram');
    begin
      insert into public.outreach_leads (business_name, category_key, category, city, country, region, timezone, lat, lon,
                                         address, website, phone, email, email_source, instagram, osm_ref)
      values (left(btrim(r->>'business_name'), 200),
              nullif(btrim(coalesce(r->>'category_key', '')), ''),
              nullif(left(btrim(coalesce(r->>'category', '')), 60), ''),
              nullif(left(btrim(coalesce(r->>'city', '')), 80), ''),
              upper(btrim(coalesce(r->>'country', ''))),
              nullif(left(btrim(coalesce(r->>'region', '')), 80), ''),
              public.outreach_valid_tz(r->>'timezone'),
              case when jsonb_typeof(r->'lat') = 'number' then (r->>'lat')::double precision end,
              case when jsonb_typeof(r->'lon') = 'number' then (r->>'lon')::double precision end,
              nullif(left(btrim(coalesce(r->>'address', '')), 200), ''),
              nullif(left(btrim(coalesce(r->>'website', '')), 500), ''),
              nullif(left(btrim(coalesce(r->>'phone', '')), 60), ''),
              v_email,
              case when v_email is null then null else nullif(left(btrim(coalesce(r->>'email_source', '')), 500), '') end,
              v_ig,
              nullif(left(btrim(coalesce(r->>'osm_ref', '')), 40), ''))
      on conflict do nothing
      returning id into v_id;
      if v_id is null then v_dupes := v_dupes + 1; else v_added := v_added + 1; end if;
      v_id := null;
    exception when check_violation or not_null_violation or invalid_text_representation then
      v_bad := v_bad + 1;
    end;
  end loop;
  perform public.admin_audit('outreach.add_leads', 'outreach', null, v_added || ' shops added', jsonb_build_object('added', v_added, 'duplicates', v_dupes, 'invalid', v_bad));
  return jsonb_build_object('added', v_added, 'duplicates', v_dupes, 'invalid', v_bad);
end $$;

-- Results of reading shops' websites. Only fills what's still empty; an
-- address or account another shop already has is left out.
-- p_results: [{id, email, email_source, instagram}]
create or replace function public.admin_outreach_save_scans(p_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r       jsonb;
  v_email text;
  v_ig    text;
  v_found integer := 0;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if jsonb_typeof(p_results) <> 'array' then raise exception 'invalid_results'; end if;
  for r in select * from jsonb_array_elements(p_results) loop
    v_email := nullif(lower(btrim(coalesce(r->>'email', ''))), '');
    if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        or exists (select 1 from public.outreach_leads o where lower(o.email) = v_email and o.id <> (r->>'id')::uuid)) then
      v_email := null;
    end if;
    v_ig := public.outreach_clean_instagram(r->>'instagram');
    if v_ig is not null and exists (select 1 from public.outreach_leads o
                                     where lower(o.instagram) = lower(v_ig) and o.id <> (r->>'id')::uuid) then
      v_ig := null;
    end if;
    update public.outreach_leads l
       set email = coalesce(l.email, v_email),
           email_source = case when l.email is null and v_email is not null
                               then nullif(left(btrim(coalesce(r->>'email_source', '')), 500), '') else l.email_source end,
           instagram = coalesce(l.instagram, v_ig),
           website_checked_at = now(),
           updated_at = now()
     where l.id = (r->>'id')::uuid;
    if found and (v_email is not null or v_ig is not null) then v_found := v_found + 1; end if;
  end loop;
  return jsonb_build_object('found', v_found);
end $$;

-- Edits one shop: first_line, email, instagram, notes, and the status the
-- team sets by hand (replied, not interested, skipped, Instagram sent).
create or replace function public.admin_outreach_update_lead(p_id uuid, p_patch jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  l       public.outreach_leads;
  v_email text;
  v_es    text := p_patch->>'email_status';
  v_is    text := p_patch->>'ig_status';
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  select * into l from public.outreach_leads where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_es is not null and v_es not in ('new','replied','not_interested','skipped') then raise exception 'invalid_status'; end if;
  if v_is is not null and v_is not in ('new','sent','replied','not_interested','skipped') then raise exception 'invalid_status'; end if;

  if p_patch ? 'email' then
    v_email := nullif(lower(btrim(coalesce(p_patch->>'email', ''))), '');
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
    if v_email is distinct from l.email and l.email_status not in ('new','skipped') then raise exception 'email_in_use'; end if;
  end if;

  update public.outreach_leads o set
    first_line   = case when p_patch ? 'first_line' then nullif(left(btrim(coalesce(p_patch->>'first_line', '')), 300), '') else o.first_line end,
    notes        = case when p_patch ? 'notes' then nullif(left(btrim(coalesce(p_patch->>'notes', '')), 2000), '') else o.notes end,
    email        = case when p_patch ? 'email' then v_email else o.email end,
    email_source = case when p_patch ? 'email' and v_email is distinct from o.email
                        then case when v_email is null then null else 'added by hand' end else o.email_source end,
    instagram    = case when p_patch ? 'instagram' then public.outreach_clean_instagram(p_patch->>'instagram') else o.instagram end,
    email_status = coalesce(v_es, o.email_status),
    ig_status    = coalesce(v_is, o.ig_status),
    ig_sent_at   = case when v_is = 'sent' and o.ig_status <> 'sent' then now()
                        when v_is = 'new' then null else o.ig_sent_at end,
    updated_at   = now()
   where o.id = p_id
   returning * into l;

  -- Not interested, or skipped before anything went out: stop queued email,
  -- and "not interested" also blocks the address for good.
  if v_es in ('not_interested','skipped','replied') then
    update public.outreach_messages set status = 'cancelled', error = v_es, updated_at = now()
     where lead_id = p_id and status = 'queued';
  end if;
  if v_es = 'not_interested' and l.email is not null then
    insert into public.outreach_suppressions (email, reason) values (lower(l.email), 'not_interested')
    on conflict (email) do nothing;
  end if;
  perform public.admin_audit('outreach.update_lead', 'outreach_lead', p_id::text, l.business_name, p_patch);
  return to_jsonb(l) - 'unsub_token';
exception when unique_violation then
  raise exception 'duplicate';
end $$;

-- Removes a shop that was added by mistake (only if nothing was sent).
create or replace function public.admin_outreach_delete_lead(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_name text;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if exists (select 1 from public.outreach_messages where lead_id = p_id and status not in ('queued','cancelled','failed')) then
    raise exception 'already_contacted';
  end if;
  delete from public.outreach_leads where id = p_id returning business_name into v_name;
  perform public.admin_audit('outreach.delete_lead', 'outreach_lead', p_id::text, v_name, null);
end $$;

-- Queues the first email (p_kind 'first') or the follow-up ('followup') for
-- these shops. The text is fixed now, so what was previewed is what goes out.
create or replace function public.admin_outreach_queue(p_ids uuid[], p_kind text default 'first')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s        public.outreach_settings;
  l        public.outreach_leads;
  v_reason text;
  v_queued integer := 0;
  v_skip   jsonb := '[]'::jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_kind not in ('first','followup') then raise exception 'invalid_kind'; end if;
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 500 then raise exception 'invalid_ids'; end if;
  select * into s from public.outreach_settings where id = 1;

  for l in select * from public.outreach_leads where id = any (p_ids) order by created_at for update loop
    v_reason := case
      when l.email is null then 'no_email'
      when p_kind = 'first' and l.email_status <> 'new' then 'not_new'
      when p_kind = 'followup' and l.email_status <> 'sent' then 'not_sent'
      when p_kind = 'followup' and l.email_sent_at > now() - make_interval(days => s.followup_days) then 'too_soon'
      when public.outreach_country_block(l.country, l.region) is not null then public.outreach_country_block(l.country, l.region)
      when exists (select 1 from public.outreach_messages m
                    where m.lead_id = l.id and m.kind = p_kind and m.status not in ('cancelled','failed')) then 'already_queued'
      else public.outreach_blocked_reason(l.email) end;
    if v_reason is not null then
      v_skip := v_skip || jsonb_build_object('id', l.id, 'business', l.business_name, 'reason', v_reason);
      continue;
    end if;
    insert into public.outreach_messages (lead_id, kind, to_email, subject, body)
    values (l.id, p_kind, lower(l.email),
            public.outreach_render(case when p_kind = 'followup' then s.followup_subject_tpl else s.subject_tpl end, l, s.default_first_line),
            public.outreach_render(case when p_kind = 'followup' then s.followup_tpl else s.body_tpl end, l, s.default_first_line)
              || E'\n\n' || s.footer);
    update public.outreach_leads set email_status = case when p_kind = 'followup' then 'followup_queued' else 'queued' end,
                                     updated_at = now()
     where id = l.id;
    v_queued := v_queued + 1;
  end loop;
  perform public.admin_audit('outreach.queue', 'outreach', null, v_queued || ' ' || p_kind || ' emails queued',
                             jsonb_build_object('queued', v_queued, 'skipped', jsonb_array_length(v_skip)));
  return jsonb_build_object('queued', v_queued, 'skipped', v_skip);
end $$;

-- Takes queued emails back out of the queue.
create or replace function public.admin_outreach_cancel(p_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  with c as (
    update public.outreach_messages m set status = 'cancelled', error = 'cancelled', updated_at = now()
     where m.lead_id = any (p_ids) and m.status = 'queued'
    returning m.lead_id, m.kind)
  update public.outreach_leads l
     set email_status = case when c.kind = 'followup' then 'sent' else 'new' end, updated_at = now()
    from c where l.id = c.lead_id and l.email_status in ('queued','followup_queued');
  get diagnostics v_n = row_count;
  return jsonb_build_object('cancelled', v_n);
end $$;

create or replace function public.admin_outreach_save_settings(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s public.outreach_settings;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  update public.outreach_settings o set
    paused               = coalesce((p->>'paused')::boolean, o.paused),
    -- Switching on by hand clears an automatic pause.
    pause_reason         = case when (p->>'paused')::boolean is not null then null else o.pause_reason end,
    daily_cap            = coalesce((p->>'daily_cap')::integer, o.daily_cap),
    window_start         = coalesce((p->>'window_start')::integer, o.window_start),
    window_end           = coalesce((p->>'window_end')::integer, o.window_end),
    weekdays_only        = coalesce((p->>'weekdays_only')::boolean, o.weekdays_only),
    followup_days        = coalesce((p->>'followup_days')::integer, o.followup_days),
    from_name            = coalesce(nullif(regexp_replace(btrim(p->>'from_name'), '[<>"\r\n]', '', 'g'), ''), o.from_name),
    default_first_line   = coalesce(p->>'default_first_line', o.default_first_line),
    subject_tpl          = coalesce(nullif(btrim(p->>'subject_tpl'), ''), o.subject_tpl),
    body_tpl             = coalesce(nullif(btrim(p->>'body_tpl'), ''), o.body_tpl),
    followup_subject_tpl = coalesce(nullif(btrim(p->>'followup_subject_tpl'), ''), o.followup_subject_tpl),
    followup_tpl         = coalesce(nullif(btrim(p->>'followup_tpl'), ''), o.followup_tpl),
    footer               = coalesce(nullif(btrim(p->>'footer'), ''), o.footer),
    ig_tpl               = coalesce(nullif(btrim(p->>'ig_tpl'), ''), o.ig_tpl),
    ig_account           = case when p ? 'ig_account' then public.outreach_clean_instagram(p->>'ig_account') else o.ig_account end,
    ig_daily_limit       = coalesce((p->>'ig_daily_limit')::integer, o.ig_daily_limit),
    updated_at           = now()
   where o.id = 1
   returning * into s;
  perform public.admin_audit('outreach.settings', 'outreach', null, case when p ? 'paused' then
            case when (p->>'paused')::boolean then 'sending paused' else 'sending on' end else 'settings saved' end, p - 'body_tpl' - 'followup_tpl' - 'ig_tpl');
  return to_jsonb(s);
end $$;

-- ---- Sending (the outreach-send function, as the service role) ------------------------

-- The next email that may go out now, marked 'sending'; or why none.
create or replace function public.outreach_claim_next()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s        public.outreach_settings;
  m        public.outreach_messages;
  l        public.outreach_leads;
  v_local  timestamp;
  v_sent   integer;
  v_reason text;
begin
  select * into s from public.outreach_settings where id = 1;
  if s.paused then return jsonb_build_object('status', 'paused'); end if;

  -- An email stuck in 'sending' (the function stopped half way) goes back to
  -- the queue; Resend's idempotency key stops a second copy going out.
  update public.outreach_messages set status = 'queued', updated_at = now()
   where status = 'sending' and updated_at < now() - interval '15 minutes';

  select count(*) into v_sent from public.outreach_messages
   where status in ('sent','bounced','complained','sending') and coalesce(sent_at, updated_at) > now() - interval '24 hours';
  if v_sent >= s.daily_cap then return jsonb_build_object('status', 'cap'); end if;

  for m in select * from public.outreach_messages where status = 'queued' order by created_at for update skip locked loop
    select * into l from public.outreach_leads where id = m.lead_id;
    v_local := now() at time zone coalesce(public.outreach_valid_tz(l.timezone), 'UTC');
    if s.weekdays_only and extract(isodow from v_local) > 5 then continue; end if;
    if extract(hour from v_local) < s.window_start or extract(hour from v_local) >= s.window_end then continue; end if;

    v_reason := coalesce(public.outreach_country_block(l.country, l.region), public.outreach_blocked_reason(m.to_email));
    if v_reason is not null then
      update public.outreach_messages set status = 'cancelled', error = v_reason, updated_at = now() where id = m.id;
      update public.outreach_leads set email_status = case when v_reason = 'opted_out' and email_status in ('queued','followup_queued')
                                                           then 'unsubscribed' else 'skipped' end,
                                       updated_at = now()
       where id = l.id and email_status in ('queued','followup_queued');
      continue;
    end if;

    update public.outreach_messages set status = 'sending', attempts = attempts + 1, updated_at = now() where id = m.id;
    return jsonb_build_object('status', 'send', 'id', m.id, 'to', m.to_email, 'subject', m.subject, 'body', m.body,
                              'from_name', s.from_name, 'unsub_token', l.unsub_token);
  end loop;
  return jsonb_build_object('status', 'idle');
end $$;

create or replace function public.outreach_mark_sent(p_id uuid, p_resend_id text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  m public.outreach_messages;
begin
  update public.outreach_messages set status = 'sent', sent_at = now(), resend_id = nullif(p_resend_id, ''),
                                      error = null, updated_at = now()
   where id = p_id and status = 'sending'
  returning * into m;
  if found then
    update public.outreach_leads
       set email_status = case when m.kind = 'followup' then 'followed_up' else 'sent' end,
           email_sent_at = now(), updated_at = now()
     where id = m.lead_id and email_status in ('queued','followup_queued');
  end if;
end $$;

-- p_retry: a temporary problem (rate limit, Resend down): try again later,
-- at most 3 times. Otherwise the email fails and the shop goes back to
-- where it was, with the error shown in the admin panel.
create or replace function public.outreach_mark_failed(p_id uuid, p_error text, p_retry boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  m public.outreach_messages;
begin
  select * into m from public.outreach_messages where id = p_id and status = 'sending' for update;
  if not found then return; end if;
  if p_retry and m.attempts < 3 then
    update public.outreach_messages set status = 'queued', error = left(p_error, 500), updated_at = now() where id = p_id;
  else
    update public.outreach_messages set status = 'failed', error = left(p_error, 500), updated_at = now() where id = p_id;
    update public.outreach_leads
       set email_status = case when m.kind = 'followup' then 'sent' else 'new' end, updated_at = now()
     where id = m.lead_id and email_status in ('queued','followup_queued');
  end if;
end $$;

-- Resend events (the outreach-webhook function). Only bounces and spam
-- reports matter; events for the app's own emails don't match and are ignored.
create or replace function public.outreach_webhook_event(p_type text, p_resend_id text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  m        public.outreach_messages;
  v_bounce integer;
  v_total  integer;
begin
  select * into m from public.outreach_messages where resend_id = p_resend_id and p_resend_id is not null;
  if not found then return jsonb_build_object('matched', false); end if;

  if p_type = 'email.bounced' then
    update public.outreach_messages set status = 'bounced', updated_at = now() where id = m.id and status = 'sent';
    update public.outreach_leads set email_status = 'bounced', updated_at = now() where id = m.lead_id;
    insert into public.outreach_suppressions (email, reason) values (lower(m.to_email), 'bounced')
    on conflict (email) do nothing;
    -- More than 3% of the last 50 bounced: something is wrong with the list.
    select count(*) filter (where x.status = 'bounced'), count(*) into v_bounce, v_total
      from (select status from public.outreach_messages where status in ('sent','bounced','complained')
             order by sent_at desc nulls last limit 50) x;
    if v_total >= 10 and v_bounce::numeric / v_total > 0.03 then
      update public.outreach_settings set paused = true, pause_reason = 'bounces', updated_at = now() where id = 1;
    end if;
  elsif p_type = 'email.complained' then
    update public.outreach_messages set status = 'complained', updated_at = now() where id = m.id;
    update public.outreach_leads set email_status = 'complained', updated_at = now() where id = m.lead_id;
    insert into public.outreach_suppressions (email, reason) values (lower(m.to_email), 'complained')
    on conflict (email) do update set reason = 'complained';
    -- Any spam report pauses sending until an admin looks.
    update public.outreach_settings set paused = true, pause_reason = 'complaint', updated_at = now() where id = 1;
  end if;
  return jsonb_build_object('matched', true);
end $$;

-- Public: the unsubscribe link and the one-click unsubscribe header.
create or replace function public.outreach_unsubscribe(p_token uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  l public.outreach_leads;
begin
  select * into l from public.outreach_leads where unsub_token = p_token;
  if not found then return false; end if;
  if l.email is not null then
    insert into public.outreach_suppressions (email, reason) values (lower(l.email), 'unsubscribed')
    on conflict (email) do nothing;
  end if;
  update public.outreach_messages set status = 'cancelled', error = 'unsubscribed', updated_at = now()
   where lead_id = l.id and status = 'queued';
  update public.outreach_leads set email_status = 'unsubscribed', updated_at = now() where id = l.id;
  return true;
end $$;

-- ---- Schedule -------------------------------------------------------------------------
-- Every 10 minutes, when sending is on and something is queued, ask the
-- outreach-send function to send the next email. The function checks the
-- secret below; it's made here and never leaves the database.

create or replace function public.outreach_secret_ok(p_secret text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from vault.decrypted_secrets where name = 'outreach_cron_secret' and decrypted_secret = p_secret);
$$;

create or replace function public.outreach_send_tick()
returns bigint language plpgsql volatile security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  if (select paused from public.outreach_settings where id = 1)
     or not exists (select 1 from public.outreach_messages where status in ('queued','sending')) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'outreach_cron_secret';
  if v_url is null or v_secret is null then return null; end if;
  return net.http_post(
    url     := v_url || '/functions/v1/outreach-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-outreach-secret', v_secret),
    body    := jsonb_build_object('mode', 'tick'));
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'vault')
     and not exists (select 1 from vault.secrets where name = 'outreach_cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'outreach_cron_secret');
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'stampfix-outreach-send';
    perform cron.schedule('stampfix-outreach-send', '*/10 * * * *', 'select public.outreach_send_tick()');
  end if;
end $$;

-- ---- Grants ---------------------------------------------------------------------------

revoke execute on function public.outreach_country_block(text, text) from public, anon, authenticated;
revoke execute on function public.outreach_valid_tz(text) from public, anon, authenticated;
revoke execute on function public.outreach_render(text, public.outreach_leads, text) from public, anon, authenticated;
revoke execute on function public.outreach_blocked_reason(text) from public, anon, authenticated;
revoke execute on function public.outreach_clean_instagram(text) from public, anon, authenticated;
revoke execute on function public.outreach_lead_json(public.outreach_leads, public.outreach_settings) from public, anon, authenticated;
revoke execute on function public.admin_outreach_state() from public, anon;
revoke execute on function public.admin_outreach_leads(text, text, integer) from public, anon;
revoke execute on function public.admin_outreach_preview(uuid, text) from public, anon;
revoke execute on function public.admin_outreach_add_leads(jsonb) from public, anon;
revoke execute on function public.admin_outreach_save_scans(jsonb) from public, anon;
revoke execute on function public.admin_outreach_update_lead(uuid, jsonb) from public, anon;
revoke execute on function public.admin_outreach_delete_lead(uuid) from public, anon;
revoke execute on function public.admin_outreach_queue(uuid[], text) from public, anon;
revoke execute on function public.admin_outreach_cancel(uuid[]) from public, anon;
revoke execute on function public.admin_outreach_save_settings(jsonb) from public, anon;
revoke execute on function public.outreach_claim_next() from public, anon, authenticated;
revoke execute on function public.outreach_mark_sent(uuid, text) from public, anon, authenticated;
revoke execute on function public.outreach_mark_failed(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.outreach_webhook_event(text, text) from public, anon, authenticated;
revoke execute on function public.outreach_secret_ok(text) from public, anon, authenticated;
revoke execute on function public.outreach_send_tick() from public, anon, authenticated;
revoke execute on function public.outreach_unsubscribe(uuid) from public;

grant execute on function public.admin_outreach_state() to authenticated;
grant execute on function public.admin_outreach_leads(text, text, integer) to authenticated;
grant execute on function public.admin_outreach_preview(uuid, text) to authenticated;
grant execute on function public.admin_outreach_add_leads(jsonb) to authenticated;
grant execute on function public.admin_outreach_save_scans(jsonb) to authenticated;
grant execute on function public.admin_outreach_update_lead(uuid, jsonb) to authenticated;
grant execute on function public.admin_outreach_delete_lead(uuid) to authenticated;
grant execute on function public.admin_outreach_queue(uuid[], text) to authenticated;
grant execute on function public.admin_outreach_cancel(uuid[]) to authenticated;
grant execute on function public.admin_outreach_save_settings(jsonb) to authenticated;
grant execute on function public.outreach_claim_next() to service_role;
grant execute on function public.outreach_mark_sent(uuid, text) to service_role;
grant execute on function public.outreach_mark_failed(uuid, text, boolean) to service_role;
grant execute on function public.outreach_webhook_event(text, text) to service_role;
grant execute on function public.outreach_secret_ok(text) to service_role;
grant execute on function public.outreach_unsubscribe(uuid) to anon, authenticated, service_role;
