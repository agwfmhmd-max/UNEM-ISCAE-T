-- غرف الخريجين Sortants Promo N: صلاحيات الدخول والرسائل والإشارات والبلاغات وقائمة المشرف، مع الترقية السنوية.
-- يعدّل community_api و community_member_suggestions بتصحيحات نصية دقيقة (تفشل المعاملة كاملة إن لم يتطابق أي نص).
create or replace function public.unem_patch_text(p_src text, p_old text, p_new text, p_count int) returns text
language plpgsql immutable as $$
declare v_c int;
begin
  v_c := (length(p_src) - length(replace(p_src, p_old, ''))) / greatest(length(p_old),1);
  if v_c <> p_count then raise exception 'patch mismatch (% found, % expected): %', v_c, p_count, left(p_old,80); end if;
  return replace(p_src, p_old, p_new);
end $$;

do $patch$
declare v text;
begin
  v := replace(pg_get_functiondef('public.community_api(text,text,jsonb)'::regprocedure), E'\r', '');
  v := public.unem_patch_text(v, $q$  if auth.uid() is not null then adm := coalesce(public.is_community_staff(), false); v_is_primary_admin$q$, $q$  perform public.student_rollover_if_needed();
  if auth.uid() is not null then adm := coalesce(public.is_community_staff(), false); v_is_primary_admin$q$, 1);
  v := public.unem_patch_text(v, $q$'enrollments', public.community_profile_enrollments(me.id),$q$, $q$'enrollments', public.community_profile_enrollments(me.id), 'promo', public.community_profile_promo(me.id), 'current_promo', public.community_current_promo(), 'academic_year', public.community_academic_year(),$q$, 1);
  v := public.unem_patch_text(v, $q$    if v_room in ('general','sortants') then null;
    elsif v_room in ('level:L1','level:L2','level:L3') then$q$, $q$    if v_room = 'sortants' then v_room := 'sortants:' || coalesce(public.community_profile_promo(me.id), public.community_current_promo()); end if;
    if v_room ~ '^sortants:[0-9]{1,3}$' and (substring(v_room from 10)::int > public.community_current_promo() or substring(v_room from 10)::int < 1) then raise exception 'bad_room'; end if;
    if v_room = 'general' then null;
    elsif v_room ~ '^sortants:[0-9]{1,3}$' then
      if not adm and not public.community_profile_in_promo(me.id, substring(v_room from 10)::int) and not exists(select 1 from community_room_moderators rm where rm.room=v_room and rm.profile=me.id) then raise exception 'forbidden'; end if;
    elsif v_room in ('level:L1','level:L2','level:L3') then$q$, 1);
  v := public.unem_patch_text(v, $q$          and (v_room in ('general','sortants')
            or (v_room like 'level:%'$q$, $q$          and (v_room = 'general'
            or (v_room like 'sortants:%' and public.community_profile_in_promo(cp.id,substring(v_room from 10)::int))
            or (v_room like 'level:%'$q$, 1);
  v := public.unem_patch_text(v, $q$v_room not in ('general','sortants','level:L1','level:L2','level:L3') and v_room !~ '^(spec:$q$, $q$v_room not in ('general','level:L1','level:L2','level:L3') and v_room !~ '^(sortants:[0-9]{1,3}|spec:$q$, 3);
  v := public.unem_patch_text(v, $q$        if v_room in ('general','sortants') then null;
        elsif v_room like 'level:%' then$q$, $q$        if v_room = 'general' then null;
        elsif v_room ~ '^sortants:[0-9]{1,3}$' then
          if not public.community_profile_in_promo(me.id,substring(v_room from 10)::int) then raise exception 'forbidden'; end if;
        elsif v_room like 'level:%' then$q$, 1);
  v := public.unem_patch_text(v, $q$union select 'sortants'$q$, $q$union select 'sortants:' || g.n::text from generate_series(17, greatest(public.community_current_promo(), 17)) g(n) union select distinct 'sortants:' || ac.promo::text from student_accounts ac where ac.promo is not null union select distinct m2.room from community_messages m2 where m2.room ~ '^sortants:[0-9]{1,3}$'$q$, 1);
  v := public.unem_patch_text(v, $q$case when r.room='general' then 'General'$q$, $q$case when r.room='general' then 'General'
               when r.room like 'sortants:%' then 'UNEM ISCAE Sortants Promo ' || substring(r.room from 10)$q$, 1);
  v := public.unem_patch_text(v, $q$  elsif p_action = 'group_new' then
    insert into community_groups(owner$q$, $q$  elsif p_action = 'group_new' then
    if public.community_profile_promo(me.id) is not null then raise exception 'forbidden'; end if;
    insert into community_groups(owner$q$, 1);
  execute v;

  v := replace(pg_get_functiondef('public.community_member_suggestions(text,text,text)'::regprocedure), E'\r', '');
  v := public.unem_patch_text(v, $q$  if v_room in ('general','sortants') then v_allowed:=true;
  elsif v_room in ('level:L1'$q$, $q$  if v_room = 'sortants' then v_room := 'sortants:' || coalesce(public.community_profile_promo(v_profile), public.community_current_promo()); end if;
  if v_room = 'general' then v_allowed:=true;
  elsif v_room ~ '^sortants:[0-9]{1,3}$' then
    v_allowed:=v_admin or public.community_profile_in_promo(v_profile,substring(v_room from 10)::int) or exists(select 1 from public.community_room_moderators rm where rm.room=v_room and rm.profile=v_profile);
  elsif v_room in ('level:L1'$q$, 1);
  v := public.unem_patch_text(v, $q$        and (v_room in ('general','sortants')
          or (v_room like 'level:%'$q$, $q$        and (v_room = 'general'
          or (v_room like 'sortants:%' and public.community_profile_in_promo((select cp.id from community_profiles cp where cp.account=sa.id),substring(v_room from 10)::int))
          or (v_room like 'level:%'$q$, 1);
  execute v;
end $patch$;

drop function public.unem_patch_text(text,text,text,int);


-- ترحيل غرفة الخريجين القديمة العامة إلى الدفعة 17 (الرسائل والمشرفون وقفل الغرفة)
alter table public.community_room_moderators drop constraint if exists community_room_moderators_room_check;
alter table public.community_room_settings drop constraint if exists community_room_settings_room_check;
update public.community_messages set room = 'sortants:17' where room = 'sortants';
update public.community_room_moderators set room = 'sortants:17' where room = 'sortants';
update public.community_room_settings set room = 'sortants:17' where room = 'sortants' and not exists (select 1 from public.community_room_settings s2 where s2.room = 'sortants:17');
delete from public.community_room_settings where room = 'sortants';
alter table public.community_room_moderators add constraint community_room_moderators_room_check check (
  room in ('general','level:L1','level:L2','level:L3') or room ~ '^(sortants:[0-9]{1,3}|spec:[A-Z0-9_]+|class:[A-Z0-9_]+:(L1|L2|L3|M1|M2)|group:[0-9a-fA-F-]{36})$'
);
alter table public.community_room_settings add constraint community_room_settings_room_check check (
  room in ('general','level:L1','level:L2','level:L3') or room ~ '^(sortants:[0-9]{1,3}|spec:[A-Z0-9_]+|class:[A-Z0-9_]+:(L1|L2|L3|M1|M2)|group:[0-9a-fA-F-]{36})$'
);
notify pgrst, 'reload schema';
