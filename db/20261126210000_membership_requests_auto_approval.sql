-- UNEM ISCAE — طلبات انتساب سنوية مع مراجعة يدوية أو موافقة آلية للحسابات المطابقة للائحة الرسمية فقط.
-- يضاف بعد 20261126190000_fix_community_visibility_schedule.sql. آمن لإعادة التطبيق.

create table if not exists public.student_membership_requests (
  id uuid primary key default gen_random_uuid(),
  account uuid not null references public.student_accounts(id) on delete cascade,
  academic_year int not null check (academic_year between 2000 and 2200),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  decision_source text not null default 'manual' check (decision_source in ('manual','automatic')),
  unique (account, academic_year)
);
create index if not exists student_membership_requests_pending_idx
  on public.student_membership_requests (academic_year, requested_at desc)
  where status = 'pending';
alter table public.student_membership_requests enable row level security;
drop policy if exists student_membership_requests_deny on public.student_membership_requests;
create policy student_membership_requests_deny on public.student_membership_requests
  for all to anon, authenticated using (false) with check (false);
revoke all on public.student_membership_requests from public, anon, authenticated;

insert into public.platform_settings(key, value_boolean)
values ('student_membership_auto_approval', false)
on conflict (key) do nothing;

create or replace function public.student_membership(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  a public.student_accounts;
  v_phone text;
  v_photo text;
  v_community_photo text;
  v_year int;
  v_request_status text;
  v_request_id uuid;
  v_requested_at timestamptz;
  v_auto_enabled boolean := false;
  v_auto_eligible boolean := false;
  v_next_status text;
begin
  if p_token is null or char_length(p_token) < 30 then
    return jsonb_build_object('error','bad_token');
  end if;

  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  select ac.* into a
  from public.student_devices d
  join public.student_accounts ac on ac.id=d.account
  where d.token_hash=v_hash;
  if a.id is null then
    return jsonb_build_object('error','not_logged_in');
  end if;

  v_year := public.community_academic_year();
  select cp.avatar_data into v_community_photo
  from public.community_profiles cp
  where cp.account=a.id
  limit 1;

  select r.id, r.status, r.requested_at
    into v_request_id, v_request_status, v_requested_at
  from public.student_membership_requests r
  where r.account=a.id and r.academic_year=v_year;

  if p_action = 'status' then
    return jsonb_build_object(
      'status',a.status,'approved',a.status='approved','reg_no',a.reg_no,'full_name',a.full_name,
      'spec',a.spec,'level',a.level,'promo',a.promo,'academic_year',v_year,'member_year',a.membership_year,
      'phone',a.membership_phone,'photo',coalesce(v_community_photo,a.membership_photo),
      'card_enabled',coalesce(a.card_enabled,false),'card_code',public.student_card_code(a.card_year,a.card_no),
      'token',a.card_token,
      'enrollment_status',case when coalesce(a.card_enabled,false) then 'approved' else coalesce(v_request_status,'not_requested') end,
      'request_id',v_request_id,'requested_at',v_requested_at
    );

  elsif p_action = 'request' then
    if a.status <> 'approved' then
      return jsonb_build_object('error','not_approved');
    end if;

    -- A legacy administrator-enabled card is already an explicit approval.
    if coalesce(a.card_enabled,false) then
      return jsonb_build_object(
        'status',a.status,'approved',true,'reg_no',a.reg_no,'full_name',a.full_name,
        'spec',a.spec,'level',a.level,'promo',a.promo,'academic_year',v_year,'member_year',a.membership_year,
        'phone',a.membership_phone,'photo',coalesce(v_community_photo,a.membership_photo),
        'card_enabled',true,'card_code',public.student_card_code(a.card_year,a.card_no),
        'token',a.card_token,'enrollment_status','approved','request_id',v_request_id,'requested_at',v_requested_at
      );
    end if;

    perform pg_advisory_xact_lock(hashtext(a.id::text),v_year);
    select coalesce(ps.value_boolean,false) into v_auto_enabled
    from public.platform_settings ps where ps.key='student_membership_auto_approval';
    v_auto_enabled := coalesce(v_auto_enabled,false);

    -- Automatic approval is restricted to accounts created from, and still matching, the official roster.
    select a.source='roster' and exists (
      select 1 from public.student_roster ro
      where ro.reg_no_norm=a.reg_no_norm
        and public.student_names_match(ro.name_norm,a.name_norm)
    ) into v_auto_eligible;
    v_next_status := case when v_request_status='approved' then 'approved'
                          when v_auto_enabled and coalesce(v_auto_eligible,false) then 'approved'
                          else 'pending' end;

    if v_request_id is not null and v_request_status='approved' then
      null; -- An approval remains in force while the student completes the card details.
    elsif v_request_id is not null and v_request_status='pending' and v_next_status='pending' then
      null; -- Repeated confirmation is idempotent; keep the original request timestamp.
    elsif v_request_id is not null then
      update public.student_membership_requests
      set status=v_next_status, requested_at=case when status='rejected' then now() else requested_at end,
          reviewed_at=case when v_next_status='approved' then now() else null end,
          reviewed_by=null,
          decision_source=case when v_next_status='approved' then 'automatic' else 'manual' end
      where id=v_request_id
      returning id,status,requested_at into v_request_id,v_request_status,v_requested_at;
    else
      insert into public.student_membership_requests(account,academic_year,status,reviewed_at,reviewed_by,decision_source)
      values(a.id,v_year,v_next_status,case when v_next_status='approved' then now() else null end,null,
             case when v_next_status='approved' then 'automatic' else 'manual' end)
      returning id,status,requested_at into v_request_id,v_request_status,v_requested_at;
    end if;

    if v_request_status='approved' then
      -- Approval authorizes completion only; card_enabled remains false until the student submits their details.
      update public.student_accounts
      set membership_year=v_year,membership_phone=null,membership_photo=null,
          membership_applied_at=null,membership_updated_at=now()
      where id=a.id
      returning * into a;
    end if;

    return jsonb_build_object(
      'status',a.status,'approved',true,'reg_no',a.reg_no,'full_name',a.full_name,
      'spec',a.spec,'level',a.level,'promo',a.promo,'academic_year',v_year,'member_year',a.membership_year,
      'phone',a.membership_phone,'photo',coalesce(v_community_photo,a.membership_photo),
      'card_enabled',coalesce(a.card_enabled,false),'card_code',public.student_card_code(a.card_year,a.card_no),
      'token',a.card_token,'enrollment_status',v_request_status,'request_id',v_request_id,'requested_at',v_requested_at
    );

  elsif p_action = 'apply' then
    if a.status <> 'approved' then
      raise exception 'not_approved';
    end if;
    if not coalesce(a.card_enabled,false) and coalesce(v_request_status,'') <> 'approved' then
      raise exception 'membership_not_approved';
    end if;

    v_phone := btrim(coalesce(p_args->>'phone',''));
    -- Keep accepting an explicitly supplied photo from older clients, but use the community
    -- profile photo by default and retain any already saved membership photo as a fallback.
    v_photo := nullif(btrim(coalesce(p_args->>'photo','')),'');
    if v_photo is null then
      v_photo := coalesce(v_community_photo,a.membership_photo);
    end if;
    if v_phone !~ '^[234][0-9]{7}$' then
      raise exception 'bad_phone';
    end if;
    if v_photo is not null and (char_length(v_photo) > 700000 or v_photo !~ '^data:image/(jpeg|png|webp);base64,') then
      raise exception 'bad_photo';
    end if;

    update public.student_accounts
    set membership_phone=v_phone,
        membership_photo=v_photo,
        membership_year=v_year,
        membership_applied_at=now(),
        membership_updated_at=now(),
        card_enabled=true,
        card_enabled_at=case when coalesce(a.card_enabled,false) then a.card_enabled_at else now() end,
        card_enabled_by=case when coalesce(a.card_enabled,false) then a.card_enabled_by else null end
    where id=a.id
    returning * into a;

    return jsonb_build_object(
      'status','applied','approved',true,'reg_no',a.reg_no,'full_name',a.full_name,
      'spec',a.spec,'level',a.level,'promo',a.promo,'academic_year',v_year,'member_year',a.membership_year,
      'phone',a.membership_phone,'photo',coalesce(v_community_photo,a.membership_photo),
      'card_enabled',coalesce(a.card_enabled,false),'card_code',public.student_card_code(a.card_year,a.card_no),
      'token',a.card_token,'enrollment_status','approved',
      'request_id',v_request_id,'requested_at',v_requested_at
    );
  end if;

  return jsonb_build_object('error','unknown_action');
end $$;
revoke all on function public.student_membership(text,text,jsonb) from public;
grant execute on function public.student_membership(text,text,jsonb) to anon, authenticated;

create or replace function public.student_membership_admin(p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a jsonb := coalesce(p_args,'{}'::jsonb);
  v_enabled boolean;
  v_request public.student_membership_requests;
  v_account public.student_accounts;
  v_decision text;
begin
  perform public.student_card_admin_check();

  if p_action='settings' then
    select coalesce(ps.value_boolean,false) into v_enabled
    from public.platform_settings ps where ps.key='student_membership_auto_approval';
    return jsonb_build_object('enabled',coalesce(v_enabled,false));

  elsif p_action='set_auto_approval' then
    v_enabled := coalesce((a->>'enabled')::boolean,false);
    insert into public.platform_settings(key,value_boolean,updated_at)
    values('student_membership_auto_approval',v_enabled,now())
    on conflict(key) do update set value_boolean=excluded.value_boolean,updated_at=now();
    return jsonb_build_object('enabled',v_enabled);

  elsif p_action='requests' then
    return coalesce((
      select jsonb_agg(x order by x.requested_at asc)
      from (
        select r.id,r.academic_year,r.status,r.requested_at,
               ac.full_name,ac.reg_no,ac.spec,ac.level,ac.source
        from public.student_membership_requests r
        join public.student_accounts ac on ac.id=r.account
        where r.academic_year=public.community_academic_year()
          and r.status='pending' and ac.status='approved'
          and not coalesce(ac.card_enabled,false)
        order by r.requested_at asc limit 500
      ) x
    ),'[]'::jsonb);

  elsif p_action='review' then
    begin
      select * into v_request from public.student_membership_requests
      where id=(a->>'id')::uuid for update;
    exception when invalid_text_representation then
      raise exception 'bad_request_id';
    end;
    if v_request.id is null or v_request.status <> 'pending' then
      return jsonb_build_object('reviewed',false,'reason','not_pending');
    end if;
    if v_request.academic_year <> public.community_academic_year() then
      return jsonb_build_object('reviewed',false,'reason','stale_request');
    end if;

    v_decision := lower(coalesce(a->>'decision',''));
    if v_decision not in ('approved','rejected') then
      raise exception 'bad_decision';
    end if;

    if v_decision='approved' then
      select * into v_account from public.student_accounts
      where id=v_request.account and status='approved' for update;
      if v_account.id is null then
        return jsonb_build_object('reviewed',false,'reason','account_not_approved');
      end if;
      update public.student_accounts
      set membership_year=v_request.academic_year,membership_phone=null,membership_photo=null,
          membership_applied_at=null,membership_updated_at=now()
      where id=v_account.id;
    end if;

    update public.student_membership_requests
    set status=v_decision,reviewed_at=now(),reviewed_by=auth.uid(),decision_source='manual'
    where id=v_request.id;
    return jsonb_build_object('reviewed',true,'status',v_decision,'academic_year',v_request.academic_year);
  end if;

  raise exception 'unknown_action';
end $$;
revoke all on function public.student_membership_admin(text,jsonb) from public, anon;
grant execute on function public.student_membership_admin(text,jsonb) to authenticated;

notify pgrst, 'reload schema';
