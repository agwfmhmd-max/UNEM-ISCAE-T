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
  idA := pg_temp.mk_student('I1','Student Alpha','BA','L3','approved',tA);
  accB := pg_temp.mk_student('I2','Student Beta','FC','L1','approved',tB);  idB := accB;
  idC := pg_temp.mk_student('I3','Student Gamma','TCM','L2','approved',tC);
  perform pg_temp.mk_student('I4','Student Pending','IG','L1','pending',tD);
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
  r := pg_temp.api(tA,'find_student','{"reg":" i2 "}');
  perform pg_temp.must((r->>'found')::boolean and (r->>'registered')::boolean and (r->>'id')::uuid=pb and not (r->>'online')::boolean and (r->>'active')::boolean, 'نتيجة البحث لطالب مسجّل (بلا جلسة نشطة): غير صحيحة');
  insert into public.student_sessions(session_id, account, device_hash, last_seen) values (gen_random_uuid(), accB, 'x', now());
  r := pg_temp.api(tA,'find_student','{"reg":"I2"}');
  perform pg_temp.must((r->>'online')::boolean and (r->>'active')::boolean, 'حالة متصل الآن غير صحيحة');
  update public.student_sessions set last_seen = now() - interval '2 hours' where account = accB;
  update public.student_devices set last_seen = now() - interval '2 hours' where account = accB;
  r := pg_temp.api(tA,'find_student','{"reg":"I2"}');
  perform pg_temp.must(not (r->>'online')::boolean and (r->>'active')::boolean and (r->>'last_seen') is not null, 'حالة آخر ظهور غير صحيحة');
  delete from public.community_search_log;   -- نحاكي مرور الدقيقة
  r := pg_temp.api(tA,'find_student','{"reg":"I4"}');   -- حساب معلّق = لم يسجّل بعد
  perform pg_temp.must((r->>'found')::boolean and not (r->>'registered')::boolean and not (r->>'active')::boolean, 'حساب معلّق يجب أن يظهر غير نشط');
  r := pg_temp.api(tA,'find_student','{"reg":"nope999"}');
  perform pg_temp.must(not (r->>'found')::boolean, 'رقم مجهول يجب ألا يوجد');
  r := pg_temp.api(tA,'find_student','{"reg":"I1"}');
  perform pg_temp.must((r->>'self')::boolean, 'البحث عن نفسه يجب أن يشير self');
  delete from public.community_search_log;
  -- الحد: 4 عمليات في الدقيقة (A أجرى 5 بالفعل أعلاه → الخامسة فما بعد مرفوضة؛ نتحقق بطالب جديد)
  perform pg_temp.api(tC,'find_student','{"reg":"I1"}'); perform pg_temp.api(tC,'find_student','{"reg":"I1"}');
  perform pg_temp.api(tC,'find_student','{"reg":"I1"}'); perform pg_temp.api(tC,'find_student','{"reg":"I1"}');
  perform pg_temp.expect_err(tC,'find_student','{"reg":"I1"}','rate');

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

  raise notice '✅ كل اختبارات القاعدة نجحت';
end $$;
