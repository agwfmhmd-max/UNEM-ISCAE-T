-- =====================================================================
--  UNEM ISCAE — مجتمع الطلاب (منشورات، غرف، مجموعات دراسة، زميل دراسة، رسائل)
--  شغّله مرة واحدة في: Supabase → SQL Editor  (آمن لإعادة التنفيذ)
--  يضيف جداول جديدة فقط (community_*) ولا يمس أي جدول أو بيانات موجودة.
--  الوصول كله عبر دالة واحدة SECURITY DEFINER: community_api
--  الهوية: رمز سرّي عشوائي يولّده المتصفح (يُخزَّن هنا مشفّراً SHA-256 فقط).
-- =====================================================================

create table if not exists public.community_profiles (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  name text not null check (char_length(name) between 2 and 24),
  spec text not null, level text not null,
  banned boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references public.community_profiles(id) on delete cascade,
  kind text not null check (kind in ('question','help','discussion','announcement','partner')),
  body text not null check (char_length(body) between 1 and 3000),
  spec text, level text, subject text,
  created_at timestamptz not null default now(),
  expires_at timestamptz            -- طلبات زميل الدراسة: 14 يوماً
);
create index if not exists community_posts_idx on public.community_posts (kind, created_at desc);
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post uuid not null references public.community_posts(id) on delete cascade,
  author uuid not null references public.community_profiles(id) on delete cascade,
  parent uuid, body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists community_comments_idx on public.community_comments (post, created_at);
create table if not exists public.community_likes (
  post uuid not null references public.community_posts(id) on delete cascade,
  profile uuid not null references public.community_profiles(id) on delete cascade,
  primary key (post, profile)
);
create table if not exists public.community_groups (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.community_profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  subject text, spec text, level text, descr text,
  max_members int not null default 10 check (max_members between 2 and 30),
  created_at timestamptz not null default now()
);
create table if not exists public.community_members (
  grp uuid not null references public.community_groups(id) on delete cascade,
  profile uuid not null references public.community_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (grp, profile)
);
-- رسائل الغرف ومجموعات الدراسة والخاصة (room: general | spec:BA | group:<uuid> | dm:<uuid>:<uuid>)
create table if not exists public.community_messages (
  id bigserial primary key,
  room text not null,
  author uuid not null references public.community_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')   -- الرسائل تختفي بعد 24 ساعة
);
create index if not exists community_messages_idx on public.community_messages (room, id);
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid references public.community_profiles(id) on delete set null,
  kind text, target text, reason text,
  created_at timestamptz not null default now()
);

-- RLS: لا وصول مباشر للزوار؛ المشرف الرئيسي فقط (للإشراف من لوحة Supabase أو التطبيق)
do $$
declare t text;
begin
  foreach t in array array['community_profiles','community_posts','community_comments','community_likes',
                           'community_groups','community_members','community_messages','community_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "community admin all" on public.%I', t);
    execute format('create policy "community admin all" on public.%I for all using (public.has_role(auth.uid(),''admin'')) with check (public.has_role(auth.uid(),''admin''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
create or replace function public.community_api(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.community_profiles;
  a jsonb := coalesce(p_args, '{}'::jsonb);
  adm boolean := false;
  v_room text; v_id uuid; v_n int; v_body text;
begin
  if p_token is null or char_length(p_token) < 30 then raise exception 'bad_token'; end if;
  select * into me from community_profiles where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if auth.uid() is not null then adm := coalesce(public.has_role(auth.uid(),'admin'), false); end if;
  if random() < 0.02 then   -- تنظيف دوري بدون cron
    delete from community_messages where expires_at < now();
    delete from community_posts where expires_at < now();
  end if;

  if p_action = 'register' then
    if me.id is null then
      insert into community_profiles(token_hash,name,spec,level)
      values (encode(sha256(convert_to(p_token,'UTF8')),'hex'), btrim(a->>'name'), a->>'spec', a->>'level') returning * into me;
    else
      update community_profiles set name=btrim(a->>'name'), spec=a->>'spec', level=a->>'level' where id=me.id returning * into me;
    end if;
    return to_jsonb(me) - 'token_hash';
  end if;
  if me.id is null then return jsonb_build_object('need_register', true); end if;
  if me.banned then raise exception 'banned'; end if;
  if p_action = 'me' then return to_jsonb(me) - 'token_hash' || jsonb_build_object('admin', adm); end if;

  if p_action = 'feed' then
    return coalesce((select jsonb_agg(x order by x.t desc) from (
      select p.id, p.kind, p.body, p.spec, p.level, p.subject, p.created_at as t, p.author as aid, pr.name as an,
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
      order by p.created_at desc limit 50) x), '[]'::jsonb);

  elsif p_action = 'post' then
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;
    select count(*) into v_n from community_posts where author=me.id and created_at > now() - interval '1 hour';
    if v_n >= 10 then raise exception 'rate'; end if;
    insert into community_posts(author,kind,body,spec,level,subject,expires_at)
    values (me.id, a->>'kind', left(v_body,3000), coalesce(a->>'spec',me.spec), coalesce(a->>'level',me.level),
            nullif(left(btrim(coalesce(a->>'subject','')),60),''),
            case when a->>'kind'='partner' then now() + interval '14 days' end)
    returning id into v_id;
    return jsonb_build_object('id', v_id);

  elsif p_action = 'del_post' then
    delete from community_posts where id=(a->>'id')::uuid and (author=me.id or adm); return '{}'::jsonb;

  elsif p_action = 'like' then
    v_id := (a->>'id')::uuid;
    if exists(select 1 from community_likes where post=v_id and profile=me.id) then
      delete from community_likes where post=v_id and profile=me.id;
    else insert into community_likes(post,profile) values (v_id,me.id); end if;
    return '{}'::jsonb;

  elsif p_action = 'comments' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'an',pr.name,'aid',c.author,'body',c.body,'t',c.created_at,
             'can_del',(c.author=me.id or adm)) order by c.created_at)
           from community_comments c join community_profiles pr on pr.id=c.author where c.post=(a->>'id')::uuid), '[]'::jsonb);

  elsif p_action = 'comment' then
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;
    select count(*) into v_n from community_comments where author=me.id and created_at > now() - interval '1 hour';
    if v_n >= 30 then raise exception 'rate'; end if;
    insert into community_comments(post,author,body) values ((a->>'id')::uuid, me.id, left(v_body,1000));
    return '{}'::jsonb;

  elsif p_action = 'del_comment' then
    delete from community_comments where id=(a->>'id')::uuid and (author=me.id or adm); return '{}'::jsonb;

  elsif p_action in ('msgs','send') then
    v_room := coalesce(a->>'room','');
    if v_room = 'general' or v_room like 'spec:%' then null;
    elsif v_room like 'group:%' then
      if not exists(select 1 from community_members where grp=substr(v_room,7)::uuid and profile=me.id) then raise exception 'not_member'; end if;
    elsif v_room like 'dm:%' then
      if me.id::text not in (split_part(v_room,':',2), split_part(v_room,':',3)) then raise exception 'forbidden'; end if;
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
      select g.id, g.body, g.created_at as t, g.author as aid, pr.name as an, (g.author=me.id) as mine
      from community_messages g join community_profiles pr on pr.id=g.author
      where g.room=v_room and g.expires_at>now() and g.id > coalesce((a->>'after')::bigint,0)
      order by g.id desc limit 100) m), '[]'::jsonb);

  elsif p_action = 'groups' then
    return coalesce((select jsonb_agg(x order by x.t desc) from (
      select g.id, g.name, g.subject, g.spec, g.level, g.descr, g.max_members as max, g.created_at as t,
        (select count(*) from community_members m where m.grp=g.id) as members,
        exists(select 1 from community_members m where m.grp=g.id and m.profile=me.id) as joined
      from community_groups g
      where (coalesce(a->>'spec','')='' or g.spec=a->>'spec') and (coalesce(a->>'level','')='' or g.level=a->>'level')
      order by g.created_at desc limit 50) x), '[]'::jsonb);

  elsif p_action = 'group_new' then
    insert into community_groups(owner,name,subject,spec,level,descr,max_members)
    values (me.id, left(btrim(a->>'name'),60), nullif(left(btrim(coalesce(a->>'subject','')),60),''),
            coalesce(a->>'spec',me.spec), coalesce(a->>'level',me.level), nullif(left(btrim(coalesce(a->>'descr','')),300),''),
            greatest(2, least(30, coalesce((a->>'max')::int,10)))) returning id into v_id;
    insert into community_members(grp,profile) values (v_id, me.id);
    return jsonb_build_object('id', v_id);

  elsif p_action = 'group_join' then
    v_id := (a->>'id')::uuid;
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
      order by m.room, m.id desc) x), '[]'::jsonb);

  elsif p_action = 'report' then
    insert into community_reports(reporter,kind,target,reason) values (me.id, left(a->>'kind',20), left(a->>'target',60), left(coalesce(a->>'reason',''),300));
    return '{}'::jsonb;
  end if;
  raise exception 'unknown_action';
end $$;

revoke all on function public.community_api(text,text,jsonb) from public;
grant execute on function public.community_api(text,text,jsonb) to anon, authenticated;
