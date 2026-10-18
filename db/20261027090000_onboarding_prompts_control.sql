-- UNEM ISCAE — تحكّم المشرف في نافذتي «ثبّت التطبيق» و«فعّل الإشعارات» اللتين تظهران للطلاب الجدد
--              ولمن لم يثبّت التطبيق أو لم يفعّل الإشعارات.
-- شغّله بعد db/20261025090000_public_platform_stats.sql (و20261026). آمن لإعادة التنفيذ ولا يحذف أي بيانات.
--
--  • مفتاحان جديدان في platform_settings: show_install_prompt و show_push_prompt (الافتراضي: ظاهر = السلوك السابق).
--  • get_public_platform_stats() يعيد الآن أيضاً: show_install_prompt, show_push_prompt, prompts_reset_at.
--  • set_public_stat_visibility(key, enabled) تقبل المفتاحين الجديدين (للمشرف أو من يملك manage_platform_settings).
--  • reset_onboarding_prompts(): «إعادة إظهار» النافذتين لمن أغلقهما سابقاً (يُسجَّل وقت الإعادة؛ كل جهاز يلتقطه عند فتح الموقع).

insert into public.platform_settings(key, value_boolean) values ('show_install_prompt', true) on conflict (key) do nothing;
insert into public.platform_settings(key, value_boolean) values ('show_push_prompt',    true) on conflict (key) do nothing;

create or replace function public.get_public_platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_show_v boolean;
  v_show_r boolean;
  v_visitors bigint := 0;
  v_reg bigint := 0;
  v_json jsonb;
  v_inst boolean;
  v_push boolean;
  v_reset bigint := 0;
begin
  select coalesce((select value_boolean from public.platform_settings where key = 'show_visitors_count'), true)   into v_show_v;
  select coalesce((select value_boolean from public.platform_settings where key = 'show_registered_count'), true) into v_show_r;

  select coalesce((select value_boolean from public.platform_settings where key = 'show_install_prompt'), true) into v_inst;
  select coalesce((select value_boolean from public.platform_settings where key = 'show_push_prompt'), true)    into v_push;
  select coalesce((select floor(extract(epoch from updated_at))::bigint from public.platform_settings where key = 'prompts_reset'), 0) into v_reset;

  if v_show_v then
    -- نعيد استعمال دالة الزوار الموجودة إن كانت منشورة، وإلا نحسب بنفس الطريقة
    if to_regprocedure('public.get_public_visitor_stats()') is not null then
      begin
        execute 'select to_jsonb(public.get_public_visitor_stats())' into v_json;
        if jsonb_typeof(v_json) = 'array' then v_json := v_json -> 0; end if;
        v_visitors := coalesce((v_json ->> 'total_visitors')::bigint, 0);
      exception when others then v_visitors := 0;
      end;
    else
      begin
        select coalesce((select count(distinct visitor_id) from public.analytics where visitor_id is not null and visitor_id <> ''), 0)
             + coalesce((select count(*) from public.analytics where (visitor_id is null or visitor_id = '') and action_type not like '%(متكرر)%'), 0)
          into v_visitors;
      exception when others then v_visitors := 0;
      end;
    end if;
  end if;

  if v_show_r then
    select count(*) into v_reg from public.student_accounts where status = 'approved';
  end if;

  return jsonb_build_object(
    'total_visitors',      case when v_show_v then v_visitors else null end,
    'registered_students', case when v_show_r then v_reg else null end,
    'show_visitors',       v_show_v,
    'show_registered',     v_show_r,
    'show_install_prompt', v_inst,
    'show_push_prompt',    v_push,
    'prompts_reset_at',    v_reset
  );
end;
$$;

create or replace function public.set_public_stat_visibility(p_key text, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
  v_val boolean;
begin
  if p_key not in ('show_visitors_count', 'show_registered_count', 'show_install_prompt', 'show_push_prompt') then
    raise exception 'invalid key';
  end if;
  if auth.uid() is null then raise exception 'not authorized'; end if;

  v_ok := coalesce(public.has_role(auth.uid(), 'admin'), false);
  if not v_ok and to_regprocedure('public.has_supervisor_permission(text)') is not null then
    execute 'select coalesce(public.has_supervisor_permission(''manage_platform_settings''), false)' into v_ok;
  end if;
  if not v_ok then raise exception 'not authorized'; end if;

  insert into public.platform_settings(key, value_boolean, updated_at)
  values (p_key, coalesce(p_enabled, true), now())
  on conflict (key) do update set value_boolean = excluded.value_boolean, updated_at = now();

  select value_boolean into v_val from public.platform_settings where key = p_key;
  return coalesce(v_val, true);
end;
$$;

revoke all on function public.get_public_platform_stats() from public;
grant execute on function public.get_public_platform_stats() to anon, authenticated;
revoke all on function public.set_public_stat_visibility(text, boolean) from public, anon;
grant execute on function public.set_public_stat_visibility(text, boolean) to authenticated;

create or replace function public.reset_onboarding_prompts()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
  v_ts timestamptz := now();
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  v_ok := coalesce(public.has_role(auth.uid(), 'admin'), false);
  if not v_ok and to_regprocedure('public.has_supervisor_permission(text)') is not null then
    execute 'select coalesce(public.has_supervisor_permission(''manage_platform_settings''), false)' into v_ok;
  end if;
  if not v_ok then raise exception 'not authorized'; end if;
  insert into public.platform_settings(key, value_boolean, updated_at) values ('prompts_reset', true, v_ts)
  on conflict (key) do update set updated_at = excluded.updated_at, value_boolean = true;
  return floor(extract(epoch from v_ts))::bigint;
end;
$$;
revoke all on function public.reset_onboarding_prompts() from public, anon;
grant execute on function public.reset_onboarding_prompts() to authenticated;

notify pgrst, 'reload schema';
