-- UNEM ISCAE — unify registration/card statistics and require an approved student account.
-- This migration deliberately supersedes the legacy deferred-grant behavior without rewriting old migrations.

-- Deferred grants are no longer valid: a card may only be enabled for an existing approved account.
delete from public.student_card_grants;
drop trigger if exists student_accounts_apply_card_grant_trg on public.student_accounts;

create or replace function public.student_accounts_apply_card_grant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Kept as a compatibility stub for deployments that reference the old function.
  return new;
end $$;
revoke all on function public.student_accounts_apply_card_grant() from public, anon;

-- Shared definition used by supervisor pages: current registered students are approved accounts;
-- active cards are approved accounts with card_enabled=true.
create or replace function public.student_registration_stats()
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_year int := public.community_academic_year();
begin
  if auth.uid() is null or (not public.has_role(auth.uid(),'admin'::app_role)
    and not public.has_supervisor_permission('view_student_registrations')) then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'academic_year', v_year,
    'total_accounts', (select count(*)::int from public.student_accounts),
    'pending_accounts', (select count(*)::int from public.student_accounts where status = 'pending'),
    'approved_accounts', (select count(*)::int from public.student_accounts where status = 'approved'),
    'rejected_accounts', (select count(*)::int from public.student_accounts where status = 'rejected'),
    'active_cards', (select count(*)::int from public.student_accounts where status = 'approved' and coalesce(card_enabled,false)),
    'by_specialization', coalesce((select jsonb_agg(jsonb_build_object('key', x.key, 'count', x.n) order by x.key) from (
      select coalesce(nullif(spec,''),'غير محدد') as key, count(*)::int as n
      from public.student_accounts where status = 'approved' group by coalesce(nullif(spec,''),'غير محدد')
    ) x), '[]'::jsonb),
    'by_level', coalesce((select jsonb_agg(jsonb_build_object('key', x.key, 'count', x.n) order by x.key) from (
      select coalesce(nullif(level,''),'غير محدد') as key, count(*)::int as n
      from public.student_accounts where status = 'approved' group by coalesce(nullif(level,''),'غير محدد')
    ) x), '[]'::jsonb),
    'cards_by_specialization', coalesce((select jsonb_agg(jsonb_build_object('key', x.key, 'count', x.n) order by x.key) from (
      select coalesce(nullif(spec,''),'غير محدد') as key, count(*)::int as n
      from public.student_accounts where status = 'approved' and coalesce(card_enabled,false)
      group by coalesce(nullif(spec,''),'غير محدد')
    ) x), '[]'::jsonb),
    'cards_by_level', coalesce((select jsonb_agg(jsonb_build_object('key', x.key, 'count', x.n) order by x.key) from (
      select coalesce(nullif(level,''),'غير محدد') as key, count(*)::int as n
      from public.student_accounts where status = 'approved' and coalesce(card_enabled,false)
      group by coalesce(nullif(level,''),'غير محدد')
    ) x), '[]'::jsonb)
  );
end $$;
revoke all on function public.student_registration_stats() from public, anon;
grant execute on function public.student_registration_stats() to authenticated;

-- Keep the membership dashboard on the same definition as the registration/card dashboards.
create or replace function public.student_membership_stats()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare d jsonb;
begin
  perform public.student_card_admin_check();
  select public.student_registration_stats() into d;
  return d || jsonb_build_object('total_members', coalesce((d->>'active_cards')::int, 0),
    'by_specialization', coalesce(d->'cards_by_specialization','[]'::jsonb),
    'by_level', coalesce(d->'cards_by_level','[]'::jsonb));
end $$;
revoke all on function public.student_membership_stats() from public, anon;
grant execute on function public.student_membership_stats() to authenticated;

-- Lookup never advertises a pending/rejected account as card-eligible.
create or replace function public.student_card_admin_lookup(p_reg text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.student_accounts; v_reg text := upper(btrim(coalesce(p_reg,'')));
begin
  perform public.student_card_admin_check();
  select * into a from public.student_accounts where upper(reg_no) = v_reg limit 1;
  if a.id is null then return jsonb_build_object('found', false, 'registered', false, 'reg_no', v_reg); end if;
  return jsonb_build_object('found', true, 'registered', true, 'reg_no', a.reg_no, 'full_name', a.full_name,
    'spec', a.spec, 'level', a.level, 'promo', a.promo, 'status', a.status,
    'approved', a.status = 'approved', 'enabled', a.status = 'approved' and coalesce(a.card_enabled,false),
    'enabled_at', a.card_enabled_at, 'card_code', case when a.status = 'approved' and a.card_enabled then public.student_card_code(a.card_year, a.card_no) else null end,
    'devices', (select count(*) from public.push_subscriptions s where s.account = a.id));
end $$;
revoke all on function public.student_card_admin_lookup(text) from public, anon;
grant execute on function public.student_card_admin_lookup(text) to authenticated;

create or replace function public.student_card_set(p_regs text[], p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_reg text; a public.student_accounts; out jsonb := '[]'::jsonb; v_changed boolean;
begin
  perform public.student_card_admin_check();
  if p_regs is null or coalesce(array_length(p_regs,1),0) = 0 or array_length(p_regs,1) > 300 then raise exception 'bad_input'; end if;
  foreach v_reg in array p_regs loop
    v_reg := upper(btrim(coalesce(v_reg,''))); continue when v_reg = '';
    select * into a from public.student_accounts where upper(reg_no) = v_reg limit 1;
    if a.id is null then
      out := out || jsonb_build_array(jsonb_build_object('reg_no',v_reg,'found',false,'registered',false,'reason','not_registered'));
      continue;
    end if;
    if a.status <> 'approved' then
      out := out || jsonb_build_array(jsonb_build_object('reg_no',a.reg_no,'found',true,'registered',true,'approved',false,'status',a.status,'enabled',coalesce(a.card_enabled,false),'changed',false,'reason','account_not_approved'));
      continue;
    end if;
    v_changed := a.card_enabled is distinct from p_enabled;
    if v_changed then
      update public.student_accounts set card_enabled=p_enabled,
        card_enabled_at=case when p_enabled then now() else null end,
        card_enabled_by=case when p_enabled then auth.uid() else null end,
        membership_year=case when p_enabled then public.community_academic_year() else membership_year end,
        card_notified_at=case when p_enabled then null else card_notified_at end where id=a.id;
    end if;
    out := out || jsonb_build_array(jsonb_build_object('reg_no',a.reg_no,'found',true,'registered',true,'full_name',a.full_name,
      'spec',a.spec,'level',a.level,'approved',true,'status','approved','enabled',p_enabled,'changed',v_changed));
  end loop;
  return out;
end $$;
revoke all on function public.student_card_set(text[], boolean) from public, anon;
grant execute on function public.student_card_set(text[], boolean) to authenticated;

-- Membership imports use the same approved-account rule and current-year definition.
create or replace function public.student_membership_admin_set(p_regs text[], p_year int, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text; a public.student_accounts; out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin'::app_role) then raise exception 'forbidden'; end if;
  if p_year < 2000 or p_year > 2200 or p_regs is null or coalesce(array_length(p_regs,1),0) > 3000 then raise exception 'bad_input'; end if;
  foreach r in array p_regs loop
    r := upper(btrim(coalesce(r,''))); continue when r='';
    select * into a from public.student_accounts where upper(reg_no)=r limit 1;
    if a.id is null then out := out || jsonb_build_array(jsonb_build_object('reg_no',r,'found',false,'reason','not_registered'));
    elsif a.status <> 'approved' then out := out || jsonb_build_array(jsonb_build_object('reg_no',a.reg_no,'found',true,'approved',false,'status',a.status,'enabled',coalesce(a.card_enabled,false),'reason','account_not_approved'));
    else
      update public.student_accounts set card_enabled=p_enabled, card_enabled_at=case when p_enabled then now() else null end,
        card_enabled_by=case when p_enabled then auth.uid() else null end, membership_year=case when p_enabled then p_year else membership_year end
        where id=a.id;
      out := out || jsonb_build_array(jsonb_build_object('reg_no',a.reg_no,'found',true,'approved',true,'full_name',a.full_name,'enabled',p_enabled));
    end if;
  end loop; return out;
end $$;
revoke all on function public.student_membership_admin_set(text[],int,boolean) from public, anon;
grant execute on function public.student_membership_admin_set(text[],int,boolean) to authenticated;

-- Date-filtered list used by the card page; only enabled approved accounts are listed.
create or replace function public.student_card_admin_list_payload(p_day date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.student_card_admin_check();
  return jsonb_build_object(
    'enabled_count', (select count(*)::int from public.student_accounts where status='approved' and coalesce(card_enabled,false)),
    'pending_count', 0,
    'total_approved', (select count(*)::int from public.student_accounts where status='approved'),
    'items', coalesce((select jsonb_agg(x order by x.enabled_at desc nulls last) from (
      select reg_no, full_name, spec, level, promo, true as registered, true as approved,
        card_enabled_at as enabled_at, public.student_card_code(card_year,card_no) as card_code,
        card_enabled_by::text as added_by
      from public.student_accounts where status='approved' and coalesce(card_enabled,false)
        and (p_day is null or card_enabled_at::date = p_day)
      order by card_enabled_at desc nulls last limit 300
    ) x), '[]'::jsonb)
  );
end $$;
revoke all on function public.student_card_admin_list_payload(date) from public, anon;

drop function if exists public.student_card_admin_list(date);
create function public.student_card_admin_list(p_day date) returns jsonb
language sql security definer set search_path = public as $$ select public.student_card_admin_list_payload(p_day) $$;
revoke all on function public.student_card_admin_list(date) from public, anon;
grant execute on function public.student_card_admin_list(date) to authenticated;

create or replace function public.student_card_admin_list() returns jsonb
language sql security definer set search_path = public as $$ select public.student_card_admin_list_payload(null) $$;
revoke all on function public.student_card_admin_list() from public, anon;
grant execute on function public.student_card_admin_list() to authenticated;

notify pgrst, 'reload schema';
