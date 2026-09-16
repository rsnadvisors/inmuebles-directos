# PR-2: local publication guards and server validation

DO NOT MERGE — REVIEW REQUIRED.

Baseline: `8ec8d4f4f6d221c0ebfa33805fd239f31311ddf7`.

## Boundary and business contract

Before: `/publicar` wrote directly to Supabase from the browser. After:
`/publicar` → multipart POST `/api/publicar` → dedicated anonymous Supabase client.
The client has no publication SDK calls. The server validates the entire request
before constructing its client and before the first write. It does not forward
cookies, user tokens or a browser session. Only the existing public URL/anon key
variables are used; persistence, refresh and URL session detection are disabled.

| Field | Accepted contract |
| --- | --- |
| title | Trimmed nonempty string, at most 120 characters |
| description | Trimmed nonempty string, at most 3000 characters |
| address | Trimmed nonempty string, at most 250 characters |
| operation | Vender → sale; Alquilar → rent; no fallback |
| type | Casas → house; Departamentos → apartment; Terrenos → land |
| price | Finite decimal, greater than zero, at most 1,000,000,000 USD |
| latitude / longitude | Nonblank finite decimals; latitude [-6,-4], longitude [-82,-79] |
| coordinatesConfirmed | Explicit `true`; defaults never count as confirmation |
| images | 1–5 File objects, each nonempty and at most 5 MiB, JPEG/PNG/WebP MIME |

The price ceiling is a technical bound, not a new commercial pricing rule.
Unknown fields, duplicate scalar fields and client-controlled status, currency,
city, region, slug, storage path, public URL, owner/agent, order or cover are rejected.
Server derives USD, published, Piura/Piura, a title prefix plus UUID slug and
`public/<property-id>/<uuid>.<jpg|png|webp>`. Original filenames are not used.
MIME checking is not a content-signature scanner or an image decoder.

## Client behavior

Rules are shared with the server. Submit revalidates all values and photos.
Invalid replacement photos clear the old selection and the file input.
Geolocation confirms only valid Piura coordinates; denial, timeout, unsupported
location and out-of-area results do not confirm. Manual edits invalidate previous
confirmation. Request versions prevent late location callbacks overwriting edits.

A synchronous ref lock and disabled UI prevent concurrent submissions before a
React rerender. A form reference is captured before awaiting. `finally` releases
the lock. Success alone resets fields/photos and returns confirmation to false.
Partial/unknown/network failures keep the form and present an alert asking the
user not to resend immediately. There is no automatic retry or persistent lock.

## Request and response guards

Only POST is implemented; Next handles unsupported methods. Content type must be
multipart/form-data. Content-Length above 27 MiB is rejected early. Actual stream
bytes are also counted and reading is cancelled above 27 MiB, before multipart
parsing, including when Content-Length is absent or misleading. The accepted body
is buffered and parsed with the Web Request/Response APIs available in Node 24.
Five files of exactly 5 MiB plus ordinary fields pass the handler tests.

This is an application body cap, **not an ingress, concurrency or memory budget**:
buffering/parsing can allocate additional copies, and proxy/platform limits remain
independent. No Next configuration, Railway settings or new infrastructure changed.
Reference: [Next Route Handler request bodies](https://nextjs.org/docs/app/api-reference/file-conventions/route)
and [Railway public networking](https://docs.railway.com/guides/public-networking).

Fetch Metadata `Sec-Fetch-Site: cross-site` is rejected. This is not a complete
Origin check, CSRF solution or authentication: non-browser clients can omit/spoof
the signal and same-site sibling origins are not rejected. A strict Origin allowlist
is deferred rather than trusting forwarded Host headers without a verified proxy
trust/configuration contract. Same-origin localhost and production remain compatible.

| HTTP | code/status | Meaning |
| --- | --- | --- |
| 200 | ok:true, status:published | Entire sequential workflow completed |
| 400 | VALIDATION_ERROR / INVALID_REQUEST | Validation or multipart parse rejected |
| 403 | INVALID_ORIGIN | Explicit cross-site browser signal |
| 413 | REQUEST_TOO_LARGE | Declared or observed size exceeded cap |
| 415 | INVALID_CONTENT_TYPE | Not multipart |
| 503 | PUBLICATION_FAILED | Failure before attempted property write |
| 502 | PARTIAL_OR_UNCERTAIN | A write may have occurred |

Responses do not expose SDK errors, SQL, stack traces or credentials.

## Partial writes and remaining security debt

Writes remain sequential: property INSERT → upload → image INSERT, repeated per
image. Even an error returned by the first INSERT is conservatively uncertain:
the response could have failed after the server committed it. No retry, cleanup,
compensation or transaction is attempted. Installed PostgREST retry logic excludes
POST, and Storage upload has no automatic retry loop in the installed SDK.

**PR-2 protects the official application publication flow. Direct anonymous
Supabase writes remain possible according to current RLS/policies and are NOT
remediated by PR-2.** Coordinate confirmation is a UI acknowledgement, not proof
of physical presence. The server remains subject to existing anonymous policies.

Persistent idempotency, transactional integrity, Storage cleanup, Turnstile,
distributed rate limiting and RLS hardening remain deferred. Anonymous publication
is still temporarily allowed directly as published. USD, Piura bounds and the
three publishable types are unchanged. Inventory/map/drawer/CSS are untouched.

## Verification

`npm run typecheck`, `npm test`, `npm run build`: PASS on Node 24.20.0 / Next 16.3.4.
Suite: 6 files, 173 tests, including all 61 baseline tests and 112 new tests.
Tests deny real fetch/WebSocket/XHR and replace the SDK; the node handler tests
use an explicit SDK mock. The shared setup only conditionally guards XHR when
the Node environment has no XMLHttpRequest.

Coverage includes empty/whitespace/missing/duplicate fields, enum tampering,
price/coordinate bounds, confirmation, photo limits, body byte limit with absent
or false Content-Length, derived fields, canonical paths and sequential ordering.
Partial cases: first upload failure, second upload failure after one image row,
image-row failure, unexpected exception after property insertion. Also tests first
INSERT uncertainty, initialization failure, safe error messages and no retries.
Client lifecycle tests exercise immediate double submit (one request), disabled
UI, finally release, stable reset and form preservation.

Local browser smoke uses a temporary helper outside version control on port 3103.
Public Supabase URL is overridden to that loopback server with a synthetic key.
Its property/image/storage responses are in-memory fixtures; no database or real
Storage writes occur. Desktop viewport 1440×900 and mobile 375×812 exercise
form rendering, validation, file selection/rejection, manual confirmation,
geolocation failure, pending lock, pre-write error, partial result and mock success.
The mock success traverses the real route and records one property, upload and
image-row request locally; partial stops after the first failed local upload.

Home regression smoke: five synthetic cards, four located markers, operation
filter 5→2→5, drawer open/close and second gallery image pass. Mobile list opens,
closes and reopens; its scrollTop advances 0→160 to expose later cards. Desktop
Home/filter/drawer also pass. No browser JS errors were recorded in the final log
inspection. Pre-existing limitation: the mobile floating list button overlaps
the bottom of the last card; that Home/CSS code is unchanged in this PR.

No dependencies, Supabase schema/RLS/Storage/Auth configuration, Railway settings,
production deployment or merge are part of this change.
