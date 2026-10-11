-- UNEM ISCAE: توسعة مجتمع الطلاب والحسابات، سجل الجلسات والصورة الشخصية.
-- نفّذ بعد db/20261011100000_student_community.sql و db/20261012090000_student_accounts_gate.sql.
-- جميع العمليات الحساسة والقيود تُفرض داخل SECURITY DEFINER RPC، وليس في الواجهة فقط.

create table if not exists public.student_sessions (
  session_id uuid primary key,
  account uuid not null references public.student_accounts(id) on delete cascade,
  device_hash text not null,
  login_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  logout_at timestamptz
);
create index if not exists student_sessions_active_idx on public.student_sessions(account,last_seen desc) where logout_at is null;
create index if not exists student_sessions_login_idx on public.student_sessions(login_at desc);
alter table public.student_sessions enable row level security;
drop policy if exists "student sessions admin all" on public.student_sessions;
create policy "student sessions admin all" on public.student_sessions for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

alter table public.community_profiles add column if not exists avatar_data text;
create index if not exists community_groups_scope_idx on public.community_groups(spec,level,created_at desc);
create index if not exists community_posts_scope_idx on public.community_posts(spec,level,created_at desc);
-- المنشورات والطلبات الموجودة تأخذ مدة سبعة أيام بحسب تاريخ إنشائها.
update public.community_posts set expires_at=created_at+interval '7 days' where expires_at is null or expires_at>created_at+interval '7 days';
create or replace function public.student_gate(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a jsonb := coalesce(p_args,'{}'::jsonb); v_hash text; v_sid uuid; acc public.student_accounts; ro public.student_roster;
  v_name text; v_reg text; v_nn text; v_rn text; v_spec text; v_level text; v_n int;
begin
  if p_token is null or char_length(p_token)<30 then return jsonb_build_object('error','bad_token'); end if;
  v_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  begin v_sid:=(a->>'session_id')::uuid; exception when others then v_sid:=null; end;
  if p_action in ('login','status','logout','end_session') and v_sid is null then return jsonb_build_object('error','bad_session'); end if;
  if p_action='status' then
    select ac.* into acc from student_devices d join student_accounts ac on ac.id=d.account where d.token_hash=v_hash;
    if acc.id is null then return jsonb_build_object('status','none'); end if;
    update student_devices set last_seen=now() where token_hash=v_hash;
    insert into student_sessions(session_id,account,device_hash,login_at,last_seen,logout_at)
      values(v_sid,acc.id,v_hash,now(),now(),null)
      on conflict(session_id) do update set account=excluded.account,device_hash=excluded.device_hash,
        login_at=case when student_sessions.logout_at is not null then now() else student_sessions.login_at end,
        last_seen=now(),logout_at=null;
    return public.student_view(acc);
  elsif p_action='end_session' then
    update student_sessions set logout_at=now(),last_seen=now() where session_id=v_sid and device_hash=v_hash and logout_at is null;
    return jsonb_build_object('status','ended');
  elsif p_action='logout' then
    update student_sessions set logout_at=now(),last_seen=now() where session_id=v_sid and device_hash=v_hash and logout_at is null;
    delete from student_devices where token_hash=v_hash;
    return jsonb_build_object('status','none');
  elsif p_action='login' then
    v_name:=left(btrim(regexp_replace(coalesce(a->>'name',''),'\s+',' ','g')),80);
    v_reg:=left(btrim(coalesce(a->>'reg','')),30); v_nn:=public.student_norm_name(v_name);v_rn:=public.student_norm_reg(v_reg);
    v_spec:=upper(btrim(coalesce(a->>'spec','')));v_level:=upper(btrim(coalesce(a->>'level','')));
    if char_length(v_name)<3 or v_nn='' then return jsonb_build_object('error','bad_name'); end if;
    if char_length(v_rn)<2 then return jsonb_build_object('error','bad_reg'); end if;
    if v_spec not in ('BA','FC','TCM','GRH','SAE','IG','MASTER_FC','MASTER_IG') or v_level not in ('L1','L2','L3','M1','M2')
       or (v_spec like 'MASTER_%' and v_level not in ('M1','M2')) or (v_spec not like 'MASTER_%' and v_level not in ('L1','L2','L3')) then
      return jsonb_build_object('error','bad_scope');
    end if;
    select * into acc from student_accounts where reg_no_norm=v_rn;
    if acc.id is not null then
      if not public.student_names_match(acc.name_norm,v_nn) then return jsonb_build_object('error','name_mismatch'); end if;
      if acc.status='approved' and acc.spec is not null and (acc.spec<>v_spec or acc.level<>v_level) then return jsonb_build_object('error','scope_mismatch'); end if;
      if acc.status='pending' and (acc.spec is null or acc.level is null) then update student_accounts set spec=v_spec,level=v_level where id=acc.id returning * into acc; end if;
    else
      select * into ro from student_roster where reg_no_norm=v_rn;
      if ro.id is not null and public.student_names_match(ro.name_norm,v_nn) then
        insert into student_accounts(reg_no,reg_no_norm,full_name,name_norm,spec,level,status,source,decided_at)
        values(ro.reg_no,v_rn,ro.full_name,ro.name_norm,ro.spec,ro.level,'approved','roster',now()) returning * into acc;
      else
        select count(*) into v_n from student_accounts where status='pending' and created_at>now()-interval '1 hour';
        if v_n>=300 then return jsonb_build_object('error','busy'); end if;
        insert into student_accounts(reg_no,reg_no_norm,full_name,name_norm,spec,level,status,source,decided_at,note)
        values(v_reg,v_rn,v_name,v_nn,v_spec,v_level,case when ro.id is null then 'approved' else 'pending' end,'manual',
          case when ro.id is null then now() else null end,
          case when ro.id is not null then 'رقم التسجيل موجود في اللائحة باسم مختلف: '||ro.full_name end) returning * into acc;
      end if;
    end if;
    insert into student_devices(token_hash,account) values(v_hash,acc.id)
      on conflict(token_hash) do update set account=excluded.account,last_seen=now();
    insert into student_sessions(session_id,account,device_hash,login_at,last_seen,logout_at)
      values(v_sid,acc.id,v_hash,now(),now(),null)
      on conflict(session_id) do update set account=excluded.account,device_hash=excluded.device_hash,login_at=now(),last_seen=now(),logout_at=null;
    return public.student_view(acc);
  end if;
  return jsonb_build_object('error','unknown_action');
end $$;
revoke all on function public.student_gate(text,text,jsonb) from public;
grant execute on function public.student_gate(text,text,jsonb) to anon,authenticated;
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
  if auth.uid() is null or not coalesce(public.has_role(auth.uid(),'admin'), false) then raise exception 'forbidden'; end if;

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
  -- الهوية الآن من حساب الطالب المعتمد (الاسم الكامل + التخصص + المستوى من قاعدة البيانات)
  select ac.* into acc from student_devices d join student_accounts ac on ac.id = d.account where d.token_hash = v_hash;
  if acc.id is null or acc.status <> 'approved' then
    return jsonb_build_object('need_register', true, 'student_status', coalesce(acc.status,'none'));
  end if;
  select * into me from community_profiles where token_hash = v_hash;
  if me.id is null then
    insert into community_profiles(token_hash,name,spec,level) values (v_hash, left(acc.full_name,80), acc.spec, acc.level) returning * into me;
  elsif me.name is distinct from left(acc.full_name,80) or me.spec is distinct from acc.spec or me.level is distinct from acc.level then
    update community_profiles set name=left(acc.full_name,80), spec=acc.spec, level=acc.level where id=me.id returning * into me;
  end if;
  if auth.uid() is not null then adm := coalesce(public.has_role(auth.uid(),'admin'), false); end if;
  if random() < 0.02 then   -- تنظيف دوري بدون cron
    delete from community_messages where expires_at < now();
    delete from community_posts where expires_at < now();
  end if;

  if p_action = 'register' then   -- لم يعد التسجيل اليدوي مطلوباً: الهوية من حساب الطالب
    return to_jsonb(me) - 'token_hash';
  end if;
  if me.id is null then return jsonb_build_object('need_register', true); end if;
  if me.banned then raise exception 'banned'; end if;
  if p_action = 'me' then return to_jsonb(me) - 'token_hash' || jsonb_build_object('admin', adm); end if;

  if p_action = 'feed' then
    return coalesce((select jsonb_agg(x order by x.t desc) from (
      select p.id, p.kind, p.body, p.spec, p.level, p.subject, p.created_at as t, p.author as aid, pr.name as an, pr.avatar_data as avatar,
        (select count(*) from community_likes l where l.post=p.id) as likes,
        (select count(*) from community_comments c where c.post=p.id) as comments,
        exists(select 1 from community_likes l where l.post=p.id and l.profile=me.id) as liked,
        (p.author=me.id or adm) as can_del
      from community_posts p join community_profiles pr on pr.id=p.author
      where (p.expires_at is null or p.expires_at > now())
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
      if not exists(select 1 from student_accounts ac where ac.spec=substr(v_room,6) and ac.status='approved') then raise exception 'bad_room'; end if;
    elsif v_room like 'group:%' then
      if not exists(select 1 from community_groups g join community_members m on m.grp=g.id where g.id=substr(v_room,7)::uuid and m.profile=me.id and (adm or (g.spec=me.spec and g.level=me.level))) then raise exception 'not_member'; end if;
    elsif v_room like 'dm:%' then
      if me.id::text not in (split_part(v_room,':',2), split_part(v_room,':',3)) then raise exception 'forbidden'; end if;
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
      where g.room=v_room and g.expires_at>now() and g.id > coalesce((a->>'after')::bigint,0)
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
      where m.room like 'dm:%' and m.expires_at>now() and me.id::text in (split_part(m.room,':',2), split_part(m.room,':',3))
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
      'posts', coalesce((select jsonb_agg(x order by x.t desc) from (select p.id,p.kind,p.body,p.spec,p.level,p.created_at as t,pr.name as an from community_posts p join community_profiles pr on pr.id=p.author order by p.created_at desc limit 100) x),'[]'::jsonb),
      'groups', coalesce((select jsonb_agg(x order by x.t desc) from (select g.id,g.name,g.spec,g.level,g.created_at as t from community_groups g order by g.created_at desc limit 100) x),'[]'::jsonb),
      'messages', coalesce((select jsonb_agg(x order by x.t desc) from (select m.id,m.room,m.body,m.created_at as t,pr.name as an from community_messages m join community_profiles pr on pr.id=m.author where m.expires_at>now() order by m.id desc limit 100) x),'[]'::jsonb),
      'reports', coalesce((select jsonb_agg(x order by x.t desc) from (select r.id,r.kind,r.target,r.reason,r.created_at as t,pr.name as an from community_reports r left join community_profiles pr on pr.id=r.reporter order by r.created_at desc limit 100) x),'[]'::jsonb));

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
