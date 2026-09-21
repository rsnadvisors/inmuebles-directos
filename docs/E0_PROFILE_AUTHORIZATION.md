# E0 Profile Authorization Hardening

## Status and scope

E0 addresses authorization of updates to `public.profiles`. The vulnerability was reproduced locally. The security fixture reconstructs the security-relevant profiles authorization baseline from the latest read-only production metadata available during E0 analysis; it is not a complete historical dump or proof of the current production state. There is no evidence in this work that a real attacker exploited production.

This change contains one production migration, a local-only baseline fixture, and a fail-closed regression harness. It does not change application UI, property publication, Storage, property policies, Railway, or production data.

## Vulnerability and root cause

The pre-E0 model combined an own-row UPDATE policy with a table-level UPDATE grant to `authenticated`. RLS correctly limited which row a user could update, but it did not limit which columns of that row could be changed. An authenticated viewer could therefore change their own `role` to `agent` or `admin` and could rewrite `created_at`. Cross-user writes remained blocked by RLS.

The threat model is any authenticated client that can call PostgREST directly. Client UI restrictions and user metadata are not authorization boundaries.

## Fix

The migration:

1. revokes historical client table privileges, including general UPDATE, INSERT, DELETE, and TRUNCATE;
2. restores SELECT for `authenticated`;
3. grants column-scoped UPDATE only for `full_name`, `phone`, and `avatar_url`;
4. leaves `id`, `role`, and `created_at` outside the client UPDATE surface;
5. adds `private.guard_profile_system_fields()` and the `e0_guard_profile_system_fields` trigger as defense in depth;
6. fails closed if `public.profiles` contains columns outside the six-column E0 baseline;
7. keeps existing RLS policies and the authorization functions unchanged.

Expected client privilege model:

| Principal | SELECT | UPDATE table | full_name | phone | avatar_url | id | role | created_at |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| authenticated | yes | no | yes | yes | yes | no | no | no |
| anon | no | no | no | no | no | no | no | no |

## RLS relationship

RLS continues to answer **which rows** the current user may see or update. Column privileges answer **which fields** may be changed. Both layers are required. E0 does not alter the existing own-row/admin policies.

## Defensive trigger

The trigger rejects changes to `id`, `role`, or `created_at` unless the effective database role is a trusted administrative role (`postgres` or `service_role`). It uses `SECURITY INVOKER` and `search_path = ''`. Its function is not directly executable by client roles.

This layer remains effective if a future change accidentally broadens UPDATE privileges. The security suite proves this by temporarily granting table UPDATE, attempting changes to `role`, `id`, and `created_at` over Auth + PostgREST, observing denial, and restoring then rechecking the hardened grants.

## Signup and authorization compatibility

`private.handle_new_user()` remains unchanged. A new local user receives a `viewer` profile. Client-controlled signup metadata such as `{"role":"admin"}` does not determine the stored role.

`private.is_agent()` and `private.is_admin()` remain unchanged. The suite verifies:

- viewer: agent=false, admin=false;
- legitimate agent: agent=true, admin=false;
- legitimate admin: agent=true, admin=true.

## Trusted administrative role changes

Role changes must use an explicitly trusted server-side administrative path whose database role is `postgres` or `service_role`. Never expose a service-role credential to browsers or mobile clients. Any future admin API must authenticate and authorize the operator independently before updating a role.

## Local reproducible test procedure

Prerequisites: Docker, Supabase CLI, Python 3, and the local stack started for this repository.

```bash
python3 tests/security/profile_authorization.py --rebuild
```

The harness refuses to run without `--rebuild`. Before reset it requires the local project ID, rejects a linked project reference, rejects `*.supabase.co` and non-loopback API/DB hosts, and ignores application credentials. It creates a temporary test-only workdir, installs the baseline fixture as the first local migration and E0 as the second, runs `supabase db reset --local --no-seed`, verifies local migration history, creates synthetic users through local Auth, and exercises updates through local PostgREST.

The fixture at `tests/security/fixtures/profiles_baseline.sql` is test-only and must never be applied to production.

## Rollout prerequisites

Before any production migration gate:

- review the PR and exact migration SHA;
- reconfirm production schema preconditions from metadata;
- confirm a current backup and rollback decision owner;
- run a dry-run or equivalent plan against an isolated schema;
- schedule observation of Auth, PostgREST, and application errors;
- require explicit production authorization;
- apply only the E0 migration, never the test fixture.

## Rollback

**SECURITY-SENSITIVE ROLLBACK — MANUAL AUTHORIZATION REQUIRED**

Do not automate restoration of the vulnerable table-level UPDATE grants. If an emergency rollback is required, prefer a fail-closed state: revoke client UPDATE, preserve read access where safe, diagnose the affected legitimate workflow, and introduce only the minimum reviewed column grants. Removing the defensive trigger or restoring client role updates requires a separate security review and explicit authorization.
