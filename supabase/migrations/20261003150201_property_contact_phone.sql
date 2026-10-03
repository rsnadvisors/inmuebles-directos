begin;

-- Listing-owned public contact. Existing rows remain NULL; no profile backfill.
alter table public.properties add column contact_phone text;
alter table public.properties add constraint properties_contact_phone_format
  check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$');
comment on column public.properties.contact_phone is
  'Advertiser-provided public listing contact in international phone format; NULL for legacy listings.';

-- Existing row visibility, ownership and privileges remain unchanged.
notify pgrst, 'reload schema';
commit;
