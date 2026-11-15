-- Apply ONLY after new application health, old HTTP publisher/upload/DELETE drain
-- and explicit reconciliation of legacy drafts. A SQL lock is not HTTP drain evidence.
begin;
do $preflight$ begin
  if to_regclass('private.publication_slots') is null
    or to_regprocedure('public.prepare_publication_attempt(text,text)') is null then
    raise exception 'Publication Expand missing';
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name like 'PUBLICATION_BOUNDARY_HMAC_KEY:%'
    and decrypted_secret ~ '^[0-9a-f]{64}$') then raise exception 'Publication boundary key missing'; end if;
  if exists(select 1 from public.properties p where p.status='draft'
    and not exists(select 1 from private.publication_attempts a where a.request_id=p.id)) then
    raise exception 'Legacy drafts require explicit reconciliation before Contract';
  end if;
end $preflight$;

-- Table and column INSERT grants are separate. Keep existing SELECT/content UPDATE.
revoke insert on public.properties from public,anon,authenticated;
do $acl$ declare cols text; f record; begin
  select string_agg(quote_ident(attname),',') into cols from pg_attribute
    where attrelid='public.properties'::regclass and attnum>0 and not attisdropped;
  execute 'revoke insert ('||cols||') on public.properties from public,anon,authenticated';
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('finalize_private_property_publication','finalize_own_property_publication') loop
    execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
  end loop;
end $acl$;

create function private.publication_metadata_guard() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
  if current_user='postgres' then return new; end if;
  if tg_op='INSERT' then
    if exists(select 1 from public.properties where id=new.property_id and status='draft')
      or private.publication_has_attempt(new.property_id) then
      raise exception 'Publication metadata is server controlled' using errcode='42501';
    end if;
  elsif private.publication_has_attempt(old.property_id) or private.publication_has_attempt(new.property_id) then
    raise exception 'Publication metadata binding is immutable' using errcode='42501';
  end if;
  return new;
end $fn$;

create function private.publication_has_attempt(p_request uuid) returns boolean
language sql security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from private.publication_attempts where request_id=p_request);
$$;
alter function private.publication_has_attempt(uuid) owner to postgres;
revoke all on function private.publication_has_attempt(uuid) from public,anon;
grant execute on function private.publication_has_attempt(uuid) to authenticated;
revoke all on function private.publication_metadata_guard() from public,anon,authenticated;
create trigger publication_metadata_binding_guard before insert or update on public.property_images
  for each row execute function private.publication_metadata_guard();

create function private.publication_slot_admission(p_bucket text,p_path text) returns boolean
language sql security definer set search_path='' as $$
  select auth.uid() is not null and p_bucket='property-images-private' and exists (
    select 1 from private.publication_slots s join private.publication_attempts a on a.request_id=s.request_id
      join public.properties p on p.id=a.request_id join public.property_images i on i.id=s.image_id
    where s.owner_id=auth.uid() and a.owner_id=auth.uid() and s.storage_path=p_path
      and a.state='ACTIVE' and s.state='RESERVED' and p.status='draft' and p.owner_id=auth.uid()
      and p.agent_id is null and i.property_id=p.id and i.storage_bucket=p_bucket and i.storage_path=p_path
      and i.public_url is null and i.sort_order=s.sort_order and i.is_cover=(s.sort_order=0));
$$;
alter function private.publication_slot_admission(text,text) owner to postgres;
revoke all on function private.publication_slot_admission(text,text) from public,anon;
grant execute on function private.publication_slot_admission(text,text) to authenticated;
create policy "publication exact private slot admission" on storage.objects as restrictive
  for insert to authenticated with check (
    bucket_id<>'property-images-private' or private.publication_slot_admission(bucket_id,name));
-- Explicitly deny UPDATE for this new private lifecycle, even if a future permissive policy is added.
create policy "publication private objects are not replaceable" on storage.objects as restrictive
  for update to authenticated using (bucket_id<>'property-images-private') with check (bucket_id<>'property-images-private');

create function private.publication_tombstone_cleanup(p_bucket text,p_path text,p_owner text) returns boolean
language sql security definer set search_path='' as $$
  select auth.uid() is not null and p_owner=auth.uid()::text and p_bucket='property-images-private' and exists(
    select 1 from private.publication_slots s join private.publication_attempts a on a.request_id=s.request_id
      where s.storage_path=p_path and s.owner_id=auth.uid() and a.owner_id=auth.uid()
        and s.state='RETIRED' and a.state in ('CANCEL_PENDING','CANCELLED')
        and not exists(select 1 from public.properties p where p.id=a.request_id
          and (p.status='published' or p.owner_id is distinct from auth.uid() or p.agent_id is not null)));
$$;
alter function private.publication_tombstone_cleanup(text,text,text) owner to postgres;
revoke all on function private.publication_tombstone_cleanup(text,text,text) from public,anon;
grant execute on function private.publication_tombstone_cleanup(text,text,text) to authenticated;
create policy "owners inspect exact publication tombstones" on storage.objects for select to authenticated
  using (private.publication_tombstone_cleanup(bucket_id,name,owner_id));
create policy "owners clean exact publication tombstones" on storage.objects for delete to authenticated
  using (private.publication_tombstone_cleanup(bucket_id,name,owner_id));
notify pgrst,'reload schema';
commit;
