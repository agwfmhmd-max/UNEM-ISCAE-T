-- Protect student_accounts from direct client access.
-- Student-facing RPCs are SECURITY DEFINER and continue to work without exposing rows.
alter table public.student_accounts enable row level security;

drop policy if exists "student admin all" on public.student_accounts;
drop policy if exists student_accounts_block_anon on public.student_accounts;
drop policy if exists student_accounts_admin_select on public.student_accounts;
drop policy if exists student_accounts_admin_insert on public.student_accounts;
drop policy if exists student_accounts_admin_update on public.student_accounts;
drop policy if exists student_accounts_admin_delete on public.student_accounts;

create policy student_accounts_block_anon
on public.student_accounts
for all to anon
using (false)
with check (false);

create policy student_accounts_admin_select
on public.student_accounts
for select to authenticated
using (public.has_role(auth.uid(), 'admin'::app_role));

create policy student_accounts_admin_insert
on public.student_accounts
for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'::app_role));

create policy student_accounts_admin_update
on public.student_accounts
for update to authenticated
using (public.has_role(auth.uid(), 'admin'::app_role))
with check (public.has_role(auth.uid(), 'admin'::app_role));

create policy student_accounts_admin_delete
on public.student_accounts
for delete to authenticated
using (public.has_role(auth.uid(), 'admin'::app_role));

notify pgrst, 'reload schema';
