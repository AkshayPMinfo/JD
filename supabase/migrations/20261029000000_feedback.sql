-- Feedback: "How was it?" after a download, and "Send feedback" in the sidebar.
-- People (including guests) can only add their own; only you (in the dashboard) can read it.
create table if not exists public.jd_feedback (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rating text check (rating in ('up', 'down')),
  comment text check (char_length(comment) <= 2000),
  place text not null default 'sidebar' check (char_length(place) <= 30),
  created_at timestamptz not null default now()
);

alter table public.jd_feedback enable row level security;

drop policy if exists "jd_feedback_insert_own" on public.jd_feedback;
create policy "jd_feedback_insert_own" on public.jd_feedback
  for insert to authenticated with check (auth.uid() = user_id);

grant insert on public.jd_feedback to authenticated;
grant usage, select on sequence public.jd_feedback_id_seq to authenticated;

-- To read feedback, newest first:
--   select f.created_at, u.email, f.rating, f.comment, f.place
--   from public.jd_feedback f left join auth.users u on u.id = f.user_id
--   order by f.created_at desc;
