-- UNEM ISCAE — delegated supervisor permissions and student registrations
-- Apply after db/20261015090000_community_admin_reports_rooms_avatars.sql.
-- All authorization is checked by PostgreSQL/server APIs; hiding UI controls is not the security boundary.

create table if not exists public.supervisor_permissions (
  email text primary key,
  upload_files boolean not null default false,
  delete_files boolean not null default false,
  manage_whatsapp boolean not null default false,
  manage_announcements boolean not null default false,
  send_notifications boolean not null default false,
  view_analytics boolean not null default false,
  manage_document_types boolean not null default false,
  view_student_registrations boolean not null default false,
  manage_students boolean not null default false,
  manage_schedules boolean not null default false,
  manage_curriculum_subjects boolean not null default false,
  manage_platform_settings boolean not null default false,
  manage_file_order boolean not null default false,
  manage_results boolean not null default false
);

alter table public.supervisor_permissions add column if not exists upload_files boolean not null default false;
alter table public.supervisor_permissions add column if not exists delete_files boolean not null default false;
alter table public.supervisor_permissions add column if not exists manage_whatsapp boolean not null default false;
alter table public.supervisor_permissions add column if not exists manage_announcements boolean not null default false;
alter table public.supervisor_permissions add column if not exists send_notifications boolean not null default false;
alter table public.supervisor_permissions add column if not exists view_analytics boolean not null default false;
alter table public.supervisor_permissions add column if not exists manage_document_types boolean not null default false;
alter table public.supervisor_permissions add column if not exists view_student_registrations boolean not null default false;
alter table public.supervisor_permissions add column if not exists manage_students boolean not null default false;
alter table public.supervisor_permissions add column if not exists manage_schedules boolean not null default false;
alter table public.supervisor_permissions add column if not exists manage_curriculum_subjects boolean not null default false;
alter table public.supervisor_permissions add column if not exists manage_platform_settings boolean not null default false;
alter table public.supervisor_permissions add column if not exists manage_file_order boolean not null default false;
alter table public.supervisor_permissions add column if not exists manage_results boolean not null default false;
create unique index if not exists supervisor_permissions_email_uidx on public.supervisor_permissions(email);

alter table public.supervisor_permissions enable row level security;
revoke all on public.supervisor_permissions from public, anon;
grant select, insert, update, delete on public.supervisor_permissions to authenticated;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='supervisor_permissions' loop
    execute format('drop policy %I on public.supervisor_permissions', p.policyname);
  end loop;
end $$;

create or replace function public.has_supervisor_permission(p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare v_email text;
begin
  if auth.uid() is null then return false; end if;
  if coalesce(public.has_role(auth.uid(),'admin'),false) then return true; end if;
  if p_permission not in ('upload_files','delete_files','manage_whatsapp','manage_announcements','send_notifications','view_analytics','manage_document_types','view_student_registrations','manage_students','manage_schedules','manage_curriculum_subjects','manage_platform_settings','manage_file_order','manage_results') then
    return false;
  end if;
  v_email := lower(coalesce(auth.jwt()->>'email',''));
  if v_email = '' then return false; end if;
  if p_permission = 'view_student_registrations' then
    return exists (
      select 1 from public.supervisor_permissions sp
      where lower(sp.email)=v_email
        and (coalesce((to_jsonb(sp)->>'view_student_registrations')::boolean,false)
          or coalesce((to_jsonb(sp)->>'manage_students')::boolean,false))
    );
  end if;
  return exists (
    select 1 from public.supervisor_permissions sp
    where lower(sp.email)=v_email
      and coalesce((to_jsonb(sp)->>p_permission)::boolean,false)
  );
end;
$$;
revoke all on function public.has_supervisor_permission(text) from public, anon;
grant execute on function public.has_supervisor_permission(text) to authenticated;

create or replace function public.get_my_supervisor_permissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare v_email text; v_permissions jsonb;
begin
  if auth.uid() is null then return '{}'::jsonb; end if;
  if coalesce(public.has_role(auth.uid(),'admin'),false) then
    return jsonb_build_object(
      'upload_files',true,'delete_files',true,'manage_whatsapp',true,
      'manage_announcements',true,'send_notifications',true,'view_analytics',true,
      'manage_document_types',true,'view_student_registrations',true,'manage_students',true,
      'manage_schedules',true,'manage_curriculum_subjects',true,
      'manage_platform_settings',true,'manage_file_order',true,
      'manage_results',true
    );
  end if;
  v_email := lower(coalesce(auth.jwt()->>'email',''));
  select to_jsonb(sp) - 'email' into v_permissions
  from public.supervisor_permissions sp where lower(sp.email)=v_email limit 1;
  return coalesce(v_permissions,'{}'::jsonb);
end;
$$;
revoke all on function public.get_my_supervisor_permissions() from public, anon;
grant execute on function public.get_my_supervisor_permissions() to authenticated;

create policy supervisor_permissions_select_self_or_root
on public.supervisor_permissions for select to authenticated
using (coalesce(public.has_role(auth.uid(),'admin'),false) or lower(email)=lower(coalesce(auth.jwt()->>'email','')));
create policy supervisor_permissions_insert_root_only
on public.supervisor_permissions for insert to authenticated
with check (coalesce(public.has_role(auth.uid(),'admin'),false));
create policy supervisor_permissions_update_root_only
on public.supervisor_permissions for update to authenticated
using (coalesce(public.has_role(auth.uid(),'admin'),false))
with check (coalesce(public.has_role(auth.uid(),'admin'),false));
create policy supervisor_permissions_delete_root_only
on public.supervisor_permissions for delete to authenticated
using (coalesce(public.has_role(auth.uid(),'admin'),false));

-- Allow only explicitly delegated upload/delete operations on study documents.
grant select, insert, delete on public.documents to authenticated;
drop policy if exists supervisor_documents_read_for_upload_or_delete on public.documents;
create policy supervisor_documents_read_for_upload_or_delete
on public.documents for select to authenticated
using (public.has_supervisor_permission('upload_files') or public.has_supervisor_permission('delete_files') or public.has_supervisor_permission('manage_file_order') or public.has_supervisor_permission('view_analytics') or public.has_role(auth.uid(),'uploader'::public.app_role));
drop policy if exists supervisor_documents_upload on public.documents;
create policy supervisor_documents_upload
on public.documents for insert to authenticated
with check (public.has_supervisor_permission('upload_files') or public.has_role(auth.uid(),'uploader'::public.app_role));
drop policy if exists supervisor_documents_delete on public.documents;
create policy supervisor_documents_delete
on public.documents for delete to authenticated
using (public.has_supervisor_permission('delete_files'));

-- Legacy Supabase Storage PDFs keep their existing flows; grant deletion only by explicit permission.
drop policy if exists supervisor_delete_pdf_files on storage.objects;
create policy supervisor_delete_pdf_files
on storage.objects for delete to authenticated
using (bucket_id='pdf-files' and public.has_supervisor_permission('delete_files'));

-- Extend the existing manager policies for linked document types; public active reads remain unchanged.
drop policy if exists supervisor_manage_document_types on public.document_types;
create policy supervisor_manage_document_types
on public.document_types for all to authenticated
using (public.has_supervisor_permission('manage_document_types'))
with check (public.has_supervisor_permission('manage_document_types'));
drop policy if exists supervisor_manage_subject_document_types on public.subject_document_types;
create policy supervisor_manage_subject_document_types
on public.subject_document_types for all to authenticated
using (public.has_supervisor_permission('manage_document_types'))
with check (public.has_supervisor_permission('manage_document_types'));

-- Tables maintained by the existing application may be provisioned outside migrations;
-- attach additive policies only when each table is present, preserving public/read policies.
do $$
begin
  if to_regclass('public.whatsapp_groups') is not null then
    execute 'grant select, insert, update, delete on public.whatsapp_groups to authenticated';
    execute 'drop policy if exists supervisor_manage_whatsapp_groups on public.whatsapp_groups';
    execute 'create policy supervisor_manage_whatsapp_groups on public.whatsapp_groups for all to authenticated using (public.has_supervisor_permission(''manage_whatsapp'')) with check (public.has_supervisor_permission(''manage_whatsapp''))';
  end if;
  if to_regclass('public.announcements') is not null then
    execute 'grant select, insert, update, delete on public.announcements to authenticated';
    execute 'drop policy if exists supervisor_manage_announcements on public.announcements';
    execute 'create policy supervisor_manage_announcements on public.announcements for all to authenticated using (public.has_supervisor_permission(''manage_announcements'')) with check (public.has_supervisor_permission(''manage_announcements''))';
  end if;
  if to_regclass('public.analytics') is not null then
    execute 'grant select on public.analytics to authenticated';
    execute 'drop policy if exists supervisor_read_analytics on public.analytics';
    execute 'create policy supervisor_read_analytics on public.analytics for select to authenticated using (public.has_supervisor_permission(''view_analytics''))';
  end if;
  if to_regclass('public.study_schedules') is not null then
    execute 'grant select, insert, update, delete on public.study_schedules to authenticated';
    execute 'drop policy if exists supervisor_manage_study_schedules on public.study_schedules';
    execute 'create policy supervisor_manage_study_schedules on public.study_schedules for all to authenticated using (public.has_supervisor_permission(''manage_schedules'')) with check (public.has_supervisor_permission(''manage_schedules''))';
  end if;
  if to_regclass('public.curriculum_subject_overrides') is not null then
    execute 'grant select, insert, update, delete on public.curriculum_subject_overrides to authenticated';
    execute 'drop policy if exists supervisor_manage_curriculum_subjects on public.curriculum_subject_overrides';
    execute 'create policy supervisor_manage_curriculum_subjects on public.curriculum_subject_overrides for all to authenticated using (public.has_supervisor_permission(''manage_curriculum_subjects'')) with check (public.has_supervisor_permission(''manage_curriculum_subjects''))';
  end if;
  if to_regclass('public.common_subjects') is not null then
    execute 'grant select, insert, update, delete on public.common_subjects to authenticated';
    execute 'drop policy if exists supervisor_manage_common_subjects on public.common_subjects';
    execute 'create policy supervisor_manage_common_subjects on public.common_subjects for all to authenticated using (public.has_supervisor_permission(''manage_curriculum_subjects'')) with check (public.has_supervisor_permission(''manage_curriculum_subjects''))';
  end if;
  if to_regclass('public.master_subjects') is not null then
    execute 'grant select, insert, update, delete on public.master_subjects to authenticated';
    execute 'drop policy if exists supervisor_manage_master_subjects on public.master_subjects';
    execute 'create policy supervisor_manage_master_subjects on public.master_subjects for all to authenticated using (public.has_supervisor_permission(''manage_curriculum_subjects'')) with check (public.has_supervisor_permission(''manage_curriculum_subjects''))';
  end if;
  if to_regclass('public.push_notifications_log') is not null then
    execute 'grant select, insert on public.push_notifications_log to authenticated';
    execute 'drop policy if exists supervisor_read_push_notification_log on public.push_notifications_log';
    execute 'create policy supervisor_read_push_notification_log on public.push_notifications_log for select to authenticated using (public.has_supervisor_permission(''send_notifications''))';
  end if;
end $$;

alter table public.push_notifications_log add column if not exists expired integer not null default 0;

-- Notification managers may inspect recipients and remove tokens reported expired by providers.
grant select, delete on public.push_subscriptions to authenticated;
drop policy if exists supervisor_read_push_subscriptions on public.push_subscriptions;
create policy supervisor_read_push_subscriptions
on public.push_subscriptions for select to authenticated
using (public.has_supervisor_permission('send_notifications'));
drop policy if exists supervisor_delete_expired_push_subscriptions on public.push_subscriptions;
create policy supervisor_delete_expired_push_subscriptions
on public.push_subscriptions for delete to authenticated
using (public.has_supervisor_permission('send_notifications'));
grant select, delete on public.fcm_tokens to authenticated;
drop policy if exists supervisor_read_fcm_tokens on public.fcm_tokens;
create policy supervisor_read_fcm_tokens
on public.fcm_tokens for select to authenticated
using (public.has_supervisor_permission('send_notifications'));
drop policy if exists supervisor_delete_expired_fcm_tokens on public.fcm_tokens;
create policy supervisor_delete_expired_fcm_tokens
on public.fcm_tokens for delete to authenticated
using (public.has_supervisor_permission('send_notifications'));
grant select, insert on public.push_notifications_log to authenticated;
drop policy if exists supervisor_insert_push_notification_log on public.push_notifications_log;
create policy supervisor_insert_push_notification_log
on public.push_notifications_log for insert to authenticated
with check (public.has_supervisor_permission('send_notifications'));

-- The curriculum appearance settings are public-read but editable only by the matching capability.
alter table public.platform_settings add column if not exists value_text text;
grant select on public.platform_settings to anon, authenticated;
grant insert, update on public.platform_settings to authenticated;
drop policy if exists public_read_master_curriculum_settings on public.platform_settings;
create policy public_read_master_curriculum_settings
on public.platform_settings for select to anon, authenticated
using (key in ('master_enabled','master_schedule','results_mode','results_url'));
drop policy if exists supervisor_manage_platform_settings on public.platform_settings;
create policy supervisor_manage_platform_settings
on public.platform_settings for all to authenticated
using (
  (key in ('master_enabled','master_schedule') and public.has_supervisor_permission('manage_curriculum_subjects'))
  or (key='show_online_count' and public.has_supervisor_permission('manage_platform_settings'))
  or (key in ('results_mode','results_url') and public.has_supervisor_permission('manage_results'))
)
with check (
  (key in ('master_enabled','master_schedule') and public.has_supervisor_permission('manage_curriculum_subjects'))
  or (key='show_online_count' and public.has_supervisor_permission('manage_platform_settings'))
  or (key in ('results_mode','results_url') and public.has_supervisor_permission('manage_results'))
);

create or replace function public.reorder_documents(p_document_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare i integer;
begin
  if auth.uid() is null or not public.has_supervisor_permission('manage_file_order') then
    raise exception 'not authorized';
  end if;
  if p_document_ids is null or cardinality(p_document_ids)=0 then return; end if;
  for i in 1..cardinality(p_document_ids) loop
    update public.documents set sort_order=i*10 where id=p_document_ids[i];
  end loop;
end $$;
revoke all on function public.reorder_documents(uuid[]) from public;
grant execute on function public.reorder_documents(uuid[]) to authenticated;

create or replace function public.set_public_online_count(p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_enabled boolean;
begin
  if auth.uid() is null or not public.has_supervisor_permission('manage_platform_settings') then
    raise exception 'not authorized';
  end if;
  insert into public.platform_settings(key,value_boolean,updated_at)
  values ('show_online_count',coalesce(p_enabled,false),now())
  on conflict (key) do update set value_boolean=excluded.value_boolean,updated_at=now();
  select value_boolean into v_enabled from public.platform_settings where key='show_online_count';
  return coalesce(v_enabled,false);
end $$;
revoke all on function public.set_public_online_count(boolean) from public;
grant execute on function public.set_public_online_count(boolean) to authenticated;

create or replace function public.cleanup_expired_push_subscriptions(p_inactive_days integer default 90)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_deleted integer;
begin
  if auth.uid() is null or not public.has_supervisor_permission('send_notifications') then
    raise exception 'not authorized';
  end if;
  delete from public.push_subscriptions
  where last_seen_at < now() - make_interval(days => greatest(coalesce(p_inactive_days,90),1));
  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted,0);
end $$;
revoke all on function public.cleanup_expired_push_subscriptions(integer) from public;
grant execute on function public.cleanup_expired_push_subscriptions(integer) to authenticated;

create or replace function public.student_admin(p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a jsonb := coalesce(p_args, '{}'::jsonb);
  r jsonb; ex public.student_roster;
  v_spec text := upper(coalesce(a->>'spec','')); v_level text := upper(coalesce(a->>'level',''));
  v_n text; v_r text; v_nn text; v_rn text;
  c_new int := 0; c_up int := 0; c_same int := 0; c_skip int := 0; c_bad int := 0; c_auto int := 0; v_cnt int;
  v_q text; v_st text;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if p_action in ('stats','list','roster_list','session_stats') then
    if not public.has_supervisor_permission('view_student_registrations') then raise exception 'forbidden'; end if;
  elsif p_action in ('import','decide','delete','roster_clear') then
    if not public.has_supervisor_permission('manage_students') then raise exception 'forbidden'; end if;
  else
    raise exception 'unknown_action';
  end if;

  if p_action = 'import' then
    if v_spec not in ('BA','FC','TCM','GRH','SAE','IG','MASTER_FC','MASTER_IG') then raise exception 'bad_spec'; end if;
    if v_level not in ('L1','L2','L3','M1','M2') then raise exception 'bad_level'; end if;
    for r in select e.value from jsonb_array_elements(coalesce(a->'rows','[]'::jsonb)) e loop
      v_n := left(btrim(regexp_replace(coalesce(r->>'n',''), '\s+', ' ', 'g')), 80);
      v_r := left(btrim(coalesce(r->>'r','')), 30);
      v_nn := public.student_norm_name(v_n); v_rn := public.student_norm_reg(v_r);
      if v_nn = '' or char_length(v_rn) < 2 or char_length(v_n) < 3 then c_bad := c_bad + 1; continue; end if;
      select * into ex from student_roster where reg_no_norm = v_rn;
      if ex.id is null then
        insert into student_roster(spec, level, full_name, name_norm, reg_no, reg_no_norm) values (v_spec, v_level, v_n, v_nn, v_r, v_rn);
        c_new := c_new + 1;
      elsif public.student_level_rank(v_level) > public.student_level_rank(ex.level) then
        -- الطالب مكرر في مستويين → يُعتبر في المستوى الأعلى
        update student_roster set spec=v_spec, level=v_level, full_name=v_n, name_norm=v_nn, reg_no=v_r, updated_at=now() where id = ex.id;
        c_up := c_up + 1;
      elsif public.student_level_rank(v_level) = public.student_level_rank(ex.level) then
        update student_roster set spec=v_spec, full_name=v_n, name_norm=v_nn, reg_no=v_r, updated_at=now() where id = ex.id;
        c_same := c_same + 1;
      else
        c_skip := c_skip + 1;   -- موجود بالفعل في مستوى أعلى
      end if;
    end loop;
    -- مزامنة الحسابات المعتمدة من اللائحة (تغيّر المستوى/التخصص)
    update student_accounts ac set spec = ro.spec, level = ro.level
      from student_roster ro where ac.reg_no_norm = ro.reg_no_norm and ac.status = 'approved' and ac.source = 'roster'
      and (ac.spec is distinct from ro.spec or ac.level is distinct from ro.level);
    -- حسابات بانتظار الموافقة أصبحت في اللائحة → تُعتمد تلقائياً
    update student_accounts ac set status='approved', source='roster', spec=ro.spec, level=ro.level, full_name=ro.full_name, decided_at=now()
      from student_roster ro where ac.reg_no_norm = ro.reg_no_norm and ac.status = 'pending' and public.student_names_match(ac.name_norm, ro.name_norm);
    get diagnostics c_auto = row_count;
    return jsonb_build_object('added',c_new,'upgraded',c_up,'updated',c_same,'skipped_higher',c_skip,'invalid',c_bad,'auto_approved',c_auto);

  elsif p_action = 'session_stats' then
    return jsonb_build_object(
      'active_students', coalesce((select count(distinct account)::int from student_sessions where logout_at is null and last_seen > now()-interval '5 minutes'),0),
      'sessions', coalesce((select jsonb_agg(x order by x.login_at desc) from (
        select s.session_id, ac.full_name, ac.reg_no, ac.spec, ac.level, s.login_at, s.logout_at, s.last_seen
        from student_sessions s join student_accounts ac on ac.id=s.account
        order by s.login_at desc limit 300) x),'[]'::jsonb));

  elsif p_action = 'stats' then
    return jsonb_build_object(
      'roster', coalesce((select jsonb_agg(x order by x.spec, x.level) from (select spec, level, count(*)::int as n from student_roster group by spec, level) x), '[]'::jsonb),
      'accounts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*)::int as n from student_accounts group by status) y), '{}'::jsonb));

  elsif p_action = 'list' then
    v_st := coalesce(a->>'status','');
    v_q := btrim(coalesce(a->>'q',''));
    return coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select id, full_name, reg_no, spec, level, status, source, note, created_at, decided_at
      from student_accounts
      where (v_st = '' or status = v_st)
        and (v_q = '' or name_norm like '%' || public.student_norm_name(v_q) || '%' or reg_no_norm like '%' || public.student_norm_reg(v_q) || '%')
      order by created_at desc limit 300) x), '[]'::jsonb);

  elsif p_action = 'decide' then
    v_st := case when (a->>'approve')::boolean then 'approved' else 'rejected' end;
    if v_st = 'approved' and (v_spec not in ('BA','FC','TCM','GRH','SAE','IG','MASTER_FC','MASTER_IG') or v_level not in ('L1','L2','L3','M1','M2')) then
      raise exception 'bad_scope';
    end if;
    update student_accounts set status = v_st,
        spec = case when v_st = 'approved' then v_spec else spec end,
        level = case when v_st = 'approved' then v_level else level end,
        decided_at = now()
      where id = (a->>'id')::uuid;
    return '{}'::jsonb;

  elsif p_action = 'delete' then
    delete from community_profiles where token_hash in (select token_hash from student_devices where account=(a->>'id')::uuid);
    delete from student_accounts where id = (a->>'id')::uuid;   -- يحذف أجهزته أيضاً؛ يستطيع الطالب التسجيل من جديد
    return '{}'::jsonb;

  elsif p_action = 'roster_list' then
    v_q := btrim(coalesce(a->>'q',''));
    return coalesce((select jsonb_agg(x order by x.full_name) from (
      select id, full_name, reg_no, spec, level from student_roster
      where (v_spec = '' or spec = v_spec) and (v_level = '' or level = v_level)
        and (v_q = '' or name_norm like '%' || public.student_norm_name(v_q) || '%' or reg_no_norm like '%' || public.student_norm_reg(v_q) || '%')
      order by full_name limit 300) x), '[]'::jsonb);

  elsif p_action = 'roster_clear' then
    if v_spec = '' or v_level = '' then raise exception 'bad_scope'; end if;
    delete from student_roster where spec = v_spec and level = v_level;
    get diagnostics v_cnt = row_count;
    return jsonb_build_object('deleted', v_cnt);
  end if;
  raise exception 'unknown_action';
end $$;

revoke all on function public.student_admin(text,jsonb) from public;
grant execute on function public.student_admin(text,jsonb) to authenticated;

create or replace function public.student_session_admin(p_action text,p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_hash text; v_n int;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if p_action='list' and not public.has_supervisor_permission('view_student_registrations') then raise exception 'forbidden'; end if;
  if p_action='revoke' and not public.has_supervisor_permission('manage_students') then raise exception 'forbidden'; end if;
  if p_action not in ('list','revoke') then raise exception 'unknown_action'; end if;
  if p_action='list' then
    return jsonb_build_object(
      'active_students',coalesce((select count(distinct account)::int from public.student_sessions where logout_at is null and last_seen>now()-interval '5 minutes'),0),
      'sessions',coalesce((select jsonb_agg(x order by x.login_at desc) from (
        select s.session_id,s.device_type,ac.full_name,ac.reg_no,ac.spec,ac.level,s.login_at,s.logout_at,s.last_seen
        from public.student_sessions s join public.student_accounts ac on ac.id=s.account
      ) x),'[]'::jsonb));
  elsif p_action='revoke' then
    begin v_sid:=(coalesce(p_args,'{}'::jsonb)->>'session_id')::uuid; exception when others then raise exception 'bad_session'; end;
    select device_hash into v_hash from public.student_sessions where session_id=v_sid and logout_at is null;
    if v_hash is null then return jsonb_build_object('revoked',false); end if;
    update public.student_sessions set logout_at=now(),last_seen=now() where session_id=v_sid and logout_at is null;
    delete from public.student_devices where token_hash=v_hash;
    get diagnostics v_n=row_count;
    return jsonb_build_object('revoked',true);
  end if;
  raise exception 'unknown_action';
end $$;
revoke all on function public.student_session_admin(text,jsonb) from public;
grant execute on function public.student_session_admin(text,jsonb) to authenticated;
