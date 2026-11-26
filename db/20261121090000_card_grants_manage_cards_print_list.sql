-- 1) إتاحة بطاقة الانتساب لطالب لم يسجل بعد (تُطبَّق عند اعتماد حسابه) مع حفظ وقت الإضافة ومن أضافه.
-- 2) صلاحية manage_cards يمنحها المشرف الرئيسي لمشرفين آخرين (إتاحة البطاقات وطباعة اللوائح).
-- 3) لائحة كاملة مرتبة بتاريخ ووقت الإضافة، مع تصفية بيوم محدد (للطباعة).
-- (مطبّق فعلاً على قاعدة Supabase عبر migration: card_grants_manage_cards_print_list)
alter table public.supervisor_permissions add column if not exists manage_cards boolean not null default false;
alter table public.student_accounts add column if not exists card_enabled_by uuid;

create table if not exists public.student_card_grants (
  reg_no_norm text primary key,
  reg_no text not null,
  enabled_at timestamptz not null default now(),
  enabled_by uuid
);
alter table public.student_card_grants enable row level security;
drop policy if exists student_card_grants_none on public.student_card_grants;
create policy student_card_grants_none on public.student_card_grants for all to anon, authenticated using (false) with check (false);

create or replace function public.student_accounts_apply_card_grant() returns trigger
language plpgsql security definer set search_path = public as $$
declare g public.student_card_grants;
begin
  if new.status = 'approved' and not coalesce(new.card_enabled, false) then
    select * into g from student_card_grants where reg_no_norm = lower(btrim(new.reg_no));
    if g.reg_no_norm is not null then
      new.card_enabled := true;
      new.card_enabled_at := g.enabled_at;
      new.card_enabled_by := g.enabled_by;
      new.card_notified_at := null;
      delete from student_card_grants where reg_no_norm = g.reg_no_norm;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists student_accounts_apply_card_grant_trg on public.student_accounts;
create trigger student_accounts_apply_card_grant_trg before insert or update of status on public.student_accounts
  for each row execute function public.student_accounts_apply_card_grant();

create or replace function public.student_card_admin_check() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.has_role(auth.uid(), 'admin'::app_role) or public.has_supervisor_permission('manage_cards')) then
    raise exception 'forbidden';
  end if;
end $$;
revoke all on function public.student_card_admin_check() from public, anon;

-- student_card_admin_lookup / student_card_set / student_card_admin_list(date): انظر الترحيل المطبّق في Supabase
-- (تدعم: الطالب غير المسجل بعد، pending، الترتيب بوقت الإضافة، التصفية بيوم محدد).
-- وتم تعديل has_supervisor_permission و get_my_supervisor_permissions لإضافة manage_cards.
