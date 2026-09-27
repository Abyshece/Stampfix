-- =====================================================================
-- Marketing campaigns: manual (send now / scheduled) and automations.
--
-- Replaces the one-shot "Offers" broadcast. Delivery is unchanged: a
-- campaign writes its message onto each card's wallet_message, the
-- existing trg_wallet_on_message trigger pushes the Apple Wallet pass, and
-- the pass shows it as a lock-screen notification (changeMessage).
--
-- Audience rule (same as the old broadcast): ACTIVE cards, not pending
-- deletion, marketing consent, and the card installed in Apple Wallet.
--
-- public.run_marketing_campaigns() runs every 5 minutes via pg_cron: it
-- sends scheduled manual campaigns when due and runs active automations.
-- Every customer gets a given campaign at most once (deliveries table).
--
-- Safe to run more than once.
-- =====================================================================

-- How long a delivered message stays on the pass (generate-apple-pass).
-- NULL keeps the old behaviour: 24 hours after wallet_message_at.
alter table public.cards add column if not exists wallet_message_until timestamptz;

create table if not exists public.marketing_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.campaigns(id) on delete cascade,
  kind                text not null check (kind in ('manual', 'automation')),
  name                text not null check (length(btrim(name)) between 1 and 80),
  message             text not null check (length(btrim(message)) between 1 and 100),
  location_ids        uuid[],                -- NULL / empty = all locations
  segment             text check (segment in ('all', 'new', 'active', 'inactive_30', 'inactive_60', 'close', 'reward_ready', 'loyal')),
  trigger_type        text check (trigger_type in ('inactive', 'stamps_reached', 'stamps_away', 'reward_ready', 'rewards_redeemed', 'joined_days')),
  trigger_value       integer check (trigger_value between 0 and 365),
  timezone            text not null default 'Europe/Berlin',
  starts_at           timestamptz not null default now(),
  ends_at             timestamptz,
  status              text not null default 'scheduled'
                      check (status in ('scheduled', 'sent', 'active', 'paused', 'ended', 'cancelled')),
  sent_count          integer not null default 0,
  last_run_at         timestamptz,
  legacy_broadcast_id uuid unique,           -- set for rows migrated from public.broadcasts
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint marketing_campaigns_kind_fields check (
    (kind = 'manual' and segment is not null) or (kind = 'automation' and trigger_type is not null)
  ),
  constraint marketing_campaigns_window check (
    ends_at is null or (ends_at > starts_at and ends_at <= starts_at + interval '31 days')
  )
);

create index if not exists marketing_campaigns_campaign_idx on public.marketing_campaigns (campaign_id, created_at desc);
create index if not exists marketing_campaigns_due_idx on public.marketing_campaigns (starts_at) where status in ('scheduled', 'active');

create table if not exists public.marketing_campaign_deliveries (
  marketing_campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  card_id               uuid not null references public.cards(id) on delete cascade,
  sent_at               timestamptz not null default now(),
  primary key (marketing_campaign_id, card_id)
);
create index if not exists marketing_campaign_deliveries_card_idx on public.marketing_campaign_deliveries (card_id);

-- ---- Row level security ------------------------------------------------
-- Merchants manage their own campaigns directly; deliveries are written only
-- by the SECURITY DEFINER functions below and are read-only to merchants.
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_deliveries enable row level security;

drop policy if exists "marketing_campaigns merchant access" on public.marketing_campaigns;
create policy "marketing_campaigns merchant access" on public.marketing_campaigns
  for all
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid()));

drop policy if exists "marketing deliveries merchant read" on public.marketing_campaign_deliveries;
create policy "marketing deliveries merchant read" on public.marketing_campaign_deliveries
  for select
  using (exists (
    select 1 from public.marketing_campaigns mc join public.campaigns c on c.id = mc.campaign_id
    where mc.id = marketing_campaign_id and c.merchant_id = auth.uid()
  ));

create or replace function public.marketing_campaigns_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists marketing_campaigns_touch on public.marketing_campaigns;
create trigger marketing_campaigns_touch before update on public.marketing_campaigns
  for each row execute function public.marketing_campaigns_touch();

-- ---- Audience ------------------------------------------------------------
-- Every card a campaign may message, with the facts segments/triggers use.
-- last_visit = latest stamp or redemption, or the join date if none yet.
create or replace function public.marketing_card_pool(p_campaign_id uuid, p_location_ids uuid[])
returns table (card_id uuid, current_stamps integer, max_stamps integer, rewards_redeemed integer,
               joined_at timestamptz, last_visit timestamptz, last_message_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id,
         c.current_stamps,
         coalesce(c.max_stamps_snapshot, camp.max_stamps, 6),
         c.rewards_redeemed,
         c.joined_at,
         greatest(c.joined_at, (select max(a.created_at) from public.activities a
                                 where a.card_id = c.id and a.type in ('STAMP', 'REDEEM'))),
         c.wallet_message_at
  from public.cards c
  join public.campaigns camp on camp.id = c.campaign_id
  where c.campaign_id = p_campaign_id
    and c.status = 'ACTIVE'
    and c.deletion_requested_at is null
    and coalesce(c.marketing_opt_in, false)
    and exists (select 1 from public.apple_wallet_registrations r where r.serial_number = c.id::text)
    and (p_location_ids is null or cardinality(p_location_ids) = 0
         or c.joined_at_location_id = any (p_location_ids)
         or exists (select 1 from public.activities a where a.card_id = c.id and a.location_id = any (p_location_ids)));
$$;

-- Manual campaigns: cards in a customer segment.
create or replace function public.marketing_segment_cards(p_campaign_id uuid, p_segment text, p_location_ids uuid[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.card_id from public.marketing_card_pool(p_campaign_id, p_location_ids) p
  where case coalesce(p_segment, 'all')
    when 'all'          then true
    when 'new'          then p.joined_at >= now() - interval '30 days'
    when 'active'       then p.last_visit >= now() - interval '30 days'
    when 'inactive_30'  then p.last_visit <  now() - interval '30 days'
    when 'inactive_60'  then p.last_visit <  now() - interval '60 days'
    when 'close'        then p.max_stamps - p.current_stamps = 1
    when 'reward_ready' then p.current_stamps >= p.max_stamps
    when 'loyal'        then p.rewards_redeemed >= 1
    else false
  end;
$$;

-- Automations: cards that currently meet a trigger. p_since is when the
-- automation started; 'joined_days' only fires for anniversaries after it,
-- so switching it on never messages every long-standing customer at once.
create or replace function public.marketing_trigger_cards(p_campaign_id uuid, p_trigger text, p_value integer,
                                                          p_location_ids uuid[], p_since timestamptz)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.card_id from public.marketing_card_pool(p_campaign_id, p_location_ids) p
  where case p_trigger
    when 'inactive'         then p.last_visit < now() - make_interval(days => coalesce(p_value, 30))
    when 'stamps_reached'   then p.current_stamps >= coalesce(p_value, 1)
    when 'stamps_away'      then p.max_stamps - p.current_stamps = greatest(coalesce(p_value, 1), 1)
    when 'reward_ready'     then p.current_stamps >= p.max_stamps
    when 'rewards_redeemed' then p.rewards_redeemed >= coalesce(p_value, 1)
    when 'joined_days'      then p.joined_at + make_interval(days => coalesce(p_value, 7)) <= now()
                             and p.joined_at + make_interval(days => coalesce(p_value, 7)) >= p_since
    else false
  end;
$$;

-- Estimated reach shown while building a campaign. For automations it is
-- how many customers match right now (i.e. would get it at launch); for
-- 'joined_days' it is the customers still inside that first-days window.
create or replace function public.marketing_estimate(p_campaign_id uuid, p_kind text, p_segment text,
                                                     p_trigger text, p_value integer, p_location_ids uuid[])
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.merchant_id = auth.uid()) then
    raise exception 'Not authorised';
  end if;
  if p_kind = 'automation' then
    if p_trigger = 'joined_days' then
      return (select count(*) from public.marketing_card_pool(p_campaign_id, p_location_ids) p
              where p.joined_at > now() - make_interval(days => coalesce(p_value, 7)));
    end if;
    return (select count(*) from public.marketing_trigger_cards(p_campaign_id, p_trigger, p_value, p_location_ids, now()));
  end if;
  return (select count(*) from public.marketing_segment_cards(p_campaign_id, p_segment, p_location_ids));
end $$;

-- ---- Delivery ------------------------------------------------------------
-- Records the delivery (once per card per campaign) and writes the message
-- onto the card, which fires trg_wallet_on_message -> Apple Wallet push.
-- Manual campaigns keep the offer on the pass until their end date;
-- automation messages stay for 7 days.
create or replace function public.marketing_deliver(p_marketing_campaign_id uuid, p_card_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_mc public.marketing_campaigns%rowtype;
  v_n  integer := 0;
begin
  select * into v_mc from public.marketing_campaigns where id = p_marketing_campaign_id;
  if not found or coalesce(cardinality(p_card_ids), 0) = 0 then
    return 0;
  end if;

  with fresh as (
    insert into public.marketing_campaign_deliveries (marketing_campaign_id, card_id)
    select p_marketing_campaign_id, x from unnest(p_card_ids) as x
    on conflict do nothing
    returning card_id
  )
  update public.cards c
     set wallet_message       = btrim(v_mc.message),
         wallet_message_at    = now(),
         wallet_message_until = case when v_mc.kind = 'manual'
                                     then coalesce(v_mc.ends_at, now() + interval '24 hours')
                                     else now() + interval '7 days' end
    from fresh
   where c.id = fresh.card_id;
  get diagnostics v_n = row_count;

  update public.marketing_campaigns
     set sent_count = sent_count + v_n, last_run_at = now()
   where id = p_marketing_campaign_id;
  return v_n;
end $$;

-- Sends every due campaign (or just p_only). Called by pg_cron every 5
-- minutes and by launch_marketing_campaign() for "Send now".
create or replace function public.run_marketing_campaigns(p_only uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r       record;
  v_ids   uuid[];
  v_total integer := 0;
begin
  -- Close campaigns whose window is over (a scheduled manual campaign that
  -- never went out before its end date is closed, not sent late).
  update public.marketing_campaigns
     set status = 'ended'
   where status in ('scheduled', 'active')
     and ends_at is not null and ends_at <= now()
     and (p_only is null or id = p_only);

  for r in
    select * from public.marketing_campaigns
     where status in ('scheduled', 'active')
       and starts_at <= now()
       and (ends_at is null or ends_at > now())
       and (p_only is null or id = p_only)
     order by starts_at
     for update skip locked
  loop
    if r.kind = 'manual' then
      select coalesce(array_agg(s.card_id), '{}') into v_ids
        from public.marketing_segment_cards(r.campaign_id, r.segment, r.location_ids) as s(card_id);
      v_total := v_total + public.marketing_deliver(r.id, v_ids);
      update public.marketing_campaigns set status = 'sent' where id = r.id;
    else
      -- New matches only; skip anyone messaged in the last 24 h (they are
      -- picked up on a later run), and cap each run to keep pushes smooth.
      select coalesce(array_agg(t.card_id), '{}') into v_ids from (
        select m.card_id
          from public.marketing_trigger_cards(r.campaign_id, r.trigger_type, r.trigger_value, r.location_ids, r.starts_at) as m(card_id)
         where not exists (select 1 from public.marketing_campaign_deliveries d
                            where d.marketing_campaign_id = r.id and d.card_id = m.card_id)
           and not exists (select 1 from public.cards c
                            where c.id = m.card_id and c.wallet_message_at > now() - interval '24 hours')
         limit 500
      ) t;
      v_total := v_total + public.marketing_deliver(r.id, v_ids);
      update public.marketing_campaigns set last_run_at = now() where id = r.id;
    end if;
  end loop;
  return v_total;
end $$;

-- "Send now" / immediate first run for the merchant who owns the campaign.
create or replace function public.launch_marketing_campaign(p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.marketing_campaigns mc
                   join public.campaigns c on c.id = mc.campaign_id
                  where mc.id = p_id and c.merchant_id = auth.uid()) then
    raise exception 'Not authorised';
  end if;
  return public.run_marketing_campaigns(p_id);
end $$;

-- Internal helpers are not callable from the API; merchants get only the
-- ownership-checked entry points.
revoke execute on function public.marketing_card_pool(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.marketing_segment_cards(uuid, text, uuid[]) from public, anon, authenticated;
revoke execute on function public.marketing_trigger_cards(uuid, text, integer, uuid[], timestamptz) from public, anon, authenticated;
revoke execute on function public.marketing_deliver(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.run_marketing_campaigns(uuid) from public, anon, authenticated;
revoke execute on function public.marketing_estimate(uuid, text, text, text, integer, uuid[]) from public, anon;
revoke execute on function public.launch_marketing_campaign(uuid) from public, anon;
grant execute on function public.marketing_estimate(uuid, text, text, text, integer, uuid[]) to authenticated;
grant execute on function public.launch_marketing_campaign(uuid) to authenticated;

-- ---- Carry over the old one-shot offers so their history stays visible ---
insert into public.marketing_campaigns
  (campaign_id, kind, name, message, segment, status, sent_count, starts_at, created_by, created_at, legacy_broadcast_id)
select b.campaign_id, 'manual', 'Offer ' || to_char(b.created_at, 'DD.MM.YYYY'), left(btrim(b.message), 100), 'all',
       'sent', coalesce(b.sent_count, 0), b.created_at, b.created_by, b.created_at, b.id
  from public.broadcasts b
 where length(btrim(coalesce(b.message, ''))) > 0
on conflict (legacy_broadcast_id) do nothing;

-- ---- Schedule ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('run-marketing-campaigns', '*/5 * * * *', 'select public.run_marketing_campaigns()');
  end if;
end $$;
