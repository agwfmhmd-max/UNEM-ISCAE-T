-- 1) اسم المشرف الظاهر في المجتمع: MDA للمشرف الرئيسي، وUNEM ISCAE لأي مشرف نظام آخر (بدل Administration).
-- 2) صور المنشورات لمشرفي النظام فقط، وتُحذف من التخزين مع المنشور.
-- 3) بلاغ «شخص سجّل باسمي»: صورة إفادة التسجيل اختيارية يراها المشرف ثم تُمسح بعد البتّ في البلاغ.
-- 4) حذف دفعي لاشتراكات الإشعارات المنتهية (لخدمة الإرسال الجماعي السريع).

-- ===== 2) أعمدة صور المنشورات + تنظيف التخزين =====
alter table public.community_posts add column if not exists media_path text;
alter table public.community_posts add column if not exists media_mime text;

create or replace function public.community_post_media_cleanup() returns trigger
language plpgsql security definer set search_path = public, storage as $$
begin
  if old.media_path is not null then
    begin perform public.community_storage_delete_object(old.media_path);
    exception when others then raise warning 'post media cleanup failed: %', sqlerrm; end;
  end if;
  return old;
end $$;
drop trigger if exists community_posts_media_cleanup on public.community_posts;
create trigger community_posts_media_cleanup before delete on public.community_posts
  for each row execute function public.community_post_media_cleanup();

-- ===== 3) صورة الإثبات في بلاغ الانتحال =====
alter table public.student_device_reports add column if not exists evidence_image text;
alter table public.student_device_reports drop constraint if exists student_device_reports_evidence_check;
alter table public.student_device_reports add constraint student_device_reports_evidence_check
  check (evidence_image is null or (char_length(evidence_image) <= 900000 and evidence_image ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));

-- ===== 4) حذف دفعي لاشتراكات الإشعارات المنتهية =====
create or replace function public.community_prune_push(p_endpoints text[]) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if p_endpoints is null or array_length(p_endpoints,1) is null or array_length(p_endpoints,1) > 200 then return 0; end if;
  delete from push_subscriptions where endpoint = any(p_endpoints);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.community_prune_push(text[]) from public;
grant execute on function public.community_prune_push(text[]) to anon, authenticated;

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
  -- ---------- community_api ----------
  v := replace(pg_get_functiondef('public.community_api(text,text,jsonb)'::regprocedure), E'\r', '');
  -- (1) اسم المشرف
  v := public.unem_patch_text(v, $q$values(v_hash,'Administration','ADMIN','ADMIN') returning * into me;
    end if;$q$,
$q$values(v_hash, case when v_is_primary_admin then 'MDA' else 'UNEM ISCAE' end,'ADMIN','ADMIN') returning * into me;
    end if;
    if adm and me.id is not null and me.spec = 'ADMIN'
       and me.name is distinct from (case when v_is_primary_admin then 'MDA' else 'UNEM ISCAE' end) then
      update community_profiles set name = case when v_is_primary_admin then 'MDA' else 'UNEM ISCAE' end where id = me.id returning * into me;
    end if;$q$, 1);
  -- (2) صور المنشورات: القراءة
  v := public.unem_patch_text(v, $q$p.level, p.subject, p.created_at as t, p.author as aid, pr.name as an,$q$,
                                 $q$p.level, p.subject, p.media_path, p.media_mime, p.created_at as t, p.author as aid, pr.name as an,$q$, 1);
  -- (2) صور المنشورات: النشر (مشرفو النظام فقط)
  v := public.unem_patch_text(v, $q$    if v_body = '' then raise exception 'empty'; end if;
    if public.community_has_mention_all(v_body) and not adm then raise exception 'mention_all_forbidden'; end if;
    select count(*) into v_n from community_posts where author=me.id$q$,
$q$    v_media_path := nullif(btrim(coalesce(a->>'media_path','')),'');
    v_media_mime := nullif(btrim(coalesce(a->>'media_mime','')),'');
    if v_media_path is not null then
      if not adm then raise exception 'post_media_forbidden'; end if;
      if v_media_path !~ '^community/[A-Za-z0-9_.-]{8,120}$' or coalesce(v_media_mime,'') !~ '^image/(jpeg|png|webp)$'
         or not exists(select 1 from storage.objects o where o.bucket_id = 'community-media' and o.name = v_media_path) then
        raise exception 'bad_media';
      end if;
      if v_body = '' then v_body := '📷'; end if;
    end if;
    if v_body = '' then raise exception 'empty'; end if;
    if public.community_has_mention_all(v_body) and not adm then raise exception 'mention_all_forbidden'; end if;
    select count(*) into v_n from community_posts where author=me.id$q$, 1);
  v := public.unem_patch_text(v, $q$    insert into community_posts(author,kind,body,spec,level,subject,expires_at)
    values (me.id, a->>'kind', left(v_body,3000), me.spec, me.level,
            nullif(left(btrim(coalesce(a->>'subject','')),60),''),
            now() + interval '7 days')$q$,
$q$    insert into community_posts(author,kind,body,spec,level,subject,expires_at,media_path,media_mime)
    values (me.id, a->>'kind', left(v_body,3000), me.spec, me.level,
            nullif(left(btrim(coalesce(a->>'subject','')),60),''),
            now() + interval '7 days', v_media_path, case when v_media_path is null then null else v_media_mime end)$q$, 1);
  execute v;

  -- ---------- student_gate: صورة إفادة التسجيل (اختيارية) ----------
  v := replace(pg_get_functiondef('public.student_gate(text,text,jsonb)'::regprocedure), E'\r', '');
  v := public.unem_patch_text(v, $q$v_registration_enabled boolean;
begin$q$, $q$v_registration_enabled boolean; v_img text;
begin$q$, 1);
  v := public.unem_patch_text(v, $q$    insert into public.student_device_reports(account,reporter_device_hash,target_device_hash,device_type,message)
      values(acc.id,v_hash,v_target_hash,v_type,v_report);$q$,
$q$    v_img := nullif(btrim(coalesce(a->>'image','')),'');
    if v_img is not null and (char_length(v_img) > 900000 or v_img !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then
      return jsonb_build_object('error','bad_image');
    end if;
    insert into public.student_device_reports(account,reporter_device_hash,target_device_hash,device_type,message,evidence_image)
      values(acc.id,v_hash,v_target_hash,v_type,v_report,v_img);$q$, 1);
  execute v;

  -- ---------- student_device_admin: عرض الصورة للمشرف ثم مسحها بعد البتّ ----------
  v := replace(pg_get_functiondef('public.student_device_admin(text,jsonb)'::regprocedure), E'\r', '');
  v := public.unem_patch_text(v, $q$select r.id,r.account,r.device_type,r.message,r.status,r.created_at,r.resolved_at,$q$,
                                 $q$select r.id,r.account,r.device_type,r.message,r.status,r.created_at,r.resolved_at,(r.evidence_image is not null) as has_image,$q$, 1);
  v := public.unem_patch_text(v, $q$  elsif p_action = 'ban_report' then$q$,
$q$  elsif p_action = 'report_image' then
    if not public.has_supervisor_permission('view_student_registrations') then raise exception 'forbidden'; end if;
    begin v_id:=(a->>'id')::uuid; exception when others then raise exception 'bad_report'; end;
    return jsonb_build_object('image', (select r.evidence_image from public.student_device_reports r where r.id = v_id));
  elsif p_action = 'ban_report' then$q$, 1);
  v := public.unem_patch_text(v, $q$update public.student_device_reports set status='banned',resolved_at=now(),resolved_by=auth.uid() where id=v_id;$q$,
                                 $q$update public.student_device_reports set status='banned',resolved_at=now(),resolved_by=auth.uid(),evidence_image=null where id=v_id;$q$, 1);
  v := public.unem_patch_text(v, $q$update public.student_device_reports set status='rejected',resolved_at=now(),resolved_by=auth.uid()$q$,
                                 $q$update public.student_device_reports set status='rejected',resolved_at=now(),resolved_by=auth.uid(),evidence_image=null$q$, 1);
  execute v;
end $patch$;

drop function public.unem_patch_text(text,text,text,int);

-- أسماء المشرفين القديمة (المشرف الرئيسي الوحيد حالياً) → MDA؛ ويُصحَّح أي مشرف آخر تلقائياً عند أول دخول له
update public.community_profiles set name = 'MDA' where spec = 'ADMIN' and name = 'Administration';
notify pgrst, 'reload schema';
