begin;

-- Trigger invocations remain bound to the existing function OIDs.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
alter function private.set_updated_at() set search_path = pg_catalog;

do $verify$
begin
  if exists (
    select 1 from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated')
      and pg_catalog.has_function_privilege(r.oid, 'public.rls_auto_enable()'::regprocedure, 'EXECUTE')
  ) then
    raise exception 'Client EXECUTE on rls_auto_enable remains';
  end if;
end;
$verify$;

commit;
