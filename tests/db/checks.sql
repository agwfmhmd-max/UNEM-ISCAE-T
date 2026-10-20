-- اختبارات وظيفية للقاعدة بعد بنائها من الصفر. أي فشل يوقف التنفيذ برسالة FAIL: ...
create function pg_temp.api(p_token text, p_action text, p_args jsonb default '{}') returns jsonb
language sql as $$ select public.community_api(p_token, p_action, p_args) $$;

create function pg_temp.expect_err(p_token text, p_action text, p_args jsonb, p_err text) returns void
language plpgsql as $$
declare got text := null;
begin
  begin perform public.community_api(p_token, p_action, p_args);
  exception when others then got := sqlerrm; end;
  if got is distinct from p_err then
    raise exception 'FAIL: % متوقع خطأ "%" لكن النتيجة "%"', p_action, p_err, coalesce(got,'نجاح بلا خطأ');
  end if;
end $$;

create function pg_temp.must(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin if not coalesce(p_cond,false) then raise exception 'FAIL: %', p_msg; end if; end $$;

create function pg_temp.mk_student(p_reg text, p_name text, p_spec text, p_level text, p_status text, p_token text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.student_accounts(reg_no, reg_no_norm, full_name, name_norm, spec, level, status)
  values (p_reg, public.student_norm_reg(p_reg), p_name, lower(p_name), p_spec, p_level, p_status) returning id into v;
  if p_token is not null then
    insert into public.student_devices(token_hash, account) values (encode(sha256(convert_to(p_token,'UTF8')),'hex'), v);
  end if;
  return v;
end $$;

do $$
declare
  tA text := repeat('a',40); tB text := repeat('b',40); tC text := repeat('c',40); tD text := repeat('d',40); tAdm text := repeat('z',40);
  idA uuid; idB uuid; idC uuid; pa uuid; pb uuid; pc uuid; adm uuid;
  r jsonb; pid uuid; cid uuid; mid bigint; mid2 bigint; n int; room text;
  accB uuid;
begin
  ------------------------------------------------------------ A) الجداول المعاد بناؤها
  perform pg_temp.must((select count(*) from information_schema.tables where table_schema='public' and table_name in
    ('announcements','curriculum_subject_overrides','master_subjects','shared_subject_groups','shared_subject_members','site_settings','student_results','study_schedules')) = 8,
    'ملف الأساس لم ينشئ الجداول الثمانية');
  perform pg_temp.must(to_regprocedure('public.cleanup_expired_push_subscriptions(integer)') is not null, 'دالة تنظيف الإشعارات غير موجودة');

  ------------------------------------------------------------ B) حسابات
  idA := pg_temp.mk_student('I18001','Student Alpha','BA','L3','approved',tA);
  accB := pg_temp.mk_student('I18002','Student Beta','FC','L1','approved',tB);  idB := accB;
  idC := pg_temp.mk_student('I18003','Student Gamma','TCM','L2','approved',tC);
  perform pg_temp.mk_student('I18004','Student Pending','IG','L1','pending',tD);
  pa := (pg_temp.api(tA,'me')->>'id')::uuid; pb := (pg_temp.api(tB,'me')->>'id')::uuid; pc := (pg_temp.api(tC,'me')->>'id')::uuid;
  perform pg_temp.must(pa is not null and pb is not null and pc is not null and pa<>pb, 'تعذر إنشاء ملفات المجتمع');
  r := pg_temp.api(tD,'me'); perform pg_temp.must((r->>'need_register')::boolean, 'حساب معلّق يجب ألا يدخل المجتمع');

  ------------------------------------------------------------ C) المنشورات: ظهور لكل المعهد + تعديل لصاحبه فقط
  perform pg_temp.api(tA,'post','{"kind":"question","body":"سؤال من BA"}');
  r := pg_temp.api(tB,'feed');   -- B من FC/L1 يرى منشور BA/L3
  perform pg_temp.must(jsonb_array_length(r)=1, 'طالب من تخصص آخر لا يرى المنشور');
  pid := (r->0->>'id')::uuid;
  perform pg_temp.must((r->0->>'can_edit')::boolean = false, 'can_edit يجب أن تكون false لغير الكاتب');
  perform pg_temp.expect_err(tB,'edit_post',jsonb_build_object('id',pid,'body','تخريب'),'forbidden');
  perform pg_temp.api(tA,'edit_post',jsonb_build_object('id',pid,'body','سؤال معدّل'));
  r := pg_temp.api(tA,'feed');
  perform pg_temp.must(r->0->>'body'='سؤال معدّل' and (r->0->>'ed') is not null and (r->0->>'can_edit')::boolean, 'تعديل المنشور لم يُحفظ');
  perform pg_temp.expect_err(tA,'edit_post',jsonb_build_object('id',pid,'body','   '),'empty');

  ------------------------------------------------------------ D) التعليقات
  perform pg_temp.api(tA,'comment',jsonb_build_object('id',pid,'body','تعليق A'));
  perform pg_temp.api(tB,'comment',jsonb_build_object('id',pid,'body','تعليق B'));
  r := pg_temp.api(tB,'comments',jsonb_build_object('id',pid));
  perform pg_temp.must(jsonb_array_length(r)=2, 'التعليقات لا تظهر للطالب من تخصص آخر');
  select (x->>'id')::uuid into cid from jsonb_array_elements(r) x where x->>'body'='تعليق A';
  perform pg_temp.expect_err(tB,'edit_comment',jsonb_build_object('id',cid,'body','x'),'forbidden');
  perform pg_temp.api(tA,'edit_comment',jsonb_build_object('id',cid,'body','تعليق A معدّل'));
  perform pg_temp.must((select count(*) from public.community_comments where body='تعليق A معدّل' and edited_at is not null)=1, 'تعديل التعليق لم يُحفظ');
  perform pg_temp.expect_err(tB,'del_comment',jsonb_build_object('id',cid),null);  -- حذف تعليق الغير لا يحذف شيئاً (لا خطأ)
  perform pg_temp.must((select count(*) from public.community_comments where id=cid)=1, 'طالب حذف تعليق غيره!');

  ------------------------------------------------------------ E) الرسائل: غرفة عامة
  perform pg_temp.api(tB,'send',jsonb_build_object('room','general','body','رسالة B'));
  perform pg_temp.api(tA,'send',jsonb_build_object('room','general','body','رسالة A'));
  r := pg_temp.api(tA,'msgs',jsonb_build_object('room','general','after',0));
  perform pg_temp.must(jsonb_array_length(r)=2, 'الرسائل لا تظهر');
  select (x->>'id')::bigint into mid from jsonb_array_elements(r) x where x->>'body'='رسالة A';
  select (x->>'id')::bigint into mid2 from jsonb_array_elements(r) x where x->>'body'='رسالة B';
  perform pg_temp.expect_err(tA,'edit_message',jsonb_build_object('id',mid2,'body','x'),'forbidden');
  perform pg_temp.api(tA,'edit_message',jsonb_build_object('id',mid,'body','رسالة A معدّلة'));
  r := pg_temp.api(tB,'msgs_sync',jsonb_build_object('room','general','ids',jsonb_build_array(mid,mid2)));
  perform pg_temp.must(jsonb_array_length(r)=2 and exists(select 1 from jsonb_array_elements(r) x where x->>'body'='رسالة A معدّلة' and x->>'ed' is not null), 'msgs_sync لا يعيد التعديل');
  perform pg_temp.expect_err(tA,'del_message',jsonb_build_object('id',mid2),'forbidden');
  perform pg_temp.api(tB,'del_message',jsonb_build_object('id',mid2));
  r := pg_temp.api(tA,'msgs_sync',jsonb_build_object('room','general','ids',jsonb_build_array(mid,mid2)));
  perform pg_temp.must(jsonb_array_length(r)=1, 'الرسالة المحذوفة ما زالت تظهر في المزامنة');

  ------------------------------------------------------------ F) رسالة خاصة بين تخصصين مختلفين + خصوصية
  room := 'dm:'||least(pa::text,pb::text)||':'||greatest(pa::text,pb::text);
  perform pg_temp.api(tA,'send',jsonb_build_object('room',room,'body','خاص A→B'));
  r := pg_temp.api(tB,'msgs',jsonb_build_object('room',room,'after',0));
  perform pg_temp.must(jsonb_array_length(r)=1, 'المراسلة الخاصة بين تخصصين مختلفين لا تعمل');
  perform pg_temp.expect_err(tC,'msgs',jsonb_build_object('room',room,'after',0),'forbidden');
  perform pg_temp.expect_err(tC,'send',jsonb_build_object('room',room,'body','تطفل'),'forbidden');

  ------------------------------------------------------------ G) البحث برقم التسجيل
  r := pg_temp.api(tA,'find_student','{"reg":" i18002 "}');
  perform pg_temp.must((r->>'found')::boolean and (r->>'registered')::boolean and (r->>'id')::uuid=pb and not (r->>'online')::boolean and (r->>'active')::boolean, 'نتيجة البحث لطالب مسجّل (بلا جلسة نشطة): غير صحيحة');
  insert into public.student_sessions(session_id, account, device_hash, last_seen) values (gen_random_uuid(), accB, 'x', now());
  r := pg_temp.api(tA,'find_student','{"reg":"I18002"}');
  perform pg_temp.must((r->>'online')::boolean and (r->>'active')::boolean, 'حالة متصل الآن غير صحيحة');
  update public.student_sessions set last_seen = now() - interval '2 hours' where account = accB;
  update public.student_devices set last_seen = now() - interval '2 hours' where account = accB;
  r := pg_temp.api(tA,'find_student','{"reg":"I18002"}');
  perform pg_temp.must(not (r->>'online')::boolean and (r->>'active')::boolean and (r->>'last_seen') is not null, 'حالة آخر ظهور غير صحيحة');
  delete from public.community_search_log;   -- نحاكي مرور الدقيقة
  r := pg_temp.api(tA,'find_student','{"reg":"I18004"}');   -- حساب معلّق = لم يسجّل بعد
  perform pg_temp.must((r->>'found')::boolean and not (r->>'registered')::boolean and not (r->>'active')::boolean, 'حساب معلّق يجب أن يظهر غير نشط');
  perform pg_temp.must((r->>'name') = 'S… P…', 'اسم غير المسجّل يجب أن يكون مقنَّعاً: ' || (r->>'name'));
  perform pg_temp.must(position('Pending' in (r->>'name')) = 0, 'الاسم الكامل لغير المسجّل تسرّب');
  perform pg_temp.must((pg_temp.api(tA,'find_student','{"reg":"I18002"}')->>'name') = 'Student Beta', 'اسم المسجّل يجب أن يبقى كاملاً');
  perform pg_temp.must(public.mask_person_name('  أحمد   محمد  سالم ') = 'أ… م… س…' and public.mask_person_name('A') = 'A' and public.mask_person_name(null) is null and public.mask_person_name('   ') is null, 'mask_person_name: حالات حدّية');
  delete from public.community_search_log;
  r := pg_temp.api(tA,'find_student','{"reg":"nope999"}');
  perform pg_temp.must(not (r->>'found')::boolean, 'رقم مجهول يجب ألا يوجد');
  r := pg_temp.api(tA,'find_student','{"reg":"I18001"}');
  perform pg_temp.must((r->>'self')::boolean, 'البحث عن نفسه يجب أن يشير self');
  delete from public.community_search_log;
  -- الحد: 4 عمليات في الدقيقة (A أجرى 5 بالفعل أعلاه → الخامسة فما بعد مرفوضة؛ نتحقق بطالب جديد)
  perform pg_temp.api(tC,'find_student','{"reg":"I18001"}'); perform pg_temp.api(tC,'find_student','{"reg":"I18001"}');
  perform pg_temp.api(tC,'find_student','{"reg":"I18001"}'); perform pg_temp.api(tC,'find_student','{"reg":"I18001"}');
  perform pg_temp.expect_err(tC,'find_student','{"reg":"I18001"}','rate');

  ------------------------------------------------------------ H) المشرف: تثبيت وتمديد وقائمة محدودة
  insert into auth.users(id,email) values (gen_random_uuid(),'admin@test.local') returning id into adm;
  insert into public.user_roles(user_id, role) values (adm, 'admin');
  perform pg_temp.expect_err(tA,'admin_pin',jsonb_build_object('type','post','id',pid,'pinned',true),'forbidden');
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform pg_temp.api(tAdm,'admin_pin',jsonb_build_object('type','post','id',pid,'pinned',true));
  perform pg_temp.api(tAdm,'admin_pin',jsonb_build_object('type','message','id',mid,'pinned',true));
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.must((select expires_at='infinity' from public.community_posts where id=pid), 'التثبيت لم يضع expires_at=infinity');
  perform pg_temp.api(tB,'post','{"kind":"help","body":"منشور أحدث"}');
  r := pg_temp.api(tB,'feed');
  perform pg_temp.must((r->0->>'id')::uuid=pid and (r->0->>'pinned')::boolean and (r->0->>'exp') is null, 'المنشور المثبّت يجب أن يكون أولاً بلا exp');
  perform pg_temp.must((select pinned from public.community_messages where id=mid), 'تثبيت الرسالة لم يُحفظ');
  -- التنظيف لا يحذف المثبّت
  update public.community_messages set expires_at = now() - interval '1 day' where id=mid;      -- مثبّتة لكن انتهى وقتها
  delete from public.community_messages where expires_at < now() and not pinned;                -- نفس شرط التنظيف
  perform pg_temp.must((select count(*) from public.community_messages where id=mid)=1, 'التنظيف حذف رسالة مثبّتة');
  -- تمديد
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform pg_temp.api(tAdm,'admin_pin',jsonb_build_object('type','post','id',pid,'pinned',false));
  perform pg_temp.must((select not pinned and expires_at > now() + interval '6 days' from public.community_posts where id=pid), 'إلغاء التثبيت لم يعد المدة العادية');
  perform pg_temp.api(tAdm,'admin_extend',jsonb_build_object('type','post','id',pid,'hours',72));
  perform pg_temp.must((select expires_at > now() + interval '9 days' from public.community_posts where id=pid), 'التمديد لم يُضف المدة');
  r := pg_temp.api(tAdm,'admin_list','{}');
  perform pg_temp.must((r->>'limit')::int=200 and (r->'totals'->>'posts')::int=2, 'admin_list: limit/totals غير صحيحة');
  r := pg_temp.api(tAdm,'admin_list','{"limit":1}');
  perform pg_temp.must(jsonb_array_length(r->'posts')=1 and (r->'totals'->>'posts')::int=2, 'سقف admin_list لا يعمل');
  perform set_config('request.jwt.claim.sub', '', true);

  ------------------------------------------------------------ I) إحصاءات الصفحة الرئيسية
  r := public.get_public_platform_stats();
  perform pg_temp.must((r->>'registered_students')::int=3 and (r->>'show_registered')::boolean and (r->>'show_visitors')::boolean, 'عدد المسجلين يجب أن يعدّ المعتمدين فقط (3)');
  begin perform public.set_public_stat_visibility('show_registered_count', false); raise exception 'FAIL: set_public_stat_visibility سمحت لغير مشرف';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform pg_temp.must(public.set_public_stat_visibility('show_registered_count', false) = false, 'المشرف لم يستطع الإخفاء');
  r := public.get_public_platform_stats();
  perform pg_temp.must((r->'registered_students') = 'null'::jsonb and not (r->>'show_registered')::boolean, 'الرقم لا يزال يخرج رغم الإخفاء');
  perform public.set_public_stat_visibility('show_registered_count', true);
  begin perform public.set_public_stat_visibility('evil_key', true); raise exception 'FAIL: قبلت مفتاحاً غير مسموح';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub', '', true);


  ------------------------------------------------------------ J) تحكّم المشرف بنافذتي التثبيت والإشعارات
  r := public.get_public_platform_stats();
  perform pg_temp.must(not (r->>'show_install_prompt')::boolean and not (r->>'show_push_prompt')::boolean and (r->>'prompts_reset_at')::bigint = 0, 'الافتراضي: النافذتان مخفيتان ولا إعادة');
  begin perform public.set_public_stat_visibility('show_push_prompt', false); raise exception 'FAIL: غير مشرف عدّل إعداد النافذة';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.reset_onboarding_prompts(); raise exception 'FAIL: غير مشرف أعاد إظهار النافذتين';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform pg_temp.must(public.set_public_stat_visibility('show_push_prompt', true) = true, 'المشرف لم يُظهر نافذة الإشعارات');
  perform pg_temp.must(public.set_public_stat_visibility('show_install_prompt', true) = true, 'المشرف لم يُظهر نافذة التثبيت');
  r := public.get_public_platform_stats();
  perform pg_temp.must((r->>'show_push_prompt')::boolean and (r->>'show_install_prompt')::boolean, 'الإظهار لم ينعكس في الإحصاءات العامة');
  perform pg_temp.must(public.set_public_stat_visibility('show_push_prompt', false) = false, 'المشرف لم يخفِ نافذة الإشعارات');
  perform pg_temp.must(public.set_public_stat_visibility('show_install_prompt', false) = false, 'المشرف لم يخفِ نافذة التثبيت');
  r := public.get_public_platform_stats();
  perform pg_temp.must(not (r->>'show_push_prompt')::boolean and not (r->>'show_install_prompt')::boolean, 'الإخفاء لم ينعكس في الإحصاءات العامة');
  perform pg_temp.must((r->>'show_visitors')::boolean and (r->>'show_registered')::boolean, 'إخفاء النافذتين أثّر على عدّادات الصفحة الرئيسية!');
  n := public.reset_onboarding_prompts();
  perform pg_temp.must(n > 1700000000, 'reset_onboarding_prompts لم تعد وقتاً صحيحاً');
  r := public.get_public_platform_stats();
  perform pg_temp.must((r->>'prompts_reset_at')::bigint = n and not (r->>'show_install_prompt')::boolean, 'وقت الإعادة لا يظهر في الإحصاءات العامة، أو الإعادة غيّرت الإعداد');
  -- إعادة تشغيل ملف الافتراضي لا تمسّ اختيار المشرف (علامة المرة الواحدة)
  perform public.set_public_stat_visibility('show_push_prompt', true);
  perform pg_temp.must((select value_boolean from public.platform_settings where key='show_push_prompt'), 'اختيار المشرف لم يُحفظ');
  perform set_config('request.jwt.claim.sub', '', true);


  ------------------------------------------------------------ K) حجم الاستجابات: صورة الكاتب مرة واحدة فقط
  perform pg_temp.api(tA,'avatar',jsonb_build_object('data','data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////'));
  perform pg_temp.api(tA,'post','{"kind":"help","body":"منشور ثانٍ لـ A"}');
  perform pg_temp.api(tA,'post','{"kind":"help","body":"منشور ثالث لـ A"}');
  r := pg_temp.api(tB,'feed');
  perform pg_temp.must((select count(*) from jsonb_array_elements(r) x where x->>'aid'=pa::text) >= 3, 'يجب أن يوجد 3 منشورات أو أكثر لـ A');
  perform pg_temp.must((select count(*) from jsonb_array_elements(r) x where x->>'aid'=pa::text and x->>'avatar' is not null) = 1, 'صورة A يجب أن تُرسل مرة واحدة فقط في feed');
  perform pg_temp.must((select (x->>'avatar') is not null from jsonb_array_elements(r) with ordinality t(x,i) where x->>'aid'=pa::text order by i limit 1), 'الصورة يجب أن تكون على أول منشور لـ A في ترتيب العرض');
  perform pg_temp.api(tA,'comment',jsonb_build_object('id',pid,'body','تعليق إضافي 1'));
  perform pg_temp.api(tA,'comment',jsonb_build_object('id',pid,'body','تعليق إضافي 2'));
  r := pg_temp.api(tB,'comments',jsonb_build_object('id',pid));
  perform pg_temp.must((select count(*) from jsonb_array_elements(r) x where x->>'aid'=pa::text) >= 3, 'تعليقات A غير كافية للاختبار');
  perform pg_temp.must((select count(*) from jsonb_array_elements(r) x where x->>'aid'=pa::text and x->>'avatar' is not null) = 1, 'صورة A يجب أن تُرسل مرة واحدة فقط في comments');
  perform pg_temp.must((select (x->>'avatar') is not null from jsonb_array_elements(r) with ordinality t(x,i) where x->>'aid'=pa::text order by i limit 1), 'صورة التعليقات على أول تعليق');
  perform pg_temp.must((select count(*) from jsonb_array_elements(r) x where x->>'aid'=pb::text and x->>'avatar' is null) >= 1, 'B بلا صورة: لا خطأ');

  ------------------------------------------------------------ L) قفل محاولات الدخول وإعادة ضبطه
  declare g jsonb; throttle_key text := md5(random()::text || clock_timestamp()::text);
  begin
    for n in 1..4 loop
      g := public.student_login_throttle(throttle_key, 'failure');
      perform pg_temp.must(g = '{}'::jsonb, 'المحاولات الأولى يجب ألا تقفل الدخول');
    end loop;
    g := public.student_login_throttle(throttle_key, 'failure');
    perform pg_temp.must(g->>'error' = 'too_many_attempts' and (g->>'retry_after')::int between 14 and 15, 'المحاولة الخامسة يجب أن تقفل 15 دقيقة');
    g := public.student_login_throttle(throttle_key, 'check');
    perform pg_temp.must(g->>'error' = 'too_many_attempts', 'القفل يجب أن يستمر في المحاولة التالية');
    perform public.student_login_throttle(throttle_key, 'success');
    g := public.student_login_throttle(throttle_key, 'check');
    perform pg_temp.must(g = '{}'::jsonb, 'الدخول الناجح يجب أن يمسح القفل');
  end;

  ------------------------------------------------------------ M) بلاغ انتحال وحظر الجهاز المعتدي
  declare target_token text := repeat('e',40); report_token text := repeat('f',40); target_sid uuid := gen_random_uuid(); report_id uuid; banned_result jsonb;
  begin
    insert into public.student_devices(token_hash,account)
      values(encode(sha256(convert_to(target_token,'UTF8')),'hex'),idA)
      on conflict(token_hash) do update set account=excluded.account;
    insert into public.student_sessions(session_id,account,device_hash,device_type,login_at,last_seen,logout_at)
      values(target_sid,idA,encode(sha256(convert_to(target_token,'UTF8')),'hex'),'computer',now(),now(),null);
    r := public.student_gate(report_token,'report_device_in_use',jsonb_build_object('name','Student Alpha','reg','I18001','device_type','computer','message','هذا الجهاز ليس جهازي وقد استُخدم باسمي دون إذني'));
    perform pg_temp.must((r->>'submitted')::boolean, 'بلاغ انتحال صحيح يجب أن يُرسل');
    select id into report_id from public.student_device_reports where account=idA and status='pending' order by created_at desc limit 1;
    perform pg_temp.must(report_id is not null, 'البلاغ لم يُحفظ');
    perform set_config('request.jwt.claim.sub',adm::text,true);
    banned_result := public.student_device_admin('ban_report',jsonb_build_object('id',report_id,'reason','انتحال هوية طالب'));
    perform pg_temp.must((banned_result->>'banned')::boolean, 'المشرف يجب أن يحظر الجهاز');
    perform set_config('request.jwt.claim.sub','',true);
    r := public.student_gate(target_token,'status',jsonb_build_object('session_id',gen_random_uuid(),'device_type','computer'));
    perform pg_temp.must(r->>'error'='device_banned', 'الجهاز المحظور يجب أن يُمنع من البوابة');
    perform pg_temp.must((select count(*) from public.student_sessions where session_id=target_sid and logout_at is null)=0, 'حظر الجهاز يجب أن ينهي جلسته');
    insert into public.student_devices(token_hash,account)
      values(encode(sha256(convert_to(report_token,'UTF8')),'hex'),idA)
      on conflict(token_hash) do update set account=excluded.account;
    r := pg_temp.api(report_token,'report_status');
    perform pg_temp.must(jsonb_array_length(r)=1 and r->0->>'status'='banned', 'يجب أن تظهر حالة البلاغ للطالب داخل المنصة');
    perform set_config('request.jwt.claim.sub',adm::text,true);
    r := public.student_device_admin('unban_report',jsonb_build_object('id',report_id));
    perform pg_temp.must((r->>'unbanned')::boolean, 'المشرف يجب أن يستطيع إلغاء حظر الجهاز');
    perform set_config('request.jwt.claim.sub','',true);
    r := public.student_gate(target_token,'status',jsonb_build_object('session_id',gen_random_uuid(),'device_type','computer'));
    perform pg_temp.must(r->>'error' is distinct from 'device_banned', 'إلغاء الحظر يجب أن يرفع المنع الفعّال');
  end;

  ------------------------------------------------------------ N) سياسة أرقام التسجيل والتحكم في إنشاء الحساب
  perform pg_temp.must(public.student_reg_allowed('I18000') and public.student_reg_allowed('I99999'), 'I18000 و I99999 يجب أن يكونا صالحين');
  perform pg_temp.must(not public.student_reg_allowed('I17999') and not public.student_reg_allowed('I01') and not public.student_reg_allowed('I1800'), 'الأرقام القديمة أو الناقصة يجب أن تُرفض');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  r := public.student_device_admin('set_registration_enabled',jsonb_build_object('enabled',false));
  perform pg_temp.must((r->>'enabled')::boolean=false, 'المشرف يجب أن يستطيع إيقاف إنشاء الحساب');
  perform set_config('request.jwt.claim.sub','',true);
  r := public.student_gate(repeat('q',40),'lookup',jsonb_build_object('name','New Student','reg','I18099'));
  perform pg_temp.must((r->>'registration_enabled')::boolean=false, 'الاستعلام يجب أن يعيد حالة التسجيل للمستخدم');
  r := public.student_gate(repeat('q',40),'create',jsonb_build_object('session_id',gen_random_uuid(),'name','New Student','reg','I18099','spec','BA','level','L1'));
  perform pg_temp.must(r->>'error'='registration_disabled', 'التسجيل المباشر يجب أن يُرفض عند إيقافه');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  perform public.student_device_admin('set_registration_enabled',jsonb_build_object('enabled',true));
  perform set_config('request.jwt.claim.sub','',true);

  raise notice '✅ كل اختبارات القاعدة نجحت';
end $$;
