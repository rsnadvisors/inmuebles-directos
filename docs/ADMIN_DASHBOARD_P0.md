# Admin Dashboard P0

Read-only routes: `/admin`, `/admin/propiedades`, `/admin/usuarios`, and
`/admin/propiedades/[id]` (certified metadata only).

The server layout and **each data read** call the unchanged
`requireDashboardAdmin()` helper. A layout alone is insufficient because
App Router may render nested pages concurrently. The verified client is
reused for the certified `admin_dashboard_summary`, `admin_properties`, and
`admin_users` RPCs. RPC authorization also independently checks approval.
There is no email/role-only shortcut, browser authorization, service-role
client, mutation endpoint, or persistent cache. Routes are dynamic and
protected responses have private/no-store headers. Robots indexing is disabled.

Unauthenticated access redirects to the existing login flow with a fixed
local destination. Unapproved access and service failure render separate,
generic denial/unavailable screens; no protected data is rendered. These
Server Component screens do not promise HTTP 403/503 status codes (Next may
serve or stream them with HTTP 200). Internal helper errors retain 401/403/503.
No raw database diagnostics are rendered.

Lists request 21 rows to display 20 plus detect another page. Keyset cursors
preserve the original PostgreSQL timestamp precision and UUID. Filters are
URL-based, validated, and applied only on submission, with a reset to the
first page. Properties support status, operation, type, exact city/district,
ownerless and text search. Users support name/email search. RPC payloads
are validated and minimized into DTOs; profile phone and Auth timestamps
are deliberately discarded. No approval state is inferred from role.

P0 does not include a private image preview, full property attributes,
user detail, approval indicators or audit UI. Those require further certified
read capabilities/application integration; they do not justify a migration
in this gate. Existing historical roles and ownerless listings are preserved.

The previous Next.js vulnerability remains dependency debt. No dependency
or migration is changed. Fixtures for local visual review must remain
outside the repository and use only loopback/synthetic identities. Never
use production credentials, users or business rows for local QA.
