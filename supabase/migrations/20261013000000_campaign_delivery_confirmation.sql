-- =====================================================================
-- Campaigns: delivery confirmation per customer + "who can be reached".
--
-- 1. marketing_campaign_deliveries gets the real outcome of each send:
--      pushed_at     Apple accepted the push for one of the customer's
--                    devices (push-apple-update).
--      delivered_at  the customer's iPhone downloaded the card carrying the
--                    campaign message (apple-wallet-webservice). That is the
--                    moment Wallet shows the lock-screen notification.
--      failed_reason Apple refused every device, or the card is no longer
--                    in Apple Wallet.
--    The edge functions report these through marketing_delivery_event().
--
-- 2. marketing_reach_breakdown(): how many customers can receive campaigns
--    at all, and why the others can't (no marketing consent / card not in
--    Apple Wallet), so the estimated reach is explained in the dashboard.
--
-- 3. marketing_campaign_recipients(): who a campaign went to, with status;
--    marketing_delivery_summary(): the counts for every campaign in the list.
--
-- Sending is unchanged. Safe to run more than once.
-- =====================================================================

alter table public.marketing_campaign_deliveries add column if not exists pushed_at     timestamptz;
alter table public.marketing_campaign_deliveries add column if not exists delivered_at  timestamptz;
alter table public.marketing_campaign_deliveries add column if not exists failed_reason text;

-- ---- Outcome events from the Apple Wallet edge functions -----------------
-- p_event:
--   'pushed'      APNs accepted the push for at least one device
--   'push_failed' APNs refused every device / no device registered (p_detail = reason)
--   'downloaded'  the device downloaded the pass; p_pass_version is the
--                 card's passkit_last_updated the download was built from
-- Only deliveries from the last 31 days (the longest campaign) are touched.
create or replace function public.marketing_delivery_event(p_card_id uuid, p_event text,
                                                           p_detail text default null,
                                                           p_pass_version timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_card_id is null then
    return;
  end if;

  if p_event = 'pushed' then
    update public.marketing_campaign_deliveries
       set pushed_at = coalesce(pushed_at, now()), failed_reason = null
     where card_id = p_card_id
       and delivered_at is null
       and sent_at > now() - interval '31 days';

  elsif p_event = 'push_failed' then
    update public.marketing_campaign_deliveries
       set failed_reason = left(coalesce(nullif(btrim(p_detail), ''), 'push_failed'), 120)
     where card_id = p_card_id
       and pushed_at is null and delivered_at is null
       and sent_at > now() - interval '31 days';

  elsif p_event = 'downloaded' then
    -- Delivered only if the downloaded pass carries THIS campaign's message:
    -- sent before the pass version, the card still shows that text, and the
    -- text hasn't expired (generate-apple-pass drops it after
    -- wallet_message_until, or 24 h after sending when there is none).
    update public.marketing_campaign_deliveries d
       set delivered_at = now(), pushed_at = coalesce(d.pushed_at, now()), failed_reason = null
      from public.marketing_campaigns mc, public.cards c
     where d.card_id = p_card_id
       and d.delivered_at is null
       and d.sent_at > now() - interval '31 days'
       and d.sent_at <= coalesce(p_pass_version, now())
       and mc.id = d.marketing_campaign_id
       and c.id = d.card_id
       and c.wallet_message = btrim(mc.message)
       and coalesce(c.wallet_message_until, c.wallet_message_at + interval '24 hours') > now();
  end if;
end $$;

-- ---- Who can be reached --------------------------------------------------
-- Every customer at the chosen locations, split into: can receive campaigns,
-- didn't agree to marketing, agreed but has no card in Apple Wallet, and
-- cards that are blocked or being deleted. The four add up to `total`.
create or replace function public.marketing_reach_breakdown(p_campaign_id uuid, p_location_ids uuid[])
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v json;
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.merchant_id = auth.uid()) then
    raise exception 'Not authorised';
  end if;
  with x as (
    select c.status = 'ACTIVE' and c.deletion_requested_at is null as active,
           coalesce(c.marketing_opt_in, false) as consent,
           exists (select 1 from public.apple_wallet_registrations r where r.serial_number = c.id::text) as apple
      from public.cards c
     where c.campaign_id = p_campaign_id
       and (p_location_ids is null or cardinality(p_location_ids) = 0
            or c.joined_at_location_id = any (p_location_ids)
            or exists (select 1 from public.activities a where a.card_id = c.id and a.location_id = any (p_location_ids)))
  )
  select json_build_object(
           'total',      count(*),
           'eligible',   count(*) filter (where active and consent and apple),
           'no_consent', count(*) filter (where active and not consent),
           'no_wallet',  count(*) filter (where active and consent and not apple),
           'inactive',   count(*) filter (where not active))
    into v from x;
  return v;
end $$;

-- ---- Recipients of one campaign ------------------------------------------
create or replace function public.marketing_campaign_recipients(p_id uuid)
returns table (card_id uuid, customer_name text, customer_code text, sent_at timestamptz,
               pushed_at timestamptz, delivered_at timestamptz, failed_reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.marketing_campaigns mc
                   join public.campaigns c on c.id = mc.campaign_id
                  where mc.id = p_id and c.merchant_id = auth.uid()) then
    raise exception 'Not authorised';
  end if;
  return query
    select d.card_id, c.customer_name, c.customer_code, d.sent_at, d.pushed_at, d.delivered_at, d.failed_reason
      from public.marketing_campaign_deliveries d
      join public.cards c on c.id = d.card_id
     where d.marketing_campaign_id = p_id
     order by d.sent_at desc, c.customer_name
     limit 5000;
end $$;

-- Delivered / failed / still waiting, per campaign of one loyalty program.
create or replace function public.marketing_delivery_summary(p_campaign_id uuid)
returns table (marketing_campaign_id uuid, sent integer, delivered integer, failed integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.merchant_id = auth.uid()) then
    raise exception 'Not authorised';
  end if;
  return query
    select d.marketing_campaign_id,
           count(*)::integer,
           count(d.delivered_at)::integer,
           (count(*) filter (where d.delivered_at is null and d.pushed_at is null and d.failed_reason is not null))::integer
      from public.marketing_campaign_deliveries d
      join public.marketing_campaigns mc on mc.id = d.marketing_campaign_id
     where mc.campaign_id = p_campaign_id
     group by d.marketing_campaign_id;
end $$;

revoke execute on function public.marketing_delivery_event(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.marketing_reach_breakdown(uuid, uuid[]) from public, anon;
revoke execute on function public.marketing_campaign_recipients(uuid) from public, anon;
revoke execute on function public.marketing_delivery_summary(uuid) from public, anon;
grant execute on function public.marketing_reach_breakdown(uuid, uuid[]) to authenticated;
grant execute on function public.marketing_campaign_recipients(uuid) to authenticated;
grant execute on function public.marketing_delivery_summary(uuid) to authenticated;

-- ---- Backfill campaigns sent before this, from the Wallet round-trip log --
do $$
begin
  if to_regclass('public.wallet_debug_log') is null then
    return;
  end if;

  update public.marketing_campaign_deliveries d
     set pushed_at = (select min(l.created_at) from public.wallet_debug_log l
                       where l.source = 'push'
                         and l.detail->>'cardId' = d.card_id::text
                         and coalesce((l.detail->>'pushed')::int, 0) > 0
                         and l.created_at >= d.sent_at
                         and l.created_at <  d.sent_at + interval '1 day')
   where d.pushed_at is null;

  update public.marketing_campaign_deliveries d
     set delivered_at = (select min(l.created_at) from public.wallet_debug_log l
                          where l.source = 'webservice' and l.method = 'GET' and l.status = 200
                            and l.path like '%/passes/%/' || d.card_id::text
                            and l.created_at >= d.sent_at
                            and l.created_at <  d.sent_at + interval '1 day')
   where d.delivered_at is null;

  -- A download confirms the push too.
  update public.marketing_campaign_deliveries
     set pushed_at = delivered_at
   where pushed_at is null and delivered_at is not null;
end $$;
