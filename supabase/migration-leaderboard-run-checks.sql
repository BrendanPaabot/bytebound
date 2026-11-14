-- Stricter checks for leaderboard runs.
-- Run this once in the Supabase SQL editor. It replaces the submit function; the table and grants stay the same.
--
-- kills: runs can span several retries, so the cap is generous (the full game has 48 foes in 20 levels).
-- answers: every kill needs at least one answered question, so total answers can't be below the kill count.

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
