import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthForm from "../app/components/AuthForm";
import PasswordRecoveryForm from "../app/components/PasswordRecoveryForm";
import PropertyPage from "../app/inmueble/[slug]/page";
import { properties } from "./fixtures/properties";
import { setInventory } from "./mocks/supabase";

const stub = vi.hoisted(() => ({ signIn: vi.fn(), request: vi.fn() }));
vi.mock("next/navigation", async original => ({ ...(await original<object>()), useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../app/lib/auth-client", () => ({ getBrowserClient: () => ({ auth: {
  signInWithPassword: stub.signIn, resetPasswordForEmail: stub.request,
  getUser: async () => ({ data: { user: null }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
} }) }));

beforeEach(() => {
  stub.signIn.mockReset().mockResolvedValue({ error: null });
  stub.request.mockReset().mockResolvedValue({ error: null });
});

function fillLogin() {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "a@example.test" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "x" } });
  return screen.getByLabelText("Correo electrónico").closest("form")!;
}

describe("Turnstile en formularios de Auth", () => {
  it("no llama a Supabase sin token y pide esperar la verificación", () => {
    delete (window as unknown as { turnstile?: unknown }).turnstile; // jsdom no carga el script remoto
    render(<AuthForm mode="login" returnTo="/" />);
    fireEvent.submit(fillLogin());
    expect(stub.signIn).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("verificación de seguridad");
    expect(document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]')).not.toBeNull();
  });
  it("usa un token nuevo en cada intento de login", async () => {
    stub.signIn.mockResolvedValue({ error: { message: "x" } });
    render(<AuthForm mode="login" returnTo="/" />);
    const form = fillLogin();
    fireEvent.submit(form);
    await waitFor(() => expect(stub.signIn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar" }).hasAttribute("disabled")).toBe(false));
    fireEvent.submit(form);
    await waitFor(() => expect(stub.signIn).toHaveBeenCalledTimes(2));
    const [first, second] = stub.signIn.mock.calls.map(call => call[0].options.captchaToken);
    expect(first).toMatch(/^test-turnstile-/);
    expect(second).not.toBe(first);
  });
  it("informa el rechazo de CAPTCHA en recuperación sin revelar detalles del proveedor", async () => {
    stub.request.mockResolvedValue({ error: { code: "captcha_failed", message: "PRIVATE_PROVIDER_DETAIL" } });
    render(<PasswordRecoveryForm mode="request" />);
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "a@example.test" } });
    fireEvent.submit(screen.getByLabelText("Correo electrónico").closest("form")!);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("verificación de seguridad"));
    expect(stub.request.mock.calls[0][1].captchaToken).toMatch(/^test-turnstile-/);
    expect(document.body.textContent).not.toContain("PRIVATE_PROVIDER_DETAIL");
  });
});

describe("denuncia de anuncios", () => {
  it("la ficha ofrece un enlace de denuncia con la URL del anuncio", async () => {
    setInventory([{ ...properties[0], country: "Perú", published_at: "2026-09-01T00:00:00Z" }]);
    render(await PropertyPage({ params: Promise.resolve({ slug: "fixture-house" }) }));
    const href = screen.getByRole("link", { name: "Denunciar este anuncio" }).getAttribute("href")!;
    expect(href.startsWith("mailto:casasyterrenosenpiura@gmail.com?subject=Denuncia%20de%20anuncio")).toBe(true);
    expect(decodeURIComponent(href)).toContain("/inmueble/fixture-house");
  });
});

describe("migración antispam", () => {
  const sql = readFileSync("supabase/migrations/20261115190000_antispam_limits.sql", "utf8");
  it("limita a 5 intentos nuevos en 24 h y cierra las inserciones anónimas", () => {
    expect(sql).toMatch(/before insert on private\.publication_attempts/);
    expect(sql).toMatch(/interval '24 hours'\) >= 5/);
    expect(sql).toMatch(/raise exception 'PUBLICATION_DAILY_LIMIT'/);
    expect(sql).toMatch(/revoke insert on public\.leads, public\.property_views from anon, authenticated/);
    expect(sql).toMatch(/drop policy if exists "public can insert leads for published properties"/);
    expect(sql).toMatch(/drop policy if exists "public can insert views for published properties"/);
  });
});
