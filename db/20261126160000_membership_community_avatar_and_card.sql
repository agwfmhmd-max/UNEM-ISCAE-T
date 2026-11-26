-- Reuse the student's community avatar on the annual membership card.
-- Safe to rerun; preserves the existing student_membership RPC contract and permissions.
create or replace function public.student_membership(p_token text, p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  a public.student_accounts;
  v_phone text;
  v_photo text;
  v_community_photo text;
  v_year int;
begin
  if p_token is null or char_length(p_token) < 30 then
    return jsonb_build_object('error','bad_token');
  end if;

  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  select ac.* into a
  from student_devices d
  join student_accounts ac on ac.id=d.account
  where d.token_hash=v_hash;
  if a.id is null then
    return jsonb_build_object('error','not_logged_in');
  end if;

  v_year := public.community_academic_year();
  select cp.avatar_data into v_community_photo
  from public.community_profiles cp
  where cp.account=a.id
  limit 1;

  if p_action = 'status' then
    return jsonb_build_object(
      'status',a.status,'approved',a.status='approved','reg_no',a.reg_no,'full_name',a.full_name,
      'spec',a.spec,'level',a.level,'promo',a.promo,'academic_year',v_year,'member_year',a.membership_year,
      'phone',a.membership_phone,'photo',coalesce(v_community_photo,a.membership_photo),
      'card_enabled',coalesce(a.card_enabled,false),'card_code',public.student_card_code(a.card_year,a.card_no),
      'token',a.card_token
    );
  elsif p_action = 'apply' then
    if a.status <> 'approved' then
      raise exception 'not_approved';
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

    update student_accounts
    set membership_phone=v_phone,
        membership_photo=v_photo,
        membership_year=v_year,
        membership_applied_at=coalesce(membership_applied_at,now()),
        membership_updated_at=now()
    where id=a.id
    returning * into a;

    return jsonb_build_object(
      'status','applied','approved',true,'reg_no',a.reg_no,'full_name',a.full_name,
      'spec',a.spec,'level',a.level,'promo',a.promo,'academic_year',v_year,'member_year',a.membership_year,
      'phone',a.membership_phone,'photo',coalesce(v_community_photo,a.membership_photo),
      'card_enabled',coalesce(a.card_enabled,false),'card_code',public.student_card_code(a.card_year,a.card_no),
      'token',a.card_token
    );
  end if;

  return jsonb_build_object('error','unknown_action');
end $$;
revoke all on function public.student_membership(text,text,jsonb) from public;
grant execute on function public.student_membership(text,text,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
