-- =====================================================================
-- Outreach: a fast time-zone check.
--
-- outreach_valid_tz() looked each shop's time zone up in pg_timezone_names,
-- which reads every time zone from disk: about 60 ms a call. Adding 384 shops
-- at once took 23 seconds and hit the 8-second statement limit ("canceling
-- statement due to statement timeout"). Now the zone is simply tried, which
-- takes microseconds. Same answers: a real zone name comes back trimmed,
-- anything else is null.
--
-- Safe to run more than once.
-- =====================================================================

create or replace function public.outreach_valid_tz(p_tz text)
returns text language plpgsql stable set search_path = public as $$
declare
  v text := btrim(coalesce(p_tz, ''));
begin
  -- Region/City names ("America/Vancouver", "Etc/GMT+5") or UTC/GMT only.
  if length(v) > 64 or not (v ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' or v in ('UTC', 'GMT')) then
    return null;
  end if;
  perform now() at time zone v;
  return v;
exception when others then
  return null;
end $$;

revoke execute on function public.outreach_valid_tz(text) from public, anon, authenticated;
