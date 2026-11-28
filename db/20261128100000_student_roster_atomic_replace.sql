-- استبدال آمن للائحة المستوى/التخصص: التجهيز على دفعات، ثم تحقق ومعالجة ذرية.
-- لا تُحذف القائمة القديمة حتى يكتمل الرفع، ولا تُحذف حسابات الطلاب أو أجهزتهم.
create table if not exists public.student_roster_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  spec text not null,
  level text not null,
  promo int,
  academic_year int not null,
  expected_rows int not null check (expected_rows between 1 and 50000),
  status text not null default 'open' check (status in ('open','completed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.student_roster_import_rows (
  batch_id uuid not null references public.student_roster_import_batches(id) on delete cascade,
  row_no int not null,
  full_name text not null default '',
  reg_no text not null default '',
  primary key (batch_id,row_no)
);
alter table public.student_roster_import_batches enable row level security;
alter table public.student_roster_import_rows enable row level security;
drop policy if exists student_roster_import_batches_none on public.student_roster_import_batches;
create policy student_roster_import_batches_none on public.student_roster_import_batches for all to anon,authenticated using(false) with check(false);
drop policy if exists student_roster_import_rows_none on public.student_roster_import_rows;
create policy student_roster_import_rows_none on public.student_roster_import_rows for all to anon,authenticated using(false) with check(false);
revoke all on public.student_roster_import_batches, public.student_roster_import_rows from public, anon, authenticated;
grant select,insert,update,delete on public.student_roster_import_batches, public.student_roster_import_rows to service_role;

create or replace function public.student_roster_replace_admin(p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a jsonb := coalesce(p_args,'{}'::jsonb);
  v_uid uuid := auth.uid(); v_id uuid; v_batch public.student_roster_import_batches;
  v_spec text := upper(btrim(coalesce(a->>'spec','')));
  v_level text := upper(btrim(coalesce(a->>'level','')));
  v_promo int; v_year int := public.community_academic_year();
  v_rows jsonb; v_offset int; v_count int; v_invalid int; v_conflicts int; v_duplicates int := 0;
  v_added int := 0; v_extras int := 0; v_replaced int := 0; v_auto int := 0;
begin
  if v_uid is null or not coalesce(public.has_role(v_uid,'admin'),false) then raise exception 'forbidden'; end if;

  if p_action = 'begin' then
    if v_spec not in ('BA','FC','TCM','GRH','SAE','IG','MASTER_FC','MASTER_IG') then raise exception 'bad_spec'; end if;
    if v_level = 'S' then
      begin v_promo := nullif(btrim(coalesce(a->>'promo','')),'')::int; exception when others then raise exception 'bad_promo'; end;
      v_promo := coalesce(v_promo,public.community_current_promo());
      if v_promo < 1 or v_promo > public.community_current_promo() then raise exception 'bad_promo'; end if;
      v_level := case when v_spec like 'MASTER\_%' then 'M2' else 'L3' end;
    elsif v_level not in ('L1','L2','L3','M1','M2') or (v_spec like 'MASTER\_%' and v_level not in ('M1','M2')) or (v_spec not like 'MASTER\_%' and v_level not in ('L1','L2','L3')) then
      raise exception 'bad_level';
    end if;
    begin v_count := (a->>'expected_rows')::int; exception when others then raise exception 'bad_row_count'; end;
    if v_count is null or v_count < 1 or v_count > 50000 then raise exception 'bad_row_count'; end if;
    perform public.student_rollover_if_needed();
    delete from public.student_roster_import_batches where status='open' and created_at < now()-interval '24 hours';
    insert into public.student_roster_import_batches(created_by,spec,level,promo,academic_year,expected_rows)
    values(v_uid,v_spec,v_level,v_promo,v_year,v_count) returning * into v_batch;
    return jsonb_build_object('upload_id',v_batch.id,'expected_rows',v_count,'academic_year',v_year);

  elsif p_action = 'chunk' then
    begin v_id := (a->>'upload_id')::uuid; exception when others then raise exception 'bad_upload_id'; end;
    select * into v_batch from public.student_roster_import_batches where id=v_id and created_by=v_uid for update;
    if v_batch.id is null or v_batch.status <> 'open' then raise exception 'upload_not_open'; end if;
    v_rows := coalesce(a->'rows','[]'::jsonb);
    if jsonb_typeof(v_rows) is distinct from 'array' then raise exception 'bad_chunk'; end if;
    if jsonb_array_length(v_rows) > 400 then raise exception 'bad_chunk'; end if;
    begin v_offset := (a->>'offset')::int; exception when others then raise exception 'bad_offset'; end;
    if v_offset is null or v_offset < 0 or v_offset + jsonb_array_length(v_rows) > v_batch.expected_rows then raise exception 'bad_offset'; end if;
    insert into public.student_roster_import_rows(batch_id,row_no,full_name,reg_no)
    select v_id,v_offset+(e.ordinality::int)-1,
           left(btrim(regexp_replace(coalesce(e.value->>'n',''),'\s+',' ','g')),160),
           left(btrim(coalesce(e.value->>'r','')),60)
      from jsonb_array_elements(v_rows) with ordinality e(value,ordinality)
    on conflict (batch_id,row_no) do update set full_name=excluded.full_name,reg_no=excluded.reg_no;
    select count(*)::int into v_count from public.student_roster_import_rows where batch_id=v_id;
    return jsonb_build_object('received_rows',v_count,'expected_rows',v_batch.expected_rows);

  elsif p_action = 'abort' then
    begin v_id := (a->>'upload_id')::uuid; exception when others then raise exception 'bad_upload_id'; end;
    delete from public.student_roster_import_batches where id=v_id and created_by=v_uid and status='open';
    return jsonb_build_object('aborted',true);

  elsif p_action = 'finish' then
    begin v_id := (a->>'upload_id')::uuid; exception when others then raise exception 'bad_upload_id'; end;
    select * into v_batch from public.student_roster_import_batches where id=v_id and created_by=v_uid for update;
    if v_batch.id is null then raise exception 'upload_not_found'; end if;
    if v_batch.status='completed' then return coalesce(v_batch.result,'{}'::jsonb); end if;
    select count(*)::int into v_count from public.student_roster_import_rows where batch_id=v_id;
    if v_count <> v_batch.expected_rows or exists(select 1 from public.student_roster_import_rows where batch_id=v_id and row_no not between 0 and v_batch.expected_rows-1) then
      return jsonb_build_object('error','incomplete_upload','received_rows',v_count,'expected_rows',v_batch.expected_rows);
    end if;
    select count(*)::int into v_invalid from public.student_roster_import_rows r
     where r.batch_id=v_id and (char_length(btrim(regexp_replace(r.full_name,'\s+',' ','g'))) < 3 or public.student_norm_name(r.full_name)='' or char_length(public.student_norm_reg(r.reg_no)) < 2);
    if v_invalid > 0 then return jsonb_build_object('error','invalid_rows','invalid',v_invalid,'message','اللائحة الجديدة تحتوي صفوفاً غير صالحة؛ لم يتم استبدال اللائحة الحالية.'); end if;
    select count(*)::int into v_conflicts from public.student_roster_import_rows x join public.student_roster_import_rows y
      on x.batch_id=y.batch_id and public.student_norm_reg(x.reg_no)=public.student_norm_reg(y.reg_no) and x.row_no<y.row_no
     where x.batch_id=v_id and not public.student_names_match(public.student_norm_name(x.full_name),public.student_norm_name(y.full_name));
    if v_conflicts > 0 then return jsonb_build_object('error','duplicate_name_conflict','conflicts',v_conflicts,'message','يوجد رقم تسجيل مكرر بأسماء مختلفة؛ لم يتم استبدال اللائحة الحالية.'); end if;

    perform pg_advisory_xact_lock(hashtext('student-roster-scope:'||v_batch.spec||':'||v_batch.level||':'||coalesce(v_batch.promo::text,'')));
    perform public.student_rollover_if_needed();
    create temporary table _sr_affected(reg_no_norm text primary key) on commit drop;
    insert into _sr_affected
    select r.reg_no_norm from public.student_roster r where r.spec=v_batch.spec and
      ((v_batch.promo is null and r.promo is null and r.level=v_batch.level) or (v_batch.promo is not null and r.promo=v_batch.promo))
    union
    select x.reg_no_norm from public.student_roster_extra x where x.spec=v_batch.spec and x.academic_year=v_year and v_batch.promo is null and x.level=v_batch.level
    on conflict do nothing;
    select count(*)::int into v_replaced from _sr_affected;
    select (v_batch.expected_rows-count(distinct public.student_norm_reg(reg_no)))::int into v_duplicates
      from public.student_roster_import_rows where batch_id=v_id;
    insert into _sr_affected
    select distinct public.student_norm_reg(r.reg_no) from public.student_roster_import_rows r where r.batch_id=v_id
    on conflict do nothing;
    perform pg_advisory_xact_lock(hashtext('student-roster-reg:'||x.reg_no_norm))
      from _sr_affected x order by x.reg_no_norm;

    create temporary table _sr_scopes(
      reg_no_norm text not null,spec text not null,level text not null,promo int,academic_year int not null,
      reg_no text not null,full_name text not null,name_norm text not null,
      unique nulls not distinct(reg_no_norm,spec,level,promo,academic_year)
    ) on commit drop;
    insert into _sr_scopes
    select r.reg_no_norm,r.spec,r.level,r.promo,coalesce(r.academic_year,v_year),r.reg_no,r.full_name,r.name_norm
      from public.student_roster r join _sr_affected a using(reg_no_norm) where coalesce(r.academic_year,v_year)=v_year
    on conflict do nothing;
    insert into _sr_scopes
    select x.reg_no_norm,x.spec,x.level,null,x.academic_year,r.reg_no,r.full_name,r.name_norm
      from public.student_roster_extra x join public.student_roster r using(reg_no_norm)
      join _sr_affected a using(reg_no_norm) where x.academic_year=v_year
    on conflict do nothing;
    create temporary table _sr_removed_scope on commit drop as
    select s.reg_no_norm,s.name_norm from _sr_scopes s where s.spec=v_batch.spec and
      ((v_batch.promo is null and s.promo is null and s.level=v_batch.level) or (v_batch.promo is not null and s.promo=v_batch.promo));
    delete from _sr_scopes s where s.spec=v_batch.spec and
      ((v_batch.promo is null and s.promo is null and s.level=v_batch.level) or (v_batch.promo is not null and s.promo=v_batch.promo));
    insert into _sr_scopes(reg_no_norm,spec,level,promo,academic_year,reg_no,full_name,name_norm)
    select distinct on(public.student_norm_reg(r.reg_no)) public.student_norm_reg(r.reg_no),v_batch.spec,v_batch.level,v_batch.promo,v_year,
           left(btrim(r.reg_no),30),left(btrim(regexp_replace(r.full_name,'\s+',' ','g')),80),public.student_norm_name(r.full_name)
      from public.student_roster_import_rows r where r.batch_id=v_id
     order by public.student_norm_reg(r.reg_no),r.row_no
    on conflict do nothing;

    delete from public.student_roster_extra x using _sr_affected a where x.reg_no_norm=a.reg_no_norm and x.academic_year=v_year;
    delete from public.student_roster r using _sr_affected a where r.reg_no_norm=a.reg_no_norm;
    insert into public.student_roster(spec,level,promo,academic_year,full_name,name_norm,reg_no,reg_no_norm)
    select distinct on(s.reg_no_norm) s.spec,s.level,s.promo,s.academic_year,s.full_name,s.name_norm,s.reg_no,s.reg_no_norm
      from _sr_scopes s join _sr_affected a using(reg_no_norm)
     order by s.reg_no_norm,(public.student_level_rank(s.level)+case when s.promo is not null then 10 else 0 end) desc,
              s.spec,s.level,s.promo nulls first;
    get diagnostics v_added = row_count;
    insert into public.student_roster_extra(reg_no_norm,spec,level,academic_year)
    select distinct s.reg_no_norm,s.spec,s.level,v_year from _sr_scopes s join _sr_affected a using(reg_no_norm)
     where s.promo is null and not exists(select 1 from public.student_roster p where p.reg_no_norm=s.reg_no_norm and p.spec=s.spec and p.level=s.level and p.promo is null)
    on conflict do nothing;
    get diagnostics v_extras = row_count;

    -- الحسابات والملفات والأجهزة لا تُحذف؛ مزامنة نطاقها من السجل المعاد بناؤه فقط.
    update public.student_accounts ac set spec=r.spec,level=r.level,promo=r.promo
      from public.student_roster r join _sr_affected a using(reg_no_norm)
     where ac.reg_no_norm=r.reg_no_norm and ac.status='approved'
       and (ac.source='roster' or public.student_names_match(ac.name_norm,r.name_norm))
       and (ac.spec is distinct from r.spec or ac.level is distinct from r.level or ac.promo is distinct from r.promo);
    update public.student_accounts ac set spec=null,level=null,promo=null
      from _sr_affected a where ac.reg_no_norm=a.reg_no_norm and ac.status='approved'
        and not exists(select 1 from public.student_roster r where r.reg_no_norm=ac.reg_no_norm)
        and (ac.source='roster' or exists(select 1 from _sr_removed_scope old where old.reg_no_norm=ac.reg_no_norm and public.student_names_match(ac.name_norm,old.name_norm)))
        and (ac.spec=v_batch.spec and (ac.level=v_batch.level or ac.promo=v_batch.promo));
    delete from public.student_account_enrollments e using public.student_accounts ac,_sr_affected a
     where e.account=ac.id and ac.reg_no_norm=a.reg_no_norm and ac.status='approved'
       and (ac.source='roster' or exists(select 1 from public.student_roster r where r.reg_no_norm=ac.reg_no_norm and public.student_names_match(ac.name_norm,r.name_norm))
         or exists(select 1 from _sr_removed_scope old where old.reg_no_norm=ac.reg_no_norm and public.student_names_match(ac.name_norm,old.name_norm)));
    insert into public.student_account_enrollments(account,spec,level,academic_year)
    select distinct ac.id,s.spec,s.level,v_year from public.student_accounts ac join _sr_affected a using(reg_no_norm)
      join _sr_scopes s using(reg_no_norm) join public.student_roster r using(reg_no_norm)
     where ac.status='approved' and s.promo is null and (ac.source='roster' or public.student_names_match(ac.name_norm,r.name_norm))
    on conflict(account,spec,level) do update set academic_year=excluded.academic_year;
    update public.student_accounts ac set status='approved',source='roster',spec=r.spec,level=r.level,promo=r.promo,
      level_year=v_year,full_name=r.full_name,decided_at=now()
      from public.student_roster r join _sr_affected a using(reg_no_norm)
     where ac.reg_no_norm=r.reg_no_norm and ac.status='pending' and public.student_names_match(ac.name_norm,r.name_norm);
    get diagnostics v_auto = row_count;

    delete from public.student_roster_import_rows where batch_id=v_id;
    update public.student_roster_import_batches set status='completed',completed_at=now(),
      result=jsonb_build_object('replaced_students',v_replaced,'imported_students',v_batch.expected_rows-v_duplicates,'extra_levels',v_extras,'auto_approved',v_auto,
                               'duplicates_ignored',v_duplicates)
      where id=v_id returning * into v_batch;
    return v_batch.result;
  end if;
  raise exception 'unknown_action';
end $$;
revoke all on function public.student_roster_replace_admin(text,jsonb) from public,anon;
grant execute on function public.student_roster_replace_admin(text,jsonb) to authenticated;
notify pgrst,'reload schema';


-- جميع رسوم العضوية تُحسب على رقم تسجيل فريد؛ لا يُضاعَف الطالب إذا كان له حساب ومنحة بطاقة معاً.
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
    'active_cards',(select count(*)::int from (select a.reg_no_norm from public.student_accounts a where a.status='approved' and coalesce(a.card_enabled,false) union select g.reg_no_norm from public.student_card_grants g) q),
    'official_roster_total',(select count(*)::int from public.student_roster),
    'official_roster_members',(select count(*)::int from public.student_roster r where exists (select 1 from public.student_accounts a where a.reg_no_norm=r.reg_no_norm and a.status='approved' and coalesce(a.card_enabled,false)) or exists (select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm)),
    'members_without_account',(select count(*)::int from public.student_card_grants g where not exists (select 1 from public.student_accounts a where a.reg_no_norm=g.reg_no_norm)),
    'members_not_in_roster',(select count(*)::int from public.student_accounts a where a.status='approved' and coalesce(a.card_enabled,false) and not exists (select 1 from public.student_roster r where r.reg_no_norm=a.reg_no_norm)),
    'coverage_roster_total',(select count(*)::int from public.student_roster r where r.promo is null and upper(coalesce(r.level,'')) <> 'S'),
    'coverage_roster_members',(select count(*)::int from public.student_roster r where r.promo is null and upper(coalesce(r.level,'')) <> 'S' and (exists (select 1 from public.student_accounts a where a.reg_no_norm=r.reg_no_norm and a.status='approved' and coalesce(a.card_enabled,false)) or exists (select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm))),
    'coverage_rate',case when (select count(*) from public.student_roster r where r.promo is null and upper(coalesce(r.level,'')) <> 'S')=0 then 0 else round(100.0*(select count(*) from public.student_roster r where r.promo is null and upper(coalesce(r.level,'')) <> 'S' and (exists (select 1 from public.student_accounts a where a.reg_no_norm=r.reg_no_norm and a.status='approved' and coalesce(a.card_enabled,false)) or exists (select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm)))/(select count(*) from public.student_roster r where r.promo is null and upper(coalesce(r.level,'')) <> 'S'),2) end,
    'by_specialization',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'count',x.n) order by x.key) from (select coalesce(nullif(spec,''),'غير محدد') key,count(*)::int n from public.student_roster group by coalesce(nullif(spec,''),'غير محدد')) x),'[]'::jsonb),
    'by_level',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'count',x.n) order by x.key) from (select coalesce(nullif(level,''),'غير محدد') key,count(*)::int n from public.student_roster group by coalesce(nullif(level,''),'غير محدد')) x),'[]'::jsonb),
    'membership_by_specialization',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'members',x.members,'total',x.total,'rate',case when x.total=0 then 0 else round(100.0*x.members/x.total,2) end) order by x.key) from (select coalesce(nullif(r.spec,''),'غير محدد') key,count(*)::int total,count(*) filter (where exists (select 1 from public.student_accounts a where a.reg_no_norm=r.reg_no_norm and a.status='approved' and coalesce(a.card_enabled,false)) or exists (select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm))::int members from public.student_roster r where r.promo is null and upper(coalesce(r.level,'')) <> 'S' group by coalesce(nullif(r.spec,''),'غير محدد')) x),'[]'::jsonb),
    'membership_by_level',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'members',x.members,'total',x.total,'rate',case when x.total=0 then 0 else round(100.0*x.members/x.total,2) end) order by x.key) from (select coalesce(nullif(r.level,''),'غير محدد') key,count(*)::int total,count(*) filter (where exists (select 1 from public.student_accounts a where a.reg_no_norm=r.reg_no_norm and a.status='approved' and coalesce(a.card_enabled,false)) or exists (select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm))::int members from public.student_roster r where r.promo is null and upper(coalesce(r.level,'')) <> 'S' group by coalesce(nullif(r.level,''),'غير محدد')) x),'[]'::jsonb),
    'members_without_account_rows',coalesce((select jsonb_agg(jsonb_build_object('reg_no',z.reg_no,'full_name',z.full_name,'spec',z.spec,'level',z.level) order by z.spec,z.level,z.full_name) from (select r.reg_no,r.full_name,r.spec,r.level from public.student_card_grants g join public.student_roster r on r.reg_no_norm=g.reg_no_norm where not exists (select 1 from public.student_accounts a where a.reg_no_norm=g.reg_no_norm) order by r.spec,r.level,r.full_name limit 500) z),'[]'::jsonb),
    'members_not_in_roster_rows',coalesce((select jsonb_agg(jsonb_build_object('reg_no',z.reg_no,'full_name',z.full_name,'spec',z.spec,'level',z.level) order by z.spec,z.level,z.full_name) from (select a.reg_no,a.full_name,a.spec,a.level from public.student_accounts a where a.status='approved' and coalesce(a.card_enabled,false) and not exists (select 1 from public.student_roster r where r.reg_no_norm=a.reg_no_norm) order by a.spec,a.level,a.full_name limit 500) z),'[]'::jsonb)
  );
end $$;
revoke all on function public.student_registration_stats() from public, anon;
grant execute on function public.student_registration_stats() to authenticated;
