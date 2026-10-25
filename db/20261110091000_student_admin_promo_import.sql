-- لائحة المشرف مرجع السنة الجديدة: الراسب يبقى في مستواه، والمكرر في مستويين يظهر في الغرفتين،
-- والخريجون (Sortants) يُسجَّلون بدفعتهم Promo N. باقي إجراءات student_admin كما كانت دون تغيير.
create or replace function public.student_admin(p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a jsonb := coalesce(p_args, '{}'::jsonb);
  r jsonb; ex public.student_roster;
  v_spec text := upper(coalesce(a->>'spec','')); v_level text := upper(coalesce(a->>'level',''));
  v_n text; v_r text; v_nn text; v_rn text;
  c_new int := 0; c_up int := 0; c_same int := 0; c_skip int := 0; c_bad int := 0; c_auto int := 0; c_extra int := 0; v_cnt int;
  v_q text; v_st text; v_ay int; v_promo int; v_rank int; v_ex_rank int;
begin
  if auth.uid() is null or not coalesce(public.has_role(auth.uid(),'admin'), false) then raise exception 'forbidden'; end if;

  if p_action = 'import' then
    perform public.student_rollover_if_needed();
    v_ay := public.community_academic_year();
    if v_spec not in ('BA','FC','TCM','GRH','SAE','IG','MASTER_FC','MASTER_IG') then raise exception 'bad_spec'; end if;
    if v_level = 'S' then
      -- خريجون: الدفعة المطلوبة (الافتراضي الدفعة الحالية)
      begin v_promo := nullif(btrim(coalesce(a->>'promo','')),'')::int; exception when others then raise exception 'bad_promo'; end;
      v_promo := coalesce(v_promo, public.community_current_promo());
      if v_promo < 1 or v_promo > public.community_current_promo() then raise exception 'bad_promo'; end if;
      v_level := case when v_spec like 'MASTER\_%' then 'M2' else 'L3' end;
    elsif v_level not in ('L1','L2','L3','M1','M2') then raise exception 'bad_level';
    end if;
    v_rank := public.student_level_rank(v_level) + case when v_promo is not null then 10 else 0 end;
    for r in select e.value from jsonb_array_elements(coalesce(a->'rows','[]'::jsonb)) e loop
      v_n := left(btrim(regexp_replace(coalesce(r->>'n',''), '\s+', ' ', 'g')), 80);
      v_r := left(btrim(coalesce(r->>'r','')), 30);
      v_nn := public.student_norm_name(v_n); v_rn := public.student_norm_reg(v_r);
      if v_nn = '' or char_length(v_rn) < 2 or char_length(v_n) < 3 then c_bad := c_bad + 1; continue; end if;
      select * into ex from student_roster where reg_no_norm = v_rn;
      if ex.id is null then
        insert into student_roster(spec, level, promo, academic_year, full_name, name_norm, reg_no, reg_no_norm)
          values (v_spec, v_level, v_promo, v_ay, v_n, v_nn, v_r, v_rn);
        c_new := c_new + 1;
      elsif coalesce(ex.academic_year,0) < v_ay then
        -- لائحة السنة الجديدة هي المرجع: يبقى الطالب في المستوى المسجَّل حتى لو كان أدنى (لم ينجح)
        update student_roster set spec=v_spec, level=v_level, promo=v_promo, academic_year=v_ay,
               full_name=v_n, name_norm=v_nn, reg_no=v_r, updated_at=now() where id = ex.id;
        c_up := c_up + 1;
      else
        v_ex_rank := public.student_level_rank(ex.level) + case when ex.promo is not null then 10 else 0 end;
        if v_rank > v_ex_rank then
          -- تكرار في مستويين بنفس السنة: الأعلى أساسي، والأدنى يبقى مفعّلًا كمستوى ثانٍ
          if ex.promo is null and v_promo is null then
            insert into student_roster_extra(reg_no_norm, spec, level, academic_year) values (v_rn, ex.spec, ex.level, v_ay) on conflict do nothing;
            c_extra := c_extra + 1;
          end if;
          update student_roster set spec=v_spec, level=v_level, promo=v_promo, academic_year=v_ay,
                 full_name=v_n, name_norm=v_nn, reg_no=v_r, updated_at=now() where id = ex.id;
          c_up := c_up + 1;
        elsif v_rank = v_ex_rank then
          update student_roster set spec=v_spec, promo=v_promo, full_name=v_n, name_norm=v_nn, reg_no=v_r, updated_at=now() where id = ex.id;
          c_same := c_same + 1;
        else
          if ex.promo is null and v_promo is null then
            insert into student_roster_extra(reg_no_norm, spec, level, academic_year) values (v_rn, v_spec, v_level, v_ay) on conflict do nothing;
            c_extra := c_extra + 1;
          end if;
          c_skip := c_skip + 1;
        end if;
      end if;
    end loop;
    -- مزامنة الحسابات المعتمدة من لائحة السنة الحالية (تغيّر المستوى/التخصص/الدفعة)
    update student_accounts ac set spec = ro.spec, level = ro.level, promo = ro.promo
      from student_roster ro where ac.reg_no_norm = ro.reg_no_norm and ac.status = 'approved' and (ac.source = 'roster' or public.student_names_match(ac.name_norm, ro.name_norm))
      and ro.academic_year = v_ay
      and (ac.spec is distinct from ro.spec or ac.level is distinct from ro.level or ac.promo is distinct from ro.promo);
    -- حسابات بانتظار الموافقة أصبحت في اللائحة → تُعتمد تلقائياً
    update student_accounts ac set status='approved', source='roster', spec=ro.spec, level=ro.level, promo=ro.promo, level_year=v_ay, full_name=ro.full_name, decided_at=now()
      from student_roster ro where ac.reg_no_norm = ro.reg_no_norm and ac.status = 'pending' and public.student_names_match(ac.name_norm, ro.name_norm);
    get diagnostics c_auto = row_count;
    return jsonb_build_object('added',c_new,'upgraded',c_up,'updated',c_same,'skipped_higher',c_skip,'extra_levels',c_extra,'invalid',c_bad,'auto_approved',c_auto,'promo',v_promo);

  elsif p_action = 'session_stats' then
    return jsonb_build_object(
      'active_students', coalesce((select count(distinct account)::int from student_sessions where logout_at is null and last_seen > now()-interval '5 minutes'),0),
      'sessions', coalesce((select jsonb_agg(x order by x.login_at desc) from (
        select s.session_id, ac.full_name, ac.reg_no, ac.spec, ac.level, s.login_at, s.logout_at, s.last_seen
        from student_sessions s join student_accounts ac on ac.id=s.account
        order by s.login_at desc limit 300) x),'[]'::jsonb));

  elsif p_action = 'stats' then
    return jsonb_build_object(
      'academic_year', public.community_academic_year(),
      'current_promo', public.community_current_promo(),
      'roster', coalesce((select jsonb_agg(x order by x.promo nulls first, x.spec, x.level) from (select spec, level, promo, count(*)::int as n from student_roster group by spec, level, promo) x), '[]'::jsonb),
      'accounts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*)::int as n from student_accounts group by status) y), '{}'::jsonb));

  elsif p_action = 'list' then
    v_st := coalesce(a->>'status','');
    v_q := btrim(coalesce(a->>'q',''));
    return coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select id, full_name, reg_no, spec, level, promo, status, source, note, created_at, decided_at
      from student_accounts
      where (v_st = '' or status = v_st)
        and (v_q = '' or name_norm like '%' || public.student_norm_name(v_q) || '%' or reg_no_norm like '%' || public.student_norm_reg(v_q) || '%')
      order by created_at desc limit 300) x),'[]'::jsonb);

  elsif p_action = 'decide' then
    v_st := case when (a->>'approve')::boolean then 'approved' else 'rejected' end;
    if v_st = 'approved' and (v_spec not in ('BA','FC','TCM','GRH','SAE','IG','MASTER_FC','MASTER_IG') or v_level not in ('L1','L2','L3','M1','M2')) then
      raise exception 'bad_scope';
    end if;
    update student_accounts set status = v_st,
        spec = case when v_st = 'approved' then v_spec else spec end,
        level = case when v_st = 'approved' then v_level else level end,
        promo = case when v_st = 'approved' then null else promo end,
        decided_at = now()
      where id = (a->>'id')::uuid;
    return '{}'::jsonb;

  elsif p_action = 'delete' then
    delete from community_profiles where token_hash in (select token_hash from student_devices where account=(a->>'id')::uuid);
    delete from student_accounts where id = (a->>'id')::uuid;   -- يحذف أجهزته أيضاً؛ يستطيع الطالب التسجيل من جديد
    return '{}'::jsonb;

  elsif p_action = 'roster_list' then
    v_q := btrim(coalesce(a->>'q',''));
    begin v_promo := nullif(btrim(coalesce(a->>'promo','')),'')::int; exception when others then v_promo := null; end;
    return coalesce((select jsonb_agg(x order by x.full_name) from (
      select id, full_name, reg_no, spec, level, promo from student_roster
      where (v_spec = '' or spec = v_spec)
        and (v_level = '' or (v_level = 'S' and promo is not null and (v_promo is null or promo = v_promo)) or (v_level <> 'S' and level = v_level and promo is null))
        and (v_q = '' or name_norm like '%' || public.student_norm_name(v_q) || '%' or reg_no_norm like '%' || public.student_norm_reg(v_q) || '%')
      order by full_name limit 300) x),'[]'::jsonb);

  elsif p_action = 'roster_clear' then
    if v_spec = '' or v_level = '' then raise exception 'bad_scope'; end if;
    begin v_promo := nullif(btrim(coalesce(a->>'promo','')),'')::int; exception when others then v_promo := null; end;
    if v_level = 'S' then
      delete from student_roster where spec = v_spec and promo is not null and (v_promo is null or promo = v_promo);
    else
      delete from student_roster where spec = v_spec and level = v_level and promo is null;
    end if;
    get diagnostics v_cnt = row_count;
    return jsonb_build_object('deleted', v_cnt);
  end if;
  raise exception 'unknown_action';
end $function$;
