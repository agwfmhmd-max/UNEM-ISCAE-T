-- إصلاح جذري لحذف مرفقات المجتمع.
-- السبب: Supabase يضيف trigger باسم storage.protect_delete يرفض أي DELETE مباشر على storage.objects
-- ما لم يكن storage.allow_delete_query='true' في الجلسة، فكانت كل الدوال والـ triggers تفشل.
-- الحل: دالة مساعدة واحدة تضبط الإعداد محليًا (للمعاملة فقط) ثم تحذف الملف، وتستخدمها كل المسارات.
-- (مطبّق على قاعدة البيانات عبر migration: community_media_delete_bypass_storage_protect_delete)

create or replace function public.community_storage_delete_object(p_path text)
returns void language plpgsql security definer
set search_path = public, storage set row_security = off as $$
begin
  if p_path is null or btrim(p_path) = '' then return; end if;
  perform set_config('storage.allow_delete_query','true', true);
  delete from storage.objects where bucket_id='community-media' and name=p_path;
  perform set_config('storage.allow_delete_query','false', true);
end;
$$;
revoke all on function public.community_storage_delete_object(text) from public, anon, authenticated;

create or replace function public.community_message_media_cleanup()
returns trigger language plpgsql security definer set search_path = public, storage as $$
begin
  if old.media_path is not null then
    begin perform public.community_storage_delete_object(old.media_path);
    exception when others then raise warning 'community media cleanup failed: %', sqlerrm; end;
  end if;
  return old;
end $$;

create or replace function public.community_cleanup_deleted_message_media()
returns trigger language plpgsql security definer set search_path = public, storage as $$
begin
  if old.media_path is not null then
    begin perform public.community_storage_delete_object(old.media_path);
    exception when others then raise warning 'community media cleanup failed: %', sqlerrm; end;
  end if;
  return old;
end $$;

create or replace function public.community_remove_message_media_trigger()
returns trigger language plpgsql security definer set search_path = public, storage set row_security = off as $$
begin
  if old.media_path is not null then
    begin perform public.community_storage_delete_object(old.media_path);
    exception when others then raise warning 'community media cleanup failed: %', sqlerrm; end;
  end if;
  return old;
end $$;

create or replace function public.community_remove_message_media(p_token text, p_message_id bigint)
returns jsonb language plpgsql security definer
set search_path = public, auth, storage set row_security = off as $$
declare
  v_hash text := encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex');
  v_profile uuid; v_account uuid; v_author uuid;
  v_room text; v_body text; v_path text;
  v_staff boolean := false;
begin
  if coalesce(char_length(p_token),0) < 30 or p_message_id is null then
    raise exception 'community_media_forbidden';
  end if;
  if auth.uid() is not null then v_staff := coalesce(public.is_community_staff(),false); end if;

  select d.account into v_account from public.student_devices d where d.token_hash=v_hash limit 1;
  select p.id into v_profile from public.community_profiles p
   where p.token_hash=v_hash or (v_account is not null and p.account=v_account)
   order by (p.account is not null) desc limit 1;

  select m.author,m.room,m.body,m.media_path into v_author,v_room,v_body,v_path
  from public.community_messages m where m.id=p_message_id for update;
  if not found then raise exception 'community_media_not_found'; end if;
  if v_path is null then return jsonb_build_object('removed',false,'message_deleted',false); end if;

  if not (v_staff or (v_profile is not null and v_author=v_profile) or exists(
    select 1 from public.community_room_moderators rm where rm.room=v_room and rm.profile=v_profile
  )) then raise exception 'community_media_forbidden'; end if;

  if btrim(coalesce(v_body,''))='' then
    delete from public.community_messages where id=p_message_id;
    return jsonb_build_object('removed',true,'message_deleted',true);
  end if;

  begin perform public.community_storage_delete_object(v_path);
  exception when others then raise warning 'community media delete failed: %', sqlerrm; end;

  update public.community_messages
  set media_kind=null,media_path=null,media_mime=null,media_name=null,media_size=null,edited_at=now()
  where id=p_message_id;
  return jsonb_build_object('removed',true,'message_deleted',false);
end;
$$;
revoke all on function public.community_remove_message_media(text,bigint) from public;
grant execute on function public.community_remove_message_media(text,bigint) to anon,authenticated;

create or replace function public.community_message_remove_media(p_token text, p_message_id bigint)
returns jsonb language sql security definer set search_path = public, auth, storage as $$
  select public.community_remove_message_media(p_token, p_message_id);
$$;
revoke all on function public.community_message_remove_media(text,bigint) from public;
grant execute on function public.community_message_remove_media(text,bigint) to anon,authenticated;

notify pgrst,'reload schema';
