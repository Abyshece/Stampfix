-- =====================================================================
-- Free plan: 5 customer cards per shop (was 10).
--
-- Same trigger as before with the new number. It only stops NEW cards once
-- a free shop has 5; cards that already exist keep working, and Pro shops
-- have no limit. Keep FREE_TIER_CARD_LIMIT in src/types/index.ts in step.
--
-- Safe to run more than once.
-- =====================================================================

create or replace function public.enforce_card_limit()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  merchant_plan text;
  current_count integer;
  free_limit    constant integer := 5;
begin
  select m.plan into merchant_plan
    from public.merchants m
    join public.campaigns c on c.merchant_id = m.id
   where c.id = new.campaign_id;

  -- Pro plan: no limit.
  if merchant_plan = 'pro' then
    return new;
  end if;

  -- Free plan (or null/default): check the campaign-wide count.
  select count(*) into current_count
    from public.cards
   where campaign_id = new.campaign_id;

  if current_count >= free_limit then
    raise exception 'free_tier_limit_reached'
      using errcode = 'P0001',
            hint    = 'This loyalty program is at the free-tier limit of 5 customers. Ask the merchant to upgrade.';
  end if;

  return new;
end $function$;
