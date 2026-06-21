-- Auralis MVP Supabase schema.
-- Safe for an existing Supabase project because it only creates app-specific jd_* objects.
-- It does not alter, drop, recreate, or rename existing public.users, public.profiles,
-- public.job_descriptions, auth.users triggers, existing policies, or existing functions.

create extension if not exists pgcrypto;

create table if not exists public.jd_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jd_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text,
  location text,
  phone text,
  linkedin text,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jd_job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  job_role text not null,
  description text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jd_resumes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  resume_data jsonb not null,
  file_base64 text,
  original_file_name text,
  file_type text,
  extracted_text text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jd_tailored_resumes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  job_title text not null,
  saved_at text not null,
  resume_data jsonb not null,
  original_resume_data jsonb,
  original_job_description text,
  applied_suggestions_count integer not null default 0,
  ats_score integer,
  match_percentage integer,
  improvements jsonb not null default '[]'::jsonb,
  missing_requirements jsonb not null default '[]'::jsonb,
  missing_qualifications jsonb not null default '[]'::jsonb,
  diff_added jsonb not null default '[]'::jsonb,
  diff_modified jsonb not null default '[]'::jsonb,
  diff_unchanged jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jd_job_descriptions_user_created_idx
  on public.jd_job_descriptions (user_id, created_at desc);

create index if not exists jd_resumes_user_created_idx
  on public.jd_resumes (user_id, created_at desc);

create index if not exists jd_tailored_resumes_user_created_idx
  on public.jd_tailored_resumes (user_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'jd_set_updated_at'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    create function public.jd_set_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'jd_users_set_updated_at') then
    create trigger jd_users_set_updated_at
    before update on public.jd_users
    for each row execute function public.jd_set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'jd_profiles_set_updated_at') then
    create trigger jd_profiles_set_updated_at
    before update on public.jd_profiles
    for each row execute function public.jd_set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'jd_job_descriptions_set_updated_at') then
    create trigger jd_job_descriptions_set_updated_at
    before update on public.jd_job_descriptions
    for each row execute function public.jd_set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'jd_resumes_set_updated_at') then
    create trigger jd_resumes_set_updated_at
    before update on public.jd_resumes
    for each row execute function public.jd_set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'jd_tailored_resumes_set_updated_at') then
    create trigger jd_tailored_resumes_set_updated_at
    before update on public.jd_tailored_resumes
    for each row execute function public.jd_set_updated_at();
  end if;
end $$;

alter table public.jd_users enable row level security;
alter table public.jd_profiles enable row level security;
alter table public.jd_job_descriptions enable row level security;
alter table public.jd_resumes enable row level security;
alter table public.jd_tailored_resumes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_users'
      and policyname = 'jd_users_select_own'
  ) then
    create policy "jd_users_select_own"
    on public.jd_users for select
    to authenticated
    using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_users'
      and policyname = 'jd_users_insert_own'
  ) then
    create policy "jd_users_insert_own"
    on public.jd_users for insert
    to authenticated
    with check (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_users'
      and policyname = 'jd_users_update_own'
  ) then
    create policy "jd_users_update_own"
    on public.jd_users for update
    to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_profiles'
      and policyname = 'jd_profiles_select_own'
  ) then
    create policy "jd_profiles_select_own"
    on public.jd_profiles for select
    to authenticated
    using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_profiles'
      and policyname = 'jd_profiles_insert_own'
  ) then
    create policy "jd_profiles_insert_own"
    on public.jd_profiles for insert
    to authenticated
    with check (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_profiles'
      and policyname = 'jd_profiles_update_own'
  ) then
    create policy "jd_profiles_update_own"
    on public.jd_profiles for update
    to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_profiles'
      and policyname = 'jd_profiles_delete_own'
  ) then
    create policy "jd_profiles_delete_own"
    on public.jd_profiles for delete
    to authenticated
    using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_job_descriptions'
      and policyname = 'jd_job_descriptions_select_own'
  ) then
    create policy "jd_job_descriptions_select_own"
    on public.jd_job_descriptions for select
    to authenticated
    using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_resumes'
      and policyname = 'jd_resumes_select_own'
  ) then
    create policy "jd_resumes_select_own"
    on public.jd_resumes for select
    to authenticated
    using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_resumes'
      and policyname = 'jd_resumes_insert_own'
  ) then
    create policy "jd_resumes_insert_own"
    on public.jd_resumes for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_resumes'
      and policyname = 'jd_resumes_update_own'
  ) then
    create policy "jd_resumes_update_own"
    on public.jd_resumes for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_resumes'
      and policyname = 'jd_resumes_delete_own'
  ) then
    create policy "jd_resumes_delete_own"
    on public.jd_resumes for delete
    to authenticated
    using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_tailored_resumes'
      and policyname = 'jd_tailored_resumes_select_own'
  ) then
    create policy "jd_tailored_resumes_select_own"
    on public.jd_tailored_resumes for select
    to authenticated
    using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_tailored_resumes'
      and policyname = 'jd_tailored_resumes_insert_own'
  ) then
    create policy "jd_tailored_resumes_insert_own"
    on public.jd_tailored_resumes for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_tailored_resumes'
      and policyname = 'jd_tailored_resumes_update_own'
  ) then
    create policy "jd_tailored_resumes_update_own"
    on public.jd_tailored_resumes for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_tailored_resumes'
      and policyname = 'jd_tailored_resumes_delete_own'
  ) then
    create policy "jd_tailored_resumes_delete_own"
    on public.jd_tailored_resumes for delete
    to authenticated
    using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_job_descriptions'
      and policyname = 'jd_job_descriptions_insert_own'
  ) then
    create policy "jd_job_descriptions_insert_own"
    on public.jd_job_descriptions for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_job_descriptions'
      and policyname = 'jd_job_descriptions_update_own'
  ) then
    create policy "jd_job_descriptions_update_own"
    on public.jd_job_descriptions for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jd_job_descriptions'
      and policyname = 'jd_job_descriptions_delete_own'
  ) then
    create policy "jd_job_descriptions_delete_own"
    on public.jd_job_descriptions for delete
    to authenticated
    using (auth.uid() = user_id);
  end if;
end $$;
