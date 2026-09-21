-- E0: harden profile authorization without changing existing RLS semantics.
-- Production precondition: public.profiles and the existing authorization functions must already exist.

begin;

do $e0_preconditions$
declare
  missing_columns text[];
begin
  if to_regclass('public.profiles') is null then
    raise exception 'E0 precondition failed: public.profiles does not exist';
  end if;

  select array_agg(required.name order by required.name)
    into missing_columns
  from (values
    ('id', 'uuid'),
    ('full_name', 'text'),
    ('role', 'text'),
    ('phone', 'text'),
    ('avatar_url', 'text'),
    ('created_at', 'timestamp with time zone')
  ) as required(name, data_type)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = required.name
      and c.data_type = required.data_type
  );

  if missing_columns is not null then
    raise exception 'E0 precondition failed: profiles columns missing or incompatible: %', missing_columns;
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles' and c.relrowsecurity
  ) then
    raise exception 'E0 precondition failed: RLS is not enabled on public.profiles';
  end if;

  if to_regnamespace('private') is null then
    raise exception 'E0 precondition failed: private schema does not exist';
  end if;
  if to_regprocedure('private.is_admin()') is null then
    raise exception 'E0 precondition failed: private.is_admin() does not exist';
  end if;
  if to_regprocedure('private.is_agent()') is null then
    raise exception 'E0 precondition failed: private.is_agent() does not exist';
  end if;
  if to_regprocedure('private.handle_new_user()') is null then
    raise exception 'E0 precondition failed: private.handle_new_user() does not exist';
  end if;
  if to_regprocedure('private.guard_profile_system_fields()') is not null then
    raise exception 'E0 precondition failed: private.guard_profile_system_fields() already exists';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgname = 'e0_guard_profile_system_fields' and not tgisinternal
  ) then
    raise exception 'E0 precondition failed: e0_guard_profile_system_fields already exists';
  end if;
end;
$e0_preconditions$;

-- Remove inherited historical client privileges, including INSERT, DELETE and TRUNCATE.
revoke all privileges on table public.profiles from public, anon, authenticated;
-- Table revocation does not remove grants that may have been made at column scope.
revoke update (id, full_name, role, phone, avatar_url, created_at)
  on table public.profiles from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name, phone, avatar_url)
  on table public.profiles to authenticated;

create function private.guard_profile_system_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user not in ('postgres', 'service_role')
     and (
       new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'profile system fields require trusted administrative access'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

alter function private.guard_profile_system_fields() owner to postgres;
revoke all on function private.guard_profile_system_fields() from public, anon, authenticated;

create trigger e0_guard_profile_system_fields
before update on public.profiles
for each row
execute function private.guard_profile_system_fields();

comment on function private.guard_profile_system_fields() is
  'E0 defense in depth: blocks client mutation of profile id, role, and created_at.';

commit;
notify pgrst, 'reload schema';
