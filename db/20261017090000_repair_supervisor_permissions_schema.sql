-- UNEM ISCAE — repair delegated supervisor permission schema
-- Safe to run even when some/all permission columns already exist.
-- Apply after 20261016090000_supervisor_delegation_and_student_admin.sql.

create table if not exists public.supervisor_permissions (
  email text primary key,
  upload_files boolean not null default false,
  delete_files boolean not null default false,
  manage_whatsapp boolean not null default false,
  manage_announcements boolean not null default false,
  send_notifications boolean not null default false,
  view_analytics boolean not null default false,
  manage_document_types boolean not null default false,
  view_student_registrations boolean not null default false,
  manage_students boolean not null default false,
  manage_schedules boolean not null default false,
  manage_curriculum_subjects boolean not null default false,
  manage_platform_settings boolean not null default false,
  manage_file_order boolean not null default false,
  manage_results boolean not null default false
);

-- Add every permission idempotently. This repairs databases where an earlier
-- version of the permissions table was created before newer capabilities were added.
alter table public.supervisor_permissions add column if not exists upload_files boolean default false;
alter table public.supervisor_permissions add column if not exists delete_files boolean default false;
alter table public.supervisor_permissions add column if not exists manage_whatsapp boolean default false;
alter table public.supervisor_permissions add column if not exists manage_announcements boolean default false;
alter table public.supervisor_permissions add column if not exists send_notifications boolean default false;
alter table public.supervisor_permissions add column if not exists view_analytics boolean default false;
alter table public.supervisor_permissions add column if not exists manage_document_types boolean default false;
alter table public.supervisor_permissions add column if not exists view_student_registrations boolean default false;
alter table public.supervisor_permissions add column if not exists manage_students boolean default false;
alter table public.supervisor_permissions add column if not exists manage_schedules boolean default false;
alter table public.supervisor_permissions add column if not exists manage_curriculum_subjects boolean default false;
alter table public.supervisor_permissions add column if not exists manage_platform_settings boolean default false;
alter table public.supervisor_permissions add column if not exists manage_file_order boolean default false;
alter table public.supervisor_permissions add column if not exists manage_results boolean default false;

-- Preserve any existing choices; only repair null values and normalize defaults/constraints.
do $$
declare
  v_column text;
begin
  foreach v_column in array array[
    'upload_files','delete_files','manage_whatsapp','manage_announcements',
    'send_notifications','view_analytics','manage_document_types',
    'view_student_registrations','manage_students','manage_schedules',
    'manage_curriculum_subjects','manage_platform_settings','manage_file_order',
    'manage_results'
  ] loop
    execute format('update public.supervisor_permissions set %I = false where %I is null', v_column, v_column);
    execute format('alter table public.supervisor_permissions alter column %I set default false', v_column);
    execute format('alter table public.supervisor_permissions alter column %I set not null', v_column);
  end loop;
end $$;

create unique index if not exists supervisor_permissions_email_uidx
  on public.supervisor_permissions(email);

alter table public.supervisor_permissions enable row level security;
revoke all on public.supervisor_permissions from public, anon;
grant select, insert, update, delete on public.supervisor_permissions to authenticated;

-- Keep the authorization allowlist in sync with the complete permission matrix.
create or replace function public.has_supervisor_permission(p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare v_email text;
begin
  if auth.uid() is null then return false; end if;
  if coalesce(public.has_role(auth.uid(),'admin'),false) then return true; end if;
  if p_permission not in (
    'upload_files','delete_files','manage_whatsapp','manage_announcements',
    'send_notifications','view_analytics','manage_document_types',
    'view_student_registrations','manage_students','manage_schedules',
    'manage_curriculum_subjects','manage_platform_settings','manage_file_order',
    'manage_results'
  ) then
    return false;
  end if;
  v_email := lower(coalesce(auth.jwt()->>'email',''));
  if v_email = '' then return false; end if;
  if p_permission = 'view_student_registrations' then
    return exists (
      select 1 from public.supervisor_permissions sp
      where lower(sp.email)=v_email
        and (sp.view_student_registrations or sp.manage_students)
    );
  end if;
  return exists (
    select 1 from public.supervisor_permissions sp
    where lower(sp.email)=v_email
      and coalesce((to_jsonb(sp)->>p_permission)::boolean,false)
  );
end;
$$;
revoke all on function public.has_supervisor_permission(text) from public, anon;
grant execute on function public.has_supervisor_permission(text) to authenticated;

create or replace function public.get_my_supervisor_permissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare v_email text; v_permissions jsonb;
begin
  if auth.uid() is null then return '{}'::jsonb; end if;
  if coalesce(public.has_role(auth.uid(),'admin'),false) then
    return jsonb_build_object(
      'upload_files',true,'delete_files',true,'manage_whatsapp',true,
      'manage_announcements',true,'send_notifications',true,'view_analytics',true,
      'manage_document_types',true,'view_student_registrations',true,'manage_students',true,
      'manage_schedules',true,'manage_curriculum_subjects',true,
      'manage_platform_settings',true,'manage_file_order',true,'manage_results',true
    );
  end if;
  v_email := lower(coalesce(auth.jwt()->>'email',''));
  select to_jsonb(sp) - 'email' into v_permissions
  from public.supervisor_permissions sp where lower(sp.email)=v_email limit 1;
  return coalesce(v_permissions,'{}'::jsonb);
end;
$$;
revoke all on function public.get_my_supervisor_permissions() from public, anon;
grant execute on function public.get_my_supervisor_permissions() to authenticated;

-- PostgREST can otherwise keep serving a cached table shape after ALTER TABLE.
notify pgrst, 'reload schema';
