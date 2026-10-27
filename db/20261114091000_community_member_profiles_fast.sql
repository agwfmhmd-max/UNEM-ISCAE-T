-- أعضاء غرف المستوى والفصل بالاستعلام المجمّع (كان يحسب نطاق كل طالب على حدة: نحو ثانية لكل 2000 طالب).
create or replace function public.community_room_member_profiles(p_room text) returns table(p uuid)
language plpgsql stable security definer set search_path = public as $$
declare v_ay int := public.community_academic_year();
begin
  if p_room = 'general' then
    return query select cp.id from community_profiles cp join student_accounts a on a.id = cp.account and a.status = 'approved' where not cp.banned;
  elsif p_room ~ '^sortants:[0-9]{1,3}$' then
    return query select cp.id from community_profiles cp join student_accounts a on a.id = cp.account and a.status = 'approved'
      where not cp.banned and a.promo = substring(p_room from 10)::int;
  elsif p_room ~ '^level:(L1|L2|L3)$' then
    return query select cp.id from community_profiles cp join student_accounts a on a.id = cp.account and a.status = 'approved'
      where not cp.banned and a.promo is null and (
        a.level = substring(p_room from 7)
        or exists (select 1 from student_account_enrollments e where e.account = a.id and e.level = substring(p_room from 7) and e.academic_year = v_ay)
        or exists (select 1 from student_roster_extra x where x.reg_no_norm = a.reg_no_norm and x.level = substring(p_room from 7) and x.academic_year = v_ay));
  elsif p_room ~ '^class:[A-Z0-9_]+:(L1|L2|L3|M1|M2)$' then
    return query select cp.id from community_profiles cp join student_accounts a on a.id = cp.account and a.status = 'approved'
      where not cp.banned and a.promo is null and (
        (a.spec = split_part(p_room,':',2) and a.level = split_part(p_room,':',3))
        or exists (select 1 from student_account_enrollments e where e.account = a.id and e.spec = split_part(p_room,':',2) and e.level = split_part(p_room,':',3) and e.academic_year = v_ay)
        or exists (select 1 from student_roster_extra x where x.reg_no_norm = a.reg_no_norm and x.spec = split_part(p_room,':',2) and x.level = split_part(p_room,':',3) and x.academic_year = v_ay));
  elsif p_room like 'spec:%' then
    return query select cp.id from community_profiles cp join student_accounts a on a.id = cp.account and a.status = 'approved'
      where not cp.banned and public.community_profile_has_spec(cp.id, substring(p_room from 6));
  elsif p_room ~ '^group:[0-9a-fA-F-]{36}$' then
    return query select m.profile from community_members m join community_profiles cp on cp.id = m.profile
      where m.grp = substring(p_room from 7)::uuid and not cp.banned;
  elsif p_room ~ '^dm:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$' then
    return query select cp.id from community_profiles cp where cp.id::text in (split_part(p_room,':',2), split_part(p_room,':',3)) and not cp.banned;
  end if;
  return query select rm.profile from community_room_moderators rm join community_profiles cp on cp.id = rm.profile where rm.room = p_room and not cp.banned;
end $$;
revoke all on function public.community_room_member_profiles(text) from public, anon, authenticated;
