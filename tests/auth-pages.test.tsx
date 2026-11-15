// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "../app/login/page";
import Register from "../app/registro/page";
import AuthForm from "../app/components/AuthForm";

const auth = vi.hoisted(() => ({ verified: vi.fn(), redirect: vi.fn() }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: auth.verified }));
vi.mock("next/navigation", () => ({ redirect: auth.redirect }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});

describe.each([
  { name: "login", page: Login, mode: "login" },
  { name: "registration", page: Register, mode: "register" },
])("$name page session admission", ({ page, mode }) => {
  it.each([null, { id: "anonymous-user", is_anonymous: true }])("allows credentials for a visitor or Auth anonymous session: %j", async user => {
    auth.verified.mockResolvedValue({ user });
    expect(await page({ searchParams: Promise.resolve({ returnTo: "/publicar" }) })).toMatchObject({
      type: AuthForm, props: { mode, returnTo: "/publicar" },
    });
    expect(auth.redirect).not.toHaveBeenCalled();
  });

  it("retains the internal return route for a registered session", async () => {
    auth.verified.mockResolvedValue({ user: { id: "registered-user", is_anonymous: false } });
    await expect(page({ searchParams: Promise.resolve({ returnTo: "/publicar" }) })).rejects.toThrow("REDIRECT:/publicar");
  });

  it("sanitizes external return routes before rendering for an anonymous session", async () => {
    auth.verified.mockResolvedValue({ user: { id: "anonymous-user", is_anonymous: true } });
    expect(await page({ searchParams: Promise.resolve({ returnTo: "//external.invalid" }) })).toMatchObject({
      type: AuthForm, props: { returnTo: "/cuenta" },
    });
    expect(auth.redirect).not.toHaveBeenCalled();
  });
});
