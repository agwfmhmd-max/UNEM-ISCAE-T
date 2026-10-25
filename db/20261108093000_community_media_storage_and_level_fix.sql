-- UNEM ISCAE — إصلاح نهائي ومباشر للمرفقات وغرف المستويات.
-- يطبق بعد 20261108090000_community_scope_rooms_mentions_media.sql.

-- 1) ضمان وجود bucket وإعداداته حتى لا يفشل الرفع على الهاتف برسالة صلاحية التخزين.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'community-media','community-media',true,104857600,
  array['image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/aac']::text[]
)
on conflict (id) do update set
  name=excluded.name,
  public=true,
  file_size_limit=104857600,
  allowed_mime_types=excluded.allowed_mime_types;

-- 2) إعادة إنشاء سياسات Storage باسم ثابت؛ هذا يعالج قواعد قديمة أو ناقصة في المشروع.
drop policy if exists community_media_public_read on storage.objects;
create policy community_media_public_read
on storage.objects for select
to anon, authenticated
using (bucket_id='community-media');

drop policy if exists community_media_anon_upload on storage.objects;
create policy community_media_anon_upload
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id='community-media'
  and name ~ '^community/[A-Za-z0-9._/-]+$'
);

drop policy if exists community_media_staff_delete on storage.objects;
create policy community_media_staff_delete
on storage.objects for delete
to authenticated
using (bucket_id='community-media' and public.is_community_staff());

-- 3) حذف المرفق: صاحب الرسالة أو مشرف الغرفة أو المشرف العام.
-- إذا كانت الرسالة مرفقًا فقط، يحذف سجل الرسالة كاملًا؛ وإلا يزال المرفق فقط.
create or replace function public.community_message_remove_media(p_token text, p_message_id bigint)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,storage
as $$
declare
  v_hash text;
  v_profile uuid;
  v_author uuid;
  v_room text;
  v_body text;
  v_path text;
  v_admin boolean := false;
  v_account uuid;
begin
  if p_token is null or char_length(p_token)<30 or p_message_id is null then
    raise exception 'forbidden';
  end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if auth.uid() is not null then
    v_admin := coalesce(public.is_community_staff(),false);
  end if;

  select d.account into v_account
  from public.student_devices d
  where d.token_hash=v_hash
  limit 1;

  select cp.id into v_profile
  from public.community_profiles cp
  where cp.token_hash=v_hash
     or (v_account is not null and cp.account=v_account)
  order by (cp.account is not null) desc
  limit 1;

  if v_profile is null and not v_admin then raise exception 'forbidden'; end if;

  select m.author,m.room,m.body,m.media_path
    into v_author,v_room,v_body,v_path
  from public.community_messages m
  where m.id=p_message_id
  for update;
  if not found then raise exception 'forbidden'; end if;

  if not (
    v_admin
    or v_author=v_profile
    or exists(
      select 1 from public.community_room_moderators rm
      where rm.room=v_room and rm.profile=v_profile
    )
  ) then raise exception 'forbidden'; end if;

  if v_path is null then
    return jsonb_build_object('removed',false,'message_deleted',false);
  end if;

  if btrim(coalesce(v_body,''))='' then
    delete from public.community_messages where id=p_message_id;
    return jsonb_build_object('removed',true,'message_deleted',true);
  end if;

  delete from storage.objects
  where bucket_id='community-media' and name=v_path;

  update public.community_messages
  set media_kind=null,
      media_path=null,
      media_mime=null,
      media_name=null,
      media_size=null,
      edited_at=now()
  where id=p_message_id;

  return jsonb_build_object('removed',true,'message_deleted',false);
end;
$$;
revoke all on function public.community_message_remove_media(text,bigint) from public;
grant execute on function public.community_message_remove_media(text,bigint) to anon,authenticated;

-- 4) تنظيف Storage حتى عند حذف الرسالة من أي مسار: الطالب أو المشرف أو انتهاء الرسالة.
create or replace function public.community_cleanup_deleted_message_media()
returns trigger
language plpgsql
security definer
set search_path=public,storage
as $$
begin
  if old.media_path is not null then
    delete from storage.objects
    where bucket_id='community-media' and name=old.media_path;
  end if;
  return old;
end;
$$;
drop trigger if exists community_cleanup_deleted_message_media on public.community_messages;
create trigger community_cleanup_deleted_message_media
after delete on public.community_messages
for each row execute function public.community_cleanup_deleted_message_media();

notify pgrst,'reload schema';
