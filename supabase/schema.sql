create table if not exists public.leaderboard_entries (
  id bigint generated always as identity primary key,
  run_id uuid not null unique,
  player_name text not null check (char_length(btrim(player_name)) between 1 and 24),
  kills integer not null check (kills between 0 and 1000),
  correct_answers integer not null check (correct_answers between 0 and 50000),
  total_answers integer not null check (
    total_answers between 0 and 50000
    and correct_answers <= total_answers
  ),
  accuracy integer generated always as (
    case
      when total_answers = 0 then 0
      else floor(100.0 * correct_answers / total_answers)::integer
    end
  ) stored,
  score integer generated always as (
    kills * 100
    + correct_answers * 10
    + case
        when total_answers = 0 then 0
        else floor(100.0 * correct_answers / total_answers)::integer
      end
  ) stored,
  submitted_at timestamptz not null default now()
);

create index if not exists leaderboard_entries_rank_idx
  on public.leaderboard_entries (score desc, correct_answers desc, kills desc, submitted_at asc);

alter table public.leaderboard_entries enable row level security;

drop policy if exists "Leaderboard entries are public to read"
  on public.leaderboard_entries;
create policy "Leaderboard entries are public to read"
  on public.leaderboard_entries
  for select
  to anon, authenticated
  using (true);

revoke all on public.leaderboard_entries from public, anon, authenticated;
grant select on public.leaderboard_entries to anon, authenticated;

create or replace function public.submit_leaderboard_run(
  p_run_id uuid,
  p_player_name text,
  p_kills integer,
  p_correct_answers integer,
  p_total_answers integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_run_id is null
    or p_player_name is null
    or char_length(btrim(p_player_name)) not between 1 and 24
    or p_kills is null
    or p_kills not between 0 and 200
    or p_correct_answers is null
    or p_correct_answers not between 0 and 50000
    or p_total_answers is null
    or p_total_answers not between 0 and 50000
    or p_correct_answers > p_total_answers
    or p_total_answers < p_kills
  then
    raise exception 'Invalid leaderboard run data.';
  end if;

  insert into public.leaderboard_entries (
    run_id,
    player_name,
    kills,
    correct_answers,
    total_answers
  )
  values (
    p_run_id,
    btrim(p_player_name),
    p_kills,
    p_correct_answers,
    p_total_answers
  )
  on conflict (run_id) do nothing;
end;
$$;

revoke all on function public.submit_leaderboard_run(uuid, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.submit_leaderboard_run(uuid, text, integer, integer, integer)
  to anon, authenticated;
