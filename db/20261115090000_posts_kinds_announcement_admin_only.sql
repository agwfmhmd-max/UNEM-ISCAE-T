-- أنواع المنشورات: إزالة «نقاش»، وجعل «إعلان طلابي» للمشرفين فقط (النشر والتعديل).
-- (لا توجد منشورات قديمة من نوع نقاش؛ أي صف مستقبلي بهذا النوع يُحوَّل إلى سؤال احتياطاً قبل تشديد القيد.)
update public.community_posts set kind = 'question' where kind = 'discussion';
alter table public.community_posts drop constraint if exists community_posts_kind_check;
alter table public.community_posts add constraint community_posts_kind_check
  check (kind = any (array['question'::text, 'help'::text, 'announcement'::text, 'partner'::text]));

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
  -- النشر: النوع صالح، والإعلان الطلابي للمشرفين فقط
  v := public.unem_patch_text(v, $q$    if public.community_has_mention_all(v_body) and not adm then raise exception 'mention_all_forbidden'; end if;
    select count(*) into v_n from community_posts where author=me.id and created_at > now() - interval '1 hour';$q$,
$q$    if public.community_has_mention_all(v_body) and not adm then raise exception 'mention_all_forbidden'; end if;
    if coalesce(a->>'kind','') not in ('question','help','announcement','partner') then raise exception 'bad_kind'; end if;
    if a->>'kind' = 'announcement' and not adm then raise exception 'announcement_forbidden'; end if;
    select count(*) into v_n from community_posts where author=me.id and created_at > now() - interval '1 hour';$q$, 1);
  -- التعديل: لا يمكن تحويل منشور إلى «إعلان طلابي» إلا للمشرف، ولا إلى «نقاش»
  v := public.unem_patch_text(v, $q$kind = case when kind <> 'partner' and a->>'kind' in ('question','help','discussion','announcement') then a->>'kind' else kind end$q$,
$q$kind = case when kind <> 'partner' and (a->>'kind' in ('question','help') or (a->>'kind' = 'announcement' and adm)) then a->>'kind' else kind end$q$, 1);
  execute v;
end $patch$;

drop function public.unem_patch_text(text,text,text,int);
notify pgrst, 'reload schema';
