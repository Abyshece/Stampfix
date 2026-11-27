-- =====================================================================
-- Admin > Email shops: the footer can be edited (English and German).
--
-- The lines under every email to a shop (our address and the "reply stop"
-- line) were fixed in code. Now an admin can change them in Email shops.
-- Empty means "use the built-in footer", so nothing changes until someone
-- saves a new one.
--
-- Adds one table (one row, no direct access) and two admin functions.
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.shop_email_settings (
  id         smallint primary key default 1 check (id = 1),
  footer_en  text check (footer_en is null or char_length(footer_en) <= 1000),
  footer_de  text check (footer_de is null or char_length(footer_de) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.shop_email_settings enable row level security;
revoke all on public.shop_email_settings from anon, authenticated;
insert into public.shop_email_settings (id) values (1) on conflict (id) do nothing;

-- The saved footers (null = the built-in one).
create or replace function public.admin_shop_email_footer()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.shop_email_settings;
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  select * into r from public.shop_email_settings where id = 1;
  return jsonb_build_object('en', r.footer_en, 'de', r.footer_de, 'updated_at', r.updated_at);
end $$;

-- Save both footers. An empty one goes back to the built-in footer.
create or replace function public.admin_set_shop_email_footer(p_en text, p_de text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_en text := nullif(btrim(coalesce(p_en, '')), '');
  v_de text := nullif(btrim(coalesce(p_de, '')), '');
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if char_length(coalesce(v_en, '')) > 1000 or char_length(coalesce(v_de, '')) > 1000 then
    raise exception 'too_long';
  end if;
  insert into public.shop_email_settings (id, footer_en, footer_de, updated_at, updated_by)
  values (1, v_en, v_de, now(), auth.uid())
  on conflict (id) do update set footer_en = excluded.footer_en, footer_de = excluded.footer_de,
                                 updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return public.admin_shop_email_footer();
end $$;

revoke execute on function public.admin_shop_email_footer() from public, anon;
revoke execute on function public.admin_set_shop_email_footer(text, text) from public, anon;
grant execute on function public.admin_shop_email_footer() to authenticated;
grant execute on function public.admin_set_shop_email_footer(text, text) to authenticated;
