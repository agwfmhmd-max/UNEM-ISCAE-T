-- اختبارات طلب الانتساب: المراجعة اليدوية، الموافقة الآلية للحسابات المطابقة للائحة، وإكمال البيانات قبل التفعيل.
create function pg_temp.must_membership(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond,false) then raise exception 'FAIL: %', p_msg; end if;
end $$;

do $$
declare
  t_roster_manual text := repeat('m',40);
  t_manual_auto text := repeat('n',40);
  t_roster_auto text := repeat('o',40);
  v_admin uuid := gen_random_uuid();
  v_roster_manual uuid;
  v_manual_auto uuid;
  v_roster_auto uuid;
  r jsonb;
  v_request uuid;
  v_phone text := '23456789';
begin
  insert into auth.users(id,email) values(v_admin,'membership-flow-admin@test.local');
  insert into public.user_roles(user_id,role) values(v_admin,'admin');

  insert into public.student_roster(spec,level,full_name,name_norm,reg_no,reg_no_norm)
  values('BA','L1','Membership Roster Manual',public.student_norm_name('Membership Roster Manual'),
         'I89991',public.student_norm_reg('I89991'));
  insert into public.student_accounts(reg_no,reg_no_norm,full_name,name_norm,spec,level,status,source)
  values('I89991',public.student_norm_reg('I89991'),'Membership Roster Manual',
         public.student_norm_name('Membership Roster Manual'),'BA','L1','approved','roster')
  returning id into v_roster_manual;
  insert into public.student_devices(token_hash,account)
  values(encode(sha256(convert_to(t_roster_manual,'UTF8')),'hex'),v_roster_manual);

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.student_membership_admin('set_auto_approval','{"enabled":false}'::jsonb);
  perform set_config('request.jwt.claim.sub','',true);

  r := public.student_membership(t_roster_manual,'request','{}'::jsonb);
  perform pg_temp.must_membership(r->>'enrollment_status'='pending' and coalesce((r->>'card_enabled')::boolean,false)=false,
    'الطلب اليدوي يجب أن ينتظر المراجعة وألا يفعّل البطاقة');
  v_request := (r->>'request_id')::uuid;
  begin
    perform public.student_membership(t_roster_manual,'apply',jsonb_build_object('phone',v_phone));
    raise exception 'TEST_EXPECTED_MEMBERSHIP_NOT_APPROVED';
  exception when others then
    if sqlerrm<>'membership_not_approved' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  r := public.student_membership_admin('requests','{}'::jsonb);
  perform pg_temp.must_membership(jsonb_array_length(r)=1 and r->0->>'id'=v_request::text,
    'يجب أن تظهر الطلبات المعلقة للمشرف الرئيسي فقط');
  r := public.student_membership_admin('review',jsonb_build_object('id',v_request,'decision','approved'));
  perform pg_temp.must_membership((r->>'reviewed')::boolean and r->>'status'='approved','تعذر قبول طلب الانتساب يدويًا');
  perform set_config('request.jwt.claim.sub','',true);

  r := public.student_membership(t_roster_manual,'status','{}'::jsonb);
  perform pg_temp.must_membership(r->>'enrollment_status'='approved' and coalesce((r->>'card_enabled')::boolean,false)=false,
    'الموافقة اليدوية تسمح بإكمال البيانات لكنها لا تفعّل البطاقة قبلها');
  r := public.student_membership(t_roster_manual,'apply',jsonb_build_object('phone',v_phone));
  perform pg_temp.must_membership(coalesce((r->>'card_enabled')::boolean,false) and r->>'status'='applied',
    'إكمال البيانات بعد الموافقة يجب أن يفعّل البطاقة');

  -- حساب معتمد أُنشئ يدويًا خارج اللائحة: لا يحصل على الموافقة الآلية حتى مع تفعيل الإعداد.
  insert into public.student_accounts(reg_no,reg_no_norm,full_name,name_norm,spec,level,status,source)
  values('I89992',public.student_norm_reg('I89992'),'Membership Manual Account',
         public.student_norm_name('Membership Manual Account'),'FC','L1','approved','manual')
  returning id into v_manual_auto;
  insert into public.student_devices(token_hash,account)
  values(encode(sha256(convert_to(t_manual_auto,'UTF8')),'hex'),v_manual_auto);

  -- طالب في اللائحة الرسمية: يمكن قبول طلبه آليًا، لكن البطاقة تظل غير مفعلة حتى يكمل معلوماته.
  insert into public.student_roster(spec,level,full_name,name_norm,reg_no,reg_no_norm)
  values('IG','L2','Membership Roster Auto',public.student_norm_name('Membership Roster Auto'),
         'I89993',public.student_norm_reg('I89993'));
  insert into public.student_accounts(reg_no,reg_no_norm,full_name,name_norm,spec,level,status,source)
  values('I89993',public.student_norm_reg('I89993'),'Membership Roster Auto',
         public.student_norm_name('Membership Roster Auto'),'IG','L2','approved','roster')
  returning id into v_roster_auto;
  insert into public.student_devices(token_hash,account)
  values(encode(sha256(convert_to(t_roster_auto,'UTF8')),'hex'),v_roster_auto);

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.student_membership_admin('set_auto_approval','{"enabled":true}'::jsonb);
  perform set_config('request.jwt.claim.sub','',true);

  r := public.student_membership(t_manual_auto,'request','{}'::jsonb);
  perform pg_temp.must_membership(r->>'enrollment_status'='pending' and coalesce((r->>'card_enabled')::boolean,false)=false,
    'الحساب اليدوي غير المطابق للائحة يجب أن يبقى للمراجعة اليدوية');
  r := public.student_membership(t_roster_auto,'request','{}'::jsonb);
  perform pg_temp.must_membership(r->>'enrollment_status'='approved' and coalesce((r->>'card_enabled')::boolean,false)=false,
    'الحساب المطابق للائحة يجب أن يُقبل آليًا دون إصدار البطاقة قبل إكمال البيانات');
  r := public.student_membership(t_roster_auto,'apply',jsonb_build_object('phone',v_phone));
  perform pg_temp.must_membership(coalesce((r->>'card_enabled')::boolean,false),
    'بعد إكمال البيانات يجب تفعيل البطاقة حتى عند الموافقة الآلية');

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  begin
    perform public.student_membership_admin('set_auto_approval','{"enabled":false}'::jsonb);
    -- هذا السطر يثبت نجاح المشرف الرئيسي في تغيير الخيار.
  exception when others then raise exception 'FAIL: المشرف الرئيسي لم يستطع تغيير الموافقة الآلية: %',sqlerrm;
  end;
  perform set_config('request.jwt.claim.sub','',true);
end $$;
