-- UNEM ISCAE — fix scheduled community visibility and hide-only schedules.
-- Apply after db/20261126090000_membership_enrollment_and_community_schedule.sql.
-- Safe to rerun; retains the existing table, RPC signatures, authorization, and grants.

create or replace function public.community_visibility(p_year int default public.community_academic_year())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.community_visibility_schedule;
  v_year int := coalesce(p_year, public.community_academic_year());
  v_now timestamptz := now();
  v_visible boolean := false;
begin
  select * into s
    from public.community_visibility_schedule
    where academic_year = v_year;

  -- A null show_at with a future hide_at means "visible now, hide at hide_at".
  -- A missing schedule or both timestamps null remains hidden.
  v_visible := (s.show_at is not null and v_now >= s.show_at)
    or (s.show_at is null and s.hide_at is not null);
  v_visible := v_visible and (s.hide_at is null or v_now < s.hide_at);

  return jsonb_build_object(
    'academic_year', v_year,
    'show_at', s.show_at,
    'hide_at', s.hide_at,
    'server_now', v_now,
    'visible', coalesce(v_visible, false)
  );
end;
$$;

create or replace function public.community_visibility_set(
  p_year int,
  p_show_at timestamptz,
  p_hide_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2200
    or (p_show_at is null and p_hide_at is null)
    or (p_show_at is not null and p_hide_at is not null and p_hide_at <= p_show_at) then
    raise exception 'bad_schedule';
  end if;

  insert into public.community_visibility_schedule(academic_year, show_at, hide_at, updated_at, updated_by)
  values (p_year, p_show_at, p_hide_at, now(), auth.uid())
  on conflict (academic_year) do update
    set show_at = excluded.show_at,
        hide_at = excluded.hide_at,
        updated_at = now(),
        updated_by = auth.uid();

  return public.community_visibility(p_year);
end;
$$;

revoke all on function public.community_visibility(int) from public;
grant execute on function public.community_visibility(int) to anon, authenticated;
revoke all on function public.community_visibility_set(int, timestamptz, timestamptz) from public, anon;
grant execute on function public.community_visibility_set(int, timestamptz, timestamptz) to authenticated;
notify pgrst, 'reload schema';
