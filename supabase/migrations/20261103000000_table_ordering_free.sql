-- =====================================================================
-- Table ordering is free on every plan (it was Pro only).
--
-- Same rule as before minus the plan check: ordering is open when the shop
-- switched it on, the card is approved and the merchant account is active.
--
-- Safe to run more than once.
-- =====================================================================

create or replace function public.ordering_open(p_campaign uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaigns c
      join public.merchants m on m.id = c.merchant_id
      join public.ordering_settings s on s.campaign_id = c.id
     where c.id = p_campaign
       and s.enabled
       and c.approval_status = 'approved'
       and coalesce(m.status, 'active') = 'active'
  );
$$;
revoke execute on function public.ordering_open(uuid) from public, anon, authenticated;
