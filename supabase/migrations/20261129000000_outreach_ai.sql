-- =====================================================================
-- Outreach: the AI email finder, and the Areas overview.
--
-- For shops in the list without an email address, an AI with Google Search
-- (Google's Gemini, on its free plan) looks for the address the shop
-- publishes: its website, its Google listing, Facebook, Yelp and so on.
-- The outreach-tools function does the searching, one shop at a time,
-- started every minute by the job below while shops are waiting.
--
-- An address is only used straight away ("found") when it was seen on a
-- real web page next to the shop's name, or on the shop's own website, and
-- its domain receives email. Those go into the email queue by themselves
-- (unless switched off), with the same rules as queuing by hand: the same
-- sending limits, hours and blocks. Anything the AI says but the page check
-- can't confirm waits under "Check these" for a person to use or reject.
--
-- Areas: which kinds of shop, in which cities, are in the list and how far
-- outreach got with each (emailed, Instagram, replies), so it's clear where
-- you've already reached out.
--
-- Only platform admins write; view-only admins can look. The worker
-- functions are for the service role only. Safe to run more than once.
-- =====================================================================

alter table public.outreach_leads
  -- null: not searched. queued -> working -> found | suggested | not_found | failed
  add column if not exists ai_status text check (ai_status is null or ai_status in
                             ('queued','working','found','suggested','not_found','failed')),
  -- The address the AI found and the page it was published on.
  add column if not exists ai_email text check (ai_email is null or (length(ai_email) <= 254 and ai_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column if not exists ai_source text check (ai_source is null or length(ai_source) <= 500),
  -- One line on what happened ("Seen on beanthere.ca/contact", "No address published").
  add column if not exists ai_note text check (ai_note is null or length(ai_note) <= 500),
  -- What the AI searched Google for, so a person can repeat the search.
  add column if not exists ai_search text check (ai_search is null or length(ai_search) <= 200),
  add column if not exists ai_attempts integer not null default 0,
  add column if not exists ai_queued_at timestamptz,
  add column if not exists ai_started_at timestamptz,
  add column if not exists ai_checked_at timestamptz;
create index if not exists outreach_leads_ai_idx on public.outreach_leads (ai_status, ai_queued_at) where ai_status is not null;

alter table public.outreach_settings
  -- Confirmed addresses go into the email queue by themselves.
  add column if not exists ai_auto_queue boolean not null default true,
  -- No searches until then (Google's free searches for the day are used up,
  -- or the key is wrong), and why.
  add column if not exists ai_paused_until timestamptz,
  add column if not exists ai_last_error text check (ai_last_error is null or length(ai_last_error) <= 300);

-- Shops the AI may look for: no address yet, not contacted, and email is
-- allowed in their country.
create or replace function public.outreach_ai_wanted(p_lead public.outreach_leads)
returns boolean language sql stable set search_path = public as $$
  select p_lead.email is null and p_lead.email_status = 'new'
         and public.outreach_country_block(p_lead.country, p_lead.region) is null;
$$;

-- ---- Admin ------------------------------------------------------------------------------

create or replace function public.admin_outreach_ai_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s public.outreach_settings;
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  select * into s from public.outreach_settings where id = 1;
  return (
    select jsonb_build_object(
      'auto_queue', s.ai_auto_queue,
      'paused_until', case when s.ai_paused_until > now() then s.ai_paused_until end,
      'last_error', s.ai_last_error,
      'no_email', count(*) filter (where public.outreach_ai_wanted(l)),
      'not_searched', count(*) filter (where public.outreach_ai_wanted(l) and l.ai_status is null),
      'waiting', count(*) filter (where public.outreach_ai_wanted(l) and l.ai_status in ('queued','working')),
      'working', count(*) filter (where public.outreach_ai_wanted(l) and l.ai_status = 'working'),
      'found', count(*) filter (where l.ai_status = 'found'),
      'found_queued', count(*) filter (where l.ai_status = 'found' and l.email_status <> 'new'),
      'suggested', count(*) filter (where public.outreach_ai_wanted(l) and l.ai_status = 'suggested'),
      'not_found', count(*) filter (where public.outreach_ai_wanted(l) and l.ai_status in ('not_found','failed')),
      'searched_24h', count(*) filter (where l.ai_checked_at > now() - interval '24 hours'),
      'email_off', count(*) filter (where l.email is null and l.email_status = 'new'
                                     and public.outreach_country_block(l.country, l.region) is not null))
      from public.outreach_leads l);
end $$;

-- p_view: not_searched | waiting | found | suggested | not_found
create or replace function public.admin_outreach_ai_leads(p_view text, p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s public.outreach_settings;
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  if p_view not in ('not_searched','waiting','found','suggested','not_found') then raise exception 'invalid_view'; end if;
  select * into s from public.outreach_settings where id = 1;
  return coalesce((
    select jsonb_agg(public.outreach_lead_json(x.lead, s) order by x.ord)
      from (select l as lead,
                   row_number() over (order by
                     case when p_view = 'waiting' then (l.ai_status = 'working')::int end desc nulls last,
                     case when p_view = 'waiting' then l.ai_queued_at end asc,
                     case when p_view in ('found','suggested','not_found') then l.ai_checked_at end desc nulls last,
                     l.created_at desc, l.id) as ord
              from public.outreach_leads l
             where case p_view
                     when 'not_searched' then public.outreach_ai_wanted(l) and l.ai_status is null
                     when 'waiting' then public.outreach_ai_wanted(l) and l.ai_status in ('queued','working')
                     when 'found' then l.ai_status = 'found'
                     when 'suggested' then public.outreach_ai_wanted(l) and l.ai_status = 'suggested'
                     else public.outreach_ai_wanted(l) and l.ai_status in ('not_found','failed') end
             order by ord
             limit greatest(1, least(coalesce(p_limit, 500), 1000))) x), '[]'::jsonb);
end $$;

-- Puts shops in line for the AI: every shop not searched yet (p_ids null),
-- or the chosen ones (also to search again after "not found").
create or replace function public.admin_outreach_ai_start(p_ids uuid[] default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_ids is not null and (cardinality(p_ids) = 0 or cardinality(p_ids) > 1000) then raise exception 'invalid_ids'; end if;
  update public.outreach_leads l
     set ai_status = 'queued', ai_queued_at = now(), ai_started_at = null, ai_attempts = 0,
         ai_email = null, ai_source = null, ai_note = null, ai_search = null, updated_at = now()
   where public.outreach_ai_wanted(l)
     and case when p_ids is null then l.ai_status is null
              else l.id = any (p_ids) and (l.ai_status is null or l.ai_status in ('suggested','not_found','failed')) end;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.admin_audit('outreach.ai_start', 'outreach', null, v_n || ' shops sent to the AI email finder', jsonb_build_object('count', v_n));
  end if;
  return jsonb_build_object('queued', v_n);
end $$;

-- Takes the shops still waiting out of line (one being searched right now finishes).
create or replace function public.admin_outreach_ai_cancel()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_n integer;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  update public.outreach_leads set ai_status = null, ai_queued_at = null, updated_at = now() where ai_status = 'queued';
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.admin_audit('outreach.ai_cancel', 'outreach', null, v_n || ' AI searches cancelled', jsonb_build_object('count', v_n));
  end if;
  return jsonb_build_object('cancelled', v_n);
end $$;

-- "Use it": takes the AI's address (or the one the admin typed instead)
-- for the shop and, if p_queue, puts its first email in the queue.
create or replace function public.admin_outreach_ai_accept(p_id uuid, p_email text default null, p_queue boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  l       public.outreach_leads;
  v_email text;
  v_q     jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  select * into l from public.outreach_leads where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if l.email is not null then raise exception 'has_email'; end if;
  v_email := nullif(lower(btrim(coalesce(p_email, l.ai_email, ''))), '');
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  begin
    update public.outreach_leads o
       set email = v_email,
           email_source = case when v_email = lower(coalesce(o.ai_email, '')) then left(coalesce(o.ai_source, 'found by AI, checked by hand'), 500)
                               else 'added by hand' end,
           ai_status = 'found', ai_checked_at = coalesce(o.ai_checked_at, now()), updated_at = now()
     where o.id = p_id;
  exception when unique_violation then
    raise exception 'duplicate';
  end;
  perform public.admin_audit('outreach.ai_accept', 'outreach_lead', p_id::text, l.business_name, jsonb_build_object('email', v_email));
  if not coalesce(p_queue, false) then return jsonb_build_object('queued', false, 'reason', null); end if;
  v_q := public.admin_outreach_queue(array[p_id], 'first');
  return jsonb_build_object('queued', coalesce((v_q->>'queued')::int, 0) = 1, 'reason', v_q->'skipped'->0->>'reason');
end $$;

-- "Not theirs": drops the AI's suggestion.
create or replace function public.admin_outreach_ai_reject(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  l public.outreach_leads;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  select * into l from public.outreach_leads where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if l.ai_status is distinct from 'suggested' then return; end if;
  update public.outreach_leads
     set ai_status = 'not_found', ai_email = null, ai_source = null,
         ai_note = left('You rejected ' || coalesce(l.ai_email, 'the suggestion') || '.', 500), updated_at = now()
   where id = p_id;
  perform public.admin_audit('outreach.ai_reject', 'outreach_lead', p_id::text, l.business_name, jsonb_build_object('email', l.ai_email));
end $$;

-- Auto-queue on or off; p_resume clears a pause (after fixing the key).
create or replace function public.admin_outreach_ai_settings(p_auto_queue boolean default null, p_resume boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  update public.outreach_settings
     set ai_auto_queue = coalesce(p_auto_queue, ai_auto_queue),
         ai_paused_until = case when coalesce(p_resume, false) then null else ai_paused_until end,
         ai_last_error = case when coalesce(p_resume, false) then null else ai_last_error end,
         updated_at = now()
   where id = 1;
  perform public.admin_audit('outreach.ai_settings', 'outreach', null, 'AI email finder settings',
                             jsonb_build_object('auto_queue', p_auto_queue, 'resume', p_resume));
  return public.admin_outreach_ai_state();
end $$;

-- ---- The worker (outreach-tools, as the service role) -------------------------------------

-- The next shop to search, marked 'working'; or why none.
create or replace function public.outreach_ai_claim()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s public.outreach_settings;
  l public.outreach_leads;
begin
  select * into s from public.outreach_settings where id = 1;
  -- A search that stopped half way (the function was cut off) goes back in
  -- line, and counts as failed after 3 tries.
  update public.outreach_leads
     set ai_status = case when ai_attempts >= 3 then 'failed' else 'queued' end,
         ai_note = case when ai_attempts >= 3 then 'The search stopped half way 3 times.' else ai_note end,
         ai_checked_at = case when ai_attempts >= 3 then now() else ai_checked_at end,
         updated_at = now()
   where ai_status = 'working' and ai_started_at < now() - interval '10 minutes';
  -- A shop that got an address another way, or was marked not to email, leaves the line.
  update public.outreach_leads l2 set ai_status = null, ai_queued_at = null, updated_at = now()
   where l2.ai_status = 'queued' and not public.outreach_ai_wanted(l2);
  if s.ai_paused_until > now() then return jsonb_build_object('status', 'paused', 'until', s.ai_paused_until); end if;

  select * into l from public.outreach_leads
   where ai_status = 'queued'
   order by ai_queued_at, created_at, id
   limit 1
   for update skip locked;
  if not found then return jsonb_build_object('status', 'idle'); end if;
  update public.outreach_leads set ai_status = 'working', ai_started_at = now(), ai_attempts = ai_attempts + 1 where id = l.id;
  return jsonb_build_object('status', 'work', 'lead', jsonb_build_object(
    'id', l.id, 'business_name', l.business_name, 'category', l.category, 'category_key', l.category_key,
    'city', l.city, 'region', l.region, 'country', l.country, 'address', l.address, 'phone', l.phone,
    'website', l.website, 'website_checked', l.website_checked_at is not null, 'instagram', l.instagram,
    'attempt', l.ai_attempts + 1));
end $$;

-- What the search came to. p: {outcome, email, source, note, search, website, website_checked, instagram}
--   found      an address seen on a web page: saved, and queued when auto-queue is on
--   suggested  the AI's address, not confirmed: waits for a person
--   not_found  nothing usable
--   failed     gave up on this shop
--   retry      something went wrong with this shop: try again later (3 tries)
--   requeue    nothing to do with this shop (Google busy or out of free searches): back in line, the try doesn't count
create or replace function public.outreach_ai_save(p_id uuid, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s         public.outreach_settings;
  l         public.outreach_leads;
  v_outcome text := coalesce(p->>'outcome', '');
  v_email   text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_source  text := nullif(left(btrim(coalesce(p->>'source', '')), 500), '');
  v_note    text := nullif(left(btrim(coalesce(p->>'note', '')), 500), '');
  v_search  text := nullif(left(btrim(coalesce(p->>'search', '')), 200), '');
  v_site    text := nullif(left(btrim(coalesce(p->>'website', '')), 500), '');
  v_checked boolean := coalesce((p->>'website_checked')::boolean, false);
  v_ig      text := public.outreach_clean_instagram(p->>'instagram');
  v_dup     text;
  v_reason  text;
  v_queued  boolean := false;
begin
  if v_outcome not in ('found','suggested','not_found','failed','retry','requeue') then raise exception 'invalid_outcome'; end if;
  select * into s from public.outreach_settings where id = 1;
  select * into l from public.outreach_leads where id = p_id for update;
  if not found then return jsonb_build_object('status', 'gone'); end if;
  if l.ai_status is distinct from 'working' then return jsonb_build_object('status', 'not_working'); end if;
  -- Got an address by hand (or was marked not to email) during the search: keep that.
  if not public.outreach_ai_wanted(l) then
    update public.outreach_leads set ai_status = null, ai_queued_at = null, ai_started_at = null, updated_at = now() where id = p_id;
    return jsonb_build_object('status', 'skipped');
  end if;

  if v_outcome = 'requeue' then
    update public.outreach_leads set ai_status = 'queued', ai_started_at = null, ai_attempts = greatest(ai_attempts - 1, 0), updated_at = now()
     where id = p_id;
    return jsonb_build_object('status', 'queued');
  end if;
  if v_outcome = 'retry' then
    update public.outreach_leads
       set ai_status = case when ai_attempts >= 3 then 'failed' else 'queued' end,
           ai_note = coalesce(v_note, ai_note), ai_started_at = null,
           ai_checked_at = case when ai_attempts >= 3 then now() else ai_checked_at end,
           updated_at = now()
     where id = p_id
     returning ai_status into v_outcome;
    return jsonb_build_object('status', v_outcome);
  end if;

  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then v_email := null; end if;
  if v_outcome in ('found','suggested') and v_email is null then v_outcome := 'not_found'; end if;
  -- One address can't belong to two shops in the list.
  if v_email is not null then
    select o.business_name into v_dup from public.outreach_leads o where lower(o.email) = v_email and o.id <> p_id limit 1;
    if v_dup is not null then
      v_note := left('Found ' || v_email || ', but ' || v_dup || ' in your list already has that address.', 500);
      v_outcome := 'not_found';
      v_email := null;
    end if;
  end if;
  -- Instagram and website only fill what's empty, and never take another shop's.
  if v_ig is not null and (l.instagram is not null
      or exists (select 1 from public.outreach_leads o where lower(o.instagram) = lower(v_ig) and o.id <> p_id)) then
    v_ig := null;
  end if;
  if l.website is not null then v_site := null; end if;

  begin
    update public.outreach_leads o
       set email = case when v_outcome = 'found' then v_email else o.email end,
           email_source = case when v_outcome = 'found' then coalesce(v_source, 'found by AI') else o.email_source end,
           ai_status = v_outcome,
           ai_email = case when v_outcome in ('found','suggested') then v_email end,
           ai_source = case when v_outcome in ('found','suggested') then v_source end,
           ai_note = v_note,
           ai_search = coalesce(v_search, o.ai_search),
           ai_checked_at = now(),
           ai_started_at = null,
           website = coalesce(o.website, v_site),
           website_checked_at = case when v_checked then now() else o.website_checked_at end,
           instagram = coalesce(o.instagram, v_ig),
           updated_at = now()
     where o.id = p_id
     returning * into l;
  exception when unique_violation then
    -- Another shop took the same address or account a moment ago.
    update public.outreach_leads
       set ai_status = 'not_found', ai_email = null, ai_source = null, ai_checked_at = now(), ai_started_at = null,
           ai_note = left('Found ' || coalesce(v_email, 'an address') || ', but another shop in your list already has it.', 500),
           updated_at = now()
     where id = p_id
     returning * into l;
    v_outcome := 'not_found';
  end;

  -- Into the email queue, with the same checks as queuing by hand.
  if v_outcome = 'found' and s.ai_auto_queue then
    v_reason := case
      when l.email_status <> 'new' then 'not_new'
      when public.outreach_country_block(l.country, l.region) is not null then public.outreach_country_block(l.country, l.region)
      when exists (select 1 from public.outreach_messages m
                    where m.lead_id = l.id and m.kind = 'first' and m.status not in ('cancelled','failed')) then 'already_queued'
      else public.outreach_blocked_reason(l.email) end;
    if v_reason is null then
      insert into public.outreach_messages (lead_id, kind, to_email, subject, body)
      values (l.id, 'first', lower(l.email),
              public.outreach_render(s.subject_tpl, l, s.default_first_line),
              public.outreach_render(s.body_tpl, l, s.default_first_line) || E'\n\n' || s.footer);
      update public.outreach_leads set email_status = 'queued', updated_at = now() where id = l.id;
      v_queued := true;
    end if;
  end if;

  -- A search went through, so an earlier error is over.
  update public.outreach_settings set ai_last_error = null where id = 1 and ai_last_error is not null;
  return jsonb_build_object('status', v_outcome, 'queued', v_queued, 'not_queued', v_reason);
end $$;

-- Stops the searches for p_minutes, or (null) until Google's free daily
-- searches come back at midnight Pacific time.
create or replace function public.outreach_ai_pause(p_minutes integer, p_error text)
returns timestamptz language plpgsql volatile security definer set search_path = public as $$
declare
  v_until timestamptz;
begin
  v_until := case when p_minutes is null
    then ((date_trunc('day', now() at time zone 'America/Los_Angeles') + interval '1 day 5 minutes') at time zone 'America/Los_Angeles')
    else now() + make_interval(mins => greatest(1, least(p_minutes, 1440))) end;
  update public.outreach_settings
     set ai_paused_until = v_until, ai_last_error = nullif(left(btrim(coalesce(p_error, '')), 300), '')
   where id = 1;
  return v_until;
end $$;

-- Every minute while shops are waiting: asks outreach-tools to search a few.
create or replace function public.outreach_ai_tick()
returns bigint language plpgsql volatile security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public.outreach_leads where ai_status in ('queued','working'))
     or (select ai_paused_until from public.outreach_settings where id = 1) > now() then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'outreach_cron_secret';
  if v_url is null or v_secret is null then return null; end if;
  return net.http_post(
    url                  := v_url || '/functions/v1/outreach-tools',
    body                 := jsonb_build_object('action', 'ai_tick'),
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-outreach-secret', v_secret),
    timeout_milliseconds := 60000);
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'stampfix-outreach-ai';
    perform cron.schedule('stampfix-outreach-ai', '* * * * *', 'select public.outreach_ai_tick()');
  end if;
end $$;

-- ---- Areas ----------------------------------------------------------------------------

-- One row per city and kind of shop: how many shops, and how far outreach got.
create or replace function public.admin_outreach_coverage()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.country, x.city_key, x.shops desc, x.category_key)
      from (select l.country,
                   lower(btrim(coalesce(l.city, ''))) as city_key,
                   -- The way the city is written most often ("Vancouver").
                   mode() within group (order by l.city) as city,
                   mode() within group (order by l.region) as region,
                   coalesce(l.category_key, nullif(lower(btrim(l.category)), ''), 'other') as category_key,
                   mode() within group (order by l.category) as category,
                   count(*)::int as shops,
                   count(*) filter (where l.email is not null)::int as with_email,
                   count(*) filter (where l.email_status in ('queued','followup_queued'))::int as queued,
                   count(*) filter (where l.email_sent_at is not null)::int as emailed,
                   count(*) filter (where l.ig_sent_at is not null)::int as ig_messaged,
                   -- Emailed or messaged on Instagram (each shop once).
                   count(*) filter (where l.email_sent_at is not null or l.ig_sent_at is not null)::int as reached,
                   count(*) filter (where l.email_status = 'replied' or l.ig_status = 'replied')::int as replied,
                   count(*) filter (where l.email_status = 'not_interested' or l.ig_status = 'not_interested')::int as not_interested,
                   count(*) filter (where l.email is null and l.ai_status is not null)::int as ai_searched,
                   max(greatest(l.email_sent_at, l.ig_sent_at)) as last_contact,
                   min(l.created_at) as first_added,
                   max(l.created_at) as last_added
              from public.outreach_leads l
             group by l.country, lower(btrim(coalesce(l.city, ''))),
                      coalesce(l.category_key, nullif(lower(btrim(l.category)), ''), 'other')) x), '[]'::jsonb);
end $$;

-- ---- Grants ---------------------------------------------------------------------------

revoke execute on function public.outreach_ai_wanted(public.outreach_leads) from public, anon, authenticated;
revoke execute on function public.admin_outreach_ai_state() from public, anon;
revoke execute on function public.admin_outreach_ai_leads(text, integer) from public, anon;
revoke execute on function public.admin_outreach_ai_start(uuid[]) from public, anon;
revoke execute on function public.admin_outreach_ai_cancel() from public, anon;
revoke execute on function public.admin_outreach_ai_accept(uuid, text, boolean) from public, anon;
revoke execute on function public.admin_outreach_ai_reject(uuid) from public, anon;
revoke execute on function public.admin_outreach_ai_settings(boolean, boolean) from public, anon;
revoke execute on function public.admin_outreach_coverage() from public, anon;
revoke execute on function public.outreach_ai_claim() from public, anon, authenticated;
revoke execute on function public.outreach_ai_save(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.outreach_ai_pause(integer, text) from public, anon, authenticated;
revoke execute on function public.outreach_ai_tick() from public, anon, authenticated;

grant execute on function public.admin_outreach_ai_state() to authenticated;
grant execute on function public.admin_outreach_ai_leads(text, integer) to authenticated;
grant execute on function public.admin_outreach_ai_start(uuid[]) to authenticated;
grant execute on function public.admin_outreach_ai_cancel() to authenticated;
grant execute on function public.admin_outreach_ai_accept(uuid, text, boolean) to authenticated;
grant execute on function public.admin_outreach_ai_reject(uuid) to authenticated;
grant execute on function public.admin_outreach_ai_settings(boolean, boolean) to authenticated;
grant execute on function public.admin_outreach_coverage() to authenticated;
grant execute on function public.outreach_ai_claim() to service_role;
grant execute on function public.outreach_ai_save(uuid, jsonb) to service_role;
grant execute on function public.outreach_ai_pause(integer, text) to service_role;
