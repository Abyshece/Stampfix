-- =====================================================================
-- HOTFIX: signup trigger error "Database error saving new user"
--
-- Root cause: the handle_new_user trigger throws if ANY column insertion
-- fails (e.g. constraint check, missing column, etc), and Postgres rolls
-- back the entire auth.users insert, leaving Supabase with the generic
-- "Database error saving new user" message.
--
-- Fix: wrap the insert in an EXCEPTION block so we log the failure but
-- don't block auth.users creation. The merchant row will be created
-- best-effort; if it fails, the merchant signs in as a "customer" (no
-- merchant row) and we surface that case via the orphan-check flow in
-- App.tsx (already shipped).
--
-- We also explicitly enumerate every nullable column we might need so
-- no future column addition silently breaks signup.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.raw_user_meta_data->>'role') = 'merchant' then
    begin
      insert into public.merchants (id, email, business_name, country)
      values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'business_name', ''),
        new.raw_user_meta_data->>'country'
      )
      on conflict (id) do nothing;
    exception when others then
      -- Log to Postgres notice channel; don't block auth user creation.
      -- We'd rather have an auth user without a merchant row (which the
      -- orphan-check flow handles) than a hard signup failure.
      raise warning 'handle_new_user: merchant insert failed for % (%): % - %',
        new.email, new.id, SQLSTATE, SQLERRM;
    end;
  end if;
  return new;
end;
$$;
