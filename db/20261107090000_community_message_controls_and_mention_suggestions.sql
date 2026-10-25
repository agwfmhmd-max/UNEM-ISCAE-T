-- أدوات مستقلة ومقيّدة لحذف مرفق رسالة واقتراح من يمكن الإشارة إليه داخل الغرفة.
-- لا تكشف قوائم الطلاب خارج الغرفة المصرّح بها ولا تمنح حذفًا خارج الرسائل التي يملكها المستخدم أو يديرها.

create or replace function public.community_message_remove_media(p_token text, p_message_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  v_hash text;
  v_profile uuid;
  v_author uuid;
  v_room text;
  v_body text;
  v_path text;
  v_admin boolean := false;
begin
  if p_token is null or char_length(p_token) < 30 or p_message_id is null then
    raise exception 'forbidden';
  end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if auth.uid() is not null then
    v_admin := coalesce(public.is_community_staff(), false);
  end if;

  select cp.id into v_profile
  from public.student_devices d
  join public.student_accounts sa on sa.id=d.account and sa.status='approved'
  join public.community_profiles cp on cp.account=sa.id
  where d.token_hash=v_hash;
  if v_profile is null and v_admin then
    select cp.id into v_profile from public.community_profiles cp where cp.token_hash=v_hash;
  end if;
  if v_profile is null then raise exception 'forbidden'; end if;

  select m.author,m.room,m.body,m.media_path
    into v_author,v_room,v_body,v_path
  from public.community_messages m
  where m.id=p_message_id
  for update;
  if not found then raise exception 'forbidden'; end if;
  if not (v_admin or v_author=v_profile or exists(
    select 1 from public.community_room_moderators rm
    where rm.room=v_room and rm.profile=v_profile
  )) then
    raise exception 'forbidden';
  end if;
  if v_path is null then return jsonb_build_object('removed',false,'message_deleted',false); end if;

  -- لا نترك رسالة بلا نص ولا مرفق: حذف مرفق الرسالة الصوتية/الصورية المنفردة يحذف سجل الرسالة.
  if btrim(coalesce(v_body,''))='' then
    delete from public.community_messages where id=p_message_id;
    return jsonb_build_object('removed',true,'message_deleted',true);
  end if;

  -- دالة التنظيف الموثوقة تحفظ سلوك التنظيف نفسه عند حذف الرسالة؛ وعند الإبقاء على النص
  -- تزال بيانات التخزين القديمة ثم تزال حقول الوسيط من سجل الرسالة.
  delete from storage.objects where bucket_id='community-media' and name=v_path;
  update public.community_messages
  set media_kind=null,media_path=null,media_mime=null,media_name=null,media_size=null,edited_at=now()
  where id=p_message_id;
  return jsonb_build_object('removed',true,'message_deleted',false);
end;
$$;
revoke all on function public.community_message_remove_media(text,bigint) from public;
grant execute on function public.community_message_remove_media(text,bigint) to anon, authenticated;

create or replace function public.community_member_suggestions(p_token text, p_room text, p_prefix text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_hash text;
  v_profile uuid;
  v_spec text;
  v_level text;
  v_room text := left(btrim(coalesce(p_room,'')),120);
  v_prefix text := upper(btrim(coalesce(p_prefix,'')));
  v_admin boolean := false;
  v_allowed boolean := false;
  v_group uuid;
begin
  if p_token is null or char_length(p_token)<30 then raise exception 'forbidden'; end if;
  if v_prefix !~ '^I[0-9]{1,5}$' then return '[]'::jsonb; end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if auth.uid() is not null then
    v_admin := coalesce(public.is_community_staff(),false);
  end if;
  select cp.id,sa.spec,sa.level into v_profile,v_spec,v_level
  from public.student_devices d
  join public.student_accounts sa on sa.id=d.account and sa.status='approved'
  join public.community_profiles cp on cp.account=sa.id
  where d.token_hash=v_hash;
  if v_profile is null and v_admin then
    select cp.id into v_profile from public.community_profiles cp where cp.token_hash=v_hash;
  end if;
  if v_profile is null and not v_admin then raise exception 'forbidden'; end if;

  if v_room='general' then
    v_allowed := true;
  elsif v_room ~ '^spec:[A-Z0-9_]+$' then
    v_allowed := v_admin or substring(v_room from 6)=coalesce(v_spec,'');
  elsif v_room ~ '^class:[A-Z0-9_]+:(L1|L2|L3|M1|M2)$' then
    v_allowed := v_admin
      or (split_part(v_room,':',2)=coalesce(v_spec,'') and split_part(v_room,':',3)=coalesce(v_level,''))
      or exists(select 1 from public.community_room_moderators rm where rm.room=v_room and rm.profile=v_profile);
  elsif v_room ~ '^group:[0-9a-fA-F-]{36}$' then
    v_group := substring(v_room from 7)::uuid;
    v_allowed := v_admin or exists(
      select 1 from public.community_groups g
      join public.community_members cm on cm.grp=g.id
      where g.id=v_group and cm.profile=v_profile and g.spec=coalesce(v_spec,'') and g.level=coalesce(v_level,'')
    );
  elsif v_room ~ '^dm:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$' then
    v_allowed := v_admin or v_profile::text in (split_part(v_room,':',2),split_part(v_room,':',3));
  end if;
  if not v_allowed then raise exception 'forbidden'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('reg',q.reg_no,'name',left(q.full_name,80)) order by q.reg_no_norm)
    from (
      select distinct sa.reg_no,sa.reg_no_norm,sa.full_name
      from public.student_accounts sa
      where sa.status='approved'
        and upper(sa.reg_no_norm) like v_prefix||'%'
        and (
          v_room='general'
          or (v_room like 'spec:%' and sa.spec=substring(v_room from 6))
          or (v_room like 'class:%' and sa.spec=split_part(v_room,':',2) and sa.level=split_part(v_room,':',3))
          or (v_room like 'group:%' and exists(
            select 1 from public.community_members cm
            join public.community_profiles cp on cp.id=cm.profile
            where cm.grp=v_group and cp.account=sa.id
          ))
          or (v_room like 'dm:%' and exists(
            select 1 from public.community_profiles cp
            where cp.account=sa.id and cp.id::text in (split_part(v_room,':',2),split_part(v_room,':',3))
          ))
        )
      order by sa.reg_no_norm
      limit 8
    ) q
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.community_member_suggestions(text,text,text) from public;
grant execute on function public.community_member_suggestions(text,text,text) to anon, authenticated;
