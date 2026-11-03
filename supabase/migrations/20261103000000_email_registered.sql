-- "Create account" asks this first, so someone who already has an account (with a password)
-- is sent to Sign in instead of replacing their password without knowing.
-- Accounts that got a code but never set a password count as not registered, so they can finish.
create or replace function public.jd_email_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(trim(p_email))
      and coalesce(encrypted_password, '') <> ''
      and deleted_at is null
  );
$$;

revoke all on function public.jd_email_registered(text) from public;
grant execute on function public.jd_email_registered(text) to anon, authenticated;
