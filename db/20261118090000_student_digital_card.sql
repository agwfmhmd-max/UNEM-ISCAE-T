-- بطاقة الطالب الرقمية: رمز تحقق عشوائي لكل طالب (غير قابل للتخمين من رقم التسجيل)،
-- إجراء card في community_api يعيد بيانات البطاقة، ودالة عامة للتحقق من البطاقة عبر رمز QR.
alter table public.student_accounts add column if not exists card_token text;
create unique index if not exists student_accounts_card_token_key on public.student_accounts(card_token) where card_token is not null;

create or replace function public.student_card_verify(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.student_accounts;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9]{8,16}$' then return jsonb_build_object('valid', false); end if;
  select * into a from student_accounts where card_token = upper(p_token) and status = 'approved';
  if a.id is null then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'full_name', a.full_name, 'reg_no', a.reg_no, 'spec', a.spec,
                            'level', a.level, 'promo', a.promo, 'academic_year', public.community_academic_year());
end $$;
revoke all on function public.student_card_verify(text) from public;
grant execute on function public.student_card_verify(text) to anon, authenticated;

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
  v := public.unem_patch_text(v, $q$  elsif p_action = 'groups' then$q$,
$q$  elsif p_action = 'card' then
    if acc.id is null or acc.status <> 'approved' then raise exception 'no_card'; end if;
    v_target := acc.card_token;
    if v_target is null then
      loop
        v_target := upper(substr(md5(gen_random_uuid()::text), 1, 10));
        begin
          update student_accounts set card_token = v_target where id = acc.id;
          exit;
        exception when unique_violation then null;
        end;
      end loop;
    end if;
    return jsonb_build_object('full_name', acc.full_name, 'reg_no', acc.reg_no, 'spec', acc.spec, 'level', acc.level,
                              'promo', acc.promo, 'academic_year', public.community_academic_year(), 'token', v_target);

  elsif p_action = 'groups' then$q$, 1);
  execute v;
end $patch$;
drop function public.unem_patch_text(text,text,text,int);
notify pgrst, 'reload schema';
