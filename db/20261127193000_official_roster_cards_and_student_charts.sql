-- UNEM ISCAE — official roster is the authority for card eligibility.
-- Being eligible does not require a student account or a previous login.

create or replace function public.student_card_official_exists(p_reg text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.student_roster where reg_no_norm = lower(btrim(p_reg)))
$$;
revoke all on function public.student_card_official_exists(text) from public, anon;
grant execute on function public.student_card_official_exists(text) to authenticated;

-- A grant is valid only when its number is already in the official roster.
delete from public.student_card_grants g
where not public.student_card_official_exists(g.reg_no_norm);

create or replace function public.student_accounts_apply_card_grant() returns trigger
language plpgsql security definer set search_path = public as $$
declare g public.student_card_grants;
begin
  if new.status = 'approved' and public.student_card_official_exists(new.reg_no_norm)
     and not coalesce(new.card_enabled,false) then
    select * into g from public.student_card_grants where reg_no_norm = lower(btrim(new.reg_no));
    if g.reg_no_norm is not null then
      new.card_enabled := true;
      new.card_enabled_at := g.enabled_at;
      new.card_enabled_by := g.enabled_by;
      new.card_notified_at := null;
      new.membership_year := public.community_academic_year();
      delete from public.student_card_grants where reg_no_norm = g.reg_no_norm;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists student_accounts_apply_card_grant_trg on public.student_accounts;
create trigger student_accounts_apply_card_grant_trg before insert or update of status on public.student_accounts
for each row execute function public.student_accounts_apply_card_grant();

create or replace function public.student_registration_stats()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v_year int := public.community_academic_year();
begin
  if auth.uid() is null or (not public.has_role(auth.uid(),'admin'::app_role)
    and not public.has_supervisor_permission('view_student_registrations')) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'academic_year',v_year,
    'total_accounts',(select count(*)::int from public.student_roster),
    'pending_accounts',(select count(*)::int from public.student_accounts where status='pending'),
    'approved_accounts',(select count(*)::int from public.student_roster),
    'rejected_accounts',(select count(*)::int from public.student_accounts where status='rejected'),
    'active_cards',(select count(*)::int from public.student_accounts a where a.status='approved' and coalesce(a.card_enabled,false)) + (select count(*)::int from public.student_card_grants),
    'by_specialization',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'count',x.n) order by x.key) from (select coalesce(nullif(spec,''),'غير محدد') key,count(*)::int n from public.student_roster group by coalesce(nullif(spec,''),'غير محدد')) x),'[]'::jsonb),
    'by_level',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'count',x.n) order by x.key) from (select coalesce(nullif(level,''),'غير محدد') key,count(*)::int n from public.student_roster group by coalesce(nullif(level,''),'غير محدد')) x),'[]'::jsonb),
    'cards_by_specialization',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'count',x.n) order by x.key) from (select coalesce(nullif(r.spec,''),'غير محدد') key,count(*)::int n from public.student_roster r where exists (select 1 from public.student_accounts a where a.reg_no_norm=r.reg_no_norm and a.status='approved' and a.card_enabled) or exists (select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm) group by coalesce(nullif(r.spec,''),'غير محدد')) x),'[]'::jsonb),
    'cards_by_level',coalesce((select jsonb_agg(jsonb_build_object('key',x.key,'count',x.n) order by x.key) from (select coalesce(nullif(r.level,''),'غير محدد') key,count(*)::int n from public.student_roster r where exists (select 1 from public.student_accounts a where a.reg_no_norm=r.reg_no_norm and a.status='approved' and a.card_enabled) or exists (select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm) group by coalesce(nullif(r.level,''),'غير محدد')) x),'[]'::jsonb)
  );
end $$;
revoke all on function public.student_registration_stats() from public, anon;
grant execute on function public.student_registration_stats() to authenticated;

create or replace function public.student_card_admin_lookup(p_reg text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.student_accounts; r public.student_roster; v_reg text := upper(btrim(coalesce(p_reg,'')));
begin
  perform public.student_card_admin_check();
  select * into r from public.student_roster where upper(reg_no)=v_reg limit 1;
  select * into a from public.student_accounts where upper(reg_no)=v_reg limit 1;
  if r.id is null then return jsonb_build_object('found',false,'official',false,'registered',a.id is not null,'reg_no',v_reg); end if;
  return jsonb_build_object('found',true,'official',true,'registered',a.id is not null,'reg_no',coalesce(a.reg_no,r.reg_no),
    'full_name',coalesce(a.full_name,r.full_name),'spec',coalesce(a.spec,r.spec),'level',coalesce(a.level,r.level),'promo',coalesce(a.promo,r.promo),
    'status',coalesce(a.status,'not_registered'),'approved',true,'enabled',coalesce(a.card_enabled,false) or exists(select 1 from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm),
    'enabled_at',coalesce(a.card_enabled_at,(select g.enabled_at from public.student_card_grants g where g.reg_no_norm=r.reg_no_norm)),
    'card_code',case when a.id is not null and a.status='approved' and a.card_enabled then public.student_card_code(a.card_year,a.card_no) else null end,
    'devices',coalesce((select count(*) from public.push_subscriptions s where s.account=a.id),0));
end $$;
revoke all on function public.student_card_admin_lookup(text) from public, anon;
grant execute on function public.student_card_admin_lookup(text) to authenticated;

create or replace function public.student_card_set(p_regs text[], p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_reg text; v_norm text; a public.student_accounts; r public.student_roster; out jsonb:='[]'::jsonb; v_changed boolean;
begin
  perform public.student_card_admin_check();
  if p_regs is null or coalesce(array_length(p_regs,1),0)=0 or array_length(p_regs,1)>300 then raise exception 'bad_input'; end if;
  foreach v_reg in array p_regs loop
    v_reg:=upper(btrim(coalesce(v_reg,''))); continue when v_reg=''; v_norm:=lower(v_reg);
    select * into r from public.student_roster where upper(reg_no)=v_reg limit 1;
    select * into a from public.student_accounts where upper(reg_no)=v_reg limit 1;
    if r.id is null then
      out:=out||jsonb_build_array(jsonb_build_object('reg_no',v_reg,'found',false,'official',false,'registered',a.id is not null,'approved',false,'reason','not_official_roster'));
    elsif a.id is not null and a.status='approved' then
      v_changed:=a.card_enabled is distinct from p_enabled;
      update public.student_accounts set card_enabled=p_enabled,card_enabled_at=case when p_enabled then now() else null end,card_enabled_by=case when p_enabled then auth.uid() else null end,membership_year=case when p_enabled then public.community_academic_year() else membership_year end,card_notified_at=case when p_enabled then null else card_notified_at end where id=a.id;
      if not p_enabled then delete from public.student_card_grants where reg_no_norm=v_norm; end if;
      out:=out||jsonb_build_array(jsonb_build_object('reg_no',coalesce(a.reg_no,r.reg_no),'found',true,'official',true,'registered',true,'approved',true,'full_name',coalesce(a.full_name,r.full_name),'spec',coalesce(a.spec,r.spec),'level',coalesce(a.level,r.level),'enabled',p_enabled,'changed',v_changed));
    else
      if p_enabled then insert into public.student_card_grants(reg_no_norm,reg_no,enabled_at,enabled_by) values(v_norm,coalesce(a.reg_no,r.reg_no),now(),auth.uid()) on conflict(reg_no_norm) do update set reg_no=excluded.reg_no,enabled_at=excluded.enabled_at,enabled_by=excluded.enabled_by; else delete from public.student_card_grants where reg_no_norm=v_norm; end if;
      out:=out||jsonb_build_array(jsonb_build_object('reg_no',coalesce(a.reg_no,r.reg_no),'found',true,'official',true,'registered',a.id is not null,'approved',true,'status',coalesce(a.status,'not_registered'),'full_name',coalesce(a.full_name,r.full_name),'spec',coalesce(a.spec,r.spec),'level',coalesce(a.level,r.level),'enabled',p_enabled,'changed',true));
    end if;
  end loop; return out;
end $$;
revoke all on function public.student_card_set(text[],boolean) from public, anon;
grant execute on function public.student_card_set(text[],boolean) to authenticated;

create or replace function public.student_membership_admin_set(p_regs text[],p_year int,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r text; n text; a public.student_accounts; ro public.student_roster; out jsonb:='[]'::jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin'::app_role) then raise exception 'forbidden'; end if;
  if p_year<2000 or p_year>2200 or p_regs is null or coalesce(array_length(p_regs,1),0)>3000 then raise exception 'bad_input'; end if;
  foreach r in array p_regs loop
    r:=upper(btrim(coalesce(r,''))); continue when r=''; n:=lower(r); select * into ro from public.student_roster where upper(reg_no)=r limit 1; select * into a from public.student_accounts where upper(reg_no)=r limit 1;
    if ro.id is null then out:=out||jsonb_build_array(jsonb_build_object('reg_no',r,'found',false,'approved',false,'reason','not_official_roster'));
    elsif a.id is not null and a.status='approved' then update public.student_accounts set card_enabled=p_enabled,card_enabled_at=case when p_enabled then now() else null end,card_enabled_by=case when p_enabled then auth.uid() else null end,membership_year=case when p_enabled then p_year else membership_year end where id=a.id; if not p_enabled then delete from public.student_card_grants where reg_no_norm=n; end if; out:=out||jsonb_build_array(jsonb_build_object('reg_no',a.reg_no,'found',true,'approved',true,'registered',true,'enabled',p_enabled));
    else if p_enabled then insert into public.student_card_grants(reg_no_norm,reg_no,enabled_at,enabled_by) values(n,coalesce(a.reg_no,ro.reg_no),now(),auth.uid()) on conflict(reg_no_norm) do update set enabled_at=excluded.enabled_at,enabled_by=excluded.enabled_by; else delete from public.student_card_grants where reg_no_norm=n; end if; out:=out||jsonb_build_array(jsonb_build_object('reg_no',coalesce(a.reg_no,ro.reg_no),'found',true,'approved',true,'registered',a.id is not null,'enabled',p_enabled)); end if;
  end loop; return out;
end $$;
revoke all on function public.student_membership_admin_set(text[],int,boolean) from public, anon;
grant execute on function public.student_membership_admin_set(text[],int,boolean) to authenticated;

notify pgrst,'reload schema';

create or replace function public.student_card_admin_list_payload(p_day date default null) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.student_card_admin_check();
  return jsonb_build_object(
    'enabled_count',(select count(*)::int from public.student_accounts where status='approved' and coalesce(card_enabled,false))+(select count(*)::int from public.student_card_grants),
    'pending_count',(select count(*)::int from public.student_card_grants),
    'total_approved',(select count(*)::int from public.student_roster),
    'items',coalesce((select jsonb_agg(x order by x.enabled_at desc nulls last) from (
      select a.reg_no,a.full_name,a.spec,a.level,a.promo,true registered,true approved,a.card_enabled_at enabled_at,public.student_card_code(a.card_year,a.card_no) card_code,a.card_enabled_by::text added_by
      from public.student_accounts a where a.status='approved' and coalesce(a.card_enabled,false) and (p_day is null or a.card_enabled_at::date=p_day)
      union all
      select r.reg_no,r.full_name,r.spec,r.level,r.promo,false registered,true approved,g.enabled_at,g.reg_no card_code,g.enabled_by::text
      from public.student_card_grants g join public.student_roster r on r.reg_no_norm=g.reg_no_norm
      where (p_day is null or g.enabled_at::date=p_day)
      order by enabled_at desc nulls last limit 300
    ) x),'[]'::jsonb)
  );
end $$;
revoke all on function public.student_card_admin_list_payload(date) from public, anon;
grant execute on function public.student_card_admin_list_payload(date) to authenticated;
notify pgrst,'reload schema';


drop function if exists public.student_card_admin_list(date);
create function public.student_card_admin_list(p_day date) returns jsonb
language sql security definer set search_path=public as $$ select public.student_card_admin_list_payload(p_day) $$;
revoke all on function public.student_card_admin_list(date) from public, anon;
grant execute on function public.student_card_admin_list(date) to authenticated;

create or replace function public.student_card_admin_list() returns jsonb
language sql security definer set search_path=public as $$ select public.student_card_admin_list_payload(null) $$;
revoke all on function public.student_card_admin_list() from public, anon;
grant execute on function public.student_card_admin_list() to authenticated;
notify pgrst,'reload schema';
