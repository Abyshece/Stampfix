-- =====================================================================
-- Business page on/off.
--
-- Each shop chooses whether guests see its Business page:
--   off (the default, also for every existing shop): the page's QR codes and
--        links take guests straight to sign-up (or, from a table code, to
--        ordering), exactly as before the Business page existed;
--   on:  guests see the page.
-- The owner can always open the page to look at it. Codes already printed
-- keep working either way.
--
-- Adds one column and one function; my_business_page(), business_page() and
-- submit_page_feedback() are re-created with the same keys plus "enabled"
-- (feedback is only taken while the page is on). Safe to run more than once.
-- =====================================================================

alter table public.business_pages add column if not exists enabled boolean not null default false;

-- Turn the page on or off (the owner only).
create or replace function public.set_business_page_enabled(p_campaign uuid, p_on boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v public.business_pages%rowtype;
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  update public.business_pages set enabled = coalesce(p_on, false), updated_at = now()
   where campaign_id = p_campaign returning * into v;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_page'); end if;
  return jsonb_build_object('ok', true, 'enabled', v.enabled);
end $$;

-- The shop's page, now with "enabled".
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
    'feedback_enabled', v.feedback_enabled, 'game_enabled', v.game_enabled, 'enabled', v.enabled);
end $$;

-- Feedback only while the page is on.
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
     where bp.campaign_id = p_campaign and bp.enabled and bp.feedback_enabled
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

-- Guests: the page, now with "enabled".
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
      'game_on',         bp.game_enabled)
      from public.campaigns c
      join public.merchants m on m.id = c.merchant_id
      join public.business_pages bp on bp.campaign_id = c.id
     where c.id = v_campaign);
end $$;

revoke execute on function public.set_business_page_enabled(uuid, boolean) from public, anon;
revoke execute on function public.my_business_page(uuid) from public, anon;
revoke execute on function public.submit_page_feedback(uuid, integer, text, uuid, text, text) from public;
grant execute on function public.set_business_page_enabled(uuid, boolean) to authenticated;
grant execute on function public.my_business_page(uuid) to authenticated;
grant execute on function public.submit_page_feedback(uuid, integer, text, uuid, text, text) to anon, authenticated;
grant execute on function public.business_page(text) to anon, authenticated;
