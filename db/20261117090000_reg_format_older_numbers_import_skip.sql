-- 1) أرقام التسجيل الأقدم (مثل I17562 لخريجين قدامى) كانت مرفوضة لأن القاعدة تبدأ من I18000؛ فيسقط حفظ لائحة كاملة
--    بسبب صفّ واحد (bad_reg_format) ولا يستطيع هؤلاء الطلاب تسجيل الدخول. القاعدة الجديدة: I + 5 أرقام تبدأ بـ 1–9.
create or replace function public.student_reg_allowed(p_reg text) returns boolean
language sql immutable as $$ select upper(btrim(coalesce(p_reg,''))) ~ '^I[1-9][0-9]{4}$' $$;

-- 2) استيراد اللوائح: الصف غير الصالح (رقم أو اسم) يُتخطى ويُعاد في invalid_rows بدل إسقاط العملية كلها.
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
  v := replace(pg_get_functiondef('public.student_admin(text,jsonb)'::regprocedure), E'\r', '');
  v := public.unem_patch_text(v, $q$v_q text; v_st text; v_ay int; v_promo int; v_rank int; v_ex_rank int;$q$,
                                 $q$v_q text; v_st text; v_ay int; v_promo int; v_rank int; v_ex_rank int; v_bad_rows jsonb := '[]'::jsonb;$q$, 1);
  v := public.unem_patch_text(v, $q$if v_nn = '' or char_length(v_rn) < 2 or char_length(v_n) < 3 then c_bad := c_bad + 1; continue; end if;$q$,
$q$if v_nn = '' or char_length(v_rn) < 2 or char_length(v_n) < 3 or not public.student_reg_allowed(v_r) then
        c_bad := c_bad + 1;
        if jsonb_array_length(v_bad_rows) < 10 then v_bad_rows := v_bad_rows || jsonb_build_array(jsonb_build_object('n', v_n, 'r', v_r)); end if;
        continue;
      end if;$q$, 1);
  v := public.unem_patch_text(v, $q$'invalid',c_bad,$q$, $q$'invalid',c_bad,'invalid_rows',v_bad_rows,$q$, 1);
  execute v;
end $patch$;
drop function public.unem_patch_text(text,text,text,int);
notify pgrst, 'reload schema';
