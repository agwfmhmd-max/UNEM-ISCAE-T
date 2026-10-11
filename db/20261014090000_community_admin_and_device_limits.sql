-- UNEM ISCAE — صلاحيات إشراف كاملة، تسجيل/إنشاء حساب منفصل، وحدّ جلسة واحدة لكل نوع جهاز.
-- شغّل بعد db/20261013090000_student_community_enhancements.sql.
-- يعيد هذا الترحيل إنشاء RPCs آمنة؛ لا يحذف بيانات قائمة.

alter table public.student_sessions add column if not exists device_type text not null default 'computer';
update public.student_sessions set device_type='computer' where device_type is null or device_type not in ('phone','computer');
create index if not exists student_sessions_device_lock_idx on public.student_sessions(account,device_type,logout_at,device_hash);

create or replace function public.student_gate(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a jsonb := coalesce(p_args,'{}'::jsonb);
  v_hash text; v_sid uuid; acc public.student_accounts; ro public.student_roster;
  v_name text; v_reg text; v_nn text; v_rn text; v_spec text; v_level text; v_type text; v_n int;
begin
  if p_token is null or char_length(p_token)<30 then return jsonb_build_object('error','bad_token'); end if;
  v_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  begin v_sid:=(a->>'session_id')::uuid; exception when others then v_sid:=null; end;
  if p_action in ('login','create','status','logout','end_session') and v_sid is null then return jsonb_build_object('error','bad_session'); end if;
  v_type:=case when lower(coalesce(a->>'device_type',''))='phone' then 'phone' else 'computer' end;

  v_name:=left(btrim(regexp_replace(coalesce(a->>'name',''),'\s+',' ','g')),80);
  v_reg:=left(btrim(coalesce(a->>'reg','')),30);
  v_nn:=public.student_norm_name(v_name); v_rn:=public.student_norm_reg(v_reg);

  if p_action in ('lookup','login','create') then
    if char_length(v_name)<3 or v_nn='' then return jsonb_build_object('error','bad_name'); end if;
    if v_name !~ '[A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]' then return jsonb_build_object('error','bad_name_fr'); end if;
    if char_length(v_rn)<2 then return jsonb_build_object('error','bad_reg'); end if;
  end if;

  if p_action='lookup' then
    select * into acc from student_accounts where reg_no_norm=v_rn;
    if acc.id is not null then
      if not public.student_names_match(acc.name_norm,v_nn) then return jsonb_build_object('error','name_mismatch'); end if;
      return public.student_view(acc) || jsonb_build_object('found',true);
    end if;
    select * into ro from student_roster where reg_no_norm=v_rn;
    if ro.id is not null then
      if not public.student_names_match(ro.name_norm,v_nn) then return jsonb_build_object('error','name_mismatch'); end if;
      return jsonb_build_object('found',true,'status','roster');
    end if;
    return jsonb_build_object('found',false,'status','not_found');

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
        if ro.id is null then return jsonb_build_object('needs_registration',true); end if;
        if not public.student_names_match(ro.name_norm,v_nn) then return jsonb_build_object('error','name_mismatch'); end if;
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
      if not public.student_names_match(acc.name_norm,v_nn) then return jsonb_build_object('error','name_mismatch'); end if;
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
grant execute on function public.student_gate(text,text,jsonb) to anon,authenticated;

create or replace function public.student_revoke_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text; n int;
begin
  if auth.uid() is null or not coalesce(public.has_role(auth.uid(),'admin'),false) then raise exception 'forbidden'; end if;
  select device_hash into h from public.student_sessions where session_id=p_session_id and logout_at is null;
  if h is null then return jsonb_build_object('revoked',false); end if;
  update public.student_sessions set logout_at=now(),last_seen=now() where session_id=p_session_id and logout_at is null;
  delete from public.student_devices where token_hash=h;
  get diagnostics n=row_count;
  return jsonb_build_object('revoked',true);
end $$;
revoke all on function public.student_revoke_session(uuid) from public;
grant execute on function public.student_revoke_session(uuid) to authenticated;

create or replace function public.student_session_admin(p_action text,p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_hash text; v_n int;
begin
  if auth.uid() is null or not coalesce(public.has_role(auth.uid(),'admin'),false) then raise exception 'forbidden'; end if;
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

create or replace function public.community_api(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.community_profiles;
  acc public.student_accounts;
  v_hash text;
  a jsonb := coalesce(p_args, '{}'::jsonb);
  adm boolean := false;
  v_room text; v_id uuid; v_n int; v_body text;
begin
  if p_token is null or char_length(p_token) < 30 then raise exception 'bad_token'; end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if auth.uid() is not null then adm := coalesce(public.has_role(auth.uid(),'admin'), false); end if;
  select ac.* into acc from student_devices d join student_accounts ac on ac.id = d.account where d.token_hash = v_hash;
  if (acc.id is null or acc.status <> 'approved') and not adm then
    return jsonb_build_object('need_register', true, 'student_status', coalesce(acc.status,'none'));
  end if;
  select * into me from community_profiles where token_hash = v_hash;
  if acc.id is not null and acc.status = 'approved' then
    if me.id is null then
      insert into community_profiles(token_hash,name,spec,level) values (v_hash, left(acc.full_name,80), acc.spec, acc.level) returning * into me;
    elsif me.name is distinct from left(acc.full_name,80) or me.spec is distinct from acc.spec or me.level is distinct from acc.level then
      update community_profiles set name=left(acc.full_name,80), spec=acc.spec, level=acc.level where id=me.id returning * into me;
    end if;
  elsif adm and me.id is null then
    insert into community_profiles(token_hash,name,spec,level) values(v_hash,'Administration','ADMIN','ADMIN') returning * into me;
  end if;
  if not adm and random() < 0.02 then
    delete from community_messages where expires_at < now();
    delete from community_posts where expires_at < now();
  end if;

  if p_action = 'register' then   -- لم يعد التسجيل اليدوي مطلوباً: الهوية من حساب الطالب
    return to_jsonb(me) - 'token_hash';
  end if;
  if me.id is null then return jsonb_build_object('need_register', true); end if;
  if me.banned and not adm then raise exception 'banned'; end if;
  if p_action = 'me' then return to_jsonb(me) - 'token_hash' || jsonb_build_object('admin', adm); end if;

  if p_action = 'feed' then
    return coalesce((select jsonb_agg(x order by x.t desc) from (
      select p.id, p.kind, p.body, p.spec, p.level, p.subject, p.created_at as t, p.author as aid, pr.name as an, pr.avatar_data as avatar,
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
        and (adm or (p.spec=me.spec and p.level=me.level))
      order by p.created_at desc limit 50) x), '[]'::jsonb);

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
    if not exists(select 1 from community_posts p where p.id=v_id and (adm or (p.spec=me.spec and p.level=me.level))) then raise exception 'forbidden'; end if;
    if exists(select 1 from community_likes where post=v_id and profile=me.id) then
      delete from community_likes where post=v_id and profile=me.id;
    else insert into community_likes(post,profile) values (v_id,me.id); end if;
    return '{}'::jsonb;

  elsif p_action = 'comments' then
    if not exists(select 1 from community_posts p where p.id=(a->>'id')::uuid and (adm or (p.spec=me.spec and p.level=me.level))) then raise exception 'forbidden'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'an',pr.name,'aid',c.author,'body',c.body,'t',c.created_at,
             'can_del',(c.author=me.id or adm)) order by c.created_at)
           from community_comments c join community_profiles pr on pr.id=c.author where c.post=(a->>'id')::uuid), '[]'::jsonb);

  elsif p_action = 'comment' then
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;
    if not exists(select 1 from community_posts p where p.id=(a->>'id')::uuid and (adm or (p.spec=me.spec and p.level=me.level))) then raise exception 'forbidden'; end if;
    select count(*) into v_n from community_comments where author=me.id and created_at > now() - interval '1 hour';
    if v_n >= 30 then raise exception 'rate'; end if;
    insert into community_comments(post,author,body) values ((a->>'id')::uuid, me.id, left(v_body,1000));
    return '{}'::jsonb;

  elsif p_action = 'del_comment' then
    delete from community_comments where id=(a->>'id')::uuid and (author=me.id or adm); return '{}'::jsonb;

  elsif p_action in ('msgs','send') then
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
      if not adm and exists(select 1 from community_profiles p where p.id in (split_part(v_room,':',2)::uuid,split_part(v_room,':',3)::uuid) and (p.spec<>me.spec or p.level<>me.level)) then raise exception 'forbidden'; end if;
    else raise exception 'bad_room'; end if;
    if p_action = 'send' then
      v_body := btrim(coalesce(a->>'body',''));
      if v_body = '' then raise exception 'empty'; end if;
      select count(*) into v_n from community_messages where author=me.id and created_at > now() - interval '1 minute';
      if v_n >= 20 then raise exception 'rate'; end if;
      insert into community_messages(room,author,body) values (v_room, me.id, left(v_body,1000));
      return '{}'::jsonb;
    end if;
    return coalesce((select jsonb_agg(m order by m.id) from (
      select g.id, g.body, g.created_at as t, g.author as aid, pr.name as an, pr.avatar_data as avatar, (g.author=me.id) as mine
      from community_messages g join community_profiles pr on pr.id=g.author
      where g.room=v_room and (adm or g.expires_at>now()) and g.id > coalesce((a->>'after')::bigint,0)
      order by g.id desc limit 100) m), '[]'::jsonb);

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
           then split_part(m.room,':',3) else split_part(m.room,':',2) end)::uuid) as an
      from community_messages m
      where m.room like 'dm:%' and m.expires_at>now() and (adm or me.id::text in (split_part(m.room,':',2), split_part(m.room,':',3)))
        and (adm or not exists(select 1 from community_profiles p where p.id in (split_part(m.room,':',2)::uuid,split_part(m.room,':',3)::uuid) and (p.spec<>me.spec or p.level<>me.level)))
      order by m.room, m.id desc) x), '[]'::jsonb);

  elsif p_action = 'avatar' then
    v_body := coalesce(a->>'data','');
    if v_body <> '' and (char_length(v_body)>400000 or v_body !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'bad_avatar'; end if;
    update community_profiles set avatar_data=nullif(v_body,'') where id=me.id returning * into me;
    return to_jsonb(me) - 'token_hash';

  elsif p_action = 'admin_list' then
    if not adm then raise exception 'forbidden'; end if;
    return jsonb_build_object(
      'posts', coalesce((select jsonb_agg(x order by x.t desc) from (select p.id,p.kind,p.body,p.spec,p.level,p.created_at as t,pr.name as an from community_posts p join community_profiles pr on pr.id=p.author order by p.created_at desc) x),'[]'::jsonb),
      'groups', coalesce((select jsonb_agg(x order by x.t desc) from (select g.id,g.name,g.spec,g.level,g.created_at as t from community_groups g order by g.created_at desc) x),'[]'::jsonb),
      'comments', coalesce((select jsonb_agg(x order by x.t desc) from (select c.id,c.post,c.body,c.created_at as t,pr.name as an from community_comments c join community_profiles pr on pr.id=c.author order by c.created_at desc) x),'[]'::jsonb),
      'messages', coalesce((select jsonb_agg(x order by x.t desc) from (select m.id,m.room,m.body,m.created_at as t,pr.name as an from community_messages m join community_profiles pr on pr.id=m.author order by m.id desc) x),'[]'::jsonb),
      'reports', coalesce((select jsonb_agg(x order by x.t desc) from (select r.id,r.kind,r.target,r.reason,r.created_at as t,pr.name as an from community_reports r left join community_profiles pr on pr.id=r.reporter order by r.created_at desc) x),'[]'::jsonb),
      'rooms', coalesce((select jsonb_agg(x order by x.last_t desc) from (select m.room,count(*)::int as messages,max(m.created_at) as last_t from community_messages m group by m.room) x),'[]'::jsonb));

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
    insert into community_reports(reporter,kind,target,reason) values (me.id, left(a->>'kind',20), left(a->>'target',60), left(coalesce(a->>'reason',''),300));
    return '{}'::jsonb;
  end if;
  raise exception 'unknown_action';
end $$;

revoke all on function public.community_api(text,text,jsonb) from public;
grant execute on function public.community_api(text,text,jsonb) to anon,authenticated;
