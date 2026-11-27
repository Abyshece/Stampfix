-- =====================================================================
-- Outreach: the Queued list shows the real sending order.
--
-- Emails always went out oldest first (among shops inside their sending
-- hours right now), but the Queued list showed the newest shops on top, so
-- new shops looked as if they were next. Now the Queued list is in sending
-- order, oldest first, and each row says when it was queued and whether its
-- shop is inside its sending hours right now.
--
-- Only re-creates admin_outreach_leads(); every other list is unchanged.
-- Safe to run more than once.
-- =====================================================================

create or replace function public.admin_outreach_leads(p_view text default 'all', p_search text default null, p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s       public.outreach_settings;
  v_q     text := nullif(btrim(coalesce(p_search, '')), '');
  v_queue boolean := coalesce(p_view, 'all') = 'email_queued';
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  select * into s from public.outreach_settings where id = 1;
  return coalesce((
    select jsonb_agg(
             case when v_queue
                  then public.outreach_lead_json(x.lead, s) || jsonb_build_object('queued_at', x.queued_at, 'in_hours', x.in_hours)
                  else public.outreach_lead_json(x.lead, s) end
             order by x.sort_key)
      from (select l as lead, q.queued_at,
                   (not s.weekdays_only or extract(isodow from z.t) <= 5)
                     and extract(hour from z.t) >= s.window_start and extract(hour from z.t) < s.window_end as in_hours,
                   -- The Queued list: oldest queued first (the sending order). Every other list: newest shop first.
                   case when v_queue then extract(epoch from coalesce(q.queued_at, l.created_at))
                        else -extract(epoch from l.created_at) end as sort_key
              from public.outreach_leads l
              left join lateral (select min(m.created_at) as queued_at from public.outreach_messages m
                                  where v_queue and m.lead_id = l.id and m.status in ('queued','sending')) q on true
             cross join lateral (select now() at time zone coalesce(public.outreach_valid_tz(l.timezone), 'UTC') as t) z
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
             order by sort_key
             limit greatest(1, least(coalesce(p_limit, 300), 1000))) x), '[]'::jsonb);
end $$;
