-- =====================================================================
--  UNEM ISCAE — ملف الأساس: جداول يستعملها التطبيق لكن لم يكن لها ملف إنشاء في المشروع
--  (أُنشئت يدوياً في Supabase)، أُعيد بناؤها هنا من استعمالها في الكود:
--     announcements, curriculum_subject_overrides, master_subjects,
--     shared_subject_groups, shared_subject_members, site_settings,
--     student_results, study_schedules   +  دالة cleanup_expired_push_subscriptions
--
--  ⚠️ على قاعدة بياناتك الحالية: لا يفعل هذا الملف شيئاً إطلاقاً (كل جدول يُنشأ فقط إن لم يكن موجوداً،
--     والدالة تُنشأ فقط إن لم تكن موجودة)، فلا يغيّر جداولك ولا سياساتك الحالية.
--  ✅ على قاعدة جديدة: ينشئ الجداول مع RLS وصلاحيات مطابقة لما يحتاجه التطبيق، ليعمل بناء المشروع من الصفر.
--  الترتيب: بعد supabase/migrations/20260810170000_unem_documents_roles.sql (يعرّف has_role و user_roles).
-- =====================================================================

do $baseline$
begin
  ------------------------------------------------------------------ announcements
  if to_regclass('public.announcements') is null then
    create table public.announcements (
      id uuid primary key default gen_random_uuid(),
      message text not null,
      link_url text,
      start_date timestamptz not null,
      end_date timestamptz not null,
      created_at timestamptz not null default now()
    );
    alter table public.announcements enable row level security;
    create policy "announcements public read" on public.announcements for select to anon, authenticated using (true);
    create policy "announcements admin write" on public.announcements for all to authenticated
      using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
    grant select on public.announcements to anon;
    grant select, insert, update, delete on public.announcements to authenticated;
    grant all on public.announcements to service_role;
  end if;

  ------------------------------------------------------------------ curriculum_subject_overrides
  if to_regclass('public.curriculum_subject_overrides') is null then
    create table public.curriculum_subject_overrides (
      id uuid primary key default gen_random_uuid(),
      specialization text not null,
      level text not null,
      semester text not null,
      original_name text not null,
      display_name text not null,
      description_ar text,
      description_fr text,
      sort_order integer not null default 0,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint curriculum_subject_overrides_uq unique (specialization, level, semester, original_name)
    );
    alter table public.curriculum_subject_overrides enable row level security;
    create policy "curriculum overrides public read" on public.curriculum_subject_overrides for select to anon, authenticated using (true);
    create policy "curriculum overrides admin write" on public.curriculum_subject_overrides for all to authenticated
      using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
    grant select on public.curriculum_subject_overrides to anon;
    grant select, insert, update, delete on public.curriculum_subject_overrides to authenticated;
    grant all on public.curriculum_subject_overrides to service_role;
  end if;

  ------------------------------------------------------------------ master_subjects
  if to_regclass('public.master_subjects') is null then
    create table public.master_subjects (
      id uuid primary key default gen_random_uuid(),
      specialization text not null,
      level text not null,
      semester text not null,
      name text not null,
      subject_code text not null,
      sort_order integer not null default 0,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      constraint master_subjects_uq unique (specialization, semester, subject_code)
    );
    alter table public.master_subjects enable row level security;
    create policy "master subjects public read" on public.master_subjects for select to anon, authenticated using (true);
    create policy "master subjects admin write" on public.master_subjects for all to authenticated
      using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
    grant select on public.master_subjects to anon;
    grant select, insert, update, delete on public.master_subjects to authenticated;
    grant all on public.master_subjects to service_role;
  end if;

  ------------------------------------------------------------------ shared_subject_groups / members
  if to_regclass('public.shared_subject_groups') is null then
    create table public.shared_subject_groups (
      id uuid primary key default gen_random_uuid(),
      name text,
      sort_order integer not null default 0,
      is_active boolean not null default true,
      created_by uuid,
      created_at timestamptz not null default now()
    );
    alter table public.shared_subject_groups enable row level security;
    create policy "shared groups public read" on public.shared_subject_groups for select to anon, authenticated using (true);
    create policy "shared groups admin write" on public.shared_subject_groups for all to authenticated
      using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
    grant select on public.shared_subject_groups to anon;
    grant select, insert, update, delete on public.shared_subject_groups to authenticated;
    grant all on public.shared_subject_groups to service_role;
  end if;
  if to_regclass('public.shared_subject_members') is null then
    create table public.shared_subject_members (
      id uuid primary key default gen_random_uuid(),
      group_id uuid not null references public.shared_subject_groups(id) on delete cascade,
      specialization text not null,
      level text,
      semester text not null,
      subject_name text not null,
      subject_code text,
      created_at timestamptz not null default now()
    );
    create index shared_subject_members_group_idx on public.shared_subject_members(group_id);
    alter table public.shared_subject_members enable row level security;
    create policy "shared members public read" on public.shared_subject_members for select to anon, authenticated using (true);
    create policy "shared members admin write" on public.shared_subject_members for all to authenticated
      using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
    grant select on public.shared_subject_members to anon;
    grant select, insert, update, delete on public.shared_subject_members to authenticated;
    grant all on public.shared_subject_members to service_role;
  end if;

  ------------------------------------------------------------------ site_settings (إعدادات عرض النتائج)
  if to_regclass('public.site_settings') is null then
    create table public.site_settings (
      id integer primary key,
      display_mode text,
      year_scope text,
      single_year text,
      search_priority text,
      updated_at timestamptz not null default now()
    );
    alter table public.site_settings enable row level security;
    create policy "site settings public read" on public.site_settings for select to anon, authenticated using (true);
    create policy "site settings staff write" on public.site_settings for all to authenticated
      using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'uploader'))
      with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'uploader'));
    grant select on public.site_settings to anon;
    grant select, insert, update, delete on public.site_settings to authenticated;
    grant all on public.site_settings to service_role;
  end if;

  ------------------------------------------------------------------ student_results
  if to_regclass('public.student_results') is null then
    create table public.student_results (
      id uuid primary key default gen_random_uuid(),
      matricule text not null,
      name text,
      moyenne numeric,
      decision text,
      academic_year text,
      major text,
      level text,
      semester text,
      created_at timestamptz not null default now()
    );
    create index student_results_matricule_idx on public.student_results (matricule);
    create index student_results_class_idx on public.student_results (academic_year, major, level, semester);
    alter table public.student_results enable row level security;
    create policy "student results public read" on public.student_results for select to anon, authenticated using (true);
    create policy "student results staff write" on public.student_results for all to authenticated
      using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'uploader'))
      with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'uploader'));
    grant select on public.student_results to anon;
    grant select, insert, update, delete on public.student_results to authenticated;
    grant all on public.student_results to service_role;
  end if;

  ------------------------------------------------------------------ study_schedules (جداول الحصص)
  if to_regclass('public.study_schedules') is null then
    create table public.study_schedules (
      id uuid primary key default gen_random_uuid(),
      academic_year text not null,
      specialization text not null,
      level text not null,
      group_name text,
      title text not null,
      rows jsonb not null default '[]'::jsonb,
      is_active boolean not null default true,
      file_url text,
      file_name text,
      cloudinary_public_id text,
      uploaded_by uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index study_schedules_lookup_idx on public.study_schedules (academic_year, specialization, level);
    alter table public.study_schedules enable row level security;
    create policy "study schedules public read" on public.study_schedules for select to anon, authenticated using (is_active or public.has_role(auth.uid(),'admin'));
    create policy "study schedules admin write" on public.study_schedules for all to authenticated
      using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
    grant select on public.study_schedules to anon;
    grant select, insert, update, delete on public.study_schedules to authenticated;
    grant all on public.study_schedules to service_role;
  end if;
end
$baseline$;

-- ---------- تنظيف اشتراكات الإشعارات غير النشطة (يستدعيها زر «تنظيف» في لوحة المشرف) ----------
-- تُنشأ فقط إن لم تكن موجودة، فلا تستبدل نسختك الحالية.
do $fn$
begin
  if to_regprocedure('public.cleanup_expired_push_subscriptions(integer)') is null
     and to_regclass('public.push_subscriptions') is not null then
    execute $q$
      create function public.cleanup_expired_push_subscriptions(p_inactive_days integer default 90)
      returns integer
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare v_count integer;
      begin
        if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
          raise exception 'not authorized';
        end if;
        delete from public.push_subscriptions
         where last_seen_at < now() - make_interval(days => greatest(coalesce(p_inactive_days, 90), 1));
        get diagnostics v_count = row_count;
        return v_count;
      end;
      $body$
    $q$;
    execute 'revoke all on function public.cleanup_expired_push_subscriptions(integer) from public, anon';
    execute 'grant execute on function public.cleanup_expired_push_subscriptions(integer) to authenticated';
  end if;
end
$fn$;
