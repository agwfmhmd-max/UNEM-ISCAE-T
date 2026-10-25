-- إصلاح قيد community_messages الموروث الذي كان يرفض body='' حتى عند وجود مرفق.
-- يسمح بالنص الفارغ فقط إذا وُجد مسار وسيط؛ وتبقى الرسالة الفارغة بلا مرفق مرفوضة.
alter table public.community_messages
  drop constraint if exists community_messages_body_check;

alter table public.community_messages
  drop constraint if exists community_messages_body_or_media_check;

alter table public.community_messages
  add constraint community_messages_body_or_media_check
  check (
    char_length(body) between 0 and 1000
    and (char_length(body) > 0 or media_path is not null)
  );
