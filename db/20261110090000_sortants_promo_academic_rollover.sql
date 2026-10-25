-- UNEM ISCAE — نظام السنوات الدراسية والترقية التلقائية وغرف الخريجين (Sortants Promo N).
-- 1) السنة الدراسية تبدأ في 1 سبتمبر (2026-2027 → 2026) والدفعة الحالية = السنة − 2009 (2026-2027 → Promo 17).
-- 2) مع بداية كل سنة جديدة يرتقي كل الطلاب مستوى واحدًا تلقائيًا (L1→L2→L3→Sortants، M1→M2→Sortants).
-- 3) لائحة المشرف للسنة الجديدة هي المرجع: من يظهر فيها بمستوى أدنى (لم ينجح) يبقى في مستواه، ويمكن أن يظهر في مستويين.
-- 4) الخريجون يبقون في غرفة دفعتهم نهائيًا: UNEM ISCAE Sortants Promo N.

-- ---------- السنة الدراسية والدفعة ----------
create or replace function public.community_academic_year() returns int
language sql stable as $$
  select (case when extract(month from (now() at time zone 'UTC')) >= 9
               then extract(year from (now() at time zone 'UTC'))
               else extract(year from (now() at time zone 'UTC')) - 1 end)::int
$$;
create or replace function public.community_current_promo() returns int
language sql stable as $$ select public.community_academic_year() - 2009 $$;

-- ---------- الأعمدة ----------
alter table public.student_accounts add column if not exists level_year int;
alter table public.student_accounts add column if not exists promo int;
update public.student_accounts set level_year = public.community_academic_year() where level_year is null;
alter table public.student_accounts drop constraint if exists student_accounts_promo_check;
alter table public.student_accounts add constraint student_accounts_promo_check check (promo is null or promo between 1 and 999);

alter table public.student_roster add column if not exists academic_year int;
alter table public.student_roster add column if not exists promo int;
update public.student_roster set academic_year = public.community_academic_year() where academic_year is null;
alter table public.student_roster drop constraint if exists student_roster_promo_check;
alter table public.student_roster add constraint student_roster_promo_check check (promo is null or promo between 1 and 999);

alter table public.student_account_enrollments add column if not exists academic_year int;
update public.student_account_enrollments set academic_year = public.community_academic_year() where academic_year is null;
alter table public.student_account_enrollments alter column academic_year set default public.community_academic_year();
alter table public.student_account_enrollments alter column academic_year set not null;

-- طالب ظهر في مستويين في لائحة نفس السنة: المستوى الأدنى يُحفظ هنا (صلاحية دخول غرفتي المستويين).
create table if not exists public.student_roster_extra (
  reg_no_norm text not null,
  spec text not null,
  level text not null,
  academic_year int not null,
  created_at timestamptz not null default now(),
  primary key (reg_no_norm, spec, level, academic_year)
);
alter table public.student_roster_extra enable row level security;
drop policy if exists student_roster_extra_none on public.student_roster_extra;
create policy student_roster_extra_none on public.student_roster_extra for all to anon, authenticated using (false) with check (false);
grant select, insert, update, delete on public.student_roster_extra to service_role;

create table if not exists public.community_academic_state (
  id boolean primary key default true check (id),
  applied_year int not null,
  updated_at timestamptz not null default now()
);
alter table public.community_academic_state enable row level security;
drop policy if exists community_academic_state_none on public.community_academic_state;
create policy community_academic_state_none on public.community_academic_state for all to anon, authenticated using (false) with check (false);
insert into public.community_academic_state(id, applied_year) values (true, public.community_academic_year()) on conflict (id) do nothing;

-- ---------- حساب المستوى بعد n سنوات ----------
-- المستوى الأخير (L3 / M2) يبقى مسجلًا للخريج كي لا يتأثر باقي الموقع، وتُضاف الدفعة promo.
create or replace function public.student_shift_scope(p_level text, p_promo int, p_from int, p_to int)
returns table(level text, promo int)
language plpgsql immutable as $$
declare v_max int; n int; d int;
begin
  if p_promo is not null or p_from is null or p_to is null or p_to <= p_from or coalesce(p_level,'') !~ '^(L[1-3]|M[1-2])$' then
    return query select p_level, p_promo; return;
  end if;
  v_max := case when left(p_level,1)='M' then 2 else 3 end;
  n := substr(p_level,2)::int; d := p_to - p_from;
  if n + d <= v_max then
    return query select left(p_level,1) || (n+d)::text, null::int;
  else
    return query select left(p_level,1) || v_max::text, (p_from + (v_max - n) + 1 - 2009);
  end if;
end $$;

-- ---------- الترقية السنوية (تعمل مرة واحدة تلقائيًا عند أول نشاط في السنة الجديدة) ----------
create or replace function public.student_rollover_if_needed() returns void
language plpgsql security definer set search_path = public as $$
declare v_ay int := public.community_academic_year(); v_prev int;
begin
  select applied_year into v_prev from public.community_academic_state where id;
  if v_prev is not null and v_prev >= v_ay then return; end if;
  perform pg_advisory_xact_lock(hashtext('unem-academic-rollover'));
  select applied_year into v_prev from public.community_academic_state where id for update;
  if v_prev is not null and v_prev >= v_ay then return; end if;
  if v_prev is null then
    insert into public.community_academic_state(id, applied_year) values (true, v_ay) on conflict (id) do update set applied_year = excluded.applied_year;
    return;
  end if;
  perform set_config('unem.rollover', 'on', true);
  update public.student_accounts a set
    level = (select s.level from public.student_shift_scope(a.level, a.promo, coalesce(a.level_year, v_prev), v_ay) s),
    promo = (select s.promo from public.student_shift_scope(a.level, a.promo, coalesce(a.level_year, v_prev), v_ay) s),
    level_year = v_ay
  where coalesce(a.level_year, v_prev) < v_ay;
  update public.student_roster r set
    level = (select s.level from public.student_shift_scope(r.level, r.promo, coalesce(r.academic_year, v_prev), v_ay) s),
    promo = (select s.promo from public.student_shift_scope(r.level, r.promo, coalesce(r.academic_year, v_prev), v_ay) s),
    academic_year = v_ay
  where coalesce(r.academic_year, v_prev) < v_ay;
  delete from public.student_account_enrollments where academic_year < v_ay;
  delete from public.student_roster_extra where academic_year < v_ay;
  update public.community_academic_state set applied_year = v_ay, updated_at = now() where id;
  perform set_config('unem.rollover', 'off', true);
end $$;

-- ---------- تتبع سنة المستوى على الحسابات ----------
create or replace function public.student_accounts_scope_year() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ay int := public.community_academic_year(); ro public.student_roster;
begin
  if tg_op = 'INSERT' then
    if new.source = 'roster' then
      perform public.student_rollover_if_needed();
      select * into ro from public.student_roster where reg_no_norm = new.reg_no_norm;
      if ro.id is not null then new.spec := ro.spec; new.level := ro.level; new.promo := ro.promo; end if;
    end if;
    new.level_year := v_ay;
    return new;
  end if;
  if coalesce(current_setting('unem.rollover', true), '') <> 'on'
     and (new.level is distinct from old.level or new.spec is distinct from old.spec or new.promo is distinct from old.promo) then
    new.level_year := v_ay;
  end if;
  return new;
end $$;
drop trigger if exists student_accounts_scope_year_trg on public.student_accounts;
create trigger student_accounts_scope_year_trg
  before insert or update on public.student_accounts
  for each row execute function public.student_accounts_scope_year();

-- ---------- نطاقات الطالب (التخصص/المستوى) الصالحة هذه السنة ----------
create or replace function public.community_account_scopes(p_account uuid)
returns table(spec text, level text)
language sql stable security definer set search_path = public as $$
  select a.spec, a.level from student_accounts a
   where a.id = p_account and a.promo is null and a.spec is not null and a.level is not null
  union
  select e.spec, e.level from student_account_enrollments e join student_accounts a on a.id = e.account
   where e.account = p_account and a.promo is null and e.academic_year = public.community_academic_year()
  union
  select x.spec, x.level from student_roster_extra x join student_accounts a on a.reg_no_norm = x.reg_no_norm
   where a.id = p_account and a.promo is null and x.academic_year = public.community_academic_year();
$$;

create or replace function public.community_profile_promo(p_profile uuid) returns int
language sql stable security definer set search_path = public as $$
  select a.promo from community_profiles p join student_accounts a on a.id = p.account
   where p.id = p_profile and a.status = 'approved' limit 1;
$$;
create or replace function public.community_profile_in_promo(p_profile uuid, p_promo int) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.community_profile_promo(p_profile) = p_promo, false);
$$;

-- الخريج لا يظهر في غرف المستويات والفصول؛ والطالب المتعثر يظهر في كل مستوى سُجّل فيه هذه السنة.
create or replace function public.community_profile_has_scope(p_profile uuid, p_spec text, p_level text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from community_profiles p cross join lateral public.community_account_scopes(p.account) s
                 where p.id = p_profile and s.spec = p_spec and s.level = p_level);
$$;
create or replace function public.community_profile_has_level(p_profile uuid, p_level text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from community_profiles p cross join lateral public.community_account_scopes(p.account) s
                 where p.id = p_profile and s.level = p_level);
$$;
create or replace function public.community_profile_enrollments(p_profile uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('spec', x.spec, 'level', x.level) order by x.spec, x.level), '[]'::jsonb)
  from (select s.spec, s.level from community_profiles p cross join lateral public.community_account_scopes(p.account) s where p.id = p_profile) x;
$$;

revoke all on function public.community_account_scopes(uuid) from public, anon, authenticated;
revoke all on function public.community_profile_promo(uuid) from public, anon, authenticated;
revoke all on function public.community_profile_in_promo(uuid, int) from public, anon, authenticated;
revoke all on function public.student_rollover_if_needed() from public, anon, authenticated;
notify pgrst, 'reload schema';
