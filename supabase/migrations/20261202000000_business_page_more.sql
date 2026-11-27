-- =====================================================================
-- Business page, part 2.
--   Pro:       the page's look (colours, background, heading style) and stories.
--   All plans: Wi-Fi details for guests, private feedback from guests, and a
--              small game (each can be switched off by the shop).
--
-- Stories: up to 10 short videos (at most 10 seconds) or photos per shop,
-- shown as round bubbles at the top of the page. They stay until the shop
-- deletes them. The browser converts every video to a small MP4 that all
-- phones can play before uploading, and makes a still image for the bubble.
--
-- Files live in a PUBLIC storage bucket (guests watch them), one folder per
-- shop: page-stories/<campaign id>/<random>.mp4|.jpg. Only a Pro shop's owner
-- can upload into its folder; the owner and Stampfix admins can delete.
--
-- Feedback is anonymous (a star rating and an optional message), only the
-- shop's owner reads it, and it is rate limited per phone and per shop.
--
-- Only adds columns, tables, a bucket and functions; business_page() gains
-- five keys ("look", "stories", "wifi", "feedback_on", "game_on").
-- Safe to run more than once.
-- =====================================================================

-- ---- The look (Pro) ---------------------------------------------------------
alter table public.business_pages add column if not exists accent_color text
  check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.business_pages add column if not exists background text not null default 'cream'
  check (background in ('cream', 'white', 'stone', 'dark'));
alter table public.business_pages add column if not exists heading_style text not null default 'serif'
  check (heading_style in ('serif', 'sans'));

-- ---- Wi-Fi, feedback and the game (all plans) ------------------------------------
alter table public.business_pages add column if not exists wifi_ssid text
  check (wifi_ssid is null or length(wifi_ssid) between 1 and 32);
alter table public.business_pages add column if not exists wifi_password text
  check (wifi_password is null or length(wifi_password) between 1 and 63);
alter table public.business_pages add column if not exists feedback_enabled boolean not null default true;
alter table public.business_pages add column if not exists game_enabled boolean not null default true;

create table if not exists public.business_page_feedback (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  table_label text check (table_label is null or length(table_label) <= 40),
  rating      smallint not null check (rating between 1 and 5),
  message     text check (message is null or length(message) <= 500),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists business_page_feedback_campaign_idx on public.business_page_feedback (campaign_id, created_at desc);
alter table public.business_page_feedback enable row level security;
revoke all on public.business_page_feedback from anon, authenticated;

-- ---- Stories (Pro) ------------------------------------------------------------
create table if not exists public.business_page_stories (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind        text not null check (kind in ('video', 'photo')),
  media_path  text not null unique,
  poster_path text not null,
  label       text check (label is null or length(label) <= 30),
  duration_ms integer check (duration_ms is null or duration_ms between 300 and 10500),
  -- False when the browser that converted the video could not keep its sound.
  has_sound   boolean not null default false,
  position    integer not null default 0,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists business_page_stories_campaign_idx on public.business_page_stories (campaign_id, position);
alter table public.business_page_stories enable row level security;
revoke all on public.business_page_stories from anon, authenticated;

-- True when the signed-in user owns this shop and it is on Pro (and active).
create or replace function public.page_story_owner_pro(p_campaign uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaigns c join public.merchants m on m.id = c.merchant_id
     where c.id = p_campaign and c.merchant_id = auth.uid()
       and m.plan = 'pro' and coalesce(m.status, 'active') = 'active');
$$;

-- Upload check: the shop's own folder, Pro, and not more than 40 files there
-- (10 stories with a video and a still each, and room to replace some).
create or replace function public.page_story_upload_ok(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.page_story_owner_pro(c.id)
       and (select count(*) from storage.objects o
             where o.bucket_id = 'page-stories' and o.name like c.id::text || '/%') < 40
      from public.campaigns c
     where c.id::text = split_part(p_name, '/', 1)), false);
$$;
revoke execute on function public.page_story_owner_pro(uuid) from public, anon;
revoke execute on function public.page_story_upload_ok(text) from public, anon;
grant execute on function public.page_story_owner_pro(uuid) to authenticated;
grant execute on function public.page_story_upload_ok(text) to authenticated;

-- ---- Storage bucket (public: guests watch the stories) -----------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('page-stories', 'page-stories', true, 15728640, array['video/mp4', 'image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "page_stories_owner_insert" on storage.objects;
create policy "page_stories_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'page-stories' and public.page_story_upload_ok(name));

drop policy if exists "page_stories_owner_or_admin_read" on storage.objects;
create policy "page_stories_owner_or_admin_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'page-stories'
    and (exists (select 1 from public.campaigns c
                  where c.id::text = (storage.foldername(name))[1] and c.merchant_id = auth.uid())
         or public.can_view_admin())
  );

drop policy if exists "page_stories_owner_or_admin_delete" on storage.objects;
create policy "page_stories_owner_or_admin_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'page-stories'
    and (exists (select 1 from public.campaigns c
                  where c.id::text = (storage.foldername(name))[1] and c.merchant_id = auth.uid())
         or public.is_stampfix_admin())
  );

-- ---- The shop -----------------------------------------------------------------

-- The shop's page, now with its look. Same as before plus three keys.
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
    'feedback_enabled', v.feedback_enabled, 'game_enabled', v.game_enabled);
end $$;

-- Wi-Fi details and the feedback and game switches (all plans).
-- An empty network name removes the Wi-Fi details; an empty password means an open network.
create or replace function public.save_page_extras(p_campaign uuid, p_wifi_ssid text, p_wifi_password text,
                                                   p_feedback boolean, p_game boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v      public.business_pages%rowtype;
  v_ssid text := nullif(btrim(coalesce(p_wifi_ssid, '')), '');
  v_pass text := nullif(coalesce(p_wifi_password, ''), '');
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if v_ssid is not null and length(v_ssid) > 32 then return jsonb_build_object('ok', false, 'error', 'bad_ssid'); end if;
  if v_pass is not null and length(v_pass) > 63 then return jsonb_build_object('ok', false, 'error', 'bad_password'); end if;
  update public.business_pages
     set wifi_ssid = v_ssid,
         wifi_password = case when v_ssid is null then null else v_pass end,
         feedback_enabled = coalesce(p_feedback, feedback_enabled),
         game_enabled = coalesce(p_game, game_enabled),
         updated_at = now()
   where campaign_id = p_campaign returning * into v;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_page'); end if;
  return jsonb_build_object('ok', true, 'wifi_ssid', v.wifi_ssid, 'wifi_password', v.wifi_password,
    'feedback_enabled', v.feedback_enabled, 'game_enabled', v.game_enabled);
end $$;

-- A guest's feedback: 1 to 5 stars and an optional message, no name.
-- At most 3 a day from one phone and 30 an hour for one shop.
create or replace function public.submit_page_feedback(p_campaign uuid, p_rating integer, p_message text,
                                                       p_location uuid default null, p_table text default null,
                                                       p_device text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_msg   text := nullif(btrim(coalesce(p_message, '')), '');
  v_table text := nullif(left(btrim(coalesce(p_table, '')), 40), '');
  v_dev   text := nullif(left(btrim(coalesce(p_device, '')), 64), '');
  v_loc   uuid;
begin
  if p_rating is null or p_rating not between 1 and 5 then return jsonb_build_object('ok', false, 'error', 'bad_rating'); end if;
  if v_msg is not null and length(v_msg) > 500 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if not exists (
    select 1 from public.business_pages bp
      join public.campaigns c on c.id = bp.campaign_id
      join public.merchants m on m.id = c.merchant_id
     where bp.campaign_id = p_campaign and bp.feedback_enabled
       and c.approval_status = 'approved' and coalesce(m.status, 'active') = 'active') then
    return jsonb_build_object('ok', false, 'error', 'off');
  end if;

  perform pg_advisory_xact_lock(hashtext('page_feedback:' || p_campaign::text));
  if (select count(*) from public.business_page_feedback f
       where f.campaign_id = p_campaign and f.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  if not public.rate_limit_hit('page_feedback', p_campaign::text || ':' || coalesce(auth.uid()::text, v_dev, 'anon'), 3, 86400, 86400) then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  select l.id into v_loc from public.locations l where l.id = p_location and l.campaign_id = p_campaign;
  insert into public.business_page_feedback (campaign_id, location_id, table_label, rating, message)
  values (p_campaign, v_loc, v_table, p_rating, v_msg);
  return jsonb_build_object('ok', true);
end $$;

-- The shop's feedback, newest first (the owner only).
create or replace function public.my_page_feedback(p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(r order by r.created_at desc) from (
      select f.id, f.rating, f.message, f.table_label, f.created_at, f.read_at, l.name as location_name
        from public.business_page_feedback f
        left join public.locations l on l.id = f.location_id
       where f.campaign_id = p_campaign
       order by f.created_at desc
       limit 300) r), '[]'::jsonb);
end $$;

-- How many the owner hasn't seen yet (for the badge).
create or replace function public.page_feedback_unread(p_campaign uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.business_page_feedback f
    join public.campaigns c on c.id = f.campaign_id
   where f.campaign_id = p_campaign and c.merchant_id = auth.uid() and f.read_at is null;
$$;

-- Mark all of the shop's feedback as seen.
create or replace function public.mark_page_feedback_read(p_campaign uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  update public.business_page_feedback set read_at = now() where campaign_id = p_campaign and read_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- Delete one piece of feedback (the owner only).
create or replace function public.delete_page_feedback(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  delete from public.business_page_feedback f
   where f.id = p_id
     and exists (select 1 from public.campaigns c where c.id = f.campaign_id and c.merchant_id = auth.uid());
  if not found then raise exception 'not_owner' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- The page's look (Pro). A null accent means "the card's colour".
create or replace function public.save_page_look(p_campaign uuid, p_accent text, p_background text, p_heading text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v public.business_pages%rowtype;
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if not public.page_story_owner_pro(p_campaign) then return jsonb_build_object('ok', false, 'error', 'pro_only'); end if;
  if p_accent is not null and p_accent !~ '^#[0-9A-Fa-f]{6}$' then return jsonb_build_object('ok', false, 'error', 'bad_colour'); end if;
  if coalesce(p_background, '') not in ('cream', 'white', 'stone', 'dark') then return jsonb_build_object('ok', false, 'error', 'bad_background'); end if;
  if coalesce(p_heading, '') not in ('serif', 'sans') then return jsonb_build_object('ok', false, 'error', 'bad_heading'); end if;
  update public.business_pages
     set accent_color = upper(p_accent), background = p_background, heading_style = p_heading, updated_at = now()
   where campaign_id = p_campaign returning * into v;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_page'); end if;
  return jsonb_build_object('ok', true, 'accent_color', v.accent_color, 'background', v.background, 'heading_style', v.heading_style);
end $$;

-- All of the shop's stories (hidden ones too), in order.
create or replace function public.my_page_stories(p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'media_path', s.media_path, 'poster_path', s.poster_path,
                                        'label', s.label, 'duration_ms', s.duration_ms, 'has_sound', s.has_sound, 'hidden', s.hidden, 'created_at', s.created_at)
                     order by s.position, s.created_at)
      from public.business_page_stories s where s.campaign_id = p_campaign), '[]'::jsonb);
end $$;

-- A new story from two files the shop already uploaded (the media and its still).
create or replace function public.add_page_story(p_campaign uuid, p_kind text, p_media_path text, p_poster_path text,
                                                 p_label text default null, p_duration_ms integer default null,
                                                 p_has_sound boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_media_type  text;
  v_poster_type text;
  v_story       public.business_page_stories%rowtype;
  v_label       text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if not public.page_story_owner_pro(p_campaign) then return jsonb_build_object('ok', false, 'error', 'pro_only'); end if;
  if (select count(*) from public.business_page_stories where campaign_id = p_campaign) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  if p_kind not in ('video', 'photo') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  if v_label is not null and length(v_label) > 30 then return jsonb_build_object('ok', false, 'error', 'label_too_long'); end if;
  if p_kind = 'video' and (p_duration_ms is null or p_duration_ms not between 300 and 10500) then
    return jsonb_build_object('ok', false, 'error', 'bad_duration');
  end if;
  -- Both files must really be in this shop's folder, of the right type.
  if split_part(coalesce(p_media_path, ''), '/', 1) <> p_campaign::text
     or split_part(coalesce(p_poster_path, ''), '/', 1) <> p_campaign::text then
    return jsonb_build_object('ok', false, 'error', 'bad_files');
  end if;
  select o.metadata->>'mimetype' into v_media_type from storage.objects o where o.bucket_id = 'page-stories' and o.name = p_media_path;
  select o.metadata->>'mimetype' into v_poster_type from storage.objects o where o.bucket_id = 'page-stories' and o.name = p_poster_path;
  if v_media_type is null or v_poster_type is null
     or (p_kind = 'video' and v_media_type <> 'video/mp4')
     or (p_kind = 'photo' and v_media_type not like 'image/%')
     or v_poster_type not like 'image/%'
     or exists (select 1 from public.business_page_stories s where s.media_path = p_media_path) then
    return jsonb_build_object('ok', false, 'error', 'bad_files');
  end if;

  insert into public.business_page_stories (campaign_id, kind, media_path, poster_path, label, duration_ms, has_sound, position)
  values (p_campaign, p_kind, p_media_path, p_poster_path, v_label,
          case when p_kind = 'video' then p_duration_ms end,
          p_kind = 'video' and coalesce(p_has_sound, false),
          coalesce((select max(position) + 1 from public.business_page_stories where campaign_id = p_campaign), 0))
  returning * into v_story;
  return jsonb_build_object('ok', true, 'id', v_story.id);
end $$;

-- Rename, hide or show a story.
create or replace function public.update_page_story(p_story uuid, p_label text, p_hidden boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_label text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if v_label is not null and length(v_label) > 30 then return jsonb_build_object('ok', false, 'error', 'label_too_long'); end if;
  update public.business_page_stories s set label = v_label, hidden = coalesce(p_hidden, false)
   where s.id = p_story
     and exists (select 1 from public.campaigns c where c.id = s.campaign_id and c.merchant_id = auth.uid());
  if not found then raise exception 'not_owner' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Put the shop's stories in this order (ids of other shops are ignored).
create or replace function public.reorder_page_stories(p_campaign uuid, p_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  update public.business_page_stories s set position = x.ord - 1
    from unnest(p_ids) with ordinality as x(id, ord)
   where s.id = x.id and s.campaign_id = p_campaign;
  return jsonb_build_object('ok', true);
end $$;

-- Delete a story (its owner, or a Stampfix admin). Returns the two file paths,
-- which the browser then removes from storage.
create or replace function public.delete_page_story(p_story uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v public.business_page_stories%rowtype;
begin
  delete from public.business_page_stories s
   where s.id = p_story
     and (exists (select 1 from public.campaigns c where c.id = s.campaign_id and c.merchant_id = auth.uid())
          or public.is_stampfix_admin())
  returning * into v;
  if not found then raise exception 'not_owner' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'media_path', v.media_path, 'poster_path', v.poster_path);
end $$;

-- ---- Admin: every shop's stories (newest first) ---------------------------------
create or replace function public.admin_page_stories()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_admin() then raise exception 'Not authorised'; end if;
  return coalesce((
    select jsonb_agg(r order by r.created_at desc) from (
      select s.id, s.campaign_id, c.business_name, bp.slug, s.kind, s.media_path, s.poster_path, s.label,
             s.duration_ms, s.has_sound, s.hidden, s.created_at
        from public.business_page_stories s
        join public.campaigns c on c.id = s.campaign_id
        left join public.business_pages bp on bp.campaign_id = s.campaign_id
       order by s.created_at desc
       limit 500) r), '[]'::jsonb);
end $$;

revoke execute on function public.my_business_page(uuid) from public, anon;
revoke execute on function public.save_page_look(uuid, text, text, text) from public, anon;
revoke execute on function public.my_page_stories(uuid) from public, anon;
revoke execute on function public.add_page_story(uuid, text, text, text, text, integer, boolean) from public, anon;
revoke execute on function public.update_page_story(uuid, text, boolean) from public, anon;
revoke execute on function public.reorder_page_stories(uuid, uuid[]) from public, anon;
revoke execute on function public.delete_page_story(uuid) from public, anon;
revoke execute on function public.admin_page_stories() from public, anon;
revoke execute on function public.save_page_extras(uuid, text, text, boolean, boolean) from public, anon;
revoke execute on function public.submit_page_feedback(uuid, integer, text, uuid, text, text) from public;
revoke execute on function public.my_page_feedback(uuid) from public, anon;
revoke execute on function public.page_feedback_unread(uuid) from public, anon;
revoke execute on function public.mark_page_feedback_read(uuid) from public, anon;
revoke execute on function public.delete_page_feedback(uuid) from public, anon;
grant execute on function public.my_business_page(uuid) to authenticated;
grant execute on function public.save_page_look(uuid, text, text, text) to authenticated;
grant execute on function public.my_page_stories(uuid) to authenticated;
grant execute on function public.add_page_story(uuid, text, text, text, text, integer, boolean) to authenticated;
grant execute on function public.update_page_story(uuid, text, boolean) to authenticated;
grant execute on function public.reorder_page_stories(uuid, uuid[]) to authenticated;
grant execute on function public.delete_page_story(uuid) to authenticated;
grant execute on function public.admin_page_stories() to authenticated;
grant execute on function public.save_page_extras(uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.submit_page_feedback(uuid, integer, text, uuid, text, text) to anon, authenticated;
grant execute on function public.my_page_feedback(uuid) to authenticated;
grant execute on function public.page_feedback_unread(uuid) to authenticated;
grant execute on function public.mark_page_feedback_read(uuid) to authenticated;
grant execute on function public.delete_page_feedback(uuid) to authenticated;

-- ---- Guests: the page, now with its look and stories (Pro), Wi-Fi, feedback and game
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
      'feedback_on',     bp.feedback_enabled,
      'game_on',         bp.game_enabled)
      from public.campaigns c
      join public.merchants m on m.id = c.merchant_id
      join public.business_pages bp on bp.campaign_id = c.id
     where c.id = v_campaign);
end $$;
grant execute on function public.business_page(text) to anon, authenticated;
