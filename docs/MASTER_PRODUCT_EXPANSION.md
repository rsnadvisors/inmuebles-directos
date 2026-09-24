# Master product expansion: integration and rollout

This branch starts from production `16b215ce529f46398fcba8126633bb6d7950723b` and includes the certified EXP-2 card/drawer commit. EXP-1 already supplies `/inmueble/[slug]` with published-only reads and canonical metadata; this branch preserves it.

## Product contract

- Cards support quick comparison; the drawer previews the selected listing; the canonical page contains all persisted public details. All use the same price, type, location, image and null/zero normalization.
- Publication accepts sale/rent, PEN/USD, all five existing property types, type-appropriate numeric attributes, a public address, Peru-wide coordinates and one to five validated images. The server rejects unknown fields and derives the owner, agent, slug and initial `draft` status. The selected location is confirmed explicitly. The property becomes `published` only after the image pipeline completes.
- Header, logo, mobile menu, search, independent operation/type filters, currency-grouped price sorting and map layer selector share one navigation and display contract. The Piura map center remains a useful initial viewport, not a publication restriction.
- Supabase Auth handles registration, email confirmation, sign-in and sign-out. SSR cookies and server `getUser()` protect `/publicar`, `/cuenta`, `/mis-propiedades` and the publication API. Profile names fall back to email, then “Mi cuenta”; no role comes from signup metadata.

## Migrations and security

1. `20260921140457_harden_profile_authorization.sql` comes from the separately reviewed E0 branch (Git blob SHA-256 `434099867aaf78834fe78d4442ef146dc1c2e50cf2ca14ce164c24fabdf42fe5`). It removes direct role UPDATE privilege and adds a defensive trigger. Its preconditions reject unexpected profile columns.
2. `20260922185044_master_auth_ownership.sql` requires E0, the reviewed legacy policies and public bucket. Its preflight rejects unknown SELECT/INSERT/UPDATE/DELETE/ALL policies on the relevant tables and explicitly checks the production Storage UPDATE/DELETE policies. It removes the anonymous INSERT paths and the legacy broad Storage UPDATE/DELETE policies, adds owner-scoped draft creation and cleanup, narrows the image-agent policy, and binds uploads to `user/property/file`. A restrictive INSERT policy also covers the legacy agent branch, and an invoker trigger denies direct authenticated transitions to `published`; neither ordinary owners nor agents can create a new public row through REST. A narrowly granted `SECURITY DEFINER` RPC checks `auth.uid()`, ownership, draft transition, property fields, one to five image metadata rows and their actual Storage objects before setting `published` in one database transaction. No service-role key is used in the browser or publication API. The Storage bucket enforces MIME and 5 MiB limits; upload preflight metadata does not yet contain the final file size. Existing ownerless listings are untouched. Both migrations are transactional and send `NOTIFY pgrst` before commit.
3. `tests/security/fixtures/*.sql` are synthetic local reconstructions, never production migrations. The property fixture now includes the reviewed production `property_images_update_own` and `property_images_delete_own` Storage policies so their removal and fail-closed preflight can be tested. The isolated workflow rebuilds local Supabase and exercises direct authenticated REST denial, draft visibility, controlled finalization, owner isolation and Storage HTTP uploads. It has no production project link or credentials.

## Publication failure contract

The API creates a private `draft`, uploads each image, inserts image metadata and only then calls `finalize_own_property_publication`. Public Home, markers and the canonical page continue to read `published` only. If an upload, metadata insert or finalization fails while the row is still a draft, the API attempts to remove uploaded Storage objects, image metadata and the draft in that order. Cleanup is best effort across Storage and Postgres; a failed cleanup can leave a **non-public** draft or object for later inspection. Responses distinguish `UPLOAD_FAILED`, `METADATA_FAILED` and `FINALIZATION_FAILED` without exposing internal error details. An uncertain create or lost finalization response is reported separately; after a lost finalization response the API checks whether publication actually committed before attempting cleanup. The UI directs the owner to `/mis-propiedades` before retrying. Full idempotency across a lost response and a second form submission is deferred; the confirmed failure path cannot leave a public partial listing.

The database migration is **not automatically applied by a Next.js/Railway deployment**. The reviewed production schema and policy names must be rechecked immediately before rollout. No migration or Auth test account is created in production by this PR.

## Production sequence for a separate authorization gate

1. Verify exact PR SHA, green CI, current production/main commit, production catalog, Auth redirect allowlist, and a recoverable backup/restore path. Confirm an operations window: closing anonymous publication before the new deployment makes the old `/publicar` flow temporarily unavailable.
2. Apply E0 to production only after its own preflight; verify profile ACL and role-escalation guard. Apply the master migration only if every precondition still matches; verify anonymous INSERT denial, owner policies, Storage bucket/policies and PostgREST reload.
3. Merge the exact reviewed PR and observe Railway auto-deploy of the resulting main SHA. Do not manually redeploy. Verify build/start and perform read-only public smoke, then a separately authorized synthetic Auth/publication test only if production test writes have been explicitly approved.
4. Keep public traffic on the previous version if the migrations fail. A failed migration transaction must roll back by itself. If the new app fails, revert its merge and restore the prior deployment; **Git revert alone does not revert database grants, RLS or Storage policies**. An explicit, reviewed compensating migration or restore is required for DB rollback. Do not silently restore anonymous writes.

## Deferred limits

- Storage and Postgres are separate services, so cleanup is best effort; a failed compensation can leave a private draft or orphaned object. Periodic draft/orphan reconciliation and full retry idempotency remain future work.
- Email confirmation and redirect URLs depend on Supabase Auth dashboard configuration. No dashboard setting is changed by this PR.
- Existing ownerless properties are not auto-claimed. Editing/deleting properties, contact actions and global map/filter scalability are outside this release.
