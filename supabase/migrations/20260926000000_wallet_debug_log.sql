-- =====================================================================
-- Apple Wallet round-trip log.
--
-- push-apple-update writes one row per push (who triggered it, the APNs
-- headers used, APNs' answer per device). apple-wallet-webservice writes one
-- row per request the iPhone makes (registration, "what changed?", pass
-- download, and the error messages iOS posts to /v1/log). Reading these
-- rows after a stamp shows exactly where an automatic update stops.
--
-- Only the service role (the edge functions) can read or write it: RLS is
-- on with no policies. Pass auth tokens are never stored; push tokens are
-- stored as their last 8 characters only.
--
-- Safe to run more than once. Drop the table once Wallet updates are solid.
-- =====================================================================

create table if not exists public.wallet_debug_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source     text not null,  -- 'push' | 'webservice'
  method     text,
  path       text,
  status     integer,
  detail     jsonb
);

create index if not exists wallet_debug_log_created_at_idx
  on public.wallet_debug_log (created_at desc);

alter table public.wallet_debug_log enable row level security;
