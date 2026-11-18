-- 1) بطاقة الانتساب لا تظهر للجميع: يفعّلها المشرف الرئيسي لكل طالب برقم تسجيله، ويصل الطالب إشعار.
-- 2) المشرفون الذين لديهم صلاحية manage_schedules يستطيعون رفع الجداول الدراسية وتعديلها (سياسات study_schedules).
alter table public.student_accounts add column if not exists card_enabled boolean not null default false;
alter table public.student_accounts add column if not exists card_enabled_at timestamptz;
alter table public.student_accounts add column if not exists card_notified_at timestamptz;

-- ===== الجداول الدراسية: الكتابة للمشرف الرئيسي أو لمن يملك صلاحية manage_schedules =====
do $do$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'study_schedules' and cmd in ('INSERT','UPDATE','DELETE') loop
    execute format('drop policy if exists %I on public.study_schedules', r.policyname);
  end loop;
end $do$;
create policy "schedules staff insert" on public.study_schedules for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'::app_role) or public.has_supervisor_permission('manage_schedules'));
create policy "schedules staff update" on public.study_schedules for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role) or public.has_supervisor_permission('manage_schedules'))
  with check (public.has_role(auth.uid(), 'admin'::app_role) or public.has_supervisor_permission('manage_schedules'));
create policy "schedules staff delete" on public.study_schedules for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role) or public.has_supervisor_permission('manage_schedules'));
-- المشرفون الحاليون يحصلون على الصلاحية (يمكن للمشرف الرئيسي سحبها من لوحة المشرفين)
update public.supervisor_permissions set manage_schedules = true where manage_schedules is distinct from true;

-- ===== دوال المشرف الرئيسي لبطاقة الانتساب =====
create or replace function public.student_card_admin_check() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::app_role) then raise exception 'forbidden'; end if;
end $$;
revoke all on function public.student_card_admin_check() from public, anon;

create or replace function public.student_card_admin_lookup(p_reg text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.student_accounts; v_reg text := upper(btrim(coalesce(p_reg,'')));
begin
  perform public.student_card_admin_check();
  select * into a from student_accounts where upper(reg_no) = v_reg limit 1;
  if a.id is null then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'reg_no', a.reg_no, 'full_name', a.full_name, 'spec', a.spec, 'level', a.level,
    'promo', a.promo, 'status', a.status, 'enabled', a.card_enabled, 'enabled_at', a.card_enabled_at,
    'card_code', public.student_card_code(a.card_year, a.card_no),
    'devices', (select count(*) from push_subscriptions s where s.account = a.id));
end $$;
revoke all on function public.student_card_admin_lookup(text) from public, anon;
grant execute on function public.student_card_admin_lookup(text) to authenticated;

create or replace function public.student_card_set(p_regs text[], p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_reg text; a public.student_accounts; out jsonb := '[]'::jsonb; v_changed boolean;
begin
  perform public.student_card_admin_check();
  if p_regs is null or array_length(p_regs, 1) is null or array_length(p_regs, 1) > 300 then raise exception 'bad_input'; end if;
  foreach v_reg in array p_regs loop
    v_reg := upper(btrim(coalesce(v_reg, '')));
    continue when v_reg = '';
    select * into a from student_accounts where upper(reg_no) = v_reg limit 1;
    if a.id is null then
      out := out || jsonb_build_array(jsonb_build_object('reg_no', v_reg, 'found', false));
      continue;
    end if;
    v_changed := false;
    if a.status = 'approved' and a.card_enabled is distinct from p_enabled then
      update student_accounts set card_enabled = p_enabled,
        card_enabled_at = case when p_enabled then now() else null end,
        card_notified_at = case when p_enabled then null else card_notified_at end
        where id = a.id;
      v_changed := true;
    end if;
    out := out || jsonb_build_array(jsonb_build_object('reg_no', a.reg_no, 'found', true, 'full_name', a.full_name,
      'approved', a.status = 'approved', 'enabled', case when a.status = 'approved' then p_enabled else a.card_enabled end, 'changed', v_changed));
  end loop;
  return out;
end $$;
revoke all on function public.student_card_set(text[], boolean) from public, anon;
grant execute on function public.student_card_set(text[], boolean) to authenticated;

-- اشتراكات الإشعارات للطلاب الذين فُعّلت بطاقتهم ولم يُبلَّغوا بعد (أو الكل عند p_force)
create or replace function public.student_card_push_targets(p_regs text[], p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_subs jsonb;
begin
  perform public.student_card_admin_check();
  select coalesce(array_agg(a.id), '{}') into v_ids from student_accounts a
    where upper(a.reg_no) = any (select upper(btrim(x)) from unnest(p_regs) x)
      and a.card_enabled and a.status = 'approved' and (p_force or a.card_notified_at is null);
  update student_accounts set card_notified_at = now() where id = any(v_ids);
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    into v_subs from push_subscriptions s where s.account = any(v_ids);
  return jsonb_build_object('accounts', coalesce(array_length(v_ids, 1), 0), 'subs', v_subs);
end $$;
revoke all on function public.student_card_push_targets(text[], boolean) from public, anon;
grant execute on function public.student_card_push_targets(text[], boolean) to authenticated;

create or replace function public.student_card_admin_list() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.student_card_admin_check();
  return jsonb_build_object(
    'enabled_count', (select count(*) from student_accounts where card_enabled),
    'total_approved', (select count(*) from student_accounts where status = 'approved'),
    'recent', coalesce((select jsonb_agg(x order by x.enabled_at desc) from (
        select reg_no, full_name, spec, level, promo, card_enabled_at as enabled_at, public.student_card_code(card_year, card_no) as card_code
        from student_accounts where card_enabled order by card_enabled_at desc nulls last limit 40) x), '[]'::jsonb));
end $$;
revoke all on function public.student_card_admin_list() from public, anon;
grant execute on function public.student_card_admin_list() to authenticated;

-- التحقق العام والفحص: البطاقة غير المفعّلة لا تُعدّ صالحة
create or replace function public.student_card_verify(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.student_accounts;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9]{8,16}$' then return jsonb_build_object('valid', false); end if;
  select * into a from student_accounts where card_token = upper(p_token) and status = 'approved' and card_enabled;
  if a.id is null then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'full_name', a.full_name, 'reg_no', a.reg_no, 'spec', a.spec,
                            'level', a.level, 'promo', a.promo, 'academic_year', public.community_academic_year(),
                            'card_code', public.student_card_code(a.card_year, a.card_no));
end $$;

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
  -- فحص المشرفين: يعرض حالة التفعيل
  v := replace(pg_get_functiondef('public.student_card_lookup(text)'::regprocedure), E'\r', '');
  v := public.unem_patch_text(v, $q$'issued_at', a.created_at, 'avatar', v_avatar);$q$, $q$'issued_at', a.created_at, 'enabled', a.card_enabled, 'avatar', v_avatar);$q$, 1);
  execute v;
  -- المجتمع: card_enabled في me، والبطاقة لا تُصدر إلا للمفعّلين
  v := replace(pg_get_functiondef('public.community_api(text,text,jsonb)'::regprocedure), E'\r', '');
  v := public.unem_patch_text(v, $q$'promo', public.community_profile_promo(me.id), 'current_promo'$q$, $q$'promo', public.community_profile_promo(me.id), 'card_enabled', coalesce(acc.card_enabled, false), 'current_promo'$q$, 1);
  v := public.unem_patch_text(v, $q$    if acc.id is null or acc.status <> 'approved' then raise exception 'no_card'; end if;$q$,
$q$    if acc.id is null or acc.status <> 'approved' then raise exception 'no_card'; end if;
    if not coalesce(acc.card_enabled, false) then raise exception 'card_disabled'; end if;$q$, 1);
  execute v;
end $patch$;
drop function public.unem_patch_text(text,text,text,int);
notify pgrst, 'reload schema';
