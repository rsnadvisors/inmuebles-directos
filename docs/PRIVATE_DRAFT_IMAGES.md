# Private draft property images

This change is staged in a branch. The migration must be applied to production
only in a separately authorized rollout with verified backup and recovery.

## Data and delivery contract

- Existing `property_images` rows inherit `storage_bucket = 'property-images'`.
  Their `public_url` values, including external image URLs, remain unchanged.
  The existing public bucket and all legacy objects stay in place.
- New uploads use the non-public `property-images-private` bucket. Their metadata
  records `storage_bucket`, `storage_path`, and `public_url = NULL`. The object
  path is derived from authenticated user ID, property ID and a random UUID.
- During draft, the owner may read the object directly under Storage RLS or via
  `/api/property-images/[imageId]/preview`. This preview checks the verified
  session, image/property relationship, owner ID and draft status.
- After finalization, `/api/property-images/[imageId]` uses an anonymous
  Supabase client, checks the image and published property, and downloads the
  still-private object under Storage RLS. It never uses `service_role` or a
  stored signed URL. The same stable route supplies cards, drawer, full page
  and absolute Open Graph image metadata.
- The published-object Storage `SELECT` policy permits only the exact
  authenticated-object download operation. Anonymous clients can download a
  published image by path but cannot list the private bucket. The delivery
  route also validates the private bucket, linked property/owner IDs, and the
  canonical three-segment UUID image path before fetching bytes.

Both routes send `Cache-Control: no-store`; the draft preview additionally
sends `private`. This deliberately trades CDN caching for the guarantee that
a prior response cannot outlive a status/authorization change. The legacy
public URLs retain their existing caching behavior.

## Publication and failures

The new `finalize_private_property_publication` RPC checks owner, draft state, complete property fields,
one to five image rows, owner/property path, MIME type, size and the existence
of every Storage object before changing status in a database transaction. Its
new-image branch requires the private bucket and a null public URL. There is
no cross-system copy or move at publication time.

The API attempts cleanup only while the listing remains a draft. If the RPC
response is lost, it reads the property's current status before cleanup. After
publication, it verifies the primary image through the same anonymous delivery
contract. A temporary delivery failure returns `DELIVERY_UNCERTAIN` and leaves
the committed property alone; the user must inspect `Mis propiedades` before
retrying. The API never repeats a write automatically.

## Rollout and recovery boundary

Before applying either migration to production, verify the exact current schema,
policies, backup artifact and SHA-256, restore capability, migration history,
and a no-write staging rehearsal. The versioned `*_expand.sql` phase adds the
column, private bucket, private policies and versioned RPC **without changing**
the legacy public-bucket draft policies or legacy finalization RPC. It is
compatible with the old publisher, but temporarily retains its pre-existing
public-draft exposure. Deploy the dual-reading application only after Expand.
The new publisher writes solely to the private bucket and calls the new RPC.
Do not deploy this branch alone: its queries require `storage_bucket`.

**DO NOT APPLY CONTRACT/LOCKDOWN BEFORE NEW CODE IS DEPLOYED.** Once the exact
new Railway commit is serving traffic, its private publication flow is
verified, and no unfinished drafts remain, the separate
`*_contract.sql` phase removes old owner public draft permissions, constrains
agent public uploads to published listings, limits draft image metadata to
the private bucket and revokes authenticated access to the legacy finalization
RPC. Contract aborts transactionally if any draft is found.
It does not move, rewrite or delete legacy image rows, URLs or Storage bytes.

### In-flight legacy draft preflight and quiescence

The old publisher inserts a `properties.status = 'draft'` row before its first
Storage upload or `property_images` insert. The original Contract preflight
looked only for a legacy image row or object, leaving that zero-image interval
unprotected. No stored column identifies whether a draft in that interval was
created by the old or new publisher. Contract therefore refuses **every** draft,
including a row with zero images and zero objects, with a PII-free diagnostic.
It never finalizes, deletes or rewrites a draft. Its table locks keep the
preflight decision stable against database inserts until the transaction
commits, but cannot prove that an old application request will not start after
the locks are released. Nor do database locks serialize an independent Storage
HTTP request.

The future production rollout must first verify that the new Railway commit
serves production, the old deployment no longer serves requests, and old
publication requests are drained. It must then verify that no unsafe drafts
remain immediately before Contract. Do not treat a recent timestamp or an
empty image join as evidence of safety. If any draft exists, stop and resolve
its provenance outside this migration; do not auto-clean production data.
**DO NOT APPLY CONTRACT UNTIL OLD PUBLISHER TRAFFIC IS QUIESCED AND PREFLIGHT PASSES.**
Railway deployment identity/status and the production HTTP response can prove
which release is active; deployment history can show that the old release is
no longer active. Neither status nor aggregate logs alone proves that every
already-accepted old publication request has finished. The rollout gate must
establish a separate traffic-drain/quiescence check before B; if that evidence
is unavailable, stop rather than infer safety from a green deployment.

### Selective A/B migration execution

`supabase db push` considers all pending files in its migration workspace;
never run it from the complete PR checkout for the Expand stage. A future
rollout must use a disposable, audited workspace with the exact reviewed
baseline migrations and **only A** for stage 1. Compare the target migration
history with the workspace first. The production-only historical version
`20260909040437` must be obtained from its authentic migration-history
statements (for example with the supported `supabase migration fetch`), if
the CLI requires a matching local file. Never invent that migration's SQL or
repair production history merely to make the CLI accept the workspace.
The isolated regression fixture
`tests/security/fixtures/20260909040437_remote_history_TEST_ONLY.sql`
is an exact read-only capture of that stored statement (MD5
`c92a8fc9c03fcdd0dfa20a442c628232` excluding its final file newline).
The lab marks its version applied before presenting the file to the CLI;
the fixture is never executed or installed as a production migration.
Run `supabase db push --dry-run` and require exactly
`20260926200632` pending, then apply only after separate rollout
authorization and verify one new history entry. For stage 2, add the exact
reviewed B file to that workspace, dry-run and require exactly
`20260927153000` pending, then apply only after the quiescence and draft
preconditions pass. Any extra pending version, history mismatch or unavailable
authentic historical SQL is a STOP. The isolated rehearsal and its exact
CLI output must be recorded before either production stage.

### Recovery windows

- R1: After A, old code can still publish through the legacy path.
- R2: Before the first private production image, application rollback remains
  possible while A stays applied.
- R3: After the first private image, retain the private bucket,
  `storage_bucket`, dual resolver and delivery route during rollback.
- R4: After B, the old publisher is intentionally incompatible.
- R5: If B rejects an unsafe draft, the migration transaction rolls back;
  production remains in the A compatibility state, including the old RPC and
  legacy publisher permissions. Investigate and quiesce before retrying B.

The isolated regression reconstructs the old publisher's insert-before-upload
interval and verifies that the original image-join predicate misses a draft
with zero image rows and zero Storage objects. The revised preflight rejects
that state, object-only, metadata-only, full unfinished and multiple-draft
states. For each rejected attempt it compares policy definitions, table grants,
both finalization RPC ACLs, bucket metadata and migration history before and
after. A separate R5 check runs the immutable old publisher successfully
after a rejected Contract. After synthetic cleanup, B applies once and a
second migration-up is a no-op.

The isolated selective rehearsal records the authentic historical version as
already applied, uses its exact read-only SQL as a local filename match, and
confirms that A's dry-run and application include only `20260926200632`.
It then adds B and confirms only `20260927153000` is pending and applied.
Neither historical SQL nor a production migration is replayed. The real
cross-version test covers old+baseline, old+A, new+A and new+B; old+B is
intentionally denied at the legacy public-bucket upload.

Before the first private-backed production image, an emergency application
rollback may disable new private uploads. After the first such image, keep a
dual-reading application deployed until every private-backed image is safely
resolvable. Never delete the private bucket during rollback. Do not revert to
code that assumes every image has a non-null `public_url`.

The legacy public bucket cannot retroactively make its bytes private. Contract
removes ordinary owner draft uploads to that bucket and limits agent uploads
there to already published managed properties. Expand deliberately does not.
After the first private-backed production image, never roll the application
back to a reader that only understands non-null `public_url`; retain the
private bucket, `storage_bucket` metadata, dual reader and delivery route.

## Published delivery remediation

The managed Storage delivery path authorized an individual object-info read
(`object.get_authenticated_info`) for a download requested by storage-js. The
SDK itself emits one object GET; standalone Storage does not necessarily make
the additional info request. Expand allowed only `object.get_authenticated`,
so an existing published image could return `NoSuchKey` and the app returned
503. The forward migration
`20260930134657_fix_private_published_image_delivery.sql` additionally permits
only authenticated-info for the same published, owner-matched exact object.
It preserves the private bucket and denies anonymous/unrelated listing and
draft access. It does not apply Contract or alter its source.

Publication previously reported 502 after a committed finalization when this
delivery check failed. A committed publication now returns its canonical slug
and, if needed, an explicit image-delivery warning. New UI attempts carry a
UUID used as the property primary key; owner-filtered reconciliation and the
existing primary-key constraint prevent repeated/concurrent inserts. A local
fingerprint of normalized fields and photo bytes/types binds retries to the
same intent across page navigation. Changed data requires checking Mis
propiedades and explicitly starting a new attempt. No raw form data, token,
or credential is persisted by this mechanism. Old clients without the header
remain compatible during deployment.

Run the versioned synthetic Storage tests with
`PRIVATE_IMAGE_REMEDIATION=1 PRIVATE_DRAFT_PHASE=A` (and separately B) to verify
individual published reads/info, draft denial and listing protection. CI runs
both. The isolated rollout rehearsal additionally checks A -> remediation -> B
in that order, real HTTP lost-response/concurrent publication, and exact old
code before/after remediation. These laboratory tests never target production.

Production rollout must select only the new remediation migration, review the
exact app commit, then observe its automatic deploy and reuse the existing QA
fixture. **Phase B remains blocked until remediation is deployed, QA passes
and old-publisher quiescence is proved in a separate gate.**
