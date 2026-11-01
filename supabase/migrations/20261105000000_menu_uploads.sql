-- =====================================================================
-- Menu uploads: shops send photos or a PDF of their menu instead of typing
-- every item. Stampfix admins see the uploads in the admin panel (Menus),
-- add the items for the shop, and mark the upload done (or ask for better
-- photos with a note the shop sees).
--
-- Files live in a PRIVATE storage bucket, one folder per shop:
--   menu-uploads/<campaign id>/<random>/<file name>
-- The shop owner can upload into and read its own folder; admins (full and
-- view-only) can read every folder. Nobody else can see the files.
--
-- Safe to run more than once.
-- =====================================================================

-- ---- Storage bucket (private) ------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-uploads', 'menu-uploads', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "menu_uploads_owner_insert" on storage.objects;
create policy "menu_uploads_owner_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-uploads'
    and exists (select 1 from public.campaigns c
                 where c.id::text = (storage.foldername(name))[1] and c.merchant_id = auth.uid())
  );

drop policy if exists "menu_uploads_owner_or_admin_read" on storage.objects;
create policy "menu_uploads_owner_or_admin_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'menu-uploads'
    and (exists (select 1 from public.campaigns c
                  where c.id::text = (storage.foldername(name))[1] and c.merchant_id = auth.uid())
         or public.can_view_admin())
  );

-- ---- One row per upload --------------------------------------------------------
create table if not exists public.menu_uploads (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  -- [{path, name, type, size}] — taken from storage, not from the browser.
  files       jsonb not null check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) between 1 and 15),
  -- From the shop, e.g. "Prices on page 2 are new".
  note        text check (note is null or length(note) <= 500),
  status      text not null default 'new' check (status in ('new', 'in_progress', 'done', 'needs_info')),
  -- From Stampfix, shown to the shop, e.g. "Page 2 is blurry, please upload it again".
  admin_note  text check (admin_note is null or length(admin_note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
create index if not exists menu_uploads_status_idx on public.menu_uploads (status, created_at desc);
create index if not exists menu_uploads_campaign_idx on public.menu_uploads (campaign_id, created_at desc);

alter table public.menu_uploads enable row level security;
-- The shop reads its own uploads; all writes go through the functions below.
drop policy if exists "menu_uploads owner read" on public.menu_uploads;
create policy "menu_uploads owner read" on public.menu_uploads for select
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.merchant_id = auth.uid()));
revoke all on public.menu_uploads from anon;
revoke insert, update, delete on public.menu_uploads from authenticated;

-- ---- Shop: send an upload ------------------------------------------------------
-- p_files: [{"path": "<campaign id>/<...>", "name": "menu-page-1.jpg"}, ...]. Every
-- path must be a file this shop already uploaded to the bucket.
create or replace function public.submit_menu_upload(p_campaign uuid, p_files jsonb, p_note text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_id    uuid;
  v_files jsonb;
  v_want  integer;
  v_found integer;
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'Not authorised';
  end if;
  if p_files is null or jsonb_typeof(p_files) <> 'array' then
    raise exception 'invalid_files';
  end if;
  v_want := jsonb_array_length(p_files);
  if v_want < 1 or v_want > 15 then
    raise exception 'invalid_files';
  end if;
  if (select count(*) from public.menu_uploads u
       where u.campaign_id = p_campaign and u.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_uploads';
  end if;

  -- Only files that really are in this shop's folder; size and type come from storage.
  select count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'path', o.name,
           'name', left(coalesce(nullif(btrim(e.val->>'name'), ''), regexp_replace(o.name, '^.*/', '')), 120),
           'type', o.metadata->>'mimetype',
           'size', (o.metadata->>'size')::bigint) order by e.ord), '[]'::jsonb)
    into v_found, v_files
    from jsonb_array_elements(p_files) with ordinality as e(val, ord)
    join storage.objects o on o.bucket_id = 'menu-uploads' and o.name = e.val->>'path'
   where split_part(e.val->>'path', '/', 1) = p_campaign::text;
  if v_found <> v_want then
    raise exception 'invalid_files';
  end if;

  insert into public.menu_uploads (campaign_id, files, note)
  values (p_campaign, v_files, nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ---- Admin: list uploads ----------------------------------------------------------
create or replace function public.admin_menu_uploads(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc)
      from (
        select u.id, u.campaign_id, u.files, u.note, u.status, u.admin_note, u.created_at, u.reviewed_at,
               c.business_name, m.country, coalesce(m.plan, 'free') as plan, au.email as owner_email,
               (select count(*) from public.menu_items i where i.campaign_id = u.campaign_id) as menu_items
          from public.menu_uploads u
          join public.campaigns c on c.id = u.campaign_id
          join public.merchants m on m.id = c.merchant_id
          left join auth.users au on au.id = c.merchant_id
         where p_status is null or u.status = p_status
         order by u.created_at desc
         limit 300
      ) x), '[]'::jsonb);
end $$;

-- ---- Admin: move an upload on --------------------------------------------------------
create or replace function public.admin_set_menu_upload(p_id uuid, p_status text, p_admin_note text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_label text;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_status not in ('new', 'in_progress', 'done', 'needs_info') then raise exception 'invalid_status'; end if;
  update public.menu_uploads
     set status      = p_status,
         admin_note  = nullif(left(btrim(coalesce(p_admin_note, '')), 500), ''),
         updated_at  = now(),
         reviewed_at = case when p_status = 'new' then null else now() end,
         reviewed_by = case when p_status = 'new' then null else auth.uid() end
   where id = p_id;
  if not found then raise exception 'not_found'; end if;
  select c.business_name into v_label
    from public.menu_uploads u join public.campaigns c on c.id = u.campaign_id where u.id = p_id;
  perform public.admin_audit('menu_upload.status', 'menu_upload', p_id::text, v_label,
                             jsonb_build_object('status', p_status, 'note', p_admin_note));
end $$;

revoke execute on function public.submit_menu_upload(uuid, jsonb, text) from public, anon;
revoke execute on function public.admin_menu_uploads(text) from public, anon;
revoke execute on function public.admin_set_menu_upload(uuid, text, text) from public, anon;
grant execute on function public.submit_menu_upload(uuid, jsonb, text) to authenticated;
grant execute on function public.admin_menu_uploads(text) to authenticated;
grant execute on function public.admin_set_menu_upload(uuid, text, text) to authenticated;
