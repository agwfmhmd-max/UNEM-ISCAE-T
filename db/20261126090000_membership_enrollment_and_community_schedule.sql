-- UNEM ISCAE: annual membership enrollment + scheduled community visibility.
-- Safe to rerun. Apply after the existing 20261121090000 card migration.

alter table public.student_accounts add column if not exists membership_phone text;
alter table public.student_accounts add column if not exists membership_photo text;
alter table public.student_accounts add column if not exists membership_year int;
alter table public.student_accounts add column if not exists membership_applied_at timestamptz;
alter table public.student_accounts add column if not exists membership_updated_at timestamptz;

alter table public.student_accounts drop constraint if exists student_membership_phone_check;
alter table public.student_accounts add constraint student_membership_phone_check
  check (membership_phone is null or membership_phone ~ '^[234][0-9]{7}$');

create table if not exists public.community_visibility_schedule (
  academic_year int primary key,
  show_at timestamptz,
  hide_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.community_visibility_schedule enable row level security;
drop policy if exists community_visibility_schedule_none on public.community_visibility_schedule;
create policy community_visibility_schedule_none on public.community_visibility_schedule for all to anon, authenticated using (false) with check (false);

create or replace function public.community_visibility(p_year int default public.community_academic_year()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.community_visibility_schedule; v_now timestamptz := now();
begin
  select * into s from community_visibility_schedule where academic_year = coalesce(p_year, public.community_academic_year());
  return jsonb_build_object('academic_year',coalesce(p_year,public.community_academic_year()),'show_at',s.show_at,'hide_at',s.hide_at,
    'visible', coalesce(s.show_at is not null and v_now >= s.show_at and (s.hide_at is null or v_now < s.hide_at), false));
end $$;
revoke all on function public.community_visibility(int) from public;
grant execute on function public.community_visibility(int) to anon, authenticated;

create or replace function public.community_visibility_set(p_year int, p_show_at timestamptz, p_hide_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin'::app_role) then raise exception 'forbidden'; end if;
  if p_year < 2000 or p_year > 2200 or p_show_at is null or (p_hide_at is not null and p_hide_at <= p_show_at) then raise exception 'bad_schedule'; end if;
  insert into community_visibility_schedule(academic_year,show_at,hide_at,updated_at,updated_by)
  values(p_year,p_show_at,p_hide_at,now(),auth.uid())
  on conflict(academic_year) do update set show_at=excluded.show_at,hide_at=excluded.hide_at,updated_at=now(),updated_by=auth.uid();
  return public.community_visibility(p_year);
end $$;
revoke all on function public.community_visibility_set(int,timestamptz,timestamptz) from public, anon;
grant execute on function public.community_visibility_set(int,timestamptz,timestamptz) to authenticated;

create or replace function public.student_membership(p_token text, p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hash text; a public.student_accounts; v_phone text; v_photo text; v_year int;
begin
  if p_token is null or char_length(p_token) < 30 then return jsonb_build_object('error','bad_token'); end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  select ac.* into a from student_devices d join student_accounts ac on ac.id=d.account where d.token_hash=v_hash;
  if a.id is null then return jsonb_build_object('error','not_logged_in'); end if;
  v_year := public.community_academic_year();
  if p_action = 'status' then
    return jsonb_build_object('status',a.status,'approved',a.status='approved','reg_no',a.reg_no,'full_name',a.full_name,
      'spec',a.spec,'level',a.level,'academic_year',v_year,'member_year',a.membership_year,'phone',a.membership_phone,
      'photo',a.membership_photo,'card_enabled',coalesce(a.card_enabled,false),'card_code',public.student_card_code(a.card_year,a.card_no));
  elsif p_action = 'apply' then
    if a.status <> 'approved' then raise exception 'not_approved'; end if;
    v_phone := btrim(coalesce(p_args->>'phone',''));
    v_photo := nullif(btrim(coalesce(p_args->>'photo','')),'');
    if v_phone !~ '^[234][0-9]{7}$' then raise exception 'bad_phone'; end if;
    if v_photo is not null and (char_length(v_photo) > 700000 or v_photo !~ '^data:image/(jpeg|png|webp);base64,') then raise exception 'bad_photo'; end if;
    update student_accounts set membership_phone=v_phone,membership_photo=v_photo,membership_year=v_year,
      membership_applied_at=coalesce(membership_applied_at,now()),membership_updated_at=now() where id=a.id returning * into a;
    return jsonb_build_object('status','applied','approved',true,'reg_no',a.reg_no,'full_name',a.full_name,'spec',a.spec,'level',a.level,
      'academic_year',v_year,'member_year',a.membership_year,'phone',a.membership_phone,'photo',a.membership_photo,
      'card_enabled',coalesce(a.card_enabled,false),'card_code',public.student_card_code(a.card_year,a.card_no));
  end if;
  return jsonb_build_object('error','unknown_action');
end $$;
revoke all on function public.student_membership(text,text,jsonb) from public;
grant execute on function public.student_membership(text,text,jsonb) to anon, authenticated;

create or replace function public.student_membership_admin_set(p_regs text[], p_year int, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text; a public.student_accounts; out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin'::app_role) then raise exception 'forbidden'; end if;
  if p_year < 2000 or p_year > 2200 or p_regs is null or coalesce(array_length(p_regs,1),0) > 3000 then raise exception 'bad_input'; end if;
  foreach r in array p_regs loop
    r := upper(btrim(coalesce(r,''))); continue when r='';
    select * into a from student_accounts where upper(reg_no)=r limit 1;
    if a.id is null then out := out || jsonb_build_array(jsonb_build_object('reg_no',r,'found',false));
    else update student_accounts set card_enabled=p_enabled,card_enabled_at=case when p_enabled then now() else null end,
      card_enabled_by=case when p_enabled then auth.uid() else null end,
      membership_year=case when p_enabled then p_year else membership_year end where id=a.id;
      out := out || jsonb_build_array(jsonb_build_object('reg_no',a.reg_no,'found',true,'full_name',a.full_name,'enabled',p_enabled));
    end if;
  end loop; return out;
end $$;
revoke all on function public.student_membership_admin_set(text[],int,boolean) from public, anon;
grant execute on function public.student_membership_admin_set(text[],int,boolean) to authenticated;
notify pgrst, 'reload schema';
