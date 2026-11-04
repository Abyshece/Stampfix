-- =====================================================================
-- Add-on: Coupons (free on every plan).
--
-- A shop creates coupon codes (% off or an amount off, with an optional
-- minimum order, start/end date and usage limit). Guests use them on the
-- digital menu: they enter the code at checkout or tap a coupon the shop
-- shows on the menu. There is no online payment, so the coupon is applied
-- to the ORDER: the server works out the discount, the order shows the code,
-- the discount and the lower total, and staff charge that at the counter.
--
-- Guests never touch the coupons table; they go through check_coupon()
-- (preview) and place_order() (final check, on server prices).
--
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.coupons (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  code         text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  -- Shown to guests next to the code, e.g. "Welcome offer".
  title        text check (title is null or length(title) <= 60),
  kind         text not null check (kind in ('percent', 'amount')),
  value        numeric(10, 2) not null check (value > 0 and value <= 100000 and (kind <> 'percent' or value <= 100)),
  min_order    numeric(10, 2) check (min_order is null or (min_order >= 0 and min_order <= 100000)),
  -- Valid from / until these days (inclusive), in the shop's time zone.
  starts_on    date,
  ends_on      date,
  max_uses     integer check (max_uses is null or max_uses between 1 and 1000000),
  active       boolean not null default true,
  show_on_menu boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (starts_on is null or ends_on is null or ends_on >= starts_on)
);
create unique index if not exists coupons_campaign_code_key on public.coupons (campaign_id, code);

alter table public.coupons enable row level security;
drop policy if exists "coupons owner" on public.coupons;
create policy "coupons owner" on public.coupons for all
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid()));
revoke all on public.coupons from anon;

-- Orders remember the coupon and the discount. total = subtotal - discount.
alter table public.orders add column if not exists subtotal numeric(10, 2);
alter table public.orders add column if not exists discount numeric(10, 2) not null default 0;
alter table public.orders add column if not exists coupon_id uuid references public.coupons(id) on delete set null;
alter table public.orders add column if not exists coupon_code text;

-- ---- The coupon rule, in one place ---------------------------------------------
-- Is this code usable at this shop, today, for this subtotal? Returns the
-- coupon and the discount, or a reason: not_found | not_started | expired |
-- used_up | min_order. A paused coupon reads as not_found to guests.
create or replace function public.coupon_quote(p_campaign uuid, p_code text, p_subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  k      public.coupons;
  v_tz   text;
  v_day  date;
  v_used integer;
  v_disc numeric(10, 2);
begin
  select * into k from public.coupons c
   where c.campaign_id = p_campaign and c.code = upper(btrim(coalesce(p_code, ''))) and c.active;
  if not found then
    return jsonb_build_object('reason', 'not_found');
  end if;

  select case m.country when 'CA' then 'America/Toronto' else 'Europe/Berlin' end into v_tz
    from public.campaigns c join public.merchants m on m.id = c.merchant_id where c.id = p_campaign;
  v_day := (now() at time zone coalesce(v_tz, 'Europe/Berlin'))::date;

  if k.starts_on is not null and v_day < k.starts_on then
    return jsonb_build_object('reason', 'not_started', 'starts_on', k.starts_on);
  end if;
  if k.ends_on is not null and v_day > k.ends_on then
    return jsonb_build_object('reason', 'expired');
  end if;
  if k.max_uses is not null then
    select count(*) into v_used from public.orders o where o.coupon_id = k.id and o.status <> 'rejected';
    if v_used >= k.max_uses then
      return jsonb_build_object('reason', 'used_up');
    end if;
  end if;
  if k.min_order is not null and coalesce(p_subtotal, 0) < k.min_order then
    return jsonb_build_object('reason', 'min_order', 'min_order', k.min_order, 'code', k.code,
                              'title', k.title, 'kind', k.kind, 'value', k.value);
  end if;

  v_disc := case k.kind
              when 'percent' then round(coalesce(p_subtotal, 0) * k.value / 100, 2)
              else least(k.value, coalesce(p_subtotal, 0))
            end;
  return jsonb_build_object('coupon_id', k.id, 'code', k.code, 'title', k.title, 'kind', k.kind,
                            'value', k.value, 'min_order', k.min_order, 'discount', v_disc);
end $$;
revoke execute on function public.coupon_quote(uuid, text, numeric) from public, anon, authenticated;

-- ---- Guest: preview a code at checkout -----------------------------------------------
-- The final check happens again in place_order() on server prices.
create or replace function public.check_coupon(p_campaign uuid, p_code text, p_subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q jsonb;
begin
  if not public.ordering_open(p_campaign) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  q := public.coupon_quote(p_campaign, p_code, p_subtotal);
  return (q - 'coupon_id') || jsonb_build_object('ok', q->>'reason' is null);
end $$;

-- ---- Guest: send an order (now with an optional coupon) ------------------------------
-- Same as before plus p_coupon. The old 6-argument version is replaced so the
-- API has exactly one place_order.
drop function if exists public.place_order(uuid, text, uuid, text, text, jsonb);
create or replace function public.place_order(p_campaign uuid, p_table text, p_location uuid,
                                              p_name text, p_note text, p_items jsonb,
                                              p_coupon text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_order    uuid;
  v_number   integer;
  v_subtotal numeric(10, 2) := 0;
  v_discount numeric(10, 2) := 0;
  v_coupon   uuid;
  v_code     text;
  v_token    uuid;
  v_tz       text;
  v_ids      uuid[];
  v_qtys     integer[];
  v_found    integer;
  v_table    text := nullif(left(btrim(coalesce(p_table, '')), 40), '');
  v_quote    jsonb;
begin
  if not public.ordering_open(p_campaign) then
    raise exception 'ordering_closed';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;

  -- One order at a time per shop, so order numbers (and coupon limits) hold.
  perform pg_advisory_xact_lock(hashtext('place_order:' || p_campaign::text));

  -- Simple flood protection: a table can send 3 orders a minute, a shop 40.
  if (select count(*) from public.orders o where o.campaign_id = p_campaign and o.created_at > now() - interval '1 minute') >= 40
     or (v_table is not null and (select count(*) from public.orders o
           where o.campaign_id = p_campaign and o.table_label = v_table and o.created_at > now() - interval '1 minute') >= 3) then
    raise exception 'too_many_orders';
  end if;

  -- Merge the guest's lines per item; check quantities and that every item
  -- is on this shop's menu and available.
  begin
    select array_agg(x.item_id order by x.item_id), array_agg(x.qty order by x.item_id)
      into v_ids, v_qtys
      from (select (e->>'id')::uuid as item_id, sum((e->>'qty')::integer)::integer as qty
              from jsonb_array_elements(p_items) e
             group by 1) x;
  exception when others then
    raise exception 'invalid_items';
  end;
  if coalesce(cardinality(v_ids), 0) = 0 or cardinality(v_ids) > 30
     or exists (select 1 from unnest(v_qtys) q where q is null or q < 1 or q > 20)
     or exists (select 1 from unnest(v_ids) i where i is null) then
    raise exception 'invalid_items';
  end if;
  select count(*) into v_found
    from unnest(v_ids) as l(item_id)
    join public.menu_items i on i.id = l.item_id and i.campaign_id = p_campaign and i.available;
  if v_found <> cardinality(v_ids) then
    raise exception 'item_unavailable';
  end if;

  if p_location is not null and not exists (select 1 from public.locations lo
                                             where lo.id = p_location and lo.campaign_id = p_campaign and not lo.archived) then
    p_location := null;
  end if;

  select case m.country when 'CA' then 'America/Toronto' else 'Europe/Berlin' end into v_tz
    from public.campaigns c join public.merchants m on m.id = c.merchant_id where c.id = p_campaign;
  select coalesce(max(o.order_number), 0) + 1 into v_number
    from public.orders o
   where o.campaign_id = p_campaign
     and (o.created_at at time zone v_tz)::date = (now() at time zone v_tz)::date;

  select coalesce(sum(i.price * l.qty), 0) into v_subtotal
    from unnest(v_ids, v_qtys) as l(item_id, qty) join public.menu_items i on i.id = l.item_id;

  -- Coupon: checked again here, on the server's prices.
  if nullif(btrim(coalesce(p_coupon, '')), '') is not null then
    v_quote := public.coupon_quote(p_campaign, p_coupon, v_subtotal);
    if v_quote->>'reason' is not null then
      raise exception 'coupon_%', v_quote->>'reason';
    end if;
    v_coupon := (v_quote->>'coupon_id')::uuid;
    v_code := v_quote->>'code';
    v_discount := least((v_quote->>'discount')::numeric, v_subtotal);
  end if;

  insert into public.orders (campaign_id, location_id, table_label, customer_name, note,
                             subtotal, discount, coupon_id, coupon_code, total, order_number)
  values (p_campaign, p_location, v_table,
          nullif(left(btrim(coalesce(p_name, '')), 60), ''),
          nullif(left(btrim(coalesce(p_note, '')), 300), ''),
          v_subtotal, v_discount, v_coupon, v_code, v_subtotal - v_discount, v_number)
  returning id, public_token into v_order, v_token;

  insert into public.order_items (order_id, menu_item_id, name, price, quantity)
  select v_order, i.id, i.name, i.price, l.qty
    from unnest(v_ids, v_qtys) as l(item_id, qty) join public.menu_items i on i.id = l.item_id
   order by i.position, i.name;

  return jsonb_build_object('token', v_token, 'number', v_number, 'total', v_subtotal - v_discount,
                            'discount', v_discount, 'coupon_code', v_code);
end $$;

-- ---- Guest: the menu, now with the shop's coupons ---------------------------------------
-- coupons_on: the shop has at least one active coupon (shows the code field).
-- coupons:    the ones the shop chose to show on the menu and that work today.
create or replace function public.public_menu(p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v    jsonb;
  v_tz text;
  v_day date;
begin
  select case m.country when 'CA' then 'America/Toronto' else 'Europe/Berlin' end into v_tz
    from public.campaigns c join public.merchants m on m.id = c.merchant_id where c.id = p_campaign;
  v_day := (now() at time zone coalesce(v_tz, 'Europe/Berlin'))::date;

  select jsonb_build_object(
           'business_name', c.business_name,
           'logo_image', c.logo_image,
           'primary_color', c.primary_color,
           'country', m.country,
           'open', public.ordering_open(c.id),
           'note', s.note,
           'categories', coalesce((
             select jsonb_agg(jsonb_build_object('id', mc.id, 'name', mc.name) order by mc.position, mc.created_at)
               from public.menu_categories mc where mc.campaign_id = c.id), '[]'::jsonb),
           'items', coalesce((
             select jsonb_agg(jsonb_build_object('id', i.id, 'category_id', i.category_id, 'name', i.name,
                                                 'description', i.description, 'price', i.price)
                              order by i.position, i.created_at)
               from public.menu_items i where i.campaign_id = c.id and i.available), '[]'::jsonb),
           'coupons_on', exists (select 1 from public.coupons k where k.campaign_id = c.id and k.active),
           'coupons', coalesce((
             select jsonb_agg(jsonb_build_object('code', k.code, 'title', k.title, 'kind', k.kind, 'value', k.value,
                                                 'min_order', k.min_order, 'ends_on', k.ends_on)
                              order by k.created_at)
               from public.coupons k
              where k.campaign_id = c.id and k.active and k.show_on_menu
                and (k.starts_on is null or v_day >= k.starts_on)
                and (k.ends_on is null or v_day <= k.ends_on)
                and (k.max_uses is null or (select count(*) from public.orders o
                                             where o.coupon_id = k.id and o.status <> 'rejected') < k.max_uses)), '[]'::jsonb))
    into v
    from public.campaigns c
    join public.merchants m on m.id = c.merchant_id
    left join public.ordering_settings s on s.campaign_id = c.id
   where c.id = p_campaign;
  return v;  -- null when the shop doesn't exist
end $$;

-- ---- Guest: follow an order (now with the discount) ------------------------------------
create or replace function public.order_status(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'number', o.order_number,
           'status', o.status,
           'reject_reason', o.reject_reason,
           'table', o.table_label,
           'total', o.total,
           'subtotal', coalesce(o.subtotal, o.total + o.discount),
           'discount', o.discount,
           'coupon_code', o.coupon_code,
           'created_at', o.created_at,
           'business_name', c.business_name,
           'country', m.country,
           'items', coalesce((select jsonb_agg(jsonb_build_object('name', oi.name, 'quantity', oi.quantity, 'price', oi.price))
                                from public.order_items oi where oi.order_id = o.id), '[]'::jsonb))
    from public.orders o
    join public.campaigns c on c.id = o.campaign_id
    join public.merchants m on m.id = c.merchant_id
   where o.public_token = p_token;
$$;

-- ---- Shop: how often each coupon was used --------------------------------------------
-- Rejected orders don't count.
create or replace function public.coupon_usage(p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'Not authorised';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('coupon_id', x.coupon_id, 'uses', x.uses, 'discount_total', x.discount_total))
      from (select o.coupon_id, count(*) as uses, sum(o.discount) as discount_total
              from public.orders o
             where o.campaign_id = p_campaign and o.coupon_id is not null and o.status <> 'rejected'
             group by o.coupon_id) x), '[]'::jsonb);
end $$;

revoke execute on function public.check_coupon(uuid, text, numeric) from public;
revoke execute on function public.place_order(uuid, text, uuid, text, text, jsonb, text) from public;
revoke execute on function public.coupon_usage(uuid) from public, anon;
grant execute on function public.check_coupon(uuid, text, numeric) to anon, authenticated;
grant execute on function public.place_order(uuid, text, uuid, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.coupon_usage(uuid) to authenticated;
-- public_menu / order_status keep their existing grants (same signatures).
