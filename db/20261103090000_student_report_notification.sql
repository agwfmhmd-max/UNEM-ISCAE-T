-- UNEM ISCAE — إشعار صاحب الحساب بنتيجة بلاغ انتحال الجهاز.
-- يُطبّق بعد 20261102090000_registration_policy_report_status_unban.sql.
-- لا يمنح الطالب صلاحية إلغاء الحظر؛ الإلغاء يبقى حصراً للمشرف.

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

  -- قناة حالة مستقلة لا تعتمد على وجود الجهاز في student_devices.
  -- هذا مهم خصوصاً للكمبيوتر الذي قد يكون قد فقد جلسته المحلية بعد الإبلاغ.
  if p_action='report_status' then
    return coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select r.id,r.status,r.message,r.created_at,r.resolved_at,
             case when r.status='banned' then true
                  when r.status='unbanned' then true else false end as can_login
      from public.student_device_reports r
      where r.reporter_device_hash=v_hash
      order by r.created_at desc limit 10
    ) x),'[]'::jsonb);
  end if;

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
    if acc.id is null then
      -- جهاز الطالب المُبلِّغ لا يكون مسجلاً بعد: أعد آخر حالة لبلاغه حتى
      -- يعرف فوراً أن الجهاز الآخر حُظر ويمكنه إعادة تسجيل الدخول.
      select r.status into v_report
        from public.student_device_reports r
        where r.reporter_device_hash=v_hash
        order by r.created_at desc limit 1;
      if v_report is not null then
        return jsonb_build_object('status','none','report_status',v_report,
          'can_login',v_report in ('banned','unbanned'),
          'report_notice',case when v_report='banned' then 'other_device_banned'
                               when v_report='unbanned' then 'device_ban_unbanned'
                               when v_report='rejected' then 'report_rejected'
                               else 'report_pending' end);
      end if;
      return jsonb_build_object('status','none');
    end if;
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
revoke all on function public.student_gate(text,text,jsonb) from public;
grant execute on function public.student_gate(text,text,jsonb) to anon, authenticated;
