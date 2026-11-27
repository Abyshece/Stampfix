-- =====================================================================
-- Outreach: sending stays on until an admin switches it off.
--
--  * A bounce no longer pauses sending. The bounced address is still blocked
--    for good, so it is never emailed again.
--  * A spam report still pauses sending: repeated reports could get the
--    Resend account suspended, and it also sends the app's own emails.
--  * The daily limit can go up to 100 (was 30).
--
-- If sending is paused right now because of bounces, it carries on.
-- Safe to run more than once.
-- =====================================================================

alter table public.outreach_settings drop constraint if exists outreach_settings_daily_cap_check;
alter table public.outreach_settings add constraint outreach_settings_daily_cap_check check (daily_cap between 1 and 100);

-- Resend events (the outreach-webhook function), without the bounce pause.
create or replace function public.outreach_webhook_event(p_type text, p_resend_id text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  m public.outreach_messages;
begin
  select * into m from public.outreach_messages where resend_id = p_resend_id and p_resend_id is not null;
  if not found then return jsonb_build_object('matched', false); end if;

  if p_type = 'email.bounced' then
    update public.outreach_messages set status = 'bounced', updated_at = now() where id = m.id and status = 'sent';
    update public.outreach_leads set email_status = 'bounced', updated_at = now() where id = m.lead_id;
    insert into public.outreach_suppressions (email, reason) values (lower(m.to_email), 'bounced')
    on conflict (email) do nothing;
    -- The address is blocked for good; sending carries on (an admin switches it off).
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

revoke execute on function public.outreach_webhook_event(text, text) from public, anon, authenticated;
grant execute on function public.outreach_webhook_event(text, text) to service_role;

update public.outreach_settings set paused = false, pause_reason = null, updated_at = now()
 where id = 1 and paused and pause_reason = 'bounces';
