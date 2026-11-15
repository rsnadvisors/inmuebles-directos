# Durable publication storage boundary

This implements Option C and the certified whole-attempt slot lifecycle. It does
not install Turnstile, rate limiting, an application administrative client, or a
physical/transfer/cost quota. All binary operations retain the verified user's
session. Historical migrations and published image delivery stay unchanged.

## Authority and data

`POST /api/publicar` validates the same multipart fields, photos and Origin,
verifies the user with `getUser`, computes the normalized content fingerprint,
and requests atomic preparation. The database creates the quota row, attempt,
draft, every image slot and every metadata row in one transaction. After
Contract, drafts and image slots are created only by this atomic preparation.

The separate private ledger survives deletion of the public property/metadata.
Owner, request/property UUID, fingerprint, manifest, image IDs and exact paths
are immutable. All paths are `<uid>/<request-UUID>/<slot-UUID>.<jpg|png|webp>` in
`property-images-private`. Stable per-manifest image IDs make concurrent exact
retries use the same plan; neither filenames nor browser-supplied paths are used.

Q(A) is the lifetime number of assigned slots: N=1..5, including RESERVED,
RETIRED and FINALIZED. It never decreases. P(U) counts ACTIVE/CANCEL_PENDING
attempts, at most one, enforced by a partial unique index and a per-user quota
row lock. DELETE of bytes, metadata or property never releases either ledger
authority or the pending attempt quota.

Attempt transitions: ACTIVE -> FINALIZED, or ACTIVE -> CANCEL_PENDING ->
CANCELLED. Slots: RESERVED -> FINALIZED or RETIRED. Terminal names and request
IDs cannot be reauthorized. No unused subset can finalize: all N approved fields,
metadata and objects are required. A changed manifest/fingerprint at the same
request ID is rejected. No implicit new request on a timeout/error.

## Server proof and narrow SQL elevation

Facades are public SECURITY INVOKER. Private implementations are SECURITY
DEFINER, explicitly owned by postgres, with empty search_path and independent
verified uid/proof checks. This is narrow, deliberate SQL elevation; it does not
claim DEFINER DML automatically preserves RLS. Ordinary access and Storage
continue to use their RLS policies. No service key/client or new DB credential.

HMAC-SHA256 covers the exact UTF-8 envelope, checked before JSON interpretation.
MAC comparison visits all 32 bytes. The server uses the private 32-byte lowercase
hex `PUBLICATION_BOUNDARY_HMAC_KEY` and public identifier
`PUBLICATION_BOUNDARY_HMAC_KEY_ID`; the protected DB Vault secret name is
`PUBLICATION_BOUNDARY_HMAC_KEY:<key-id>`. No key is installed by these migrations.
No signer RPC, proof response, log, browser variable or public secret read exists.

Envelope version=1, audience=inmuebles-publication, purpose=prepare/finalize/
reconcile; uid/request/fingerprint and phase-specific fields are allowlisted.
DB clock enforces max 300s validity and 60s skew. Mutations bind the stored
fingerprint and revision. Initial owner-only signed `inspect` uses a zero
fingerprint sentinel to discover that stored binding for the minimal cancellation
request `{requestId,action}`. It authorizes no mutation; all subsequent transitions
require the actual fingerprint/revision. Owner and request are independently
checked before any returned plan, including missing-parent cleanup.

Proof validity only governs DB transactions. It is NEVER a Storage policy
capability, expiring upload permission, nonce or promise of commit revocation.

## Retry, cancellation and reconciliation

The exact approved attempt can be submitted again manually. Reconciliation reads
only ledger-bound object rows under narrow DB authority. PRESENT validates object
owner, path, MIME and exact logical size; the server skips reupload. Authorized
ABSENT permits one INSERT to the SAME path with upsert=false. INACCESSIBLE,
timeout, malformed response or unknown result fails closed. A conflict/lost
upload response causes readback, not overwrite or another path/slot.

`POST /api/publicar/cancelar` accepts only `{requestId, action:'cancel'|'reconcile'}`,
with verified session, same Origin and a 1 KiB counted body. ACTIVE reconcile is
read-only. Cancel first confirms signed `begin_cancel`, freezing all slots into
RETIRED and retaining P=1. Then user-context Storage API removes all exact paths
outside DB locks. Signed `close_cancel` requires confirmed API cleanup and an
independent DB absence recheck, removes only the own unpublished public rows,
marks CANCELLED and releases P atomically. Failure/UNKNOWN retains pending quota.
Repeated pending cancellation is idempotent. FINALIZED cancellation is denied.
Terminal cancellation can only clean residual exact tombstone objects.

Cleanup RLS adds owner-only exact RETIRED path SELECT/DELETE for pending/cancelled
attempts whose parent may be missing. Published/foreign/incorrect-owner objects
remain denied. It adds no INSERT/UPDATE/upsert and no wildcard authorization.
Storage data is never deleted by SQL.

Locks follow quota -> attempt -> property -> image metadata. No network transfer
occurs inside a DB transaction. Missing/deleted metadata or parent is never
recreated on replay; cancel/reconcile is required instead. Published result
readback and image delivery warnings never trigger cleanup of a published row.

## Storage races and resource limits

Bucket maximum remains 5 MiB/object, MIME JPEG/PNG/WebP; multipart maximum 27 MiB.
Five slots mean at most 25 MiB current logical payload for a pending attempt, not
a global physical or historical ceiling. Provider permission checks, body
transfer and privileged commit are separate in Storage 1.77.5. An already
admitted upload may commit after cancellation/finalization. Its historical path
stays known and terminal; it cannot become another slot/metadata/publication.
Late orphan cleanup is owner-bound and does not reopen the attempt or quota.

Repeated transfer, concurrency, transient versions, abandoned pending attempts
and accumulated approved publications remain residual resource risks. DELETE
already admitted before finalization can affect later image delivery: no binary
and application DB atomicity is claimed. Preserve published status with an honest
delivery warning. API automation remains possible until a separate Turnstile
gate. Future Siteverify belongs BEFORE prepare proof and first persistence.

## Controlled rollout and rollback (not executed here)

1. Verify exact candidate, fresh synthetic tests and recovery evidence.
2. Provision matching private server/Vault key explicitly in a separate gate.
3. Apply additive Expand; the current application remains compatible.
4. Deploy compatible new app and verify exact SHA/health.
5. Quiesce/drain old publisher, upload and DELETE HTTP requests; reconcile all
   legacy drafts explicitly. DB locks alone do not prove an HTTP drain.
6. Apply Contract atomically; its preflight refuses unresolved legacy drafts.
7. Verify public reads, owner preview, private delivery, contact/Auth/Admin.

Before Contract an app rollback may retain Expand.
After Contract keep compatible code or fail closed for new publication. Do not
roll back to a superseded writer or restore superseded grants automatically. Never delete
properties/images/ledger to achieve rollback. No destructive down migration.

## Isolated validation

`tests/security/publication_boundary_lab.py` creates a NEW database, loopback-only
REST/Storage containers and NEW binary volume. It refuses existing destinations
and linked/remote targets. Only infrastructure schema DDL and test fixtures are
copied; no application rows, Auth users, Vault secrets or restored backup data.
Historical chain is applied by the real CLI, then Expand; Contract is applied
only after legacy compatibility and new-foundation checks. Random test key exists
only in the synthetic Vault and process memory, never evidence or Git.

`publication_boundary.py` exercises actual HTTP writes/denials, verifies final
object rows and downloaded bytes, races preparation, tests tombstones and uses
an interrupted body with observed backend file to reproduce late commit where
the runtime permits it. An unreproducible race is reported explicitly, never PASS.
Record image/version/digest, exact migration hashes and safe test outcomes.
Source/unit/SQL checks alone are insufficient for candidate certification.
