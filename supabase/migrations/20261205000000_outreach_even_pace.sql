-- =====================================================================
-- Outreach: the daily limit spread evenly over the sending hours.
--
-- Before: at most one email every 10 minutes, so a daily limit above about
-- 54 (per time zone) was never reached.
-- Now: the schedule checks every minute and sends the next email once
--     (sending hours in minutes) / (daily limit)
-- minutes have passed since the last one:
--     09:00-18:00 and 90 a day: one every 6 minutes
--     00:00-24:00 and 90 a day: one every 16 minutes
-- It still only sends inside each shop's own sending hours (and on weekdays
-- when that is set), and never more than the daily limit in 24 hours.
-- "Send next now" in the admin panel still sends straight away.
--
-- Only adds two functions, replaces outreach_send_tick() and moves the
-- schedule from every 10 minutes to every minute. Safe to run more than once.
-- =====================================================================

-- Minutes between two emails: the sending hours shared out over the daily limit.
create or replace function public.outreach_send_gap_minutes(p_cap integer, p_start integer, p_end integer)
returns integer language sql immutable set search_path = public as $$
  select greatest(1, floor(greatest(1, coalesce(p_end, 24) - coalesce(p_start, 0)) * 60.0 / greatest(1, coalesce(p_cap, 1))))::integer;
$$;

-- True when the next email should go out now.
create or replace function public.outreach_send_due()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  s     public.outreach_settings;
  v_gap integer;
begin
  select * into s from public.outreach_settings where id = 1;
  if not found or s.paused then return false; end if;

  -- An email stuck half way is retried (outreach_claim_next puts it back).
  if exists (select 1 from public.outreach_messages where status = 'sending' and updated_at < now() - interval '15 minutes') then
    return true;
  end if;

  -- The daily limit, over the last 24 hours.
  if (select count(*) from public.outreach_messages
       where status in ('sent','bounced','complained','sending')
         and coalesce(sent_at, updated_at) > now() - interval '24 hours') >= s.daily_cap then
    return false;
  end if;

  -- The gap since the last email (20 seconds early, so a 6-minute gap is 6 minutes, not 7).
  v_gap := public.outreach_send_gap_minutes(s.daily_cap, s.window_start, s.window_end);
  if exists (select 1 from public.outreach_messages
              where status in ('sent','bounced','complained','sending')
                and coalesce(sent_at, updated_at) > now() - make_interval(mins => v_gap) + interval '20 seconds') then
    return false;
  end if;

  -- Something queued for a shop that is inside its sending hours right now.
  return exists (
    select 1
      from public.outreach_messages m
      join public.outreach_leads l on l.id = m.lead_id
     cross join lateral (select now() at time zone coalesce(public.outreach_valid_tz(l.timezone), 'UTC') as t) x
     where m.status = 'queued'
       and (not s.weekdays_only or extract(isodow from x.t) <= 5)
       and extract(hour from x.t) >= s.window_start
       and extract(hour from x.t) < s.window_end);
end $$;

-- Every minute: ask the outreach-send function for one email, only when one is due.
create or replace function public.outreach_send_tick()
returns bigint language plpgsql volatile security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  if not public.outreach_send_due() then return null; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'outreach_cron_secret';
  if v_url is null or v_secret is null then return null; end if;
  return net.http_post(
    url     := v_url || '/functions/v1/outreach-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-outreach-secret', v_secret),
    body    := jsonb_build_object('mode', 'tick'));
end $$;

revoke execute on function public.outreach_send_gap_minutes(integer, integer, integer) from public, anon;
revoke execute on function public.outreach_send_due() from public, anon, authenticated;
revoke execute on function public.outreach_send_tick() from public, anon, authenticated;
grant execute on function public.outreach_send_gap_minutes(integer, integer, integer) to authenticated, service_role;
grant execute on function public.outreach_send_due() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'stampfix-outreach-send';
    perform cron.schedule('stampfix-outreach-send', '* * * * *', 'select public.outreach_send_tick()');
  end if;
end $$;
