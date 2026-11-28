-- =====================================================================
-- Business page photos: a header photo and a profile photo (every plan).
--
-- The owner uploads them in the dashboard (Business page > Basics). Guests
-- see the header photo across the top of the page instead of the colour
-- banner, and the profile photo in the round-cornered tile instead of the
-- card logo. Without photos the page looks exactly as before.
--
-- Adds two columns, a public bucket "page-photos" (files in the shop's own
-- folder: <campaign id>/cover-....jpg and <campaign id>/avatar-....jpg),
-- one owner function, and re-creates my_business_page() and business_page()
-- with the same keys plus "cover_path" and "avatar_path".
-- Safe to run more than once.
-- =====================================================================

alter table public.business_pages add column if not exists cover_path text;
alter table public.business_pages add column if not exists avatar_path text;

-- ---- Storage -------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('page-photos', 'page-photos', true, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Upload check: the shop's own folder, a cover-/avatar- file name, and not
-- more than 20 files there (two photos and room to replace them).
create or replace function public.page_photo_upload_ok(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p_name ~ ('^' || c.id::text || '/(cover|avatar)-[A-Za-z0-9-]{6,64}\.(jpg|webp|png)$')
       and (select count(*) from storage.objects o
             where o.bucket_id = 'page-photos' and o.name like c.id::text || '/%') < 20
      from public.campaigns c
     where c.id::text = split_part(p_name, '/', 1) and c.merchant_id = auth.uid()), false);
$$;
revoke execute on function public.page_photo_upload_ok(text) from public, anon;
grant execute on function public.page_photo_upload_ok(text) to authenticated;

drop policy if exists "page_photos_owner_insert" on storage.objects;
create policy "page_photos_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'page-photos' and public.page_photo_upload_ok(name));

drop policy if exists "page_photos_owner_or_admin_read" on storage.objects;
create policy "page_photos_owner_or_admin_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'page-photos'
    and (exists (select 1 from public.campaigns c
                  where c.id::text = (storage.foldername(name))[1] and c.merchant_id = auth.uid())
         or public.can_view_admin())
  );

drop policy if exists "page_photos_owner_or_admin_delete" on storage.objects;
create policy "page_photos_owner_or_admin_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'page-photos'
    and (exists (select 1 from public.campaigns c
                  where c.id::text = (storage.foldername(name))[1] and c.merchant_id = auth.uid())
         or public.is_stampfix_admin())
  );

-- ---- The owner sets or removes a photo ---------------------------------------------
-- p_kind: 'cover' or 'avatar'. p_path: an uploaded file in the shop's folder, or
-- null to remove the photo. Answers with the previous file so the app can delete it.
create or replace function public.set_page_photo(p_campaign uuid, p_kind text, p_path text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
  v_old  text;
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('cover', 'avatar') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;
  if v_path is not null and (
       v_path !~ ('^' || p_campaign::text || '/' || p_kind || '-[A-Za-z0-9-]{6,64}\.(jpg|webp|png)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'page-photos' and o.name = v_path)) then
    return jsonb_build_object('ok', false, 'error', 'bad_file');
  end if;

  select case when p_kind = 'cover' then bp.cover_path else bp.avatar_path end into v_old
    from public.business_pages bp where bp.campaign_id = p_campaign for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_page'); end if;

  if p_kind = 'cover' then
    update public.business_pages set cover_path = v_path, updated_at = now() where campaign_id = p_campaign;
  else
    update public.business_pages set avatar_path = v_path, updated_at = now() where campaign_id = p_campaign;
  end if;
  return jsonb_build_object('ok', true, 'path', v_path,
                            'old_path', case when v_old is distinct from v_path then v_old end);
end $$;
revoke execute on function public.set_page_photo(uuid, text, text) from public, anon;
grant execute on function public.set_page_photo(uuid, text, text) to authenticated;

-- ---- The shop's page, now with its photos -------------------------------------------
create or replace function public.my_business_page(p_campaign uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v       public.business_pages%rowtype;
  v_name  text;
  v_stamp text;
begin
  select c.business_name, c.stamp_code into v_name, v_stamp
    from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid();
  if not found then raise exception 'not_owner' using errcode = '42501'; end if;

  select * into v from public.business_pages where campaign_id = p_campaign;
  if not found then
    insert into public.business_pages (campaign_id, slug, counter_code)
    values (p_campaign,
            public.business_page_free_slug(public.business_page_slugify(v_name), p_campaign),
            public.business_page_new_code(v_stamp))
    on conflict (campaign_id) do nothing;
    select * into v from public.business_pages where campaign_id = p_campaign;
  end if;
  return jsonb_build_object('slug', v.slug, 'about', v.about, 'counter_code', v.counter_code,
    'accent_color', v.accent_color, 'background', v.background, 'heading_style', v.heading_style,
    'wifi_ssid', v.wifi_ssid, 'wifi_password', v.wifi_password,
    'feedback_enabled', v.feedback_enabled, 'game_enabled', v.game_enabled, 'enabled', v.enabled,
    'cover_path', v.cover_path, 'avatar_path', v.avatar_path);
end $$;

-- ---- Guests: the page, now with its photos ------------------------------------------
create or replace function public.business_page(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_slug     text := lower(btrim(coalesce(p_slug, '')));
  v_campaign uuid;
begin
  if length(v_slug) = 0 or length(v_slug) > 60 then return null; end if;
  select bp.campaign_id into v_campaign from public.business_pages bp where bp.slug = v_slug;
  if v_campaign is null then
    select a.campaign_id into v_campaign from public.business_page_aliases a where a.slug = v_slug;
  end if;
  if v_campaign is null then return null; end if;

  return (
    select jsonb_build_object(
      'campaign_id',     c.id,
      'merchant_id',     c.merchant_id,
      'slug',            bp.slug,
      'business_name',   c.business_name,
      'offer_title',     c.offer_title,
      'max_stamps',      c.max_stamps,
      'logo_image',      c.logo_image,
      'logo_mode',       c.logo_mode,
      'custom_icon',     c.custom_icon,
      'primary_color',   c.primary_color,
      'card_color',      c.card_color,
      'card_text_color', c.card_text_color,
      'about',           bp.about,
      'links',           coalesce(c.social_links, '{}'::jsonb),
      'approved',        c.approval_status = 'approved',
      'available',       coalesce(m.status, 'active') = 'active',
      'self_serve',      coalesce(c.stamping_mode, 'scanner') = 'self_serve' and bp.counter_code is not null,
      'ordering_open',   public.ordering_open(c.id),
      'locations',       coalesce((
        select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.created_at, l.id)
          from public.locations l
         where l.campaign_id = c.id and not coalesce(l.archived, false)), '[]'::jsonb),
      -- Pro: the shop's look and its stories. Default look, no stories otherwise.
      'look',            case when m.plan = 'pro' then jsonb_build_object(
                           'accent_color', bp.accent_color, 'background', bp.background, 'heading_style', bp.heading_style) end,
      'stories',         case when m.plan = 'pro' then coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'media_path', s.media_path,
                                            'poster_path', s.poster_path, 'label', s.label, 'duration_ms', s.duration_ms,
                                            'has_sound', s.has_sound)
                         order by s.position, s.created_at)
          from public.business_page_stories s
         where s.campaign_id = c.id and not s.hidden), '[]'::jsonb) else '[]'::jsonb end,
      'wifi',            case when bp.wifi_ssid is not null then jsonb_build_object(
                           'ssid', bp.wifi_ssid, 'password', bp.wifi_password) end,
      -- Off: the app sends guests straight to sign-up (or ordering at a table).
      'enabled',         bp.enabled,
      'feedback_on',     bp.feedback_enabled,
      'game_on',         bp.game_enabled,
      -- Every plan: the header and profile photos.
      'cover_path',      bp.cover_path,
      'avatar_path',     bp.avatar_path)
      from public.campaigns c
      join public.merchants m on m.id = c.merchant_id
      join public.business_pages bp on bp.campaign_id = c.id
     where c.id = v_campaign);
end $$;

revoke execute on function public.my_business_page(uuid) from public, anon;
grant execute on function public.my_business_page(uuid) to authenticated;
grant execute on function public.business_page(text) to anon, authenticated;
