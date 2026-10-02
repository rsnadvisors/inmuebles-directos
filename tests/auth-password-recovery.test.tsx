import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthForm from "../app/components/AuthForm";
import PasswordRecoveryForm, { RECOVERY_MESSAGE } from "../app/components/PasswordRecoveryForm";
import ResetPassword from "../app/restablecer-password/page";
import Login from "../app/login/page";
import { authOrigin, recoveryRedirect } from "../app/lib/auth-origin";

const stub = vi.hoisted(() => ({ request: vi.fn(), update: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), verified: vi.fn(), replace: vi.fn(), refresh: vi.fn(), available: true }));
vi.mock("../app/lib/auth-client", () => ({ getBrowserClient: () => stub.available ? { auth: {
  resetPasswordForEmail: stub.request, updateUser: stub.update, getUser: stub.getUser, signOut: stub.signOut,
  signInWithPassword: stub.signIn, signUp: stub.signUp,
} } : null }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: stub.verified }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: stub.replace, refresh: stub.refresh }), redirect: vi.fn() }));

beforeEach(() => {
  for (const value of Object.values(stub)) if (typeof value === "function") value.mockReset();
  stub.available = true;
  stub.request.mockResolvedValue({ data: {}, error: null });
  stub.getUser.mockResolvedValue({ data: { user: { id: "fixture-user" } }, error: null });
  stub.update.mockResolvedValue({ data: { user: { id: "fixture-user" } }, error: null });
  stub.signOut.mockResolvedValue({ error: null });
  stub.signIn.mockResolvedValue({ error: null });
  stub.verified.mockResolvedValue({ user: { id: "fixture-user" } });
});

function submitRequest(email = " QA@example.test ") {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: email } });
  fireEvent.submit(screen.getByLabelText("Correo electrónico").closest("form")!);
}
function submitReset(password = "fixture-password", confirmation = password) {
  fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), { target: { value: confirmation } });
  fireEvent.submit(screen.getByLabelText("Nueva contraseña").closest("form")!);
}

describe("password visibility", () => {
  it.each(["login", "register"] as const)("toggles %s without submitting or changing the password", mode => {
    render(<AuthForm mode={mode} returnTo="/cuenta" />);
    const input = screen.getByLabelText("Contraseña") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "fixture-password" } });
    expect(input.type).toBe("password");
    expect(input.autocomplete).toBe(mode === "login" ? "current-password" : "new-password");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(input.type).toBe("text");
    expect(input.value).toBe("fixture-password");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(input.type).toBe("password");
    expect(stub.signIn).not.toHaveBeenCalled();
    expect(stub.signUp).not.toHaveBeenCalled();
  });
  it("keeps registration confirmation independent", () => {
    render(<AuthForm mode="register" returnTo="/cuenta" />);
    const confirmation = screen.getByLabelText("Confirmar contraseña") as HTMLInputElement;
    fireEvent.change(confirmation, { target: { value: "fixture-password" } });
    const eye = screen.getByRole("button", { name: "Mostrar confirmar contraseña" });
    expect(eye.getAttribute("type")).toBe("button");
    fireEvent.click(eye);
    expect(confirmation.type).toBe("text");
    expect(confirmation.value).toBe("fixture-password");
    expect(screen.getByLabelText("Contraseña").getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar confirmar contraseña" }));
    expect(confirmation.type).toBe("password");
  });
  it.each(["Nueva contraseña", "Confirmar nueva contraseña"])("toggles reset field %s without update", label => {
    render(<PasswordRecoveryForm mode="reset" userId="fixture-user" />);
    const field = screen.getByLabelText(label) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "fixture-password" } });
    fireEvent.click(screen.getByRole("button", { name: `Mostrar ${label.toLowerCase()}` }));
    expect(field.type).toBe("text");
    expect(field.value).toBe("fixture-password");
    fireEvent.click(screen.getByRole("button", { name: `Ocultar ${label.toLowerCase()}` }));
    expect(field.type).toBe("password");
    expect(stub.update).not.toHaveBeenCalled();
  });
  it("links login to recovery and shows only a safe completion message", () => {
    render(<AuthForm mode="login" returnTo="/cuenta" passwordUpdated />);
    expect(screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).getAttribute("href")).toBe("/recuperar-password");
    expect(screen.getByRole("status").textContent).toContain("contraseña fue actualizada");
  });
});

describe("recovery request isolation and enumeration", () => {
  it("normalizes email and requests only the canonical callback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    render(<PasswordRecoveryForm mode="request" />);
    submitRequest();
    await waitFor(() => expect(stub.request).toHaveBeenCalledWith("qa@example.test", { redirectTo: "https://inmueblesdirectos.com/auth/callback?returnTo=%2Frestablecer-password" }));
    expect(screen.getByRole("status").textContent).toBe(RECOVERY_MESSAGE);
    expect((screen.getByRole("button", { name: "Enviar enlace" }) as HTMLButtonElement).disabled).toBe(true);
    vi.unstubAllEnvs();
  });
  it.each(["unknown-account", "rate-limit", "delivery-error", "network-error"])("uses identical neutral copy for %s", scenario => {
    if (scenario === "network-error") stub.request.mockRejectedValue(new Error("PRIVATE_PROVIDER_DETAIL"));
    else stub.request.mockResolvedValue({ data: null, error: { message: "PRIVATE_PROVIDER_DETAIL", code: scenario } });
    render(<PasswordRecoveryForm mode="request" />);
    submitRequest("unknown@example.test");
    return waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(RECOVERY_MESSAGE);
      expect(document.body.textContent).not.toContain("PRIVATE_PROVIDER_DETAIL");
    });
  });
  it("rejects malformed email without an Auth call", () => {
    render(<PasswordRecoveryForm mode="request" />);
    submitRequest("invalid");
    expect(stub.request).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("correo electrónico válido");
  });
  it("prevents immediate duplicate submits while pending", async () => {
    let resolve!: (value: unknown) => void;
    stub.request.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<PasswordRecoveryForm mode="request" />);
    submitRequest();
    const form = screen.getByLabelText("Correo electrónico").closest("form")!;
    fireEvent.submit(form);
    expect(stub.request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Enviando…" }).getAttribute("disabled")).not.toBeNull();
    resolve({ error: null });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(RECOVERY_MESSAGE));
  });
  it("handles missing configuration safely", () => {
    stub.available = false;
    render(<PasswordRecoveryForm mode="request" />);
    submitRequest();
    expect(stub.request).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("no está disponible");
  });
});

describe("trusted origin", () => {
  it.each(["https://evil.example", "//evil.example", "javascript:alert(1)", "https%3A%2F%2Fevil.example", "http://localhost:8080"])("production ignores supplied origin %s", input => {
    vi.stubEnv("NODE_ENV", "production");
    expect(recoveryRedirect(input)).toBe("https://inmueblesdirectos.com/auth/callback?returnTo=%2Frestablecer-password");
    vi.unstubAllEnvs();
  });
  it("permits loopback development only and rejects malformed/nonloopback origins", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(authOrigin("http://localhost:3112")).toBe("http://localhost:3112");
    expect(authOrigin("http://127.0.0.1:3112")).toBe("http://127.0.0.1:3112");
    for (const origin of ["https://evil.example", "//evil.example", "javascript:alert(1)", "\\evil.example"]) expect(authOrigin(origin)).toBe("https://inmueblesdirectos.com");
    vi.unstubAllEnvs();
  });
});

describe("verified self password update", () => {
  it("renders no update controls without a server-verified identity", () => {
    render(<PasswordRecoveryForm mode="reset" />);
    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();
    expect(screen.getByRole("link", { name: "Solicitar un nuevo enlace" })).toBeTruthy();
    expect(stub.update).not.toHaveBeenCalled();
  });
  it.each([null, { id: "anon", is_anonymous: true }])("server refuses unauthenticated/anonymous user %s", async user => {
    stub.verified.mockResolvedValue({ user });
    render(await ResetPassword());
    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();
  });
  it("server session verification failure fails closed", async () => {
    stub.verified.mockRejectedValue(new Error("PRIVATE_ERROR"));
    render(await ResetPassword());
    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();
    expect(document.body.textContent).not.toContain("PRIVATE_ERROR");
  });
  it("allows deliberate own-password change for a verified regular session", async () => {
    render(await ResetPassword());
    expect(screen.getByLabelText("Nueva contraseña")).toBeTruthy();
    expect(screen.getByText(/tu cuenta en esta sesión verificada/)).toBeTruthy();
  });
  it.each(["short", "1234567"])("rejects password below eight characters: %s", password => {
    render(<PasswordRecoveryForm mode="reset" userId="fixture-user" />);
    submitReset(password);
    expect(stub.update).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("8 caracteres");
  });
  it("rejects mismatch before verifying/updating", () => {
    render(<PasswordRecoveryForm mode="reset" userId="fixture-user" />);
    submitReset("fixture-password", "different-password");
    expect(stub.getUser).not.toHaveBeenCalled();
    expect(stub.update).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("no coinciden");
  });
  it.each([null, { id: "other-user" }, { id: "fixture-user", is_anonymous: true }])("blocks missing/changed/anonymous identity at submit: %s", async user => {
    stub.getUser.mockResolvedValue({ data: { user }, error: null });
    render(<PasswordRecoveryForm mode="reset" userId="fixture-user" />);
    submitReset();
    await waitFor(() => expect(screen.queryByLabelText("Nueva contraseña")).toBeNull());
    expect(stub.update).not.toHaveBeenCalled();
  });
  it("denies stale session even if an error includes a user", async () => {
    stub.getUser.mockResolvedValue({ data: { user: { id: "fixture-user" } }, error: { message: "expired" } });
    render(<PasswordRecoveryForm mode="reset" userId="fixture-user" />);
    submitReset();
    await waitFor(() => expect(screen.queryByLabelText("Nueva contraseña")).toBeNull());
    expect(stub.update).not.toHaveBeenCalled();
  });
  it("updates only password then locally signs out and returns to login", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    render(<PasswordRecoveryForm mode="reset" userId="fixture-user" />);
    submitReset("12345678");
    await waitFor(() => expect(stub.replace).toHaveBeenCalledWith("/login?status=password-updated"));
    expect(stub.update).toHaveBeenCalledWith({ password: "12345678" });
    expect(stub.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(stub.getUser.mock.invocationCallOrder[0]).toBeLessThan(stub.update.mock.invocationCallOrder[0]);
    expect(stub.update.mock.invocationCallOrder[0]).toBeLessThan(stub.signOut.mock.invocationCallOrder[0]);
    expect(JSON.stringify([...info.mock.calls, ...log.mock.calls])).not.toContain("12345678");
  });
  it("safe update failure never signs out or navigates", async () => {
    stub.update.mockResolvedValue({ error: { message: "PRIVATE_PASSWORD_ERROR" } });
    render(<PasswordRecoveryForm mode="reset" userId="fixture-user" />);
    submitReset();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("No pudimos actualizar"));
    expect(document.body.textContent).not.toContain("PRIVATE_PASSWORD_ERROR");
    expect(stub.signOut).not.toHaveBeenCalled();
    expect(stub.replace).not.toHaveBeenCalled();
  });
  it("retries only local sign-out when password changed but logout failed", async () => {
    stub.signOut.mockResolvedValueOnce({ error: { message: "PRIVATE_ERROR" } }).mockResolvedValueOnce({ error: null });
    render(<PasswordRecoveryForm mode="reset" userId="fixture-user" />);
    submitReset();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cerrar esta sesión" })).toBeTruthy());
    expect(stub.replace).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();
    fireEvent.submit(screen.getByRole("button", { name: "Cerrar esta sesión" }).closest("form")!);
    await waitFor(() => expect(stub.replace).toHaveBeenCalledWith("/login?status=password-updated"));
    expect(stub.update).toHaveBeenCalledTimes(1);
  });
  it("handles a thrown sign-out after update without asking to update twice", async () => {
    stub.signOut.mockRejectedValue(new Error("PRIVATE_ERROR"));
    render(<PasswordRecoveryForm mode="reset" userId="fixture-user" />);
    submitReset();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("fue actualizada"));
    expect(stub.replace).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();
  });
  it("shows the completion message on login only for the fixed status indicator", async () => {
    stub.verified.mockResolvedValue({ user: null });
    render(await Login({ searchParams: Promise.resolve({ status: "password-updated" }) }));
    expect(screen.getByRole("status").textContent).toContain("Ya puedes iniciar sesión");
  });
});
