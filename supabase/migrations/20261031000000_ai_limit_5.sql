-- Daily AI limit: 5 a day signed in (was 3), 1 for guests
create or replace function public.jd_ai_daily_limit()
returns int
language sql
stable
as $$
  select case when coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then 1 else 5 end;
$$;
