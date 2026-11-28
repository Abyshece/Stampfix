-- =====================================================================
-- Table sticker: the owner's design for the small printed sticker with the
-- Business page QR code (Business page > QR code).
--
-- Adds one column and two owner functions. Nothing else changes: the page,
-- its other functions and the guest page stay as they are. Until a shop saves
-- a design, the column is empty and the app uses its defaults.
-- Safe to run more than once.
--
-- The design (all keys optional when saving; stored cleaned up):
--   color  '#RRGGBB' or null (null: the card's colour)
--   bg     'white' | 'cream' | 'brand'
--   logo   'auto' | 'name' | 'logo_name' | 'logo'
--   name   the name printed on the sticker (null: the business name), 40 max
--   nfc    show the "tap" mark (true/false)
--   items  up to 4 of: menu, rewards, wifi, reviews, feedback, delivery,
--          order, website, instagram, game ([] : the app picks)
-- =====================================================================

alter table public.business_pages add column if not exists sticker jsonb;

-- The saved design, or null when the shop never saved one.
create or replace function public.my_page_sticker(p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  select bp.sticker into v from public.business_pages bp where bp.campaign_id = p_campaign;
  return v;
end $$;

-- Save the design. Answers {ok: true, sticker} or {ok: false, error}.
create or replace function public.save_page_sticker(p_campaign uuid, p_sticker jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_color text;
  v_bg    text;
  v_logo  text;
  v_name  text;
  v_nfc   boolean;
  v_items jsonb;
  v_clean jsonb;
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign and c.merchant_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if p_sticker is null or jsonb_typeof(p_sticker) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_sticker');
  end if;

  v_color := case when jsonb_typeof(p_sticker -> 'color') = 'string' then nullif(btrim(p_sticker ->> 'color'), '') end;
  if p_sticker ? 'color' and jsonb_typeof(p_sticker -> 'color') not in ('string', 'null') then
    return jsonb_build_object('ok', false, 'error', 'bad_color');
  end if;
  if v_color is not null and v_color !~ '^#[0-9A-Fa-f]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_color');
  end if;

  v_bg := coalesce(p_sticker ->> 'bg', 'white');
  if v_bg not in ('white', 'cream', 'brand') then return jsonb_build_object('ok', false, 'error', 'bad_bg'); end if;

  v_logo := coalesce(p_sticker ->> 'logo', 'auto');
  if v_logo not in ('auto', 'name', 'logo_name', 'logo') then return jsonb_build_object('ok', false, 'error', 'bad_logo'); end if;

  if p_sticker ? 'name' and jsonb_typeof(p_sticker -> 'name') not in ('string', 'null') then
    return jsonb_build_object('ok', false, 'error', 'bad_name');
  end if;
  v_name := nullif(btrim(coalesce(p_sticker ->> 'name', '')), '');
  if v_name is not null and length(v_name) > 40 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;

  if p_sticker ? 'nfc' and jsonb_typeof(p_sticker -> 'nfc') <> 'boolean' then
    return jsonb_build_object('ok', false, 'error', 'bad_nfc');
  end if;
  v_nfc := coalesce((p_sticker ->> 'nfc')::boolean, true);

  v_items := coalesce(p_sticker -> 'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 4 then
    return jsonb_build_object('ok', false, 'error', 'bad_items');
  end if;
  if exists (select 1 from jsonb_array_elements(v_items) e
              where jsonb_typeof(e) <> 'string'
                 or (e #>> '{}') not in ('menu', 'rewards', 'wifi', 'reviews', 'feedback', 'delivery', 'order', 'website', 'instagram', 'game'))
     or (select count(distinct e #>> '{}') from jsonb_array_elements(v_items) e) <> jsonb_array_length(v_items) then
    return jsonb_build_object('ok', false, 'error', 'bad_items');
  end if;

  v_clean := jsonb_build_object('color', v_color, 'bg', v_bg, 'logo', v_logo, 'name', v_name, 'nfc', v_nfc, 'items', v_items);
  update public.business_pages set sticker = v_clean, updated_at = now() where campaign_id = p_campaign;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_page'); end if;
  return jsonb_build_object('ok', true, 'sticker', v_clean);
end $$;

revoke execute on function public.my_page_sticker(uuid) from public, anon;
grant execute on function public.my_page_sticker(uuid) to authenticated;
revoke execute on function public.save_page_sticker(uuid, jsonb) from public, anon;
grant execute on function public.save_page_sticker(uuid, jsonb) to authenticated;
