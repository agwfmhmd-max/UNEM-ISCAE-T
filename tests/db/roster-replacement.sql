-- اختبارات استبدال اللائحة دون حذف الحسابات أو نطاقات الغرف الأخرى.
do $$
declare
  v_admin uuid := '00000000-0000-0000-0000-0000000000b1';
  v_a uuid; v_b uuid; v_upload uuid; v_result jsonb; v_year int := public.community_academic_year();
  v_account_b uuid; v_device text := repeat('r',64); v_scopes int; v_expected int;
begin
  insert into auth.users(id,email) values(v_admin,'roster-replace-admin@test.local') on conflict do nothing;
  insert into public.user_roles(user_id,role) values(v_admin,'admin') on conflict do nothing;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);

  insert into public.student_roster(spec,level,academic_year,full_name,name_norm,reg_no,reg_no_norm)
  values ('BA','L1',v_year,'Old Student A',public.student_norm_name('Old Student A'),'I90001',public.student_norm_reg('I90001'))
  returning id into v_a;
  insert into public.student_roster(spec,level,academic_year,full_name,name_norm,reg_no,reg_no_norm)
  values ('BA','L3',v_year,'Student B',public.student_norm_name('Student B'),'I90002',public.student_norm_reg('I90002'))
  returning id into v_b;
  insert into public.student_roster_extra(reg_no_norm,spec,level,academic_year)
  values(public.student_norm_reg('I90002'),'BA','L1',v_year);
  insert into public.student_accounts(reg_no,reg_no_norm,full_name,name_norm,spec,level,status,source)
  values('I90001',public.student_norm_reg('I90001'),'Old Student A',public.student_norm_name('Old Student A'),'BA','L1','approved','roster');
  insert into public.student_accounts(reg_no,reg_no_norm,full_name,name_norm,spec,level,status,source)
  values('I90002',public.student_norm_reg('I90002'),'Student B',public.student_norm_name('Student B'),'BA','L3','approved','roster') returning id into v_account_b;
  insert into public.student_devices(token_hash,account) values(v_device,v_account_b);

  v_result := public.student_roster_replace_admin('begin',jsonb_build_object('spec','BA','level','L1','expected_rows',3));
  v_upload := (v_result->>'upload_id')::uuid;
  perform public.student_roster_replace_admin('chunk',jsonb_build_object('upload_id',v_upload,'offset',0,'rows',jsonb_build_array(
    jsonb_build_object('n','Student B','r','I90002'),
    jsonb_build_object('n','New Student C','r','I90003'),
    jsonb_build_object('n','New Student C','r','I90003'))));
  v_result := public.student_roster_replace_admin('finish',jsonb_build_object('upload_id',v_upload));
  if v_result ? 'error' then raise exception 'FAIL: roster import did not finish: %',v_result; end if;
  if (v_result->>'duplicates_ignored')::int <> 1 then raise exception 'FAIL: duplicate registration was not deduplicated: %',v_result; end if;
  if exists(select 1 from public.student_roster where reg_no_norm=public.student_norm_reg('I90001')) then raise exception 'FAIL: removed roster student remains in roster'; end if;
  if not exists(select 1 from public.student_accounts where reg_no_norm=public.student_norm_reg('I90001') and status='approved' and spec is null and level is null) then raise exception 'FAIL: student account was deleted or stale replaced scope remains'; end if;
  if not exists(select 1 from public.student_roster where reg_no_norm=public.student_norm_reg('I90002') and spec='BA' and level='L3') then raise exception 'FAIL: the highest level is not the canonical roster level'; end if;
  if not exists(select 1 from public.student_roster_extra where reg_no_norm=public.student_norm_reg('I90002') and spec='BA' and level='L1' and academic_year=v_year) then raise exception 'FAIL: secondary room scope was lost'; end if;
  select count(*) into v_scopes from public.community_account_scopes(v_account_b) where spec='BA' and level in ('L1','L3');
  if v_scopes <> 2 then raise exception 'FAIL: the student cannot access both level rooms (got %) ',v_scopes; end if;
  if (select count(*) from public.student_roster where reg_no_norm in (public.student_norm_reg('I90002'),public.student_norm_reg('I90003'))) <> 2 then raise exception 'FAIL: canonical roster count is not unique'; end if;
  if not exists(select 1 from public.student_devices where token_hash=v_device and account=v_account_b) then raise exception 'FAIL: device record was deleted'; end if;
  if (select count(*) from public.student_roster where spec='BA' and level='L1' and promo is null) <> 1 then raise exception 'FAIL: replacement did not remove the old target list'; end if;
  update public.student_accounts set card_enabled=true where id=v_account_b;
  insert into public.student_card_grants(reg_no_norm,reg_no) values(public.student_norm_reg('I90002'),'I90002') on conflict do nothing;
  v_result := public.student_registration_stats();
  select count(*)::int into v_expected from (
    select reg_no_norm from public.student_accounts where status='approved' and coalesce(card_enabled,false)
    union select reg_no_norm from public.student_card_grants
  ) active_students;
  if (v_result->>'active_cards')::int <> v_expected then raise exception 'FAIL: active-card statistics double-count registrations with both an account and a grant'; end if;
  select coalesce(sum((e->>'count')::int),0)::int into v_scopes from jsonb_array_elements(v_result->'by_level') e;
  if v_scopes <> (v_result->>'official_roster_total')::int then raise exception 'FAIL: level chart is not based on each canonical roster student exactly once'; end if;

  -- اكتمال غير كافٍ: يرفض العملية ويبقي قائمة المستوى كما هي.
  v_result := public.student_roster_replace_admin('begin',jsonb_build_object('spec','BA','level','L1','expected_rows',2));
  v_upload := (v_result->>'upload_id')::uuid;
  perform public.student_roster_replace_admin('chunk',jsonb_build_object('upload_id',v_upload,'offset',0,'rows',jsonb_build_array(jsonb_build_object('n','Only One','r','I90004'))));
  v_result := public.student_roster_replace_admin('finish',jsonb_build_object('upload_id',v_upload));
  if v_result->>'error' <> 'incomplete_upload' then raise exception 'FAIL: incomplete upload unexpectedly accepted: %',v_result; end if;
  if (select count(*) from public.student_roster where spec='BA' and level='L1' and promo is null) <> 1 then raise exception 'FAIL: incomplete upload changed the current list'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  raise notice 'OK: atomic roster replacement, highest-level counting, secondary room access, and account/device preservation';
end $$;
