-- UNEM ISCAE — membership coverage against the official roster.
-- A member is active when an official-roster row has either an enabled account card or a valid roster grant.

create or replace function public.student_registration_stats()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v_year int := public.community_academic_year();
begin
  if auth.uid() is null or (not public.has_role(auth.uid(),'admin'::app_role)
    and not public.has_supervisor_permission('view_student_registrations')) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'academic_year',v_year,
    'total_accounts',(select count(*)::int from public.student_roster),
    'pending_accounts',(select count(*)::int from public.student_accounts where status='pending'),
    'approved_accounts',(select count(*)::int from public.student_roster),
    'rejected_accounts',(select count(*)::int from public.student_accounts where status='rejected'),
    'active_cards',(select count(*)::int from public.student_accounts a where a.status='approved' and coalesce(a.card_enabled,false)) + (select count(*)::int from public.student_card_grants),
    'official_roster_total',(select count(*)::int from public.student_roster),
    'official_roster_members',(select count(*)::int from public.student_roster r where exists (select 1 from public.student_accounts a where a.reg_no_norm=r.reg_no_norm and a.status='approved' and coalesce(a.card_enabled,false)) or exists (select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm)),
    'members_without_account',(select count(*)::int from public.student_card_grants g where not exists (select 1 from public.student_accounts a where a.reg_no_norm=g.reg_no_norm)),
    'members_not_in_roster',(select count(*)::int from public.student_accounts a where a.status='approved' and coalesce(a.card_enabled,false) and not exists (select 1 from public.student_roster r where r.reg_no_norm=a.reg_no_norm)),
    'membership_rate',case when (select count(*) from public.student_roster)=0 then 0 else round(100.0*(select count(*) from public.student_roster r where exists (select 1 from public.student_accounts a where a.reg_no_norm=r.reg_no_norm and a.status='approved' and coalesce(a.card_enabled,false)) or exists (select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm))/(select count(*) from public.student_roster),2) end,
    'by_specialization',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'count',x.n) order by x.key) from (select coalesce(nullif(spec,''),'غير محدد') key,count(*)::int n from public.student_roster group by coalesce(nullif(spec,''),'غير محدد')) x),'[]'::jsonb),
    'by_level',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'count',x.n) order by x.key) from (select coalesce(nullif(level,''),'غير محدد') key,count(*)::int n from public.student_roster group by coalesce(nullif(level,''),'غير محدد')) x),'[]'::jsonb),
    'membership_by_specialization',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'members',x.members,'total',x.total,'rate',case when x.total=0 then 0 else round(100.0*x.members/x.total,2) end) order by x.key) from (select coalesce(nullif(r.spec,''),'غير محدد') key,count(*)::int total,count(*) filter (where exists (select 1 from public.student_accounts a where a.reg_no_norm=r.reg_no_norm and a.status='approved' and coalesce(a.card_enabled,false)) or exists (select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm))::int members from public.student_roster r group by coalesce(nullif(r.spec,''),'غير محدد')) x),'[]'::jsonb),
    'membership_by_level',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'members',x.members,'total',x.total,'rate',case when x.total=0 then 0 else round(100.0*x.members/x.total,2) end) order by x.key) from (select coalesce(nullif(r.level,''),'غير محدد') key,count(*)::int total,count(*) filter (where exists (select 1 from public.student_accounts a where a.reg_no_norm=r.reg_no_norm and a.status='approved' and coalesce(a.card_enabled,false)) or exists (select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm))::int members from public.student_roster r group by coalesce(nullif(r.level,''),'غير محدد')) x),'[]'::jsonb),
    'members_without_account_rows',coalesce((select jsonb_agg(jsonb_build_object('reg_no',z.reg_no,'full_name',z.full_name,'spec',z.spec,'level',z.level) order by z.spec,z.level,z.full_name) from (select r.reg_no,r.full_name,r.spec,r.level from public.student_card_grants g join public.student_roster r on r.reg_no_norm=g.reg_no_norm where not exists (select 1 from public.student_accounts a where a.reg_no_norm=g.reg_no_norm) order by r.spec,r.level,r.full_name limit 500) z),'[]'::jsonb),
    'members_not_in_roster_rows',coalesce((select jsonb_agg(jsonb_build_object('reg_no',z.reg_no,'full_name',z.full_name,'spec',z.spec,'level',z.level) order by z.spec,z.level,z.full_name) from (select a.reg_no,a.full_name,a.spec,a.level from public.student_accounts a where a.status='approved' and coalesce(a.card_enabled,false) and not exists (select 1 from public.student_roster r where r.reg_no_norm=a.reg_no_norm) order by a.spec,a.level,a.full_name limit 500) z),'[]'::jsonb)
  );
end $$;
revoke all on function public.student_registration_stats() from public, anon;
grant execute on function public.student_registration_stats() to authenticated;

create or replace function public.student_membership_stats()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare d jsonb;
begin
  perform public.student_card_admin_check();
  select public.student_registration_stats() into d;
  return d || jsonb_build_object(
    'total_members',coalesce((d->>'active_cards')::int,0),
    'by_specialization',coalesce(d->'membership_by_specialization','[]'::jsonb),
    'by_level',coalesce(d->'membership_by_level','[]'::jsonb)
  );
end $$;
revoke all on function public.student_membership_stats() from public, anon;
grant execute on function public.student_membership_stats() to authenticated;
notify pgrst,'reload schema';
