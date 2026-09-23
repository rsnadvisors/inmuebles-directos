import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthForm from "../app/components/AuthForm";
import SiteHeader from "../app/components/SiteHeader";
import SignOutButton from "../app/components/SignOutButton";

const stub = vi.hoisted(() => ({
  signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), getUser: vi.fn(), profile: vi.fn(), onAuthStateChange: vi.fn(),
  replace: vi.fn(), refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: stub.replace, refresh: stub.refresh }) }));
vi.mock("../app/lib/auth-client", () => ({ getBrowserClient: () => ({
  auth: { signInWithPassword: stub.signIn, signUp: stub.signUp, signOut: stub.signOut, getUser: stub.getUser, onAuthStateChange: stub.onAuthStateChange },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: stub.profile }) }) }),
}) }));

beforeEach(() => {
  Object.values(stub).forEach(value => value.mockReset());
  stub.signIn.mockResolvedValue({ error: null });
  stub.signUp.mockResolvedValue({ data: { session: null }, error: null });
  stub.signOut.mockResolvedValue({ error: null });
  stub.getUser.mockResolvedValue({ data: { user: null }, error: null });
  stub.profile.mockResolvedValue({ data: null, error: null });
  stub.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe("Supabase Auth UX", () => {
  it("logs in and navigates only to the validated internal return route", async () => {
    render(<AuthForm mode="login" returnTo="/publicar" />);
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: " user@example.test " } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "synthetic-password" } });
    fireEvent.submit(screen.getByLabelText("Correo electrónico").closest("form")!);
    await waitFor(() => expect(stub.signIn).toHaveBeenCalledWith({ email: "user@example.test", password: "synthetic-password" }));
    expect(stub.replace).toHaveBeenCalledWith("/publicar");
  });
  it("rejects mismatched registration passwords before any Auth call", () => {
    render(<AuthForm mode="register" returnTo="//evil.test" />);
    fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: "Usuario Prueba" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "u@example.test" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "12345678" } });
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: "different" } });
    fireEvent.submit(screen.getByLabelText("Correo electrónico").closest("form")!);
    expect(stub.signUp).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("no coinciden");
  });
  it("creates an unprivileged signup request with a safe confirmation URL", async () => {
    render(<AuthForm mode="register" returnTo="/publicar" />);
    fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: "Usuario Prueba" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "u@example.test" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "12345678" } });
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), { target: { value: "12345678" } });
    fireEvent.submit(screen.getByLabelText("Correo electrónico").closest("form")!);
    await waitFor(() => expect(stub.signUp).toHaveBeenCalledOnce());
    const options = stub.signUp.mock.calls[0][0].options;
    expect(options.data).toEqual({ full_name: "Usuario Prueba" });
    expect(options.data.role).toBeUndefined();
    expect(options.emailRedirectTo).toContain("returnTo=%2Fpublicar");
    expect(screen.getByRole("status").textContent).toContain("Revisa tu correo");
  });
  it("handles logout success and failure without pretending a failed logout succeeded", async () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(stub.replace).toHaveBeenCalledWith("/"));
  });
  it("shows email rather than a null profile name in the authenticated header", async () => {
    stub.getUser.mockResolvedValue({ data: { user: { id: "synthetic-user", email: "u@example.test" } }, error: null });
    render(<SiteHeader />);
    await waitFor(() => expect(screen.getByRole("link", { name: "u@example.test" })).toBeTruthy());
    expect(screen.queryByText(/Usuario null|undefined/)).toBeNull();
    expect(screen.getByRole("link", { name: "Publicar gratis" }).getAttribute("href")).toBe("/publicar");
  });
});
