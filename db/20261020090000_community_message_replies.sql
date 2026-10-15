-- UNEM ISCAE — الرد على الرسائل في المجتمع + تخفيف إرسال الصور الشخصية في المحادثات
-- شغّل هذا الملف في Supabase SQL Editor بعد db/20261019090000_community_profile_per_account.sql
-- آمن لإعادة التنفيذ ولا يحذف أي بيانات.

alter table public.community_messages add column if not exists reply_to bigint references public.community_messages(id) on delete set null;
create index if not exists community_messages_reply_idx on public.community_messages(reply_to) where reply_to is not null;

create or replace function public.community_api(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.community_profiles;
  acc public.student_accounts;
  v_hash text;
  a jsonb := coalesce(p_args, '{}'::jsonb);
  adm boolean := false;
  v_room text; v_id uuid; v_n int; v_body text; v_kind text; v_target text; v_message_id bigint; v_rt bigint;
begin
  if p_token is null or char_length(p_token) < 30 then raise exception 'bad_token'; end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
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
    return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'an',pr.name,'aid',c.author,'avatar',pr.avatar_data,'body',c.body,'t',c.created_at,
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
      v_rt := null;
      if coalesce(a->>'reply_to','') ~ '^[0-9]{1,18}$' then
        select id into v_rt from community_messages where id = (a->>'reply_to')::bigint and room = v_room;
      end if;
      insert into community_messages(room,author,body,reply_to) values (v_room, me.id, left(v_body,1000), v_rt);
      return '{}'::jsonb;
    end if;
    -- الصورة الشخصية تُرسل مرة واحدة لكل كاتب في الدفعة (لا مع كل رسالة) لتخفيف الحمل؛ والرسالة المردود عليها تأتي مقتطفة
    return coalesce((select jsonb_agg(m order by m.id) from (
      select g.id, g.body, g.created_at as t, g.author as aid, pr.name as an,
        case when row_number() over (partition by g.author order by g.id desc) = 1 then pr.avatar_data end as avatar,
        (g.author=me.id) as mine,
        g.reply_to as rt, rpr.name as rn, left(rp.body,140) as rb, rp.author as ra
      from community_messages g join community_profiles pr on pr.id=g.author
      left join community_messages rp on rp.id=g.reply_to
      left join community_profiles rpr on rpr.id=rp.author
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
           then split_part(m.room,':',3) else split_part(m.room,':',2) end)::uuid) as an,
        (select avatar_data from community_profiles p where p.id = (case when split_part(m.room,':',2)=me.id::text
           then split_part(m.room,':',3) else split_part(m.room,':',2) end)::uuid) as avatar
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
      'posts', coalesce((select jsonb_agg(x order by x.t desc) from (select p.id,p.kind,p.body,p.spec,p.level,p.created_at as t,pr.name as an,pr.avatar_data as avatar from community_posts p join community_profiles pr on pr.id=p.author order by p.created_at desc) x),'[]'::jsonb),
      'groups', coalesce((select jsonb_agg(x order by x.t desc) from (select g.id,g.name,g.spec,g.level,g.created_at as t from community_groups g order by g.created_at desc) x),'[]'::jsonb),
      'comments', coalesce((select jsonb_agg(x order by x.t desc) from (select c.id,c.post,c.body,c.created_at as t,pr.name as an from community_comments c join community_profiles pr on pr.id=c.author order by c.created_at desc) x),'[]'::jsonb),
      'messages', coalesce((select jsonb_agg(x order by x.t desc) from (select m.id,m.room,m.body,m.created_at as t,pr.name as an from community_messages m join community_profiles pr on pr.id=m.author order by m.id desc) x),'[]'::jsonb),
      'reports', coalesce((select jsonb_agg(x order by x.t desc) from (
        select r.id,r.kind,r.target,r.reason,r.created_at as t,pr.name as an,
          case when r.kind='student' then (select p.name from community_profiles p where p.id::text=r.target)
               when r.kind='message' then (select p.name from community_messages m join community_profiles p on p.id=m.author where m.id::text=r.target)
               when r.kind='post' then (select p.name from community_posts q join community_profiles p on p.id=q.author where q.id::text=r.target)
               when r.kind='comment' then (select p.name from community_comments c join community_profiles p on p.id=c.author where c.id::text=r.target) end as target_name,
          case when r.kind='message' then (select m.body from community_messages m where m.id::text=r.target)
               when r.kind='post' then (select q.body from community_posts q where q.id::text=r.target)
               when r.kind='comment' then (select c.body from community_comments c where c.id::text=r.target) end as target_content
        from community_reports r left join community_profiles pr on pr.id=r.reporter order by r.created_at desc
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
          if me.id::text not in (split_part(v_room,':',2),split_part(v_room,':',3)) or exists(select 1 from community_profiles p where p.id in (split_part(v_room,':',2)::uuid,split_part(v_room,':',3)::uuid) and (p.spec<>me.spec or p.level<>me.level)) then raise exception 'forbidden'; end if;
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
revoke all on function public.community_api(text,text,jsonb) from public;
grant execute on function public.community_api(text,text,jsonb) to anon,authenticated;

notify pgrst, 'reload schema';
