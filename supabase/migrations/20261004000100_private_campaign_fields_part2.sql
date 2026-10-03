-- Private shop fields, part 2 of 2. Apply only AFTER the app update that reads
-- campaigns with named columns (src/lib/db.ts CAMPAIGN_PUBLIC_COLS) is live:
-- the old app's select('*') stops working once these columns are hidden.
--
-- Browser roles (anon, authenticated) can read every campaigns column except
-- stamp_code, owner_pin_hash and rejection_reason. The owner reads those via
-- campaign_private(); server code (service role, SECURITY DEFINER functions)
-- is unaffected. A column-level REVOKE does nothing while a table-level grant
-- exists, hence revoke-all-then-grant-the-list.
--
-- NOTE for future migrations: a NEW campaigns column is not readable from the
-- app until it is added to this grant (and to CAMPAIGN_PUBLIC_COLS).

revoke select on public.campaigns from anon, authenticated;
grant select (
  id, merchant_id, business_name, offer_title, description, max_stamps,
  primary_color, background_color, logo_text, card_pattern, custom_icon,
  logo_image, created_at, updated_at, poster_color, customer_privacy_notice,
  card_color, card_text_color, approval_status, approval_banner_seen,
  logo_color, max_stamps_per_day, logo_mode, social_links, stamping_mode,
  self_serve_radius
) on public.campaigns to anon, authenticated;
