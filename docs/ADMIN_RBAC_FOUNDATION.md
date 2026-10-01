# Admin RBAC foundation (PR-A)

## Scope and authority

This implements the approved PR-A foundation and administrative reads. The normative design report SHA-256 is `6a389e3f751018bbf24c72c529cdf7ba6a614dcb3b9441d7ae6188c673b51e44`.
Base: `57c276989faa4d3b8dfda2e97322f64f4f43581b`.
Migration: `20260930214156_admin_rbac_foundation.sql`.
Exact Git/Linux SHA-256: `e26f6d035ff07ea3bac523692afbcfb3049713cf3dab3abbe9086e547575098e`.

**NO PRODUCTION MIGRATION APPLIED. NO REAL ADMIN ACTIVATED. NO RAILWAY DEPLOYMENT.**
Migration comments retain the approved candidate's wording; execution in this gate was exclusively synthetic/local.

The implementation does not add an admin UI, ownership reassignment, status mutation RPC, role promotion, or owner editing. Those remain PR-C/PR-D under the normative design. The implementation gate's general owner-edit example must not override the explicit PR-A boundary.

## Authorization contract

An administrative capability requires both `profiles.role = 'admin'` and an enabled membership in `private.dashboard_admins`. Initial membership is empty. Historical admins retain existing role semantics but cannot use new Auth/KPI/query/audit/private-byte capabilities without approval. Legacy table capabilities are not represented as newly isolated.

`requireDashboardAdmin()` is server-only and request-scoped. It verifies the session with the existing server client and then calls `dashboard_access`. It accepts only a boolean true without errors. Missing sessions, malformed results, infrastructure errors, and revocation fail closed. It never trusts client metadata or caches approval.

Only the trusted PostgreSQL operator can change membership through the private function. Membership changes and audit entries are atomic; repeated original requests do not duplicate audit records; the final effective administrator cannot be disabled through this function. No production account is pre-approved.

## Database changes

- Two tables: private membership and append-only public audit.
- Eleven new functions: seven private implementations/guards, four public invoker wrappers.
- One existing function hardened: `private.is_admin()` search path; role meaning preserved.
- Three triggers: property system-field protection, audit UPDATE/DELETE protection, audit TRUNCATE protection.
- Two policies: approved audit SELECT and exact private-object GET/INFO.
- Explicit table/column UPDATE cleanup on properties; only twenty content columns re-granted to authenticated.
- No owner UPDATE policy; no change to baseline migrations, schema roles, publication RPC, or public UI.

Protected fields: id, code, slug, owner_id, agent_id, status, created_at, published_at.
The trigger also checks state-specific content allowlists in defense-in-depth tests. Those tests temporarily widen grants/RLS only inside transactions that roll back; they do not enable owner editing in PR-A.

## Storage boundary

Approved admins can read only related, valid exact private image objects through authenticated GET/INFO, including the six supported property states. Matching parent, bucket, owner, UUID path, extension, MIME, and private metadata relation remain required.

The new policy does not enable listing or signing. Existing owner-scoped inspection remains available. Published delivery remains public through the existing managed delivery path; draft bytes remain private. No client service-role credential was introduced.

## Synthetic baseline provenance

`tests/security/fixtures/admin_rbac_baseline.sql` is a **TEST-ONLY reconstruction**, not the missing original remote migration and not a production migration. It reproduces certified catalog metadata without application rows, credentials or real Storage objects. Original app migration history is not repaired or manually populated: the CLI applies the reconstruction as the synthetic first version and then applies the five unchanged historical Git migrations, followed by RBAC.

The strict precondition is unchanged. The reconstructed baseline matches `e83685a3edb9d051ed75374c6f241ff8` before RBAC. Public function default EXECUTE ACLs are explicitly reconstructed from read-only metadata. Historical files are copied with Git/Linux LF: CRLF within an E0 function body changes PostgreSQL's catalog fingerprint.

## Reproducing the isolated evidence

Requires the explicitly authorized, empty local Supabase-compatible Docker lab on Linux:
- Local Unix Docker endpoint; container label project `inmuebles-directos`.
- PostgreSQL 17.6, effective binding `127.0.0.1:54322`.
- Existing local REST and Storage 1.77.5 images/configuration.
- Supabase CLI 2.117.0 and Python 3.
- Zero Auth users and zero Storage objects in the source lab.
- No previously occupied gate database, target containers or private test volume.

Do not run against production, a linked project, a remote Docker context or a populated lab.
The runner does not download production data, copy .env files, or read production credentials.

```sh
python3 tests/security/admin_rbac_lab.py /root/inmuebles-admin-rbac-replay
```

The fresh workdir must not exist. The runner creates only the hardcoded local synthetic database, loopback REST (54401), loopback Storage (54402), a separate private volume, and explicitly named negative/rollback databases. It refuses overwrite. The source Supabase lab remains untouched.

Security harness results are written to the separate replay workdir, not to Git. Local keys are consumed in memory; temporary env files are mode 0600 and removed. No token is printed. The negative test retains six CLI-recorded migrations and zero partial RBAC objects.

Each SQL actor mutation is rolled back unless it deliberately builds a synthetic fixture or tests trusted membership/audit. The API tests upload two generated PNGs only to the separate volume. Full rollback rehearsal restores only synthetic data into another local database and preserves all rows and previous security.

## Evidence recorded on 2026-09-30 (America/Lima)

- SQL security matrix: 361 PASS, 0 FAIL.
- Real REST/Storage matrix: 41 PASS, 0 FAIL.
- Adversarial exact-object, six states, Lima boundaries, keyset, rollback: 36 PASS, 0 FAIL.
- Negative unexpected-column/atomicity/history/E0 test: 4 assertions PASS.
- Application: 310 PASS, 0 FAIL, 0 skipped, 13 test files.
- Publication subset: server 81 + client 49 = 130 PASS.
- Server authorization helper: 14 PASS.
- TypeScript and optimized build: PASS.
- Local runtime: Node 24.19.0; Next 16.3.4. Repository CI remains pinned to Node 24.20.0/npm 11.19.0. No runtime/dependency config changed.
- Lint: not configured; no lint stack added.
- Security scan: no credential values or sensitive NEXT_PUBLIC additions.

The packaged runner was executed from a fresh source copy and fresh workdir, and reproduced all SQL/HTTP/negative/rollback results.

## Rollback and limitations

`tests/security/fixtures/admin_rbac_rollback.sql` is a test copy of the approved emergency capability shutdown. It disables dashboard approval checks and revokes new read capabilities while retaining memberships/audit/history, E0, publication protection, and property ACL/guard changes. It is not a destructive/full schema rollback.

Before future production authorization: independently review the exact Git SHA, verify current catalog/history and recovery evidence, and plan controlled migration. No production rollback was executed here.

## Deferred work

Owner editing (PR-D), audited administrative mutations and closure of historical direct table mutation paths (PR-C), dashboard UI, and dedicated automated CI execution of the new modern-Storage replay remain separate work. Existing CI still checks the application and earlier security regressions. No merge/deploy is authorized by these results.
