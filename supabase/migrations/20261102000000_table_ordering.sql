-- =====================================================================
-- Add-on: digital menu + table ordering (included in Pro).
--
-- Guests scan a table QR, see the shop's menu and send an order; they pay at
-- the counter (no online payment). The shop sees orders in the dashboard and
-- moves them new -> accepted -> ready -> completed (or rejected).
--
-- The shop manages its menu and settings directly (RLS: owner only). Guests
-- never touch the tables: they go through public_menu(), place_order() and
-- order_status() below, which check that ordering is on, the shop is Pro and
-- approved, and work out prices on the server.
--
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.ordering_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  enabled     boolean not null default false,
  -- Table labels the shop prints QR codes for, e.g. {'1','2','Terrace 1'}.
  tables      text[] not null default '{}',
  -- Shown at the top of the menu, e.g. "Kitchen closes at 9 pm".
  note        text check (note is null or length(note) <= 200),
  updated_at  timestamptz not null default now()
);

create table if not exists public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists menu_categories_campaign_idx on public.menu_categories (campaign_id, position);

create table if not exists public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete set null,
  name        text not null check (length(btrim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 300),
  price       numeric(10, 2) not null check (price >= 0 and price <= 100000),
  available   boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists menu_items_campaign_idx on public.menu_items (campaign_id, position);

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  location_id   uuid references public.locations(id) on delete set null,
  table_label   text check (table_label is null or length(table_label) <= 40),
  customer_name text check (customer_name is null or length(customer_name) <= 60),
  note          text check (note is null or length(note) <= 300),
  status        text not null default 'new' check (status in ('new', 'accepted', 'ready', 'completed', 'rejected')),
  reject_reason text check (reject_reason is null or length(reject_reason) <= 200),
  total         numeric(10, 2) not null default 0,
  -- Short number for guests and staff; starts again at 1 every day.
  order_number  integer not null,
  -- Lets the guest's phone follow the order without an account.
  public_token  uuid not null default gen_random_uuid() unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  ready_at      timestamptz,
  completed_at  timestamptz,
  rejected_at   timestamptz
);
create index if not exists orders_campaign_created_idx on public.orders (campaign_id, created_at desc);
create index if not exists orders_open_idx on public.orders (campaign_id, created_at) where status in ('new', 'accepted', 'ready');

create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name         text not null,
  price        numeric(10, 2) not null,
  quantity     integer not null check (quantity between 1 and 50)
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---- Row level security: the shop owner only ---------------------------
alter table public.ordering_settings enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "ordering_settings owner" on public.ordering_settings;
create policy "ordering_settings owner" on public.ordering_settings for all
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid()));

drop policy if exists "menu_categories owner" on public.menu_categories;
create policy "menu_categories owner" on public.menu_categories for all
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid()));

drop policy if exists "menu_items owner" on public.menu_items;
create policy "menu_items owner" on public.menu_items for all
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid())
              and (category_id is null or exists (select 1 from public.menu_categories mc
                                                   where mc.id = category_id and mc.campaign_id = menu_items.campaign_id)));

-- Orders are read by the owner; they are created by place_order() and moved
-- on by set_order_status() only.
drop policy if exists "orders owner read" on public.orders;
create policy "orders owner read" on public.orders for select
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid()));
drop policy if exists "order_items owner read" on public.order_items;
create policy "order_items owner read" on public.order_items for select
  using (exists (select 1 from public.orders o join public.campaigns c on c.id = o.campaign_id
                  where o.id = order_id and c.merchant_id = auth.uid()));

revoke all on public.orders, public.order_items from anon;
revoke insert, update, delete on public.orders, public.order_items from authenticated;
revoke all on public.ordering_settings, public.menu_categories, public.menu_items from anon;

-- ---- Is ordering open for this shop? --------------------------------------
create or replace function public.ordering_open(p_campaign uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaigns c
      join public.merchants m on m.id = c.merchant_id
      join public.ordering_settings s on s.campaign_id = c.id
     where c.id = p_campaign
       and s.enabled
       and c.approval_status = 'approved'
       and m.plan = 'pro'
       and coalesce(m.status, 'active') = 'active'
  );
$$;
revoke execute on function public.ordering_open(uuid) from public, anon, authenticated;

-- ---- Guest: the menu --------------------------------------------------------
create or replace function public.public_menu(p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
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
               from public.menu_items i where i.campaign_id = c.id and i.available), '[]'::jsonb))
    into v
    from public.campaigns c
    join public.merchants m on m.id = c.merchant_id
    left join public.ordering_settings s on s.campaign_id = c.id
   where c.id = p_campaign;
  return v;  -- null when the shop doesn't exist
end $$;

-- ---- Guest: send an order --------------------------------------------------
-- p_items: [{"id": "<menu item id>", "qty": 2}, ...]. Prices come from the menu,
-- never from the guest. Returns {token, number, total}.
create or replace function public.place_order(p_campaign uuid, p_table text, p_location uuid,
                                              p_name text, p_note text, p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_order   uuid;
  v_number  integer;
  v_total   numeric(10, 2) := 0;
  v_token   uuid;
  v_tz      text;
  v_ids     uuid[];
  v_qtys    integer[];
  v_found   integer;
  v_table   text := nullif(left(btrim(coalesce(p_table, '')), 40), '');
begin
  if not public.ordering_open(p_campaign) then
    raise exception 'ordering_closed';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;

  -- One order at a time per shop, so order numbers never repeat.
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

  select coalesce(sum(i.price * l.qty), 0) into v_total
    from unnest(v_ids, v_qtys) as l(item_id, qty) join public.menu_items i on i.id = l.item_id;

  insert into public.orders (campaign_id, location_id, table_label, customer_name, note, total, order_number)
  values (p_campaign, p_location, v_table,
          nullif(left(btrim(coalesce(p_name, '')), 60), ''),
          nullif(left(btrim(coalesce(p_note, '')), 300), ''),
          v_total, v_number)
  returning id, public_token into v_order, v_token;

  insert into public.order_items (order_id, menu_item_id, name, price, quantity)
  select v_order, i.id, i.name, i.price, l.qty
    from unnest(v_ids, v_qtys) as l(item_id, qty) join public.menu_items i on i.id = l.item_id
   order by i.position, i.name;

  return jsonb_build_object('token', v_token, 'number', v_number, 'total', v_total);
end $$;

-- ---- Guest: follow an order ------------------------------------------------
create or replace function public.order_status(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'number', o.order_number,
           'status', o.status,
           'reject_reason', o.reject_reason,
           'table', o.table_label,
           'total', o.total,
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

-- ---- Shop: move an order on --------------------------------------------------
-- new -> accepted | rejected; accepted -> ready | rejected; ready -> completed.
create or replace function public.set_order_status(p_order uuid, p_status text, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  select o.status into v_old
    from public.orders o join public.campaigns c on c.id = o.campaign_id
   where o.id = p_order and c.merchant_id = auth.uid()
   for update of o;
  if not found then raise exception 'Not authorised'; end if;
  if not ((v_old = 'new' and p_status in ('accepted', 'rejected'))
       or (v_old = 'accepted' and p_status in ('ready', 'rejected'))
       or (v_old = 'ready' and p_status = 'completed')) then
    raise exception 'invalid_transition';
  end if;
  update public.orders
     set status        = p_status,
         updated_at    = now(),
         reject_reason = case when p_status = 'rejected' then nullif(left(btrim(coalesce(p_reason, '')), 200), '') else reject_reason end,
         accepted_at   = case when p_status = 'accepted' then now() else accepted_at end,
         ready_at      = case when p_status = 'ready' then now() else ready_at end,
         completed_at  = case when p_status = 'completed' then now() else completed_at end,
         rejected_at   = case when p_status = 'rejected' then now() else rejected_at end
   where id = p_order;
  return p_status;
end $$;

revoke execute on function public.public_menu(uuid) from public;
revoke execute on function public.place_order(uuid, text, uuid, text, text, jsonb) from public;
revoke execute on function public.order_status(uuid) from public;
revoke execute on function public.set_order_status(uuid, text, text) from public, anon;
grant execute on function public.public_menu(uuid) to anon, authenticated;
grant execute on function public.place_order(uuid, text, uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.order_status(uuid) to anon, authenticated;
grant execute on function public.set_order_status(uuid, text, text) to authenticated;
