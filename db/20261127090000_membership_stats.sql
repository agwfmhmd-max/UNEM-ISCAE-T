-- UNEM ISCAE — precise membership statistics for the supervisor dashboard.
-- Safe to rerun. Does not expose student rows; only aggregate counts.
create or replace function public.student_membership_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := public.community_academic_year();
  v_total int;
  v_pending int;
  v_approved int;
  v_rejected int;
  v_members int;
  v_by_spec jsonb;
  v_by_level jsonb;
begin
  perform public.student_card_admin_check();

  select count(*)::int into v_total from public.student_accounts;
  select count(*)::int into v_pending from public.student_accounts where status = 'pending';
  select count(*)::int into v_approved from public.student_accounts where status = 'approved';
  select count(*)::int into v_rejected from public.student_accounts where status = 'rejected';
  select count(*)::int into v_members
    from public.student_accounts
   where status = 'approved'
     and coalesce(card_enabled, false)
     and membership_year = v_year;

  select coalesce(jsonb_agg(jsonb_build_object('key', x.spec, 'count', x.n) order by x.spec), '[]'::jsonb)
    into v_by_spec
    from (
      select coalesce(nullif(spec,''),'غير محدد') as spec, count(*)::int as n
        from public.student_accounts
       where status = 'approved'
         and coalesce(card_enabled, false)
         and membership_year = v_year
       group by coalesce(nullif(spec,''),'غير محدد')
    ) x;

  select coalesce(jsonb_agg(jsonb_build_object('key', x.level, 'count', x.n) order by x.level), '[]'::jsonb)
    into v_by_level
    from (
      select coalesce(nullif(level,''),'غير محدد') as level, count(*)::int as n
        from public.student_accounts
       where status = 'approved'
         and coalesce(card_enabled, false)
         and membership_year = v_year
       group by coalesce(nullif(level,''),'غير محدد')
    ) x;

  return jsonb_build_object(
    'academic_year', v_year,
    'total_accounts', v_total,
    'pending_accounts', v_pending,
    'approved_accounts', v_approved,
    'rejected_accounts', v_rejected,
    'total_members', coalesce(v_members, 0),
    'by_specialization', v_by_spec,
    'by_level', v_by_level
  );
end;
$$;
revoke all on function public.student_membership_stats() from public, anon;
grant execute on function public.student_membership_stats() to authenticated;
notify pgrst, 'reload schema';
