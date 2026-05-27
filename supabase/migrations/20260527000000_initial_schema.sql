-- =====================================================================
-- STAMPIFY DATABASE SCHEMA
-- Multi-tenant loyalty program: merchants own campaigns, customers
-- enroll in campaigns and collect stamps via punch cards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- merchants
-- One row per merchant account. Linked 1:1 to auth.users via id.
-- ---------------------------------------------------------------------
create table public.merchants (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  business_name text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- campaigns
-- A merchant's loyalty program configuration (one campaign per merchant
-- for v1; schema allows many for future).
-- ---------------------------------------------------------------------
create table public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references public.merchants(id) on delete cascade,
  business_name    text not null,
  offer_title      text not null default 'Buy 6, get 1 free',
  description      text not null default '',
  max_stamps       int  not null default 6 check (max_stamps between 3 and 20),
  primary_color    text not null default '#37352F',
  background_color text not null default '#F5F5F0',
  logo_text        text not null default '',
  card_pattern     text not null default 'solid' check (card_pattern in ('solid','dots','grid')),
  custom_icon      text not null default '☕️',
  logo_image       text,  -- base64 data URL (small) or storage URL
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index campaigns_merchant_id_idx on public.campaigns(merchant_id);

-- ---------------------------------------------------------------------
-- cards
-- One per (customer, campaign). A customer (auth.users) enrolling in a
-- campaign creates a card. customer_id is nullable to allow merchants
-- to pre-create cards before the customer signs up (claim via email).
-- ---------------------------------------------------------------------
create table public.cards (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns(id) on delete cascade,
  customer_id       uuid references auth.users(id) on delete set null,
  customer_name     text not null,
  email             text not null,
  age               int,
  current_stamps    int  not null default 0 check (current_stamps >= 0),
  rewards_redeemed  int  not null default 0 check (rewards_redeemed >= 0),
  status            text not null default 'ACTIVE' check (status in ('ACTIVE','BLOCKED')),
  joined_at         timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (campaign_id, email)
);

create index cards_campaign_id_idx on public.cards(campaign_id);
create index cards_customer_id_idx on public.cards(customer_id);
create index cards_email_idx on public.cards(email);

-- ---------------------------------------------------------------------
-- activities
-- Append-only log of stamp/redeem/join events.
-- ---------------------------------------------------------------------
create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  card_id       uuid references public.cards(id) on delete set null,
  customer_name text not null,
  type          text not null check (type in ('STAMP','REDEEM','JOIN','BLOCK','UNBLOCK')),
  created_at    timestamptz not null default now()
);

create index activities_campaign_id_created_at_idx
  on public.activities(campaign_id, created_at desc);

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- Auto-update updated_at on row change
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger merchants_touch  before update on public.merchants
  for each row execute function public.touch_updated_at();
create trigger campaigns_touch  before update on public.campaigns
  for each row execute function public.touch_updated_at();
create trigger cards_touch      before update on public.cards
  for each row execute function public.touch_updated_at();

-- Auto-create merchant row when an auth user signs up with merchant metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only create a merchant row if the signup metadata says so.
  -- Customers signing in via magic link won't create a merchant row.
  if (new.raw_user_meta_data->>'role') = 'merchant' then
    insert into public.merchants (id, email, business_name)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'business_name', '')
    )
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

alter table public.merchants  enable row level security;
alter table public.campaigns  enable row level security;
alter table public.cards      enable row level security;
alter table public.activities enable row level security;

-- merchants: a merchant can read/update their own row.
create policy "merchants self read"
  on public.merchants for select
  using (auth.uid() = id);

create policy "merchants self update"
  on public.merchants for update
  using (auth.uid() = id);

-- campaigns: merchant owns; customers can read campaigns they have a card in
-- (and anyone can read by ID — campaigns are public-by-link, like a Notion page).
create policy "campaigns merchant full access"
  on public.campaigns for all
  using (auth.uid() = merchant_id)
  with check (auth.uid() = merchant_id);

create policy "campaigns public read"
  on public.campaigns for select
  to anon, authenticated
  using (true);

-- cards: merchant who owns the campaign can read/write all cards.
-- Customers can read/update only their own card.
create policy "cards merchant full access"
  on public.cards for all
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = cards.campaign_id and c.merchant_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = cards.campaign_id and c.merchant_id = auth.uid()
    )
  );

create policy "cards customer self read"
  on public.cards for select
  using (auth.uid() = customer_id);

-- Anonymous signup: a person enrolling for the first time via the public
-- signup form will be authenticated (magic link) by the time the insert
-- happens. We allow authenticated users to insert a card where they are
-- the customer.
create policy "cards customer self insert"
  on public.cards for insert
  to authenticated
  with check (auth.uid() = customer_id);

-- activities: merchant who owns the campaign can read & insert.
-- Customers can read activities tied to their own cards.
create policy "activities merchant full access"
  on public.activities for all
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = activities.campaign_id and c.merchant_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = activities.campaign_id and c.merchant_id = auth.uid()
    )
  );

create policy "activities customer self read"
  on public.activities for select
  using (
    exists (
      select 1 from public.cards cd
      where cd.id = activities.card_id and cd.customer_id = auth.uid()
    )
  );
