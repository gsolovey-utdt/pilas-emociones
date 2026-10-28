-- Run once in the SQL editor of the SAME Supabase project as two-armed-bandit.
-- Extra CHECK constraints reject malformed partitions even outside the app.
create function public.pilas_valid_words(value jsonb, partitioned boolean)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  expected text[] := array['alegría','entusiasmo','orgullo','calma','alivio','cariño','miedo','ansiedad',
    'enojo','asco','tristeza','aburrimiento','culpa','vergüenza','celos','sorpresa','nostalgia'];
  actual text[] := array[]::text[];
  part jsonb;
  word jsonb;
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if partitioned then
    if jsonb_array_length(value) not between 2 and 6 then return false; end if;
    for part in select jsonb_array_elements(value) loop
      if jsonb_typeof(part) is distinct from 'array' then return false; end if;
      if jsonb_array_length(part) = 0 then return false; end if;
      for word in select jsonb_array_elements(part) loop
        if jsonb_typeof(word) is distinct from 'string' then return false; end if;
        actual := array_append(actual, word #>> '{}');
      end loop;
    end loop;
  else
    for word in select jsonb_array_elements(value) loop
      if jsonb_typeof(word) is distinct from 'string' then return false; end if;
      actual := array_append(actual, word #>> '{}');
    end loop;
  end if;
  return cardinality(actual) = 17
    and (select count(distinct w) from unnest(actual) w) = 17
    and actual <@ expected;
end;
$$;

create table public.pilas_responses (
  id uuid default gen_random_uuid() primary key,
  session_code text not null check (length(btrim(session_code)) > 0),
  participant_id uuid not null,
  groups jsonb not null check (public.pilas_valid_words(groups, true)),
  n_groups integer not null check (n_groups between 2 and 6 and n_groups = jsonb_array_length(groups)),
  word_order jsonb not null check (public.pilas_valid_words(word_order, false)),
  criterio text check (criterio is null or (length(btrim(criterio)) between 2 and 120 and criterio !~ E'[\\r\\n]')),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz default now(),
  unique (session_code, participant_id)
);
create index on public.pilas_responses (session_code);
alter table public.pilas_responses enable row level security;
create policy "anon_insert" on public.pilas_responses for insert to anon with check (true);
create policy "anon_select" on public.pilas_responses for select to anon using (true);
grant select, insert on public.pilas_responses to anon;
revoke update, delete on public.pilas_responses from anon;
