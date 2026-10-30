// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVerifiedPublicationUser, getVerifiedUser } from "../app/lib/auth-server";
import { POST } from "../app/api/publicar/route";
import PublishLayout from "../app/publicar/layout";
import PublicationRecovery from "../app/publicar/PublicationRecovery";
import { MAX_REQUEST_BYTES } from "../app/lib/publication";

const provider = vi.hoisted(() => ({
  create: vi.fn(), getUser: vi.fn(), getSession: vi.fn(), cookies: vi.fn(),
  rpc: vi.fn(), storageFrom: vi.fn(), delivery: vi.fn(), redirect: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: provider.create }));
vi.mock("next/headers", () => ({ cookies: provider.cookies }));
vi.mock("next/navigation", () => ({ redirect: provider.redirect }));
vi.mock("../app/lib/property-images", () => ({
  PRIVATE_PROPERTY_IMAGE_BUCKET: "property-images-private",
  anonymousImageClient: provider.delivery, loadPublishedPrivateImage: provider.delivery,
}));

const registeredUser = {
  id: "11111111-1111-4111-8111-111111111111", is_anonymous: false,
  email: "publisher@example.invalid", email_confirmed_at: "2026-10-01T00:00:00Z",
};
const client = {
  auth: { getUser: provider.getUser, getSession: provider.getSession },
  rpc: provider.rpc, storage: { from: provider.storageFrom },
};
const deniedIdentities = [
  { label: "Auth anonymous even with confirmation attributes", user: { ...registeredUser, is_anonymous: true } },
  { label: "missing anonymous classification", user: { ...registeredUser, is_anonymous: undefined } },
  { label: "unconfirmed email", user: { ...registeredUser, email_confirmed_at: undefined } },
  { label: "missing email", user: { ...registeredUser, email: undefined } },
  { label: "blank email", user: { ...registeredUser, email: "  " } },
  { label: "blank confirmation", user: { ...registeredUser, email_confirmed_at: " " } },
  { label: "invalid confirmation", user: { ...registeredUser, email_confirmed_at: "not-a-date" } },
  { label: "missing user identifier", user: { ...registeredUser, id: "" } },
  { label: "metadata claiming confirmation", user: { ...registeredUser, email_confirmed_at: undefined,
    user_metadata: { email_verified: true, email_confirmed_at: registeredUser.email_confirmed_at } } },
  { label: "phone/general confirmation only", user: { ...registeredUser, email_confirmed_at: undefined,
    confirmed_at: registeredUser.email_confirmed_at, phone_confirmed_at: registeredUser.email_confirmed_at } },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:9999");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon");
  provider.cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
  provider.create.mockReturnValue(client);
  provider.getUser.mockResolvedValue({ data: { user: { ...registeredUser } }, error: null });
  provider.redirect.mockImplementation((location: string) => { throw new Error(`REDIRECT:${location}`); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("provider-verified publication identity", () => {
  it("admits a registered user with provider-confirmed email using getUser", async () => {
    const result = await getVerifiedPublicationUser();
    expect(result).toEqual({ client, user: registeredUser, reason: null });
    expect(provider.getUser).toHaveBeenCalledOnce();
    expect(provider.getUser).toHaveBeenCalledWith();
    expect(provider.getSession).not.toHaveBeenCalled();
  });
  it.each(deniedIdentities)("denies $label", async ({ user }) => {
    provider.getUser.mockResolvedValue({ data: { user }, error: null });
    expect(await getVerifiedPublicationUser()).toEqual({ client: null, user: null, reason: "PUBLICATION_IDENTITY_REQUIRED" });
  });
  it("preserves generic authentication for verified identities ineligible for new publication", async () => {
    for (const user of [{ ...registeredUser, email_confirmed_at: undefined }, { ...registeredUser, is_anonymous: true }]) {
      provider.getUser.mockResolvedValue({ data: { user }, error: null });
      expect(await getVerifiedUser()).toEqual({ client, user });
      expect((await getVerifiedPublicationUser()).user).toBeNull();
    }
  });
});

describe("publication API identity admission before expensive work", () => {
  function multipartRequest() {
    return new Request("http://localhost/api/publicar", {
      method: "POST", body: "unparsed multipart content",
      headers: { origin: "http://localhost", "content-type": "multipart/form-data; boundary=fixture",
        "content-length": String(MAX_REQUEST_BYTES + 1),
        "x-publication-request-id": "22222222-2222-4222-8222-222222222222" },
    });
  }
  async function expectEarlyDenial(status: number, code: string) {
    const request = multipartRequest();
    const read = vi.spyOn(request.body!, "getReader");
    const parse = vi.spyOn(request, "formData");
    const response = await POST(request);
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.code).toBe(code);
    expect(body).not.toHaveProperty("preparation");
    expect(body).not.toHaveProperty("subject");
    expect(JSON.stringify(body)).not.toContain("PRIVATE_PROVIDER_DETAIL");
    expect(read).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
    expect(provider.getSession).not.toHaveBeenCalled();
    expect(provider.rpc).not.toHaveBeenCalled();
    expect(provider.storageFrom).not.toHaveBeenCalled();
    expect(provider.delivery).not.toHaveBeenCalled();
  }
  it.each(deniedIdentities)("rejects $label before oversized multipart, RPC or Storage", async ({ user }) => {
    provider.getUser.mockResolvedValue({ data: { user }, error: null });
    await expectEarlyDenial(403, "PUBLICATION_IDENTITY_REQUIRED");
  });
  it("rejects absence of a verified session", async () => {
    provider.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expectEarlyDenial(401, "AUTH_REQUIRED");
  });
  it("rejects a session reported revoked by the provider", async () => {
    // Simulates a provider rejection; does not establish live revocation semantics.
    provider.getUser.mockResolvedValue({ data: { user: null }, error: { code: "session_not_found", message: "PRIVATE_PROVIDER_DETAIL" } });
    await expectEarlyDenial(401, "AUTH_REQUIRED");
  });
  it("rejects provider errors even when a user is also returned", async () => {
    provider.getUser.mockResolvedValue({ data: { user: registeredUser }, error: { message: "PRIVATE_PROVIDER_DETAIL" } });
    await expectEarlyDenial(401, "AUTH_REQUIRED");
  });
  it("fails closed when the provider throws without exposing details", async () => {
    provider.getUser.mockRejectedValueOnce(new Error("PRIVATE_PROVIDER_DETAIL"));
    await expectEarlyDenial(503, "PUBLICATION_FAILED");
  });
  it("fails closed on an incomplete provider response", async () => {
    provider.getUser.mockResolvedValue({ data: null, error: null });
    await expectEarlyDenial(503, "PUBLICATION_FAILED");
  });
  it("retains denial when the authentication client is unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await expectEarlyDenial(401, "AUTH_REQUIRED");
    expect(provider.create).not.toHaveBeenCalled();
  });
  it("still checks origin before authentication", async () => {
    const request = new Request("http://localhost/api/publicar", {
      method: "POST", headers: { origin: "https://other.invalid" }, body: "ignored",
    });
    expect((await POST(request)).status).toBe(403);
    expect(provider.getUser).not.toHaveBeenCalled();
  });
  it("lets an eligible identity reach normal payload validation", async () => {
    const request = new Request("http://localhost/api/publicar", {
      method: "POST", headers: { origin: "http://localhost", "x-publication-request-id": "22222222-2222-4222-8222-222222222222" }, body: new FormData(),
    });
    const read = vi.spyOn(request.body!, "getReader");
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR", preparation: "NOT_STARTED",
      requestId: "22222222-2222-4222-8222-222222222222", subject: registeredUser.id });
    expect(read).toHaveBeenCalledOnce();
    expect(provider.getUser).toHaveBeenCalledOnce();
    expect(provider.rpc).not.toHaveBeenCalled();
    expect(provider.storageFrom).not.toHaveBeenCalled();
  });
});

describe("publication layout identity boundary", () => {
  it("returns the publication UI only for an eligible identity", async () => {
    expect(await PublishLayout({ children: "publication form" })).toMatchObject({ type: PublicationRecovery,
      props: { userId: registeredUser.id, canPublish: true, children: "publication form" } });
    expect(provider.getUser).toHaveBeenCalledOnce();
    expect(provider.redirect).not.toHaveBeenCalled();
  });
  it("redirects an unauthenticated visitor to login", async () => {
    provider.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(PublishLayout({ children: "publication form" })).rejects.toThrow("REDIRECT:/login?returnTo=/publicar");
  });
  it.each(deniedIdentities.filter(({ user }) => !!user.id))("offers only recovery for $label without a login redirect loop", async ({ user }) => {
    provider.getUser.mockResolvedValue({ data: { user }, error: null });
    const result = await PublishLayout({ children: "publication form" });
    expect(result).toMatchObject({ type: PublicationRecovery, props: { userId: user.id, canPublish: false } });
    expect((result as any).props.children).toBeUndefined();
    expect(provider.getUser).toHaveBeenCalledTimes(2);
    expect(provider.redirect).not.toHaveBeenCalled();
  });
  it("withholds children and provider details on verification failure", async () => {
    provider.getUser.mockRejectedValueOnce(new Error("PRIVATE_PROVIDER_DETAIL"));
    const result = await PublishLayout({ children: "publication form" });
    expect(result).toMatchObject({ type: "p", props: { children: "No pudimos verificar tu cuenta. Vuelve a intentarlo más tarde." } });
    expect(provider.redirect).not.toHaveBeenCalled();
  });
  it("denies recovery for an identity without a usable identifier", async () => {
    provider.getUser.mockResolvedValue({ data: { user: { ...registeredUser, id: "" } }, error: null });
    expect(await PublishLayout({ children: "publication form" })).toMatchObject({ type: "p" });
    expect(provider.rpc).not.toHaveBeenCalled();
    expect(provider.storageFrom).not.toHaveBeenCalled();
  });
  it("fails closed if the additional recovery identity verification throws", async () => {
    provider.getUser.mockResolvedValueOnce({ data: { user: { ...registeredUser, is_anonymous: true } }, error: null })
      .mockRejectedValueOnce(new Error("PRIVATE_PROVIDER_DETAIL"));
    expect(await PublishLayout({ children: "publication form" })).toMatchObject({ type: "p",
      props: { children: "No pudimos verificar tu cuenta. Vuelve a intentarlo más tarde." } });
  });
  it("redirects if the recovery verification no longer has a session", async () => {
    provider.getUser.mockResolvedValueOnce({ data: { user: { ...registeredUser, email_confirmed_at: undefined } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(PublishLayout({ children: "publication form" })).rejects.toThrow("REDIRECT:/login?returnTo=/publicar");
  });
  it("does not upgrade recovery to publishing if identity changes between verifications", async () => {
    provider.getUser.mockResolvedValueOnce({ data: { user: { ...registeredUser, is_anonymous: true } }, error: null })
      .mockResolvedValueOnce({ data: { user: { ...registeredUser, id: "44444444-4444-4444-8444-444444444444" } }, error: null });
    expect(await PublishLayout({ children: "publication form" })).toMatchObject({ type: PublicationRecovery,
      props: { userId: "44444444-4444-4444-8444-444444444444", canPublish: false } });
  });
});
