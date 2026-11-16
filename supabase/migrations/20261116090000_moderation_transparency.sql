-- Fase 4A (16/11/2026): moderación visible para el anunciante.
-- El equipo archiva un anuncio con un motivo (moderation_note) y el dueño lo ve en Mis propiedades;
-- el dueño puede pedir una revisión con un mensaje. Al volver a publicarse, el motivo y la solicitud se limpian.

alter table public.properties add column if not exists moderation_note text;
alter table public.properties add column if not exists review_requested_at timestamptz;
alter table public.properties drop constraint if exists properties_moderation_note_length;
alter table public.properties add constraint properties_moderation_note_length check (moderation_note is null or length(moderation_note) <= 300);
comment on column public.properties.moderation_note is 'Motivo del archivo por revisión que ve el dueño (lo escribe el equipo). Se borra al volver a publicar.';
comment on column public.properties.review_requested_at is 'El dueño pidió revisar el archivo (mensaje en private.review_requests).';

-- Un anuncio publicado nunca expone notas de moderación ni solicitudes pendientes.
create or replace function private.clear_moderation_on_publish()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if new.status = 'published' then
    new.moderation_note := null;
    new.review_requested_at := null;
  end if;
  return new;
end $fn$;
revoke all on function private.clear_moderation_on_publish() from public, anon, authenticated;
drop trigger if exists clear_moderation_on_publish on public.properties;
create trigger clear_moderation_on_publish before insert or update on public.properties
  for each row execute function private.clear_moderation_on_publish();

create table if not exists private.review_requests (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null,
  message text not null check (length(message) between 10 and 500),
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','closed'))
);
create index if not exists review_requests_open on private.review_requests(status, created_at);
alter table private.review_requests enable row level security;
revoke all on private.review_requests from public, anon, authenticated;

-- El dueño pide revisar un anuncio archivado por moderación. Una solicitud abierta por anuncio.
create or replace function public.owner_request_review(p_id uuid, p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare r public.properties; v_message text := btrim(coalesce(p_message, ''));
begin
  r := private.owned_listing(p_id);
  if r.status <> 'archived' or r.owner_paused or r.deletion_requested_at is not null then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if length(v_message) not between 10 and 500 then
    raise exception 'INVALID_FIELDS' using errcode = '22023';
  end if;
  if exists (select 1 from private.review_requests q where q.property_id = p_id and q.status = 'open') then
    raise exception 'REVIEW_ALREADY_REQUESTED' using errcode = 'P0001';
  end if;
  insert into private.review_requests(property_id, owner_id, message) values (p_id, r.owner_id, v_message);
  update public.properties p set review_requested_at = now() where p.id = p_id;
  return jsonb_build_object('requested', true);
end $fn$;
revoke all on function public.owner_request_review(uuid, text) from public, anon;
grant execute on function public.owner_request_review(uuid, text) to authenticated;

notify pgrst, 'reload schema';
