-- ===== اختبارات أمان قاعدة البيانات (حارس ضد فتح صلاحية عامة بالخطأ) =====
-- تُشغَّل على قاعدة مبنية من الصفر بعد checks.sql. أي فشل يوقف التنفيذ برسالة SECURITY FAIL.
do $$
declare
  expected_anon_fns text[] := array[
    'assign_default_role','can_upload','community_api','document_type_allowed_for_subject','documents_normalize','documents_validate_file_type',
    'effective_document_types_for_subject','get_my_role','get_public_platform_stats','get_public_visitor_stats','has_role',
    'remove_push_subscription','repair_cloudinary_urls','save_fcm_token','save_push_subscription','student_gate',
    'student_level_rank','student_names_match','student_norm_name','student_norm_reg','student_view','touch_updated_at'];
  actual text[]; bad text; t text; got text; n int;
  sensitive text[] := array['community_comments','community_groups','community_likes','community_members','community_messages','community_posts',
    'community_profiles','community_reports','community_search_log','student_accounts','student_devices','student_roster','student_sessions',
    'supervisor_permissions','user_roles','fcm_tokens','push_notifications_log','whatsapp_groups'];
begin
  -- 1) RLS مفعّل على كل جداول public
  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname='public'
   where c.relkind='r' and not c.relrowsecurity;
  if bad is not null then raise exception 'SECURITY FAIL: جداول بلا RLS: %', bad; end if;

  -- 2) الجداول الحساسة: لا صلاحية لـ anon إطلاقاً
  select string_agg(table_name||':'||privilege_type, ', ') into bad from information_schema.role_table_grants
   where table_schema='public' and grantee='anon' and table_name = any(sensitive);
  if bad is not null then raise exception 'SECURITY FAIL: anon يملك صلاحية على جداول حساسة: %', bad; end if;

  -- 3) قائمة الدوال القابلة للتنفيذ من anon محددة بالاسم؛ أي دالة جديدة تحتاج مراجعة وإضافتها هنا عمداً
  select array_agg(p.proname order by p.proname) into actual from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace and ns.nspname='public'
   where p.prokind='f' and has_function_privilege('anon', p.oid, 'execute');
  if actual is distinct from (select array_agg(x order by x) from unnest(expected_anon_fns) x) then
    raise exception 'SECURITY FAIL: قائمة الدوال المتاحة لـ anon تغيّرت. جديدة: %  | مفقودة: %',
      (select array_agg(x) from unnest(actual) x where x <> all(expected_anon_fns)),
      (select array_agg(x) from unnest(expected_anon_fns) x where x <> all(actual));
  end if;

  -- 4) كل دالة SECURITY DEFINER لها search_path ثابت (ضد اختطاف المسار)
  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace and ns.nspname='public'
   where p.prokind='f' and p.prosecdef and not exists (select 1 from pg_options_to_table(p.proconfig) where option_name='search_path');
  if bad is not null then raise exception 'SECURITY FAIL: دوال SECURITY DEFINER بلا search_path: %', bad; end if;

  -- 5) سلوك فعلي كزائر مجهول (anon)
  insert into public.push_subscriptions(endpoint, p256dh, auth) values ('https://push.example/secret-endpoint', 'k', 'a') on conflict do nothing;
  set local role anon;
  foreach t in array sensitive loop
    got := 'نجح بلا خطأ';
    begin execute format('select 1 from public.%I limit 1', t); exception when insufficient_privilege then got := 'denied'; end;
    if got <> 'denied' then reset role; raise exception 'SECURITY FAIL: anon قرأ الجدول الحساس %', t; end if;
  end loop;
  select count(*) into n from public.push_subscriptions;
  if n <> 0 then reset role; raise exception 'SECURITY FAIL: anon يرى % اشتراكاً من push_subscriptions', n; end if;
  got := 'نجح'; begin select count(*) into n from public.analytics; if n = 0 then got := 'denied'; end if; exception when insufficient_privilege then got := 'denied'; end;
  if got <> 'denied' then reset role; raise exception 'SECURITY FAIL: anon يقرأ analytics'; end if;
  got := 'نجح'; begin perform public.set_public_stat_visibility('show_visitors_count', false); exception when insufficient_privilege then got := 'denied'; end;
  if got <> 'denied' then reset role; raise exception 'SECURITY FAIL: anon نفّذ set_public_stat_visibility'; end if;
  got := 'نجح'; begin perform public.reset_onboarding_prompts(); exception when insufficient_privilege then got := 'denied'; end;
  if got <> 'denied' then reset role; raise exception 'SECURITY FAIL: anon نفّذ reset_onboarding_prompts'; end if;
  got := 'نجح'; begin perform * from public.repair_cloudinary_urls('evil'); exception when others then got := 'blocked'; end;
  if got <> 'blocked' then reset role; raise exception 'SECURITY FAIL: anon نفّذ repair_cloudinary_urls'; end if;
  got := 'نجح'; begin insert into public.documents(name) values ('x'); exception when others then got := 'blocked'; end;
  if got <> 'blocked' then reset role; raise exception 'SECURITY FAIL: anon كتب في documents'; end if;
  -- نقاط الدخول العامة ترفض الرموز غير الصالحة
  if (public.student_gate('short','status','{}'::jsonb)->>'error') <> 'bad_token' then reset role; raise exception 'SECURITY FAIL: student_gate قبل رمزاً قصيراً'; end if;
  if (public.community_api(repeat('q',40),'feed','{}'::jsonb)->>'need_register') is distinct from 'true' then reset role; raise exception 'SECURITY FAIL: community_api أعاد بيانات لرمز مجهول'; end if;
  -- رمز مجهول لا يصل لأي إجراء إداري: النتيجة طلب تسجيل بلا بيانات (posts/messages/...)
  declare r jsonb;
  begin
    r := public.community_api(repeat('q',40),'admin_list','{}'::jsonb);
    if not (r ? 'need_register') or r ? 'posts' or r ? 'messages' then reset role; raise exception 'SECURITY FAIL: رمز مجهول وصل إلى admin_list: %', left(r::text,120); end if;
  exception when others then
    if sqlerrm like 'SECURITY FAIL%' then raise; end if;   -- خطأ مرفوض من الدالة نفسها مقبول أيضاً
  end;
  reset role;

  -- 6) مستخدم مسجّل غير مشرف (authenticated) لا يتجاوز صلاحياته
  insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000aa','plain@test.local') on conflict do nothing;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000aa', true);
  set local role authenticated;
  select count(*) into n from public.user_roles where user_id <> '00000000-0000-0000-0000-0000000000aa';
  if n <> 0 then reset role; raise exception 'SECURITY FAIL: مستخدم عادي يرى أدوار الآخرين'; end if;
  select count(*) into n from public.push_subscriptions;
  if n <> 0 then reset role; raise exception 'SECURITY FAIL: مستخدم عادي يرى اشتراكات الإشعارات'; end if;
  got := 'نجح'; begin perform public.set_public_stat_visibility('show_visitors_count', false); exception when others then got := 'blocked'; end;
  if got <> 'blocked' then reset role; raise exception 'SECURITY FAIL: مستخدم عادي غيّر إعداداً عاماً'; end if;
  got := 'نجح'; begin insert into public.announcements(message,start_date,end_date) values ('x',now(),now()); exception when others then got := 'blocked'; end;
  if got <> 'blocked' then reset role; raise exception 'SECURITY FAIL: مستخدم عادي أنشأ إعلاناً'; end if;
  got := 'نجح'; begin perform public.reset_onboarding_prompts(); exception when others then got := 'blocked'; end;
  if got <> 'blocked' then reset role; raise exception 'SECURITY FAIL: مستخدم عادي أعاد إظهار النوافذ'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub','', true);
  raise notice '✅ كل اختبارات الأمان نجحت';
end $$;
