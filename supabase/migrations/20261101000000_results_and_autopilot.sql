-- =====================================================================
-- "Your results" + campaign Autopilot.
--
-- 1. Campaign segments for customers who haven't been back in 7 or 14
--    days (inactive_7, inactive_14), next to the 30/60-day ones.
-- 2. Campaign returns: customers who came back (a stamp or a reward)
--    within 7 days of receiving a campaign, per campaign and per customer.
-- 3. The shop's average spend per visit, used to estimate sales from
--    repeat visits. Private to the owner (public campaign reads go through
--    a fixed column grant, so it is read and saved by the functions below).
--
-- Sending is unchanged. Safe to run more than once.
-- =====================================================================

-- ---- 1. 7- and 14-day inactive segments ----------------------------------
alter table public.marketing_campaigns drop constraint if exists marketing_campaigns_segment_check;
alter table public.marketing_campaigns add constraint marketing_campaigns_segment_check
  check (segment in ('all', 'new', 'active', 'inactive_7', 'inactive_14', 'inactive_30', 'inactive_60',
                     'close', 'reward_ready', 'loyal'));

create or replace function public.marketing_segment_cards(p_campaign_id uuid, p_segment text, p_location_ids uuid[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.card_id from public.marketing_card_pool(p_campaign_id, p_location_ids) p
  where case coalesce(p_segment, 'all')
    when 'all'          then true
    when 'new'          then p.joined_at >= now() - interval '30 days'
    when 'active'       then p.last_visit >= now() - interval '30 days'
    when 'inactive_7'   then p.last_visit <  now() - interval '7 days'
    when 'inactive_14'  then p.last_visit <  now() - interval '14 days'
    when 'inactive_30'  then p.last_visit <  now() - interval '30 days'
    when 'inactive_60'  then p.last_visit <  now() - interval '60 days'
    when 'close'        then p.max_stamps - p.current_stamps = 1
    when 'reward_ready' then p.current_stamps >= p.max_stamps
    when 'loyal'        then p.rewards_redeemed >= 1
    else false
  end;
$$;
revoke execute on function public.marketing_segment_cards(uuid, text, uuid[]) from public, anon, authenticated;

-- ---- 2. Who came back after a campaign -------------------------------------
-- "Came back" = a stamp or a redeemed reward on the card within 7 days after
-- the campaign reached it.
create or replace function public.marketing_campaign_returns(p_campaign_id uuid)
returns table (marketing_campaign_id uuid, returned integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.merchant_id = auth.uid()) then
    raise exception 'Not authorised';
  end if;
  return query
    select d.marketing_campaign_id,
           (count(*) filter (where exists (
              select 1 from public.activities a
               where a.card_id = d.card_id and a.type in ('STAMP', 'REDEEM')
                 and a.created_at > d.sent_at and a.created_at <= d.sent_at + interval '7 days')))::integer
      from public.marketing_campaign_deliveries d
      join public.marketing_campaigns mc on mc.id = d.marketing_campaign_id
     where mc.campaign_id = p_campaign_id
     group by d.marketing_campaign_id;
end $$;

create or replace function public.marketing_recipient_returns(p_id uuid)
returns table (card_id uuid, returned_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.marketing_campaigns mc
                   join public.campaigns c on c.id = mc.campaign_id
                  where mc.id = p_id and c.merchant_id = auth.uid()) then
    raise exception 'Not authorised';
  end if;
  return query
    select d.card_id,
           (select min(a.created_at) from public.activities a
             where a.card_id = d.card_id and a.type in ('STAMP', 'REDEEM')
               and a.created_at > d.sent_at and a.created_at <= d.sent_at + interval '7 days')
      from public.marketing_campaign_deliveries d
     where d.marketing_campaign_id = p_id;
end $$;

-- ---- 3. Average spend per visit (owner only) --------------------------------
alter table public.campaigns add column if not exists average_spend numeric(10, 2);
alter table public.campaigns drop constraint if exists campaigns_average_spend_check;
alter table public.campaigns add constraint campaigns_average_spend_check
  check (average_spend is null or (average_spend > 0 and average_spend <= 100000));

create or replace function public.campaign_average_spend(p_campaign uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v numeric;
begin
  select c.average_spend into v from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid();
  if not found then raise exception 'Not authorised'; end if;
  return v;
end $$;

-- NULL clears it.
create or replace function public.set_campaign_average_spend(p_campaign uuid, p_amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
begin
  if p_amount is not null and (p_amount <= 0 or p_amount > 100000) then
    raise exception 'Average spend must be between 0 and 100000';
  end if;
  update public.campaigns set average_spend = round(p_amount, 2)
   where id = p_campaign and merchant_id = auth.uid();
  if not found then raise exception 'Not authorised'; end if;
  return round(p_amount, 2);
end $$;

revoke execute on function public.marketing_campaign_returns(uuid) from public, anon;
revoke execute on function public.marketing_recipient_returns(uuid) from public, anon;
revoke execute on function public.campaign_average_spend(uuid) from public, anon;
revoke execute on function public.set_campaign_average_spend(uuid, numeric) from public, anon;
grant execute on function public.marketing_campaign_returns(uuid) to authenticated;
grant execute on function public.marketing_recipient_returns(uuid) to authenticated;
grant execute on function public.campaign_average_spend(uuid) to authenticated;
grant execute on function public.set_campaign_average_spend(uuid, numeric) to authenticated;
