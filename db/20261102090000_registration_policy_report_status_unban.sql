-- UNEM ISCAE — سياسة أرقام التسجيل، التحكم في إنشاء الحساب، حالة البلاغ وإلغاء حظر الجهاز.
-- يُشغّل بعد db/20261101090000_student_device_impersonation_reports.sql.

create or replace function public.student_reg_allowed(p_reg text)
returns boolean language sql immutable
as $$ select upper(btrim(coalesce(p_reg,''))) ~ '^I(1[89][0-9]{3}|[2-9][0-9]{4})$' $$;
revoke all on function public.student_reg_allowed(text) from public, anon, authenticated;

create or replace function public.enforce_student_reg_format()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.student_reg_allowed(new.reg_no) then raise exception 'bad_reg_format'; end if;
  return new;
end $$;
revoke all on function public.enforce_student_reg_format() from public, anon, authenticated;
drop trigger if exists student_accounts_reg_format on public.student_accounts;
create trigger student_accounts_reg_format before insert or update of reg_no on public.student_accounts
for each row execute function public.enforce_student_reg_format();
drop trigger if exists student_roster_reg_format on public.student_roster;
create trigger student_roster_reg_format before insert or update of reg_no on public.student_roster
for each row execute function public.enforce_student_reg_format();

insert into public.platform_settings(key,value_boolean) values('student_registration_enabled',true) on conflict(key) do nothing;

alter table public.student_device_reports drop constraint if exists student_device_reports_status_check;
alter table public.student_device_reports add constraint student_device_reports_status_check check (status in ('pending','banned','rejected','unbanned'));
alter table public.student_device_bans add column if not exists active boolean not null default true;
alter table public.student_device_bans add column if not exists unbanned_at timestamptz;
alter table public.student_device_bans add column if not exists unbanned_by uuid references auth.users(id);

create or replace function public.student_device_admin(p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a jsonb := coalesce(p_args,'{}'::jsonb);
  v_id uuid;
  v_n int;
  v_hash text;
  v_status text;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if p_action = 'registration_status' then
    if not public.has_supervisor_permission('manage_platform_settings') then raise exception 'forbidden'; end if;
    return jsonb_build_object('enabled',coalesce((select value_boolean from public.platform_settings where key='student_registration_enabled'),true));
  elsif p_action = 'set_registration_enabled' then
    if not public.has_supervisor_permission('manage_platform_settings') then raise exception 'forbidden'; end if;
    insert into public.platform_settings(key,value_boolean,updated_at)
      values('student_registration_enabled',coalesce((a->>'enabled')::boolean,true),now())
      on conflict(key) do update set value_boolean=excluded.value_boolean,updated_at=now();
    return jsonb_build_object('enabled',coalesce((a->>'enabled')::boolean,true));
  elsif p_action = 'list_bans' then
    if not public.has_supervisor_permission('view_student_registrations') then raise exception 'forbidden'; end if;
    return coalesce((select jsonb_agg(x order by x.banned_at desc) from (
      select b.report_id,b.reason,b.banned_at,b.unbanned_at,b.active,
             left(b.device_hash,10) as device_fingerprint,
             r.status,r.message,ac.full_name,ac.reg_no
      from public.student_device_bans b
      left join public.student_device_reports r on r.id=b.report_id
      left join public.student_accounts ac on ac.id=r.account
      limit 300
    ) x),'[]'::jsonb);
  elsif p_action = 'unban_report' then
    if not public.has_supervisor_permission('manage_students') then raise exception 'forbidden'; end if;
    begin v_id:=(a->>'id')::uuid; exception when others then raise exception 'bad_report'; end;
    update public.student_device_bans b set active=false,unbanned_at=now(),unbanned_by=auth.uid()
      where b.report_id=v_id and b.active;
    get diagnostics v_n=row_count;
    if v_n=1 then update public.student_device_reports set status='unbanned',resolved_at=now(),resolved_by=auth.uid() where id=v_id; end if;
    return jsonb_build_object('unbanned',v_n=1);
  elsif p_action = 'list_reports' then
    if not public.has_supervisor_permission('view_student_registrations') then raise exception 'forbidden'; end if;
    return coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select r.id,r.account,r.device_type,r.message,r.status,r.created_at,r.resolved_at,
             ac.full_name,ac.reg_no,ac.spec,ac.level,
             left(r.target_device_hash,10) as target_device_fingerprint,
             s.last_seen as target_last_seen,
             (s.logout_at is null and s.last_seen > now()-interval '15 minutes') as target_active
      from public.student_device_reports r
      join public.student_accounts ac on ac.id=r.account
      left join lateral (select ss.last_seen,ss.logout_at from public.student_sessions ss
                         where ss.device_hash=r.target_device_hash order by ss.last_seen desc limit 1) s on true
      where r.status='pending'
      limit 200
    ) x),'[]'::jsonb);
  elsif p_action = 'ban_report' then
    if not public.has_supervisor_permission('manage_students') then raise exception 'forbidden'; end if;
    begin v_id:=(a->>'id')::uuid; exception when others then raise exception 'bad_report'; end;
    select target_device_hash into v_hash from public.student_device_reports where id=v_id and status='pending' for update;
    if v_hash is null then return jsonb_build_object('banned',false,'reason','not_pending'); end if;
    insert into public.student_device_bans(device_hash,report_id,reason,banned_by)
      values(v_hash,v_id,left(coalesce(a->>'reason','انتحال هوية طالب'),500),auth.uid())
      on conflict(device_hash) do update set reason=excluded.reason,report_id=excluded.report_id,banned_by=excluded.banned_by,active=true,unbanned_at=null,unbanned_by=null;
    update public.student_sessions set logout_at=now(),last_seen=now() where device_hash=v_hash and logout_at is null;
    delete from public.student_devices where token_hash=v_hash;
    update public.student_device_reports set status='banned',resolved_at=now(),resolved_by=auth.uid() where id=v_id;
    return jsonb_build_object('banned',true);
  elsif p_action = 'reject_report' then
    if not public.has_supervisor_permission('manage_students') then raise exception 'forbidden'; end if;
    begin v_id:=(a->>'id')::uuid; exception when others then raise exception 'bad_report'; end;
    update public.student_device_reports set status='rejected',resolved_at=now(),resolved_by=auth.uid()
      where id=v_id and status='pending';
    get diagnostics v_n=row_count;
    return jsonb_build_object('rejected',v_n=1);
  end if;
  raise exception 'unknown_action';
end $$;
create or replace function public.student_gate(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a jsonb := coalesce(p_args,'{}'::jsonb);
  v_hash text; v_sid uuid; acc public.student_accounts; ro public.student_roster;
  v_name text; v_reg text; v_nn text; v_rn text; v_spec text; v_level text; v_type text; v_n int; v_attempt_key text; v_guard jsonb; v_target_hash text; v_report text; v_registration_enabled boolean;
begin
  if p_token is null or char_length(p_token)<30 then return jsonb_build_object('error','bad_token'); end if;
  v_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if exists(select 1 from public.student_device_bans where device_hash=v_hash and active) then
    return jsonb_build_object('error','device_banned');
  end if;
  begin v_sid:=(a->>'session_id')::uuid; exception when others then v_sid:=null; end;
  if p_action in ('login','create','status','logout','end_session') and v_sid is null then return jsonb_build_object('error','bad_session'); end if;
  v_type:=case when lower(coalesce(a->>'device_type',''))='phone' then 'phone' else 'computer' end;

  v_name:=left(btrim(regexp_replace(coalesce(a->>'name',''),'\s+',' ','g')),80);
  v_reg:=left(btrim(coalesce(a->>'reg','')),30);
  v_nn:=public.student_norm_name(v_name); v_rn:=public.student_norm_reg(v_reg);
  v_registration_enabled:=coalesce((select value_boolean from public.platform_settings where key='student_registration_enabled'),true);

  -- قفل مؤقت مرتبط بجلسة المتصفح ورقم التسجيل؛ لا يمكن به حجب الطالب من جهاز آخر.
  if p_action in ('lookup','login') then
    v_attempt_key:=encode(sha256(convert_to('student-login:'||v_hash||':'||v_rn,'UTF8')),'hex');
    v_guard:=public.student_login_throttle(v_attempt_key,'check');
    if v_guard ? 'error' then return v_guard; end if;
  end if;

  if p_action in ('lookup','login','create','report_device_in_use') then
    if char_length(v_name)<3 or v_nn='' then return jsonb_build_object('error','bad_name'); end if;
    if v_name !~ '[A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]' then return jsonb_build_object('error','bad_name_fr'); end if;
    if char_length(v_rn)<2 then return jsonb_build_object('error','bad_reg'); end if;
    if not public.student_reg_allowed(v_rn) then return jsonb_build_object('error','bad_reg_format'); end if;
  end if;

  if p_action='lookup' then
    select * into acc from student_accounts where reg_no_norm=v_rn;
    if acc.id is not null then
      if not public.student_names_match(acc.name_norm,v_nn) then
        if p_action in ('lookup','login') then
          v_guard:=public.student_login_throttle(v_attempt_key,'failure');
          if v_guard ? 'error' then return v_guard; end if;
        end if;
        return jsonb_build_object('error','name_mismatch');
      end if;
      perform public.student_login_throttle(v_attempt_key,'success');
      return public.student_view(acc) || jsonb_build_object('found',true);
    end if;
    select * into ro from student_roster where reg_no_norm=v_rn;
    if ro.id is not null then
      if not public.student_names_match(ro.name_norm,v_nn) then
        v_guard:=public.student_login_throttle(v_attempt_key,'failure');
        if v_guard ? 'error' then return v_guard; end if;
        return jsonb_build_object('error','name_mismatch');
      end if;
      perform public.student_login_throttle(v_attempt_key,'success');
      return jsonb_build_object('found',true,'status','roster');
    end if;
    return jsonb_build_object('found',false,'status','not_found','registration_enabled',v_registration_enabled);

  elsif p_action='report_device_in_use' then
    v_report:=left(btrim(coalesce(a->>'message','')),1000);
    if char_length(v_report)<10 then return jsonb_build_object('error','report_too_short'); end if;
    select * into acc from student_accounts where reg_no_norm=v_rn and status='approved';
    if acc.id is null or not public.student_names_match(acc.name_norm,v_nn) then
      return jsonb_build_object('error','report_not_eligible');
    end if;
    select s.device_hash into v_target_hash
      from student_sessions s
      where s.account=acc.id and s.device_type=v_type and s.logout_at is null
        and s.last_seen > now()-interval '15 minutes' and s.device_hash<>v_hash
      order by s.last_seen desc limit 1;
    if v_target_hash is null then return jsonb_build_object('error','no_active_conflict'); end if;
    insert into public.student_device_reports(account,reporter_device_hash,target_device_hash,device_type,message)
      values(acc.id,v_hash,v_target_hash,v_type,v_report);
    return jsonb_build_object('submitted',true);

  elsif p_action='status' then
    select ac.* into acc from student_devices d join student_accounts ac on ac.id=d.account where d.token_hash=v_hash;
    if acc.id is null then return jsonb_build_object('status','none'); end if;
    perform pg_advisory_xact_lock(hashtext(acc.id::text),hashtext(v_type));
    update student_devices set last_seen=now() where token_hash=v_hash;
    update student_sessions set logout_at=now(),last_seen=now()
      where account=acc.id and device_hash=v_hash and session_id<>v_sid and logout_at is null;
    if exists(select 1 from student_sessions s where s.account=acc.id and s.device_type=v_type and s.logout_at is null and s.device_hash<>v_hash) then
      return jsonb_build_object('error','device_in_use','device_type',v_type);
    end if;
    insert into student_sessions(session_id,account,device_hash,device_type,login_at,last_seen,logout_at)
      values(v_sid,acc.id,v_hash,v_type,now(),now(),null)
      on conflict(session_id) do update set account=excluded.account,device_hash=excluded.device_hash,device_type=excluded.device_type,
        last_seen=now(),logout_at=null;
    return public.student_view(acc);

  elsif p_action='end_session' then
    update student_sessions set logout_at=now(),last_seen=now() where session_id=v_sid and device_hash=v_hash and logout_at is null;
    return jsonb_build_object('status','ended');

  elsif p_action='logout' then
    update student_sessions set logout_at=now(),last_seen=now() where session_id=v_sid and device_hash=v_hash and logout_at is null;
    delete from student_devices where token_hash=v_hash;
    return jsonb_build_object('status','none');

  elsif p_action in ('login','create') then
    if p_action='create' and not v_registration_enabled then return jsonb_build_object('error','registration_disabled'); end if;
    v_spec:=upper(btrim(coalesce(a->>'spec','')));v_level:=upper(btrim(coalesce(a->>'level','')));
    if p_action='create' and (v_spec not in ('BA','FC','TCM','GRH','SAE','IG','MASTER_FC','MASTER_IG') or v_level not in ('L1','L2','L3','M1','M2')
       or (v_spec like 'MASTER_%' and v_level not in ('M1','M2')) or (v_spec not like 'MASTER_%' and v_level not in ('L1','L2','L3'))) then
      return jsonb_build_object('error','bad_scope');
    end if;
    perform pg_advisory_xact_lock(hashtext('student-reg:'||v_rn),1001);
    select * into acc from student_accounts where reg_no_norm=v_rn;
    if acc.id is null then
      select * into ro from student_roster where reg_no_norm=v_rn;
      if p_action='login' then
        if ro.id is null then
          if not v_registration_enabled then return jsonb_build_object('error','registration_disabled'); end if;
          return jsonb_build_object('needs_registration',true,'registration_enabled',true);
        end if;
        if not public.student_names_match(ro.name_norm,v_nn) then
          v_guard:=public.student_login_throttle(v_attempt_key,'failure');
          if v_guard ? 'error' then return v_guard; end if;
          return jsonb_build_object('error','name_mismatch');
        end if;
        insert into student_accounts(reg_no,reg_no_norm,full_name,name_norm,spec,level,status,source,decided_at)
          values(ro.reg_no,v_rn,ro.full_name,ro.name_norm,ro.spec,ro.level,'approved','roster',now()) returning * into acc;
      else
        if ro.id is not null and not public.student_names_match(ro.name_norm,v_nn) then return jsonb_build_object('error','name_mismatch'); end if;
        begin
          if ro.id is not null then
            insert into student_accounts(reg_no,reg_no_norm,full_name,name_norm,spec,level,status,source,decided_at)
              values(ro.reg_no,v_rn,ro.full_name,ro.name_norm,ro.spec,ro.level,'approved','roster',now()) returning * into acc;
          else
            select count(*) into v_n from student_accounts where source='manual' and created_at>now()-interval '1 hour';
            if v_n>=300 then return jsonb_build_object('error','busy'); end if;
            insert into student_accounts(reg_no,reg_no_norm,full_name,name_norm,spec,level,status,source,decided_at)
              values(v_reg,v_rn,v_name,v_nn,v_spec,v_level,'approved','manual',now()) returning * into acc;
          end if;
        exception when unique_violation then
          select * into acc from student_accounts where reg_no_norm=v_rn;
        end;
      end if;
    else
      if not public.student_names_match(acc.name_norm,v_nn) then
        if p_action='login' then
          v_guard:=public.student_login_throttle(v_attempt_key,'failure');
          if v_guard ? 'error' then return v_guard; end if;
        end if;
        return jsonb_build_object('error','name_mismatch');
      end if;
      if p_action='create' then return jsonb_build_object('error','account_exists'); end if;
      if acc.status='approved' and acc.source='roster' and acc.spec is not null and (acc.spec<>v_spec and v_spec<>'' or acc.level<>v_level and v_level<>'') then
        -- Existing roster accounts are authenticated by their verified roster record, not by submitted scope.
        null;
      end if;
    end if;
    if acc.status='rejected' then return public.student_view(acc); end if;
    if acc.status='approved' and acc.spec is not null and acc.source<>'roster' and p_action='login' and v_spec<>'' and (acc.spec<>v_spec or acc.level<>v_level) then
      return jsonb_build_object('error','scope_mismatch');
    end if;

    if p_action='login' then perform public.student_login_throttle(v_attempt_key,'success'); end if;

    perform pg_advisory_xact_lock(hashtext(acc.id::text),hashtext(v_type));
    update student_sessions set logout_at=now(),last_seen=now()
      where account=acc.id and device_hash=v_hash and session_id<>v_sid and logout_at is null;
    if exists(select 1 from student_sessions s where s.account=acc.id and s.device_type=v_type and s.logout_at is null and s.device_hash<>v_hash) then
      return jsonb_build_object('error','device_in_use','device_type',v_type);
    end if;
    insert into student_devices(token_hash,account) values(v_hash,acc.id)
      on conflict(token_hash) do update set account=excluded.account,last_seen=now();
    insert into student_sessions(session_id,account,device_hash,device_type,login_at,last_seen,logout_at)
      values(v_sid,acc.id,v_hash,v_type,now(),now(),null)
      on conflict(session_id) do update set account=excluded.account,device_hash=excluded.device_hash,device_type=excluded.device_type,login_at=now(),last_seen=now(),logout_at=null;
    return public.student_view(acc);
  end if;
  return jsonb_build_object('error','unknown_action');
end $$;
create or replace function public.community_api(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.community_profiles;
  acc public.student_accounts;
  v_hash text;
  a jsonb := coalesce(p_args, '{}'::jsonb);
  adm boolean := false;
  v_room text; v_id uuid; v_n int; v_body text; v_kind text; v_target text; v_message_id bigint; v_rt bigint; v_pin boolean;
  tacc public.student_accounts; tro public.student_roster; tp public.community_profiles; v_reg text; v_seen timestamptz; v_online boolean; v_tmp uuid; v_lim int;
begin
  if p_token is null or char_length(p_token) < 30 then raise exception 'bad_token'; end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if exists(select 1 from public.student_device_bans where device_hash=v_hash and active) then raise exception 'device_banned'; end if;
  if auth.uid() is not null then adm := coalesce(public.is_community_staff(), false); end if;
  select ac.* into acc from student_devices d join student_accounts ac on ac.id = d.account where d.token_hash = v_hash;
  if (acc.id is null or acc.status <> 'approved') and not adm then
    return jsonb_build_object('need_register', true, 'student_status', coalesce(acc.status,'none'));
  end if;
  if acc.id is not null and acc.status = 'approved' then
    -- ملف المجتمع مرتبط بحساب الطالب (وليس بالجهاز): الصورة والمنشورات والرسائل تبقى عند الدخول من أي جهاز.
    select * into me from community_profiles where account = acc.id;
    if me.id is null then
      -- ملف قديم أنشأه هذا الجهاز ولم يُنسب لحساب بعد: يُتبنّى بدل إنشاء ملف فارغ.
      select * into me from community_profiles where token_hash = v_hash and account is null and spec is distinct from 'ADMIN';
      if me.id is not null then
        update community_profiles set account = acc.id where id = me.id returning * into me;
      else
        begin
          insert into community_profiles(token_hash,account,name,spec,level)
            values (encode(sha256(convert_to('acct:'||acc.id::text,'UTF8')),'hex'), acc.id, left(acc.full_name,80), acc.spec, acc.level)
            returning * into me;
        exception when unique_violation then
          select * into me from community_profiles where account = acc.id;
        end;
      end if;
    end if;
    if me.id is not null and (me.name is distinct from left(acc.full_name,80) or me.spec is distinct from acc.spec or me.level is distinct from acc.level) then
      update community_profiles set name=left(acc.full_name,80), spec=acc.spec, level=acc.level where id=me.id returning * into me;
    end if;
  else
    select * into me from community_profiles where token_hash = v_hash;
    if adm and me.id is null then
      insert into community_profiles(token_hash,name,spec,level) values(v_hash,'Administration','ADMIN','ADMIN') returning * into me;
    end if;
  end if;
  if not adm and random() < 0.02 then
    delete from community_messages where expires_at < now() and not pinned;
    delete from community_posts where expires_at < now() and not pinned;
  end if;

  if p_action = 'report_status' then
    return coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select r.id,r.status,r.message,r.created_at,r.resolved_at
      from public.student_device_reports r
      where r.account=acc.id and r.reporter_device_hash=v_hash
      order by r.created_at desc limit 10
    ) x),'[]'::jsonb);
  end if;

  if p_action = 'register' then   -- لم يعد التسجيل اليدوي مطلوباً: الهوية من حساب الطالب
    return to_jsonb(me) - 'token_hash';
  end if;
  if me.id is null then return jsonb_build_object('need_register', true); end if;
  if me.banned and not adm then raise exception 'banned'; end if;
  if p_action = 'me' then return to_jsonb(me) - 'token_hash' || jsonb_build_object('admin', adm); end if;

  if p_action = 'feed' then
    return coalesce((select jsonb_agg(x order by x.pinned desc, x.t desc) from (
      select p.id, p.kind, p.body, p.spec, p.level, p.subject, p.created_at as t, p.author as aid, pr.name as an,
        case when row_number() over (partition by p.author order by p.pinned desc, p.created_at desc) = 1 then pr.avatar_data end as avatar,
        p.pinned, p.edited_at as ed, case when p.pinned then null else p.expires_at end as exp, (p.author=me.id) as can_edit, adm as can_pin,
        (select count(*) from community_likes l where l.post=p.id) as likes,
        (select count(*) from community_comments c where c.post=p.id) as comments,
        exists(select 1 from community_likes l where l.post=p.id and l.profile=me.id) as liked,
        (p.author=me.id or adm) as can_del
      from community_posts p join community_profiles pr on pr.id=p.author
      where (adm or p.expires_at is null or p.expires_at > now())
        and (case when a->>'kind'='partner' then p.kind='partner'
                  else p.kind<>'partner' and (coalesce(a->>'kind','')='' or p.kind=a->>'kind') end)
        and (coalesce(a->>'spec','')='' or p.spec=a->>'spec')
        and (coalesce(a->>'level','')='' or p.level=a->>'level')
        and (coalesce(a->>'subject','')='' or p.subject ilike '%'||(a->>'subject')||'%')

      order by p.pinned desc, p.created_at desc limit 50) x), '[]'::jsonb);

  elsif p_action = 'post' then
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;
    select count(*) into v_n from community_posts where author=me.id and created_at > now() - interval '1 hour';
    if v_n >= 10 then raise exception 'rate'; end if;
    insert into community_posts(author,kind,body,spec,level,subject,expires_at)
    values (me.id, a->>'kind', left(v_body,3000), me.spec, me.level,
            nullif(left(btrim(coalesce(a->>'subject','')),60),''),
            now() + interval '7 days')
    returning id into v_id;
    return jsonb_build_object('id', v_id);

  elsif p_action = 'del_post' then
    delete from community_posts where id=(a->>'id')::uuid and (author=me.id or adm); return '{}'::jsonb;

  elsif p_action = 'like' then
    v_id := (a->>'id')::uuid;
    if not exists(select 1 from community_posts p where p.id=v_id) then raise exception 'forbidden'; end if;
    if exists(select 1 from community_likes where post=v_id and profile=me.id) then
      delete from community_likes where post=v_id and profile=me.id;
    else insert into community_likes(post,profile) values (v_id,me.id); end if;
    return '{}'::jsonb;

  elsif p_action = 'comments' then
    if not exists(select 1 from community_posts p where p.id=(a->>'id')::uuid) then raise exception 'forbidden'; end if;
    -- صورة الكاتب تُرسل مع أول تعليق له فقط (الواجهة تحتفظ بها وتعرضها على بقية تعليقاته)
    return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'an',x.name,'aid',x.author,'avatar',case when x.rn=1 then x.avatar_data end,'body',x.body,'t',x.created_at,
             'can_del',(x.author=me.id or adm),'can_edit',(x.author=me.id),'ed',x.edited_at) order by x.created_at)
           from (select c.id, c.author, c.body, c.created_at, c.edited_at, pr.name, pr.avatar_data,
                        row_number() over (partition by c.author order by c.created_at) as rn
                   from community_comments c join community_profiles pr on pr.id=c.author where c.post=(a->>'id')::uuid) x), '[]'::jsonb);

  elsif p_action = 'comment' then
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;
    if not exists(select 1 from community_posts p where p.id=(a->>'id')::uuid) then raise exception 'forbidden'; end if;
    select count(*) into v_n from community_comments where author=me.id and created_at > now() - interval '1 hour';
    if v_n >= 30 then raise exception 'rate'; end if;
    insert into community_comments(post,author,body) values ((a->>'id')::uuid, me.id, left(v_body,1000));
    return '{}'::jsonb;

  elsif p_action = 'del_comment' then
    delete from community_comments where id=(a->>'id')::uuid and (author=me.id or adm); return '{}'::jsonb;

  elsif p_action = 'find_student' then   -- البحث عن طالب برقم التسجيل + حالته (متصل / آخر ظهور / غير نشط)
    v_reg := public.student_norm_reg(a->>'reg');
    if v_reg = '' then raise exception 'empty'; end if;
    select count(*) into v_n from community_search_log where profile = me.id and created_at > now() - interval '1 minute';
    if v_n >= 4 then raise exception 'rate'; end if;   -- أقصى 4 عمليات بحث في الدقيقة: الخامسة تُرفض
    insert into community_search_log(profile) values (me.id);
    if random() < 0.02 then delete from community_search_log where created_at < now() - interval '1 day'; end if;
    select * into tacc from student_accounts where reg_no_norm = v_reg;
    if tacc.id is not null and tacc.status = 'approved' then
      select * into tp from community_profiles where account = tacc.id;
      if tp.id is null then
        -- ملف قديم أنشأه جهاز هذا الطالب قبل ربط الملفات بالحساب: يُتبنّى بدل إنشاء ملف فارغ
        select p.id into v_tmp from community_profiles p
          where p.account is null and p.spec is distinct from 'ADMIN'
            and (p.token_hash in (select d.token_hash from student_devices d where d.account = tacc.id)
              or p.token_hash in (select s.device_hash from student_sessions s where s.account = tacc.id))
          order by p.created_at limit 1;
        if v_tmp is not null then
          update community_profiles set account = tacc.id where id = v_tmp and account is null returning * into tp;
        end if;
      end if;
      if tp.id is null then
        begin
          insert into community_profiles(token_hash,account,name,spec,level)
            values (encode(sha256(convert_to('acct:'||tacc.id::text,'UTF8')),'hex'), tacc.id, left(tacc.full_name,80), coalesce(tacc.spec,''), coalesce(tacc.level,''))
            returning * into tp;
        exception when unique_violation then
          select * into tp from community_profiles where account = tacc.id;
        end;
      end if;
      select greatest((select max(s.last_seen) from student_sessions s where s.account = tacc.id),
                      (select max(d.last_seen) from student_devices d where d.account = tacc.id)) into v_seen;
      select exists(select 1 from student_sessions s where s.account = tacc.id and s.logout_at is null and s.last_seen > now() - interval '3 minutes') into v_online;
      return jsonb_build_object('found', true, 'registered', true, 'id', tp.id, 'name', tacc.full_name, 'reg', tacc.reg_no,
        'spec', tacc.spec, 'level', tacc.level, 'avatar', tp.avatar_data, 'self', (tp.id = me.id),
        'online', coalesce(v_online,false), 'last_seen', v_seen, 'active', (v_seen is not null));
    end if;
    -- لا حساب معتمد: غير نشط (لم يسجّل في المنصة). نعرض بياناته من الحساب المعلّق أو من لائحة الطلاب إن وُجدت.
    if tacc.id is not null then
      return jsonb_build_object('found', true, 'registered', false, 'active', false, 'online', false,
        'name', public.mask_person_name(tacc.full_name), 'reg', tacc.reg_no, 'spec', tacc.spec, 'level', tacc.level);
    end if;
    select * into tro from student_roster where reg_no_norm = v_reg;
    if tro.id is not null then
      return jsonb_build_object('found', true, 'registered', false, 'active', false, 'online', false,
        'name', public.mask_person_name(tro.full_name), 'reg', tro.reg_no, 'spec', tro.spec, 'level', tro.level);
    end if;
    return jsonb_build_object('found', false);

  elsif p_action = 'edit_post' then   -- تعديل منشور: لصاحبه فقط
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;
    update community_posts set body = left(v_body,3000), edited_at = now(),
      kind = case when kind <> 'partner' and a->>'kind' in ('question','help','discussion','announcement') then a->>'kind' else kind end
    where id=(a->>'id')::uuid and author=me.id;
    if not found then raise exception 'forbidden'; end if;
    return '{}'::jsonb;

  elsif p_action = 'edit_comment' then   -- تعديل تعليق: لصاحبه فقط
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;
    update community_comments set body = left(v_body,1000), edited_at = now()
    where id=(a->>'id')::uuid and author=me.id;
    if not found then raise exception 'forbidden'; end if;
    return '{}'::jsonb;

  elsif p_action = 'edit_message' then   -- تعديل رسالة (غرفة / مجموعة / خاص): لصاحبها فقط
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;
    update community_messages set body = left(v_body,1000), edited_at = now()
    where id=(a->>'id')::bigint and author=me.id and (pinned or expires_at > now());
    if not found then raise exception 'forbidden'; end if;
    return '{}'::jsonb;

  elsif p_action = 'del_message' then   -- حذف رسالة: لصاحبها أو للمشرف
    delete from community_messages where id=(a->>'id')::bigint and (author=me.id or adm);
    if not found then raise exception 'forbidden'; end if;
    return '{}'::jsonb;

  elsif p_action = 'admin_extend' then   -- المشرف: زيادة مدة ظهور منشور أو رسالة
    if not adm then raise exception 'forbidden'; end if;
    v_n := greatest(1, least(coalesce((a->>'hours')::int, 24), 8760));
    if a->>'type' = 'post' then
      update community_posts set expires_at = case when pinned or expires_at is null then expires_at
        else greatest(expires_at, now()) + make_interval(hours => v_n) end
      where id=(a->>'id')::uuid;
    elsif a->>'type' = 'message' then
      update community_messages set expires_at = case when pinned then expires_at
        else greatest(expires_at, now()) + make_interval(hours => v_n) end
      where id=(a->>'id')::bigint;
    else raise exception 'bad_action'; end if;
    return '{}'::jsonb;

  elsif p_action = 'admin_pin' then   -- المشرف: تثبيت منشور أو رسالة (لا تختفي) أو إلغاء التثبيت
    if not adm then raise exception 'forbidden'; end if;
    v_pin := coalesce((a->>'pinned')::boolean, true);
    if a->>'type' = 'post' then
      if v_pin then update community_posts set pinned = true, expires_at = 'infinity' where id=(a->>'id')::uuid;
      else update community_posts set pinned = false, expires_at = now() + interval '7 days' where id=(a->>'id')::uuid; end if;
    elsif a->>'type' = 'message' then
      if v_pin then update community_messages set pinned = true, expires_at = 'infinity' where id=(a->>'id')::bigint;
      else update community_messages set pinned = false, expires_at = now() + interval '24 hours' where id=(a->>'id')::bigint; end if;
    else raise exception 'bad_action'; end if;
    return '{}'::jsonb;

  elsif p_action in ('msgs','send','msgs_sync') then
    v_room := coalesce(a->>'room','');
    if v_room = 'general' then null;
    elsif v_room like 'spec:%' then
      if substr(v_room,6) <> me.spec and not adm then raise exception 'forbidden'; end if;
      if not adm and not exists(select 1 from student_accounts ac where ac.spec=substr(v_room,6) and ac.status='approved') then raise exception 'bad_room'; end if;
    elsif v_room like 'group:%' then
      if adm then
        if not exists(select 1 from community_groups g where g.id=substr(v_room,7)::uuid) then raise exception 'bad_room'; end if;
      elsif not exists(select 1 from community_groups g join community_members m on m.grp=g.id where g.id=substr(v_room,7)::uuid and m.profile=me.id and g.spec=me.spec and g.level=me.level) then raise exception 'not_member'; end if;
    elsif v_room like 'dm:%' then
      if v_room !~ '^dm:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$' then raise exception 'bad_room'; end if;
      if not adm and me.id::text not in (split_part(v_room,':',2), split_part(v_room,':',3)) then raise exception 'forbidden'; end if;
    else raise exception 'bad_room'; end if;
    if p_action = 'send' then
      v_body := btrim(coalesce(a->>'body',''));
      if v_body = '' then raise exception 'empty'; end if;
      select count(*) into v_n from community_messages where author=me.id and created_at > now() - interval '1 minute';
      if v_n >= 20 then raise exception 'rate'; end if;
      v_rt := null;
      if coalesce(a->>'reply_to','') ~ '^[0-9]{1,18}$' then
        select id into v_rt from community_messages where id = (a->>'reply_to')::bigint and room = v_room;
      end if;
      insert into community_messages(room,author,body,reply_to) values (v_room, me.id, left(v_body,1000), v_rt);
      return '{}'::jsonb;
    end if;
    -- مزامنة الرسائل المعروضة: التعديل / التثبيت / الحذف الذي تم من الآخرين يظهر دون إعادة فتح المحادثة
    if p_action = 'msgs_sync' then
      return coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'body',g.body,'ed',g.edited_at,'pin',g.pinned,
                'exp',case when g.pinned then null else g.expires_at end))
        from community_messages g
        where g.room=v_room and (adm or g.expires_at>now())
          and g.id in (select case when q.x ~ '^[0-9]{1,18}$' then q.x::bigint end
                       from (select jsonb_array_elements_text(coalesce(a->'ids','[]'::jsonb)) as x limit 300) q)), '[]'::jsonb);
    end if;
    -- الصورة الشخصية تُرسل مرة واحدة لكل كاتب في الدفعة (لا مع كل رسالة) لتخفيف الحمل؛ والرسالة المردود عليها تأتي مقتطفة
    return coalesce((select jsonb_agg(m order by m.id) from (
      select g.id, g.body, g.created_at as t, g.author as aid, pr.name as an,
        case when row_number() over (partition by g.author order by g.id desc) = 1 then pr.avatar_data end as avatar,
        (g.author=me.id) as mine,
        g.reply_to as rt, rpr.name as rn, left(rp.body,140) as rb, rp.author as ra,
        g.edited_at as ed, g.pinned as pin, case when g.pinned then null else g.expires_at end as exp
      from community_messages g join community_profiles pr on pr.id=g.author
      left join community_messages rp on rp.id=g.reply_to
      left join community_profiles rpr on rpr.id=rp.author
      where g.room=v_room and (adm or g.expires_at>now()) and g.id > coalesce((a->>'after')::bigint,0)
      order by (g.pinned and coalesce((a->>'after')::bigint,0)=0) desc, g.id desc limit 100) m), '[]'::jsonb);

  elsif p_action = 'groups' then
    return coalesce((select jsonb_agg(x order by x.t desc) from (
      select g.id, g.name, g.subject, g.spec, g.level, g.descr, g.max_members as max, g.created_at as t,
        (select count(*) from community_members m where m.grp=g.id) as members,
        exists(select 1 from community_members m where m.grp=g.id and m.profile=me.id) as joined
      from community_groups g
      where (adm or (g.spec=me.spec and g.level=me.level))
        and (coalesce(a->>'spec','')='' or g.spec=a->>'spec') and (coalesce(a->>'level','')='' or g.level=a->>'level')
      order by g.created_at desc limit 50) x), '[]'::jsonb);

  elsif p_action = 'group_new' then
    insert into community_groups(owner,name,subject,spec,level,descr,max_members)
    values (me.id, left(btrim(a->>'name'),60), nullif(left(btrim(coalesce(a->>'subject','')),60),''),
            me.spec, me.level, nullif(left(btrim(coalesce(a->>'descr','')),300),''),
            greatest(2, least(30, coalesce((a->>'max')::int,10)))) returning id into v_id;
    insert into community_members(grp,profile) values (v_id, me.id);
    return jsonb_build_object('id', v_id);

  elsif p_action = 'group_join' then
    v_id := (a->>'id')::uuid;
    if not exists(select 1 from community_groups g where g.id=v_id and (adm or (g.spec=me.spec and g.level=me.level))) then raise exception 'forbidden'; end if;
    if (select count(*) from community_members where grp=v_id) >= (select max_members from community_groups where id=v_id)
       and not exists(select 1 from community_members where grp=v_id and profile=me.id) then raise exception 'full'; end if;
    insert into community_members(grp,profile) values (v_id, me.id) on conflict do nothing; return '{}'::jsonb;

  elsif p_action = 'group_leave' then
    delete from community_members where grp=(a->>'id')::uuid and profile=me.id;
    delete from community_groups g where g.id=(a->>'id')::uuid and not exists(select 1 from community_members m where m.grp=g.id);
    return '{}'::jsonb;

  elsif p_action = 'dms' then   -- قائمة المحادثات الخاصة (آخر رسالة في كل محادثة)
    return coalesce((select jsonb_agg(x order by x.t desc) from (
      select distinct on (m.room) m.room, m.body, m.created_at as t,
        case when split_part(m.room,':',2)=me.id::text then split_part(m.room,':',3) else split_part(m.room,':',2) end as other,
        (select name from community_profiles p where p.id = (case when split_part(m.room,':',2)=me.id::text
           then split_part(m.room,':',3) else split_part(m.room,':',2) end)::uuid) as an,
        (select avatar_data from community_profiles p where p.id = (case when split_part(m.room,':',2)=me.id::text
           then split_part(m.room,':',3) else split_part(m.room,':',2) end)::uuid) as avatar
      from community_messages m
      where m.room like 'dm:%' and m.expires_at>now() and (adm or me.id::text in (split_part(m.room,':',2), split_part(m.room,':',3)))
      order by m.room, m.id desc) x), '[]'::jsonb);

  elsif p_action = 'avatar' then
    v_body := coalesce(a->>'data','');
    if v_body <> '' and (char_length(v_body)>400000 or v_body !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'bad_avatar'; end if;
    update community_profiles set avatar_data=nullif(v_body,'') where id=me.id returning * into me;
    return to_jsonb(me) - 'token_hash';

  elsif p_action = 'admin_list' then
    if not adm then raise exception 'forbidden'; end if;
    -- سقف لكل قائمة (الافتراضي 200، الأقصى 1000) حتى لا تتضخم الاستجابة مع الوقت؛ totals يعرض الإجمالي الحقيقي
    v_lim := least(greatest(coalesce(nullif(a->>'limit','')::int, 200), 1), 1000);
    return jsonb_build_object(
      'limit', v_lim,
      'totals', jsonb_build_object(
        'posts', (select count(*) from community_posts),
        'comments', (select count(*) from community_comments),
        'messages', (select count(*) from community_messages),
        'reports', (select count(*) from community_reports),
        'groups', (select count(*) from community_groups)),
      'posts', coalesce((select jsonb_agg(x order by x.t desc) from (select p.id,p.kind,p.body,p.spec,p.level,p.pinned,p.created_at as t,pr.name as an,pr.avatar_data as avatar from community_posts p join community_profiles pr on pr.id=p.author order by p.created_at desc limit v_lim) x),'[]'::jsonb),
      'groups', coalesce((select jsonb_agg(x order by x.t desc) from (select g.id,g.name,g.spec,g.level,g.created_at as t from community_groups g order by g.created_at desc limit v_lim) x),'[]'::jsonb),
      'comments', coalesce((select jsonb_agg(x order by x.t desc) from (select c.id,c.post,c.body,c.created_at as t,pr.name as an from community_comments c join community_profiles pr on pr.id=c.author order by c.created_at desc limit v_lim) x),'[]'::jsonb),
      'messages', coalesce((select jsonb_agg(x order by x.t desc) from (select m.id,m.room,m.body,m.pinned,m.created_at as t,pr.name as an from community_messages m join community_profiles pr on pr.id=m.author order by m.id desc limit v_lim) x),'[]'::jsonb),
      'reports', coalesce((select jsonb_agg(x order by x.t desc) from (
        select r.id,r.kind,r.target,r.reason,r.created_at as t,pr.name as an,
          case when r.kind='student' then (select p.name from community_profiles p where p.id::text=r.target)
               when r.kind='message' then (select p.name from community_messages m join community_profiles p on p.id=m.author where m.id::text=r.target)
               when r.kind='post' then (select p.name from community_posts q join community_profiles p on p.id=q.author where q.id::text=r.target)
               when r.kind='comment' then (select p.name from community_comments c join community_profiles p on p.id=c.author where c.id::text=r.target) end as target_name,
          case when r.kind='message' then (select m.body from community_messages m where m.id::text=r.target)
               when r.kind='post' then (select q.body from community_posts q where q.id::text=r.target)
               when r.kind='comment' then (select c.body from community_comments c where c.id::text=r.target) end as target_content
        from community_reports r left join community_profiles pr on pr.id=r.reporter order by r.created_at desc limit v_lim
      ) x),'[]'::jsonb),
      'rooms', coalesce((select jsonb_agg(x order by x.last_t desc nulls last,x.room) from (
        select r.room,count(m.id)::int as messages,max(m.created_at) as last_t,
          case when r.room='general' then 'General'
               when r.room like 'spec:%' then substring(r.room from 6)
               when r.room like 'group:%' then coalesce((select g.name from community_groups g where g.id=substring(r.room from 7)::uuid),'Study group')
               when r.room like 'dm:%' then coalesce((select string_agg(p.name,' ↔ ' order by p.name) from community_profiles p where p.id::text in (split_part(r.room,':',2),split_part(r.room,':',3))),'Private conversation')
               else r.room end as title
        from (
          select 'general'::text as room
          union select 'spec:'||u.spec from unnest(array['BA','FC','TCM','GRH','SAE','IG','MASTER_FC','MASTER_IG']::text[]) as u(spec)
          union select distinct 'spec:'||ac.spec from student_accounts ac where coalesce(ac.spec,'') not in ('','ADMIN')
          union select 'group:'||g.id::text from community_groups g
          union select distinct m.room from community_messages m where m.room like 'dm:%'
        ) r left join community_messages m on m.room=r.room
        group by r.room
      ) x),'[]'::jsonb));

  elsif p_action = 'admin_delete' then
    if not adm then raise exception 'forbidden'; end if;
    if a->>'type'='post' then delete from community_posts where id=(a->>'id')::uuid;
    elsif a->>'type'='group' then delete from community_messages where room='group:'||(a->>'id'); delete from community_groups where id=(a->>'id')::uuid;
    elsif a->>'type'='message' then delete from community_messages where id=(a->>'id')::bigint;
    elsif a->>'type'='room' then
      v_room:=coalesce(a->>'room','');
      if v_room<>'general' and v_room !~ '^(spec:[A-Z0-9_]+|group:[0-9a-fA-F-]{36}|dm:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36})$' then raise exception 'bad_room'; end if;
      delete from community_messages where room=v_room;
    elsif a->>'type'='report' then delete from community_reports where id=(a->>'id')::uuid;
    elsif a->>'type'='comment' then delete from community_comments where id=(a->>'id')::uuid;
    elsif a->>'type'='profile' then delete from community_profiles where id=(a->>'id')::uuid;
    else raise exception 'bad_action'; end if;
    return '{}'::jsonb;

  elsif p_action = 'report' then
    v_kind:=left(btrim(coalesce(a->>'kind','')),20);
    v_target:=left(btrim(coalesce(a->>'target','')),60);
    v_body:=left(btrim(coalesce(a->>'reason','')),300);
    if v_kind not in ('post','comment','message','student') or v_target='' then raise exception 'bad_report'; end if;
    select count(*) into v_n from community_reports where reporter=me.id and created_at>now()-interval '1 hour';
    if v_n>=20 then raise exception 'report_rate'; end if;
    if v_kind='message' then
      begin v_message_id:=v_target::bigint; exception when others then raise exception 'bad_report'; end;
      select room into v_room from community_messages where id=v_message_id and expires_at>now();
      if not found then raise exception 'report_not_found'; end if;
      if not adm then
        if v_room='general' then null;
        elsif v_room like 'spec:%' then
          if substring(v_room from 6)<>me.spec then raise exception 'forbidden'; end if;
        elsif v_room like 'group:%' then
          if not exists(select 1 from community_members cm join community_groups g on g.id=cm.grp where cm.grp=substring(v_room from 7)::uuid and cm.profile=me.id and g.spec=me.spec and g.level=me.level) then raise exception 'forbidden'; end if;
        elsif v_room like 'dm:%' then
          if me.id::text not in (split_part(v_room,':',2),split_part(v_room,':',3)) then raise exception 'forbidden'; end if;
        else raise exception 'bad_room'; end if;
      end if;
    elsif v_kind='student' then
      begin v_id:=v_target::uuid; exception when others then raise exception 'bad_report'; end;
      if v_id=me.id or not exists(select 1 from community_profiles where id=v_id) then raise exception 'report_not_found'; end if;
    elsif v_kind='post' then
      begin v_id:=v_target::uuid; exception when others then raise exception 'bad_report'; end;
      if not exists(select 1 from community_posts where id=v_id) then raise exception 'report_not_found'; end if;
    elsif v_kind='comment' then
      begin v_id:=v_target::uuid; exception when others then raise exception 'bad_report'; end;
      if not exists(select 1 from community_comments where id=v_id) then raise exception 'report_not_found'; end if;
    end if;
    insert into community_reports(reporter,kind,target,reason) values (me.id,v_kind,v_target,v_body);
    return '{}'::jsonb;
  end if;
  raise exception 'unknown_action';
end $$;

revoke all on function public.student_device_admin(text,jsonb) from public, anon;
grant execute on function public.student_device_admin(text,jsonb) to authenticated;
revoke all on function public.student_gate(text,text,jsonb) from public;
grant execute on function public.student_gate(text,text,jsonb) to anon, authenticated;
revoke all on function public.community_api(text,text,jsonb) from public;
grant execute on function public.community_api(text,text,jsonb) to anon, authenticated;
