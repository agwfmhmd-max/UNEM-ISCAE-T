-- ترقيم البطاقات تسلسلياً حسب أسبق تسجيل: UNEM-ISCAE-{سنة الإصدار}-{0001...}
-- (عدّاد لكل سنة لا يُعاد استعماله حتى لو حُذف حساب)، مع دالة فحص للمشرفين فقط (مسح QR أو إدخال الرقم).
alter table public.student_accounts add column if not exists card_year int;
alter table public.student_accounts add column if not exists card_no int;
create unique index if not exists student_accounts_card_no_key on public.student_accounts(card_year, card_no) where card_no is not null;

create table if not exists public.student_card_counters (
  year int primary key,
  last_no int not null default 0
);
alter table public.student_card_counters enable row level security;
drop policy if exists student_card_counters_none on public.student_card_counters;
create policy student_card_counters_none on public.student_card_counters for all to anon, authenticated using (false) with check (false);

create or replace function public.student_card_code(p_year int, p_no int) returns text
language sql immutable as $$ select case when p_no is null then null else 'UNEM-ISCAE-' || p_year::text || '-' || lpad(p_no::text, 4, '0') end $$;

create or replace function public.student_next_card_no(p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into student_card_counters(year, last_no) values (p_year, 1)
    on conflict (year) do update set last_no = student_card_counters.last_no + 1
    returning last_no into v;
  return v;
end $$;
revoke all on function public.student_next_card_no(int) from public, anon, authenticated;

-- الطالب يأخذ رقمه عند اعتماد حسابه (أو إنشائه معتمداً من اللائحة)
create or replace function public.student_accounts_assign_card() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_year int := public.community_academic_year();
begin
  if new.status = 'approved' and new.card_no is null then
    new.card_year := v_year;
    new.card_no := public.student_next_card_no(v_year);
  end if;
  return new;
end $$;
drop trigger if exists student_accounts_assign_card_trg on public.student_accounts;
create trigger student_accounts_assign_card_trg before insert or update of status on public.student_accounts
  for each row execute function public.student_accounts_assign_card();

-- ترقيم الحسابات المعتمدة الحالية حسب ترتيب التسجيل (الأقدم أولاً)
with ranked as (
  select id,
         (case when extract(month from created_at at time zone 'UTC') >= 9
               then extract(year from created_at at time zone 'UTC') else extract(year from created_at at time zone 'UTC') - 1 end)::int as ay,
         row_number() over (
           partition by (case when extract(month from created_at at time zone 'UTC') >= 9
               then extract(year from created_at at time zone 'UTC') else extract(year from created_at at time zone 'UTC') - 1 end)::int
           order by created_at, id) as rn
  from public.student_accounts where status = 'approved' and card_no is null
)
update public.student_accounts a set card_year = r.ay, card_no = r.rn from ranked r where a.id = r.id;
insert into public.student_card_counters(year, last_no)
  select card_year, max(card_no) from public.student_accounts where card_no is not null group by card_year
  on conflict (year) do update set last_no = greatest(student_card_counters.last_no, excluded.last_no);

-- التحقق العام (صفحة QR) يعرض رقم البطاقة أيضاً
create or replace function public.student_card_verify(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.student_accounts;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9]{8,16}$' then return jsonb_build_object('valid', false); end if;
  select * into a from student_accounts where card_token = upper(p_token) and status = 'approved';
  if a.id is null then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'full_name', a.full_name, 'reg_no', a.reg_no, 'spec', a.spec,
                            'level', a.level, 'promo', a.promo, 'academic_year', public.community_academic_year(),
                            'card_code', public.student_card_code(a.card_year, a.card_no));
end $$;

-- فحص المشرفين: يقبل رمز QR أو رابط التحقق أو رقم البطاقة (UNEM-ISCAE-2026-0001 / 2026-0001 / 0001) أو رقم التسجيل
create or replace function public.student_card_lookup(p_query text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.student_accounts; q text := upper(btrim(coalesce(p_query, ''))); v_year int; v_no int; v_avatar text; m text[];
begin
  if auth.uid() is null or not (public.has_role(auth.uid(), 'admin'::app_role) or public.has_supervisor_permission('view_student_registrations')) then
    raise exception 'forbidden';
  end if;
  m := regexp_match(q, '[?&]C=([A-Z0-9]{8,16})');
  if m is not null then q := m[1]; end if;
  if q ~ '^[A-Z0-9]{10}$' and q !~ '^I[0-9]{5}$' then
    select * into a from student_accounts where card_token = q;
  elsif q ~ '^UNEM-ISCAE-[0-9]{4}-[0-9]{1,6}$' then
    v_year := split_part(q, '-', 3)::int; v_no := split_part(q, '-', 4)::int;
    select * into a from student_accounts where card_year = v_year and card_no = v_no;
  elsif q ~ '^[0-9]{4}-[0-9]{1,6}$' then
    v_year := split_part(q, '-', 1)::int; v_no := split_part(q, '-', 2)::int;
    select * into a from student_accounts where card_year = v_year and card_no = v_no;
  elsif q ~ '^[0-9]{1,6}$' then
    v_no := q::int;
    select * into a from student_accounts where card_year = public.community_academic_year() and card_no = v_no;
  elsif q ~ '^I[1-9][0-9]{4}$' then
    select * into a from student_accounts where reg_no_norm = lower(q) or upper(reg_no) = q limit 1;
  else
    return jsonb_build_object('found', false);
  end if;
  if a.id is null then return jsonb_build_object('found', false); end if;
  select cp.avatar_data into v_avatar from community_profiles cp where cp.account = a.id order by cp.created_at desc limit 1;
  return jsonb_build_object('found', true, 'valid', a.status = 'approved', 'status', a.status,
    'full_name', a.full_name, 'reg_no', a.reg_no, 'spec', a.spec, 'level', a.level, 'promo', a.promo,
    'academic_year', public.community_academic_year(), 'card_code', public.student_card_code(a.card_year, a.card_no),
    'issued_at', a.created_at, 'avatar', v_avatar);
end $$;
revoke all on function public.student_card_lookup(text) from public, anon;
grant execute on function public.student_card_lookup(text) to authenticated;

-- إجراء card في المجتمع يعيد رقم البطاقة التسلسلي
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
  v := public.unem_patch_text(v, $q$    return jsonb_build_object('full_name', acc.full_name, 'reg_no', acc.reg_no, 'spec', acc.spec, 'level', acc.level,
                              'promo', acc.promo, 'academic_year', public.community_academic_year(), 'token', v_target);$q$,
$q$    if acc.card_no is null then
      update student_accounts set card_year = public.community_academic_year(), card_no = public.student_next_card_no(public.community_academic_year())
        where id = acc.id and card_no is null;
    end if;
    return jsonb_build_object('full_name', acc.full_name, 'reg_no', acc.reg_no, 'spec', acc.spec, 'level', acc.level,
                              'promo', acc.promo, 'academic_year', public.community_academic_year(), 'token', v_target,
                              'code', (select public.student_card_code(s.card_year, s.card_no) from student_accounts s where s.id = acc.id));$q$, 1);
  execute v;
end $patch$;
drop function public.unem_patch_text(text,text,text,int);
notify pgrst, 'reload schema';
