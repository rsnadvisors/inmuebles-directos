-- TEST FIXTURE ONLY — DO NOT APPLY TO PRODUCTION
-- Minimal reconstruction of the pre-E0 profiles authorization model.
-- Contains synthetic schema only: no production data, properties, or Storage objects.

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer'
    check (role in ('viewer', 'agent', 'owner', 'admin')),
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$function$;

create function private.is_agent()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role in ('admin', 'agent')
  );
$function$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function private.handle_new_user();

create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (auth.uid() = id or private.is_admin());

create policy profiles_update_own_or_admin
on public.profiles
for update
to authenticated
using (auth.uid() = id or private.is_admin())
with check (auth.uid() = id or private.is_admin());

-- Historical broad grants reproduce the pre-E0 client privilege surface.
grant all privileges on table public.profiles to anon, authenticated, service_role;
grant usage on schema private to anon, authenticated, service_role;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.is_agent() to anon, authenticated, service_role;
