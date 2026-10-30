-- Additive foundation only. Legacy publication remains enabled until Contract.
begin;
do $preflight$ begin
  if to_regclass('public.properties') is null or to_regclass('public.property_images') is null
    or to_regclass('storage.objects') is null or to_regclass('vault.decrypted_secrets') is null
    or to_regprocedure('extensions.hmac(bytea,bytea,text)') is null then
    raise exception 'Publication boundary prerequisites unavailable';
  end if;
  if has_table_privilege('authenticated','vault.decrypted_secrets','SELECT')
    or has_table_privilege('anon','vault.decrypted_secrets','SELECT') then
    raise exception 'Publication boundary key store is not private';
  end if;
end $preflight$;

create table private.publication_quotas (owner_id uuid primary key);
create table private.publication_attempts (
  request_id uuid primary key,
  owner_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  fields jsonb not null,
  manifest jsonb not null,
  slug text not null,
  state text not null default 'ACTIVE' check (state in ('ACTIVE','CANCEL_PENDING','CANCELLED','FINALIZED')),
  revision bigint not null default 0,
  created_at timestamptz not null default now()
);
create unique index publication_one_pending_owner on private.publication_attempts(owner_id)
  where state in ('ACTIVE','CANCEL_PENDING');
create table private.publication_slots (
  image_id uuid primary key,
  request_id uuid not null references private.publication_attempts(request_id),
  owner_id uuid not null,
  storage_path text not null unique,
  mime text not null check (mime in ('image/jpeg','image/png','image/webp')),
  size bigint not null check (size between 1 and 5242880),
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  sort_order integer not null check (sort_order between 0 and 4),
  state text not null default 'RESERVED' check (state in ('RESERVED','RETIRED','FINALIZED')),
  unique(request_id,sort_order)
);
alter table private.publication_quotas enable row level security;
alter table private.publication_attempts enable row level security;
alter table private.publication_slots enable row level security;
revoke all on private.publication_quotas, private.publication_attempts, private.publication_slots from public,anon,authenticated;

-- Verify the MAC over the exact UTF-8 bytes BEFORE interpreting the JSON.
-- Key provisioning is a separate operation, never part of this migration.
create function private.publication_verify(p_envelope text,p_mac text,p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare e jsonb; keyrow record; matched_key text; expected bytea; supplied bytea; difference integer; n integer; clock bigint;
begin
  if auth.uid() is null or p_envelope is null or octet_length(p_envelope) not between 1 and 32768
    or p_mac is null or p_mac !~ '^[0-9a-f]{64}$' then
    raise exception 'Publication proof denied' using errcode='42501';
  end if;
  supplied:=decode(p_mac,'hex');
  for keyrow in select name,decrypted_secret from vault.decrypted_secrets
    where name like 'PUBLICATION_BOUNDARY_HMAC_KEY:%' loop
    if keyrow.decrypted_secret !~ '^[0-9a-f]{64}$' then
      raise exception 'Publication boundary unavailable' using errcode='55000';
    end if;
    expected:=extensions.hmac(convert_to(p_envelope,'UTF8'),decode(keyrow.decrypted_secret,'hex'),'sha256');
    difference:=0;
    for n in 0..31 loop difference:=difference | (get_byte(expected,n) # get_byte(supplied,n)); end loop;
    if difference=0 then matched_key:=substring(keyrow.name from length('PUBLICATION_BOUNDARY_HMAC_KEY:')+1); end if;
  end loop;
  if matched_key is null then raise exception 'Publication proof denied' using errcode='42501'; end if;
  e:=p_envelope::jsonb;
  -- Reject duplicate JSON members, including signed malformed envelopes.
  if (select count(*) from json_object_keys(p_envelope::json))<>(select count(*) from jsonb_object_keys(e)) then
    raise exception 'Publication proof denied' using errcode='42501';
  end if;
  if jsonb_typeof(e)<>'object' or (e-array['version','audience','purpose','key_id','uid','request_id',
    'fingerprint','issued_at','expires_at','revision','action','fields','manifest','cleanup_confirmed'])<>'{}'::jsonb
    or not (e ?& array['version','audience','purpose','key_id','uid','request_id','fingerprint','issued_at','expires_at'])
    or e->>'key_id' is distinct from matched_key or matched_key !~ '^[a-zA-Z0-9_-]{1,40}$'
    or e->>'version' is distinct from '1' or e->>'audience' is distinct from 'inmuebles-publication'
    or e->>'purpose' is distinct from p_purpose or e->>'uid' is distinct from auth.uid()::text
    or coalesce(e->>'request_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(e->>'fingerprint','') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(e->'issued_at') is distinct from 'number' or jsonb_typeof(e->'expires_at') is distinct from 'number'
    or e->>'issued_at' !~ '^[0-9]+$' or e->>'expires_at' !~ '^[0-9]+$' then
    raise exception 'Publication proof denied' using errcode='42501';
  end if;
  if (p_purpose='prepare' and (not(e ?& array['fields','manifest']) or e ?| array['action','revision','cleanup_confirmed']))
    or (p_purpose='finalize' and (not(e ? 'revision') or e ?| array['fields','manifest','action','cleanup_confirmed']))
    or (p_purpose='reconcile' and (not(e ?& array['action','revision']) or e ?| array['fields','manifest']
      or e->>'action' not in ('inspect','begin_cancel','close_cancel')
      or (e->>'action'<>'close_cancel' and e ? 'cleanup_confirmed')))
    or (p_purpose<>'prepare' and (jsonb_typeof(e->'revision') is distinct from 'number' or e->>'revision' !~ '^[0-9]+$')) then
    raise exception 'Publication proof denied' using errcode='42501';
  end if;
  clock:=extract(epoch from clock_timestamp())::bigint;
  if (e->>'expires_at')::bigint <= (e->>'issued_at')::bigint
    or (e->>'expires_at')::bigint-(e->>'issued_at')::bigint>300
    or (e->>'issued_at')::bigint>clock+60 or (e->>'expires_at')::bigint<clock-60 then
    raise exception 'Publication proof expired' using errcode='42501';
  end if;
  return e;
end $fn$;
alter function private.publication_verify(text,text,text) owner to postgres;
revoke all on function private.publication_verify(text,text,text) from public,anon,authenticated;

-- Each slot observation is a complete privileged read limited to this caller's ledger.
-- RLS-filtered []/404 from the browser is never treated as evidence of absence.
create function private.publication_snapshot(p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a private.publication_attempts%rowtype; slots jsonb; parent_ok boolean;
begin
  select * into a from private.publication_attempts where request_id=p_request and owner_id=auth.uid();
  if not found then raise exception 'Publication not found' using errcode='PT404'; end if;
  select exists(select 1 from public.properties p where p.id=a.request_id and p.owner_id=a.owner_id
    and p.agent_id is null and p.slug=a.slug and (a.state<>'ACTIVE' or p.status='draft')
    and not exists(select 1 from jsonb_each(a.fields) f where to_jsonb(p)->f.key is distinct from f.value)) into parent_ok;
  select jsonb_agg(jsonb_build_object('imageId',s.image_id,'path',s.storage_path,'mime',s.mime,'size',s.size,
    'digest',s.digest,'state',s.state,'sortOrder',s.sort_order,
    'metadataValid',exists(select 1 from public.property_images i where i.id=s.image_id and i.property_id=a.request_id
      and i.storage_bucket='property-images-private' and i.storage_path=s.storage_path and i.public_url is null
      and i.sort_order=s.sort_order and i.is_cover=(s.sort_order=0)),
    'observation',case when o.id is null then 'ABSENT'
      when o.owner_id=a.owner_id::text and lower(o.metadata->>'mimetype')=s.mime
        and (o.metadata->>'size') ~ '^[0-9]+$' and (o.metadata->>'size')::numeric=s.size then 'PRESENT'
      else 'INACCESSIBLE' end) order by s.sort_order) into slots
    from private.publication_slots s left join storage.objects o
      on o.bucket_id='property-images-private' and o.name=s.storage_path where s.request_id=a.request_id;
  return jsonb_build_object('requestId',a.request_id,'fingerprint',a.fingerprint,'state',a.state,
    'revision',a.revision,'slug',a.slug,'parentValid',parent_ok,'slots',slots);
end $fn$;
alter function private.publication_snapshot(uuid) owner to postgres;
revoke all on function private.publication_snapshot(uuid) from public,anon,authenticated;

create function private.publication_prepare(p_envelope text,p_mac text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare e jsonb; a private.publication_attempts%rowtype; p public.properties%rowtype;
  u uuid:=auth.uid(); r uuid; m jsonb; i integer:=0; image uuid; path text; ext text; f jsonb; slug text;
begin
  e:=private.publication_verify(p_envelope,p_mac,'prepare'); r:=(e->>'request_id')::uuid;
  f:=e->'fields';
  if jsonb_typeof(f)<>'object' or (f-array['title','description','address','district','city','region','contact_phone',
    'listing_type','property_type','price','currency','area_total_m2','area_built_m2','bedrooms','bathrooms',
    'parking_spaces','floors','maintenance_fee','lat','lng'])<>'{}'::jsonb
    or (select count(*) from jsonb_object_keys(f))<>20 or jsonb_typeof(e->'manifest') is distinct from 'array'
    or jsonb_array_length(e->'manifest') not between 1 and 5 then
    raise exception 'Invalid publication plan' using errcode='23514';
  end if;
  p:=jsonb_populate_record(null::public.properties,f);
  if p.title is null or length(btrim(p.title)) not between 1 and 120
    or p.description is null or length(btrim(p.description)) not between 1 and 3000
    or p.address is null or length(btrim(p.address)) not between 1 and 250
    or p.city is null or length(btrim(p.city)) not between 1 and 120
    or p.region is null or length(btrim(p.region)) not between 1 and 120
    or coalesce(length(p.district)>120,false)
    or p.contact_phone is null or p.contact_phone !~ '^\+[1-9][0-9]{7,14}$'
    or p.price is null or p.price<=0 or p.price>1000000000
    or p.lat is null or p.lat not between -19 and 1 or p.lng is null or p.lng not between -82 and -68
    or p.listing_type is null or p.listing_type not in ('sale','rent')
    or p.property_type is null or p.property_type not in ('house','apartment','land','office','commercial')
    or p.currency is null or p.currency not in ('PEN','USD')
    or coalesce(p.area_total_m2<0 or p.area_total_m2>100000000,false)
    or coalesce(p.area_built_m2<0 or p.area_built_m2>100000000,false)
    or coalesce(p.maintenance_fee<0 or p.maintenance_fee>1000000000,false)
    or coalesce(p.bedrooms<0 or p.bedrooms>1000,false)
    or coalesce(p.bathrooms<0 or p.bathrooms>1000,false)
    or coalesce(p.parking_spaces<0 or p.parking_spaces>1000,false)
    or coalesce(p.floors<0 or p.floors>1000,false)
    or (p.property_type='land' and (p.area_built_m2 is not null or p.bedrooms is not null or p.bathrooms is not null
      or p.parking_spaces is not null or p.floors is not null or p.maintenance_fee is not null))
    or (p.property_type in ('office','commercial') and p.bedrooms is not null) then
    raise exception 'Invalid publication fields' using errcode='23514';
  end if;
  insert into private.publication_quotas(owner_id) values(u) on conflict do nothing;
  perform 1 from private.publication_quotas where owner_id=u for update;
  select * into a from private.publication_attempts where request_id=r for update;
  if found then
    if a.owner_id<>u then raise exception 'Publication not found' using errcode='PT404'; end if;
    if a.fingerprint<>e->>'fingerprint' or a.fields<>f or a.manifest<>e->'manifest' then
      raise exception 'PUBLICATION_REQUEST_MISMATCH' using errcode='23505';
    end if;
    if a.state='CANCEL_PENDING' then raise exception 'CANCELLATION_PENDING' using errcode='23505'; end if;
    if a.state='CANCELLED' then raise exception 'PUBLICATION_CANCELLED' using errcode='23505'; end if;
    return private.publication_snapshot(r);
  end if;
  if exists(select 1 from private.publication_attempts where owner_id=u and state in ('ACTIVE','CANCEL_PENDING')) then
    raise exception 'PUBLICATION_IN_PROGRESS' using errcode='23505';
  end if;
  slug:=trim(both '-' from regexp_replace(lower(p.title),'[^a-z0-9]+','-','g'));
  slug:=coalesce(nullif(slug,''),'propiedad')||'-'||r::text;
  insert into private.publication_attempts(request_id,owner_id,fingerprint,fields,manifest,slug)
    values(r,u,e->>'fingerprint',f,e->'manifest',slug);
  insert into public.properties(id,owner_id,agent_id,status,published_at,country,slug,title,description,address,district,city,region,
    contact_phone,listing_type,property_type,price,currency,area_total_m2,area_built_m2,bedrooms,bathrooms,parking_spaces,floors,maintenance_fee,lat,lng)
    values(r,u,null,'draft',null,'Peru',slug,p.title,p.description,p.address,p.district,p.city,p.region,
      p.contact_phone,p.listing_type,p.property_type,p.price,p.currency,p.area_total_m2,p.area_built_m2,p.bedrooms,p.bathrooms,
      p.parking_spaces,p.floors,p.maintenance_fee,p.lat,p.lng);
  for m in select value from jsonb_array_elements(e->'manifest') loop
    if jsonb_typeof(m)<>'object' or (m-array['imageId','mime','size','digest'])<>'{}'::jsonb
      or not(m ?& array['imageId','mime','size','digest']) then raise exception 'Invalid image slot'; end if;
    image:=(m->>'imageId')::uuid;
    ext:=case m->>'mime' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
    if ext is null then raise exception 'Invalid image type'; end if;
    path:=u::text||'/'||r::text||'/'||image::text||'.'||ext;
    insert into private.publication_slots(image_id,request_id,owner_id,storage_path,mime,size,digest,sort_order)
      values(image,r,u,path,m->>'mime',(m->>'size')::bigint,m->>'digest',i);
    insert into public.property_images(id,property_id,storage_bucket,storage_path,public_url,sort_order,is_cover)
      values(image,r,'property-images-private',path,null,i,i=0);
    i:=i+1;
  end loop;
  return private.publication_snapshot(r);
end $fn$;
alter function private.publication_prepare(text,text) owner to postgres;

create function private.publication_transition(p_envelope text,p_mac text,p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare e jsonb; a private.publication_attempts%rowtype; r uuid; snap jsonb; action text;
begin
  if p_purpose not in ('finalize','reconcile') then raise exception 'Publication proof denied' using errcode='42501'; end if;
  e:=private.publication_verify(p_envelope,p_mac,p_purpose); r:=(e->>'request_id')::uuid;
  perform 1 from private.publication_quotas where owner_id=auth.uid() for update;
  select * into a from private.publication_attempts where request_id=r and owner_id=auth.uid() for update;
  if not found then raise exception 'Publication not found' using errcode='PT404'; end if;
  action:=case when p_purpose='finalize' then 'finalize' else e->>'action' end;
  if action is null or action not in ('finalize','inspect','begin_cancel','close_cancel')
    or (p_purpose='reconcile' and action='finalize') then raise exception 'Invalid action'; end if;
  -- Initial owner-only inspect discovers the binding; a signed zero sentinel grants
  -- read-only lookup, never a transition. Every mutation requires the stored fingerprint.
  if a.fingerprint<>e->>'fingerprint' and not(action='inspect' and e->>'fingerprint'=repeat('0',64)) then
    raise exception 'PUBLICATION_REQUEST_MISMATCH' using errcode='23505';
  end if;
  if action<>'inspect' and ((e->>'revision')::bigint is distinct from a.revision) then
    raise exception 'PUBLICATION_REVISION_CONFLICT' using errcode='23505';
  end if;
  perform 1 from public.properties where id=r for update;
  perform 1 from public.property_images where property_id=r order by id for update;
  snap:=private.publication_snapshot(r);
  if action='inspect' then return snap; end if;
  if action='finalize' then
    if a.state='FINALIZED' then return snap; end if;
    if a.state<>'ACTIVE' or not (snap->>'parentValid')::boolean
      or jsonb_array_length(snap->'slots')<>jsonb_array_length(a.manifest)
      or (select count(*) from public.property_images where property_id=r)<>jsonb_array_length(a.manifest)
      or exists(select 1 from jsonb_array_elements(snap->'slots') s where s->>'state'<>'RESERVED'
        or s->>'observation'<>'PRESENT' or not (s->>'metadataValid')::boolean) then
      raise exception 'Publication not ready' using errcode='23514';
    end if;
    update public.properties set status='published',published_at=now() where id=r;
    update private.publication_slots set state='FINALIZED' where request_id=r;
    update private.publication_attempts set state='FINALIZED',revision=revision+1 where request_id=r;
  else
    if a.state='FINALIZED' or exists(select 1 from public.properties where id=r and
      (status='published' or owner_id is distinct from auth.uid() or agent_id is not null)) then
      raise exception 'PUBLICATION_ALREADY_FINALIZED' using errcode='23505';
    end if;
    if action='begin_cancel' and a.state='ACTIVE' then
      update private.publication_slots set state='RETIRED' where request_id=r and state='RESERVED';
      update private.publication_attempts set state='CANCEL_PENDING',revision=revision+1 where request_id=r;
    elsif action='close_cancel' and a.state='CANCEL_PENDING' then
      if e->>'cleanup_confirmed' is distinct from 'true'
        or exists(select 1 from private.publication_slots where request_id=r and state<>'RETIRED')
        or exists(select 1 from storage.objects o join private.publication_slots s
          on o.bucket_id='property-images-private' and o.name=s.storage_path where s.request_id=r) then
        raise exception 'CLEANUP_UNCONFIRMED' using errcode='PT409';
      end if;
      delete from public.property_images where property_id=r;
      delete from public.properties where id=r and status<>'published';
      update private.publication_attempts set state='CANCELLED',revision=revision+1 where request_id=r;
    elsif a.state not in ('CANCEL_PENDING','CANCELLED') then
      raise exception 'Invalid cancellation transition' using errcode='23514';
    end if;
  end if;
  return private.publication_snapshot(r);
end $fn$;
alter function private.publication_transition(text,text,text) owner to postgres;
revoke all on function private.publication_prepare(text,text),private.publication_transition(text,text,text) from public,anon;
-- Facades are INVOKER. Private implementations independently verify caller and proof.
grant execute on function private.publication_prepare(text,text),private.publication_transition(text,text,text) to authenticated;
create function public.prepare_publication_attempt(p_envelope text,p_mac text) returns jsonb
  language sql security invoker set search_path='' as $$ select private.publication_prepare(p_envelope,p_mac); $$;
create function public.finalize_publication_attempt(p_envelope text,p_mac text) returns jsonb
  language sql security invoker set search_path='' as $$ select private.publication_transition(p_envelope,p_mac,'finalize'); $$;
create function public.reconcile_publication_attempt(p_envelope text,p_mac text) returns jsonb
  language sql security invoker set search_path='' as $$ select private.publication_transition(p_envelope,p_mac,'reconcile'); $$;
revoke all on function public.prepare_publication_attempt(text,text),public.finalize_publication_attempt(text,text),
  public.reconcile_publication_attempt(text,text) from public,anon;
grant execute on function public.prepare_publication_attempt(text,text),public.finalize_publication_attempt(text,text),
  public.reconcile_publication_attempt(text,text) to authenticated;
notify pgrst,'reload schema';
commit;
