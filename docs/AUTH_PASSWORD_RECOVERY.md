# Password recovery and visibility

The recovery request uses the installed Supabase public client and
`resetPasswordForEmail`. Production redirects use the fixed origin
`https://inmueblesdirectos.com`, through `/auth/callback` to
`/restablecer-password`. Development allows only a loopback origin.
PKCE requires opening the email in the same browser and profile. Provider
errors and unknown addresses receive the same neutral response; delivery is
not promised. The request button remains disabled after this response to
prevent immediate repeated submissions.

The callback exchanges the code through the existing SSR client, preserves
session cookies and existing signup diagnostics, and never logs secrets.
The SDK recovery flow hint only selects the destination; it is not proof of
authorization. Query parameters do not authorize password updates.

The reset page requires server-verified `getUser`, rejects anonymous users,
and re-verifies the same user ID immediately before `updateUser({ password })`.
There is no durable, independently trusted recovery-only marker in this
application. Deliberately, an already authenticated user can also change
their own password here. The page explains that behavior. It does not create
an identity, replace a profile, or modify roles or Dashboard memberships.

Passwords require at least eight characters and matching confirmation; the
provider remains authoritative for additional password policy. Successful
updates use `signOut({ scope: "local" })`, then return to login with a safe
completion message. If logout fails, the UI says the password was updated
and retries logout without repeating the password update. This does not
revoke other sessions; existing access JWTs can remain valid until expiry.

Each password field uses an independent, accessible, 44px eye button. The
button never submits the form. Passwords remain only in the current form
and transient request variables, with normal password-manager autocomplete;
the application does not persist or log them.

Validation uses synthetic tests and a loopback-only visual mock. It does
not prove real SMTP delivery or real production recovery; those require a
separate authorized human acceptance gate. No production email, password
reset, Auth admin operation, migration, RBAC change or deployment is part
of this implementation.
