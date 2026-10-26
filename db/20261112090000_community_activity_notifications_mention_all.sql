-- إشعارات النشاط: رسائل الغرف والمجموعات والمنشورات تصل كإشعار حقيقي لأعضائها، مع كتم لكل غرفة/المنشورات،
-- وإشارة @الكل (الجميع / all / everyone / tous) للمشرف ومشرف الغرفة ومالك المجموعة فقط.

create table if not exists public.community_push_mutes (
  profile uuid not null references public.community_profiles(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (profile, key)
);
alter table public.community_push_mutes enable row level security;
drop policy if exists community_push_mutes_none on public.community_push_mutes;
create policy community_push_mutes_none on public.community_push_mutes for all to anon, authenticated using (false) with check (false);

-- سجل يمنع تكرار إرسال إشعار نفس الرسالة/المنشور
create table if not exists public.community_push_log (
  kind text not null,
  ref text not null,
  created_at timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.community_push_log enable row level security;
drop policy if exists community_push_log_none on public.community_push_log;
create policy community_push_log_none on public.community_push_log for all to anon, authenticated using (false) with check (false);

create or replace function public.community_has_mention_all(p_body text) returns boolean
language sql immutable as $$
  select coalesce(p_body,'') ~* '(^|[^[:alnum:]_])@(الكل|الجميع|all|everyone|tous|toutes)([^[:alnum:]_]|$)'
$$;

create or replace function public.community_room_label(p_room text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p_room = 'general' then 'الغرفة العامة'
    when p_room like 'sortants:%' then 'UNEM ISCAE Sortants Promo ' || substring(p_room from 10)
    when p_room like 'level:%' then substring(p_room from 7) || ' UNEM ISCAE'
    when p_room like 'class:%' then replace(substring(p_room from 7), ':', ' · ')
    when p_room like 'spec:%' then substring(p_room from 6)
    when p_room like 'group:%' then coalesce((select g.name from community_groups g where g.id::text = substring(p_room from 7)), 'مجموعة دراسة')
    when p_room like 'dm:%' then 'رسالة خاصة'
    else 'المجتمع' end
$$;

-- أعضاء الغرفة (حسب نوعها) + مشرفوها
create or replace function public.community_room_member_profiles(p_room text) returns table(p uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_room = 'general' then
    return query select cp.id from community_profiles cp join student_accounts a on a.id = cp.account and a.status = 'approved' where not cp.banned;
  elsif p_room ~ '^sortants:[0-9]{1,3}$' then
    return query select cp.id from community_profiles cp join student_accounts a on a.id = cp.account and a.status = 'approved'
      where not cp.banned and a.promo = substring(p_room from 10)::int;
  elsif p_room like 'level:%' then
    return query select cp.id from community_profiles cp join student_accounts a on a.id = cp.account and a.status = 'approved'
      where not cp.banned and public.community_profile_has_level(cp.id, substring(p_room from 7));
  elsif p_room like 'class:%' then
    return query select cp.id from community_profiles cp join student_accounts a on a.id = cp.account and a.status = 'approved'
      where not cp.banned and public.community_profile_has_scope(cp.id, split_part(p_room,':',2), split_part(p_room,':',3));
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
revoke all on function public.community_room_label(text) from public, anon, authenticated;

-- يستدعيه خادم الموقع بعد نشر رسالة/منشور/تعليق: يعيد اشتراكات المستلمين ونص الإشعار مرة واحدة فقط
create or replace function public.community_activity_push_targets(p_token text, p_kind text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid; v_name text; v_is_admin boolean; v_room text; v_author uuid; v_body text; v_media text; v_msg bigint;
  v_post public.community_posts; v_cm public.community_comments; v_all boolean := false;
  v_title text; v_text text; v_url text; v_tag text; v_quiet boolean := true; v_subs jsonb;
  v_empty jsonb := jsonb_build_object('subs','[]'::jsonb);
begin
  v_me := public.community_token_profile(p_token);
  if v_me is null then raise exception 'forbidden'; end if;
  select name, spec = 'ADMIN' into v_name, v_is_admin from community_profiles where id = v_me;
  if random() < 0.02 then delete from community_push_log where created_at < now() - interval '30 days'; end if;

  if p_kind = 'message' then
    if p_id !~ '^[0-9]{1,18}$' then raise exception 'forbidden'; end if;
    v_msg := p_id::bigint;
    select m.room, m.author, m.body, m.media_kind into v_room, v_author, v_body, v_media from community_messages m where m.id = v_msg;
    if not found or v_author <> v_me then raise exception 'forbidden'; end if;
    insert into community_push_log(kind, ref) values ('message', p_id) on conflict do nothing;
    if not found then return v_empty; end if;
    v_text := coalesce(nullif(left(regexp_replace(coalesce(v_body,''), '\s+', ' ', 'g'), 140), ''),
                       case v_media when 'image' then '📷' when 'audio' then '🎤' else '📎' end);
    v_title := case when v_room like 'dm:%' then coalesce(v_name,'UNEM ISCAE') else public.community_room_label(v_room) end;
    v_text := case when v_room like 'dm:%' then v_text else coalesce(v_name,'') || ': ' || v_text end;
    v_url := '/community?room=' || v_room || '&mid=' || v_msg::text;
    v_tag := 'room-' || v_room;
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb) into v_subs
    from (select distinct r.p from public.community_room_member_profiles(v_room) r) m
    join community_profiles cp on cp.id = m.p
    join push_subscriptions s on s.account = cp.account
    where m.p <> v_me and not cp.banned
      and not exists (select 1 from community_push_mutes mu where mu.profile = m.p and mu.key = v_room)
      and not exists (select 1 from community_message_mentions mm where mm.message_id = v_msg and mm.profile = m.p);

  elsif p_kind = 'post' then
    if p_id !~ '^[0-9a-fA-F-]{36}$' then raise exception 'forbidden'; end if;
    select * into v_post from community_posts where id = p_id::uuid;
    if v_post.id is null or v_post.author <> v_me then raise exception 'forbidden'; end if;
    insert into community_push_log(kind, ref) values ('post', p_id) on conflict do nothing;
    if not found then return v_empty; end if;
    v_all := coalesce(v_is_admin,false) and public.community_has_mention_all(v_post.body);
    v_text := left(regexp_replace(coalesce(v_post.body,''), '\s+', ' ', 'g'), 160);
    v_title := case when v_all then '📢 ' || coalesce(v_name,'UNEM ISCAE') || ' نبّه الجميع'
                    when v_post.kind = 'partner' then coalesce(v_name,'') || ' يبحث عن شريك دراسة'
                    else 'منشور جديد من ' || coalesce(v_name,'') end;
    v_url := '/community?post=' || v_post.id::text || case when v_post.kind = 'partner' then '&kind=partner' else '' end;
    v_tag := 'post-' || v_post.id::text; v_quiet := not v_all;
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb) into v_subs
    from community_profiles cp
    join student_accounts a on a.id = cp.account and a.status = 'approved'
    join push_subscriptions s on s.account = cp.account
    where cp.id <> v_me and not cp.banned
      and (v_all or not exists (select 1 from community_push_mutes mu where mu.profile = cp.id and mu.key = 'posts'))
      and (v_all or v_post.kind <> 'partner' or public.community_profile_has_spec(cp.id, v_post.spec));

  elsif p_kind = 'comment' then
    if p_id !~ '^[0-9a-fA-F-]{36}$' then raise exception 'forbidden'; end if;
    select * into v_cm from community_comments where id = p_id::uuid;
    if v_cm.id is null or v_cm.author <> v_me then raise exception 'forbidden'; end if;
    insert into community_push_log(kind, ref) values ('comment', p_id) on conflict do nothing;
    if not found then return v_empty; end if;
    if not (coalesce(v_is_admin,false) and public.community_has_mention_all(v_cm.body)) then return v_empty; end if;
    v_all := true; v_quiet := false;
    v_text := left(regexp_replace(coalesce(v_cm.body,''), '\s+', ' ', 'g'), 160);
    v_title := '📢 ' || coalesce(v_name,'UNEM ISCAE') || ' نبّه الجميع';
    v_url := '/community?post=' || v_cm.post::text;
    v_tag := 'comment-' || v_cm.id::text;
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb) into v_subs
    from community_profiles cp
    join student_accounts a on a.id = cp.account and a.status = 'approved'
    join push_subscriptions s on s.account = cp.account
    where cp.id <> v_me and not cp.banned;
  else
    raise exception 'forbidden';
  end if;

  if jsonb_array_length(v_subs) > 3000 then v_subs := (select jsonb_agg(e) from (select e from jsonb_array_elements(v_subs) e limit 3000) q); end if;
  return jsonb_build_object('title', left(v_title,120), 'body', left(coalesce(v_text,''),180), 'url', v_url, 'tag', v_tag, 'quiet', v_quiet, 'subs', v_subs);
end $$;
revoke all on function public.community_activity_push_targets(text,text,text) from public;
grant execute on function public.community_activity_push_targets(text,text,text) to anon, authenticated;

-- إشعار الإشارة الجماعية يحمل عنوانًا مناسبًا
do $p$
declare v text; o text := $q$'title', left(coalesce(v_sender,'UNEM ISCAE'), 60) || ' أشار إليك',$q$;
begin
  v := replace(pg_get_functiondef('public.community_mention_push_targets(text,bigint)'::regprocedure), E'\r', '');
  if position(o in v) = 0 then raise exception 'anchor not found'; end if;
  execute replace(v, o, $q$'title', case when public.community_has_mention_all(v_body) then '📢 ' || left(coalesce(v_sender,'UNEM ISCAE'), 60) || ' نبّه الجميع' else left(coalesce(v_sender,'UNEM ISCAE'), 60) || ' أشار إليك' end,$q$);
end $p$;

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
  -- @الكل في الرسائل: مسموح فقط للمشرف/مشرف الغرفة/مالك المجموعة، ويُنشئ إشارة لكل عضو
  v := public.unem_patch_text(v, $q$      return jsonb_build_object('ok',true,'id',v_message_id,'mentions',(select count(*) from community_message_mentions where message_id=v_message_id));$q$,
$q$      if public.community_has_mention_all(v_body) then
        if not (v_room_mod or (v_room like 'group:%' and exists(select 1 from community_groups g where g.id=substr(v_room,7)::uuid and g.owner=me.id))) then raise exception 'mention_all_forbidden'; end if;
        insert into community_message_mentions(message_id,profile,reg_no)
          select v_message_id, r.p, '' from (select distinct x.p from public.community_room_member_profiles(v_room) x) r where r.p is distinct from me.id on conflict do nothing;
      end if;
      return jsonb_build_object('ok',true,'id',v_message_id,'mentions',(select count(*) from community_message_mentions where message_id=v_message_id));$q$, 1);
  -- room_state: هل يستطيع المستخدم استعمال @الكل هنا
  v := public.unem_patch_text(v, $q$return jsonb_build_object('room',v_room,'locked',coalesce(v_locked,false),'can_manage',v_room_mod);$q$,
$q$return jsonb_build_object('room',v_room,'locked',coalesce(v_locked,false),'can_manage',v_room_mod,'can_all',(v_room_mod or (v_room like 'group:%' and exists(select 1 from community_groups g where g.id=substr(v_room,7)::uuid and g.owner=me.id))));$q$, 1);
  -- المنشورات والتعليقات: @الكل للمشرف فقط
  v := public.unem_patch_text(v, $q$  elsif p_action = 'post' then
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;$q$,
$q$  elsif p_action = 'post' then
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;
    if public.community_has_mention_all(v_body) and not adm then raise exception 'mention_all_forbidden'; end if;$q$, 1);
  v := public.unem_patch_text(v, $q$  elsif p_action = 'comment' then
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;$q$,
$q$  elsif p_action = 'comment' then
    v_body := btrim(coalesce(a->>'body',''));
    if v_body = '' then raise exception 'empty'; end if;
    if public.community_has_mention_all(v_body) and not adm then raise exception 'mention_all_forbidden'; end if;$q$, 1);
  v := public.unem_patch_text(v, $q$    insert into community_comments(post,author,body) values ((a->>'id')::uuid, me.id, left(v_body,1000));
    return '{}'::jsonb;$q$,
$q$    insert into community_comments(post,author,body) values ((a->>'id')::uuid, me.id, left(v_body,1000)) returning id into v_id;
    return jsonb_build_object('id', v_id);$q$, 1);
  -- تفضيلات كتم الإشعارات
  v := public.unem_patch_text(v, $q$  elsif p_action = 'groups' then$q$,
$q$  elsif p_action = 'push_prefs' then
    return coalesce((select jsonb_agg(m.key order by m.key) from community_push_mutes m where m.profile=me.id), '[]'::jsonb);

  elsif p_action = 'push_mute' then
    v_target := left(btrim(coalesce(a->>'key','')), 80);
    if v_target !~ '^(posts|general|sortants:[0-9]{1,3}|level:(L1|L2|L3)|spec:[A-Z0-9_]+|class:[A-Z0-9_]+:(L1|L2|L3|M1|M2)|group:[0-9a-fA-F-]{36}|dm:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36})$' then raise exception 'bad_room'; end if;
    if coalesce((a->>'muted')::boolean, false) then
      insert into community_push_mutes(profile,key) values (me.id, v_target) on conflict do nothing;
    else
      delete from community_push_mutes where profile=me.id and key=v_target;
    end if;
    return '{}'::jsonb;

  elsif p_action = 'groups' then$q$, 1);
  execute v;
end $patch$;

drop function public.unem_patch_text(text,text,text,int);
notify pgrst, 'reload schema';
