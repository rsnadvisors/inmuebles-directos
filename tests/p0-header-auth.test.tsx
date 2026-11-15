import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteHeader from "../app/components/SiteHeader";

// Isolated UI contract: these doubles do not validate a Supabase session or RLS.
const stub = vi.hoisted(() => ({
  getUser: vi.fn(), profile: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../app/lib/auth-client", () => ({ getBrowserClient: () => ({
  auth: { getUser: stub.getUser, onAuthStateChange: stub.subscribe },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: stub.profile }) }) }),
}) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const signedIn = (email = "old@example.test") => ({ data: { user: { id: email, email } }, error: null });
const signedOut = { data: { user: null }, error: null };
function authChanged() { stub.subscribe.mock.calls[0][0]("SIGNED_OUT", null); }

beforeEach(() => {
  Object.values(stub).forEach(fn => fn.mockReset());
  stub.getUser.mockResolvedValue(signedOut);
  stub.profile.mockResolvedValue({ data: null, error: null });
  stub.subscribe.mockReturnValue({ data: { subscription: { unsubscribe: stub.unsubscribe } } });
});

describe("P0 header auth ordering (isolated, offline)", () => {
  it("ignores an older getUser result after sign-out in desktop and mobile navigation", async () => {
    const old = deferred<ReturnType<typeof signedIn>>();
    stub.getUser.mockReturnValueOnce(old.promise).mockResolvedValue(signedOut);
    render(<SiteHeader />);
    act(authChanged);
    await waitFor(() => expect(stub.getUser).toHaveBeenCalledTimes(2));
    await act(async () => { old.resolve(signedIn()); });
    expect(stub.profile).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "old@example.test" })).toBeNull();
    expect(screen.getByRole("link", { name: "Publicar gratis" }).getAttribute("href")).toBe("/login?returnTo=/publicar");
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    const menu = within(screen.getByRole("navigation", { name: "Menú móvil" }));
    expect(menu.getByRole("link", { name: "Iniciar sesión" })).toBeTruthy();
    expect(menu.queryByRole("link", { name: "Mi cuenta" })).toBeNull();
    expect(menu.getByRole("link", { name: "Publicar gratis" }).getAttribute("href")).toBe("/login?returnTo=/publicar");
  });

  it("ignores an older profile result after sign-out", async () => {
    const old = deferred<{ data: { full_name: string }; error: null }>();
    stub.getUser.mockResolvedValueOnce(signedIn()).mockResolvedValue(signedOut);
    stub.profile.mockReturnValueOnce(old.promise);
    render(<SiteHeader />);
    await waitFor(() => expect(stub.profile).toHaveBeenCalledOnce());
    act(authChanged);
    await waitFor(() => expect(stub.getUser).toHaveBeenCalledTimes(2));
    await act(async () => { old.resolve({ data: { full_name: "Cuenta anterior" }, error: null }); });
    expect(screen.queryByRole("link", { name: "Cuenta anterior" })).toBeNull();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeTruthy();
  });

  it("invalidates the pending profile before the deferred auth reload starts", async () => {
    const old = deferred<{ data: { full_name: string }; error: null }>();
    const next = deferred<typeof signedOut>();
    stub.getUser.mockResolvedValueOnce(signedIn()).mockReturnValue(next.promise);
    stub.profile.mockReturnValueOnce(old.promise);
    render(<SiteHeader />);
    await waitFor(() => expect(stub.profile).toHaveBeenCalledOnce());
    await act(async () => {
      authChanged();
      old.resolve({ data: { full_name: "Cuenta anterior" }, error: null });
    });
    expect(screen.queryByRole("link", { name: "Cuenta anterior" })).toBeNull();
    await act(async () => { next.resolve(signedOut); });
  });

  it("falls back to signed-out navigation when getUser rejects and can update on a later event", async () => {
    stub.getUser.mockRejectedValueOnce(new Error("synthetic offline failure")).mockResolvedValue(signedIn("next@example.test"));
    render(<SiteHeader />);
    await act(async () => {});
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeTruthy();
    act(authChanged);
    expect(await screen.findByRole("link", { name: "next@example.test" })).toBeTruthy();
  });

  it("uses the verified user's email when the optional profile request rejects", async () => {
    stub.getUser.mockResolvedValue(signedIn());
    stub.profile.mockRejectedValue(new Error("synthetic profile failure"));
    render(<SiteHeader />);
    expect(await screen.findByRole("link", { name: "old@example.test" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Publicar gratis" }).getAttribute("href")).toBe("/publicar");
  });

  it("unsubscribes and does not start queued auth work after unmount", async () => {
    const view = render(<SiteHeader />);
    await act(async () => {});
    act(authChanged);
    view.unmount();
    expect(stub.unsubscribe).toHaveBeenCalledOnce();
    // A timer turn flushes the deferred auth callback, without any real network.
    await act(async () => { await new Promise(done => setTimeout(done, 10)); });
    expect(stub.getUser).toHaveBeenCalledOnce();
  });
});
