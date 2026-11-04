-- Site-wide AI limit: 100 AI tailorings a day for everyone together (we run on free AI).
-- Both limits (5 per person, 100 for the site) now reset at midnight US Pacific time,
-- when Gemini's free quota resets: 1:30 PM India time in winter, 12:30 PM in summer.
-- Safe to run more than once. Paste this whole file into Supabase → SQL Editor → Run.
-- To change the site limit later, edit the number in jd_ai_site_limit() and run that part again.

create table if not exists public.jd_ai_site_usage (
  usage_day date primary key,
  used int not null default 0,
  updated_at timestamptz not null default now()
);
-- No policies: nobody reads or writes it directly, only the functions below
alter table public.jd_ai_site_usage enable row level security;

create or replace function public.jd_ai_site_limit()
returns int
language sql
immutable
as $$ select 100 $$;

-- The "AI day" starts at midnight US Pacific time
create or replace function public.jd_ai_day()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Los_Angeles')::date $$;

create or replace function public.jd_ai_resets_at()
returns timestamptz
language sql
stable
as $$ select ((public.jd_ai_day() + 1)::timestamp at time zone 'America/Los_Angeles') $$;

-- How many AI tailorings the caller has left today, and whether the site's daily total is used up
create or replace function public.jd_ai_credits()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := public.jd_ai_day();
  v_limit int := public.jd_ai_daily_limit();
  v_site_limit int := public.jd_ai_site_limit();
  v_used int;
  v_site_used int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select used into v_used from public.jd_ai_usage where user_id = auth.uid() and usage_day = v_day;
  select used into v_site_used from public.jd_ai_site_usage where usage_day = v_day;
  v_used := coalesce(v_used, 0);
  v_site_used := coalesce(v_site_used, 0);
  return json_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'resets_at', public.jd_ai_resets_at(),
    'site_used', v_site_used,
    'site_limit', v_site_limit,
    'site_full', v_site_used >= v_site_limit
  );
end;
$$;

-- Count one AI tailoring (called after it worked). allowed = false when the person's limit was already used.
create or replace function public.jd_use_ai_credit()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := public.jd_ai_day();
  v_limit int := public.jd_ai_daily_limit();
  v_site_limit int := public.jd_ai_site_limit();
  v_used int;
  v_site_used int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.jd_ai_usage as u (user_id, usage_day, used)
  values (auth.uid(), v_day, 1)
  on conflict (user_id, usage_day) do update
    set used = u.used + 1, updated_at = now()
    where u.used < v_limit
  returning used into v_used;

  if v_used is null then
    select used into v_used from public.jd_ai_usage where user_id = auth.uid() and usage_day = v_day;
    select used into v_site_used from public.jd_ai_site_usage where usage_day = v_day;
    return json_build_object('allowed', false, 'used', coalesce(v_used, v_limit), 'limit', v_limit, 'remaining', 0,
      'resets_at', public.jd_ai_resets_at(), 'site_used', coalesce(v_site_used, 0), 'site_limit', v_site_limit,
      'site_full', coalesce(v_site_used, 0) >= v_site_limit);
  end if;

  insert into public.jd_ai_site_usage as s (usage_day, used)
  values (v_day, 1)
  on conflict (usage_day) do update set used = s.used + 1, updated_at = now()
  returning used into v_site_used;

  return json_build_object('allowed', true, 'used', v_used, 'limit', v_limit, 'remaining', greatest(v_limit - v_used, 0),
    'resets_at', public.jd_ai_resets_at(), 'site_used', v_site_used, 'site_limit', v_site_limit,
    'site_full', v_site_used >= v_site_limit);
end;
$$;

revoke all on function public.jd_ai_credits() from public, anon;
revoke all on function public.jd_use_ai_credit() from public, anon;
grant execute on function public.jd_ai_credits() to authenticated;
grant execute on function public.jd_use_ai_credit() to authenticated;
