-- 1) وسم رسائل المشرفين (المشرف العام + مشرفو الغرفة) كي لا يظهر زر «إبلاغ» بجانبها، ومنع الإبلاغ عنها من الخادم.
-- 2) أدوات تشخيص إشعارات الإشارات: اختبار إرسال لجهاز الطالب نفسه، والتحقق من ربط الجهاز بحسابه.
-- 3) تعريف remove_push_subscription إن لم تكن موجودة (تستدعيها صفحات الموقع عند حذف اشتراك منتهٍ).

create or replace function public.community_push_test_targets(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_acc uuid; v_subs jsonb;
begin
  v_me := public.community_token_profile(p_token);
  if v_me is null then raise exception 'forbidden'; end if;
  select cp.account into v_acc from community_profiles cp where cp.id = v_me;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    into v_subs from push_subscriptions s where v_acc is not null and s.account = v_acc;
  return jsonb_build_object('title', '🔔 UNEM ISCAE', 'body', 'الإشعارات تعمل على هذا الجهاز ✓', 'url', '/community',
                            'tag', 'push-test', 'quiet', false, 'subs', v_subs);
end $$;
revoke all on function public.community_push_test_targets(text) from public;
grant execute on function public.community_push_test_targets(text) to anon, authenticated;

create or replace function public.community_push_linked(p_token text, p_endpoint text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid; v_acc uuid;
begin
  v_me := public.community_token_profile(p_token);
  if v_me is null or p_endpoint is null then return false; end if;
  select cp.account into v_acc from community_profiles cp where cp.id = v_me;
  return v_acc is not null and exists (select 1 from push_subscriptions s where s.endpoint = p_endpoint and s.account = v_acc);
end $$;
revoke all on function public.community_push_linked(text,text) from public;
grant execute on function public.community_push_linked(text,text) to anon, authenticated;

do $do$
begin
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'remove_push_subscription') then
    execute $f$
      create function public.remove_push_subscription(p_endpoint text) returns void
      language sql security definer set search_path = public as
      $b$ delete from public.push_subscriptions where endpoint = p_endpoint $b$
    $f$;
    execute 'revoke all on function public.remove_push_subscription(text) from public';
    execute 'grant execute on function public.remove_push_subscription(text) to anon, authenticated';
  end if;
end $do$;

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
  v := public.unem_patch_text(v, $q$ g.edited_at as ed, g.pinned as pin, g.media_kind,$q$,
    $q$ (pr.spec = 'ADMIN' or exists(select 1 from community_room_moderators rm2 where rm2.room = g.room and rm2.profile = g.author)) as stf, g.edited_at as ed, g.pinned as pin, g.media_kind,$q$, 1);
  v := public.unem_patch_text(v, $q$      select room into v_room from community_messages where id=v_message_id and expires_at>now();
      if not found then raise exception 'report_not_found'; end if;$q$,
    $q$      select room into v_room from community_messages where id=v_message_id and expires_at>now();
      if not found then raise exception 'report_not_found'; end if;
      if exists(select 1 from community_messages qm join community_profiles qp on qp.id = qm.author
                where qm.id = v_message_id and (qp.spec = 'ADMIN' or exists(select 1 from community_room_moderators qr where qr.room = v_room and qr.profile = qm.author))) then
        raise exception 'report_staff';
      end if;$q$, 1);
  execute v;
end $patch$;

drop function public.unem_patch_text(text,text,text,int);
notify pgrst, 'reload schema';
