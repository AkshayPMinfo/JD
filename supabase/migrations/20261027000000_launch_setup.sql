-- Launch setup: daily AI limit (3 a day signed in, 1 for guests), "delete my account", and usage tracking.
-- The day resets at midnight India time. Safe to run more than once.
-- Paste this whole file into Supabase → SQL Editor → Run.

create table if not exists public.jd_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  used int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_day)
);

alter table public.jd_ai_usage enable row level security;

-- People can read their own count. Nobody can write to the table directly;
-- only the functions below change counts.
drop policy if exists "jd_ai_usage_select_own" on public.jd_ai_usage;
create policy "jd_ai_usage_select_own" on public.jd_ai_usage
  for select using (auth.uid() = user_id);

-- 1 for guests (anonymous sign-in), 3 for everyone else
create or replace function public.jd_ai_daily_limit()
returns int
language sql
stable
as $$
  select case when coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then 1 else 3 end;
$$;

-- How many AI tailorings the caller has used and has left today
create or replace function public.jd_ai_credits()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_limit int := public.jd_ai_daily_limit();
  v_used int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select used into v_used from public.jd_ai_usage where user_id = auth.uid() and usage_day = v_day;
  v_used := coalesce(v_used, 0);
  return json_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'resets_at', ((v_day + 1)::timestamp at time zone 'Asia/Kolkata')
  );
end;
$$;

-- Use one AI tailoring. Returns allowed = false when today's limit is already used.
create or replace function public.jd_use_ai_credit()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_limit int := public.jd_ai_daily_limit();
  v_used int;
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
    return json_build_object('allowed', false, 'used', coalesce(v_used, v_limit), 'limit', v_limit, 'remaining', 0,
      'resets_at', ((v_day + 1)::timestamp at time zone 'Asia/Kolkata'));
  end if;
  return json_build_object('allowed', true, 'used', v_used, 'limit', v_limit, 'remaining', greatest(v_limit - v_used, 0),
    'resets_at', ((v_day + 1)::timestamp at time zone 'Asia/Kolkata'));
end;
$$;

revoke all on function public.jd_ai_credits() from public, anon;
revoke all on function public.jd_use_ai_credit() from public, anon;
grant execute on function public.jd_ai_credits() to authenticated;
grant execute on function public.jd_use_ai_credit() to authenticated;

-- "Delete my account and data": removes the caller's sign-in. Every jd_* table row
-- (resumes, tailored resumes, job descriptions, profile, AI usage) is removed with it
-- through "on delete cascade".
create or replace function public.jd_delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.jd_delete_my_account() from public, anon;
grant execute on function public.jd_delete_my_account() to authenticated;

-- Usage tracking: a few anonymous-ish events (upload, tailor, download, errors) so you can see
-- where people drop off. People can only add their own events; only you (in the dashboard) can read them.
create table if not exists public.jd_events (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 40),
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.jd_events enable row level security;

drop policy if exists "jd_events_insert_own" on public.jd_events;
create policy "jd_events_insert_own" on public.jd_events
  for insert to authenticated with check (auth.uid() = user_id);

grant insert on public.jd_events to authenticated;
grant usage, select on sequence public.jd_events_id_seq to authenticated;

-- To see the funnel for the last 7 days, run:
--   select name, count(*) as times, count(distinct user_id) as people
--   from public.jd_events where created_at > now() - interval '7 days'
--   group by name order by times desc;
