import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({ verified: vi.fn(), rpc: vi.fn(), refresh: vi.fn() }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: stubs.verified }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: stubs.refresh, push: vi.fn(), replace: vi.fn() }) }));

import ShareListing, { shareLinks } from "../app/components/ShareListing";
import ListingActions from "../app/components/account/ListingActions";
import { POST as manage } from "../app/api/mis-propiedades/route";

const ID = "34da4627-df58-4b7d-bff8-e51f1fd7190b";
const URL_ = `https://inmueblesdirectosperu.com/inmueble/casa-${ID}`;
const post = (body: unknown) => new Request("http://localhost:3103/api/mis-propiedades", { method: "POST", body: JSON.stringify(body), headers: { origin: "http://localhost:3103", "content-type": "application/json" } });
beforeEach(() => {
  stubs.rpc.mockReset().mockResolvedValue({ data: { requested: true }, error: null });
  stubs.verified.mockResolvedValue({ client: { rpc: stubs.rpc }, user: { id: "u1" } });
  stubs.refresh.mockReset();
});

describe("compartir anuncios", () => {
  it("arma enlaces de WhatsApp y Facebook con el título y la URL codificados", () => {
    const links = shareLinks(URL_, "Casa & jardín");
    expect(decodeURIComponent(links.whatsapp.split("text=")[1])).toBe(`Casa & jardín · ${URL_}`);
    expect(links.facebook).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(URL_)}`);
  });
  it("copia el enlace y lo confirma", async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    render(<ShareListing url={URL_} title="Casa" />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "¡Enlace copiado!" })).toBeTruthy());
    expect(write).toHaveBeenCalledWith(URL_);
  });
  it("Mis propiedades ofrece compartir solo los anuncios publicados", () => {
    const base = { id: ID, title: "Casa", slug: `casa-${ID}`, listingType: "sale", isReserved: false, ownerPaused: false, deletionRequestedAt: null, publishedAt: "2026-11-01", siteOrigin: "https://inmueblesdirectosperu.com" };
    const { unmount } = render(<ListingActions {...base} status="published" />);
    expect(screen.getByRole("group", { name: "Compartir este anuncio" })).toBeTruthy();
    unmount();
    render(<ListingActions {...base} status="sold" />);
    expect(screen.queryByRole("group", { name: "Compartir este anuncio" })).toBeNull();
  });
});

describe("moderación visible", () => {
  const moderated = { id: ID, title: "Casa", slug: "casa", status: "archived", listingType: "sale", isReserved: false, ownerPaused: false, deletionRequestedAt: null, publishedAt: "2026-11-01" };
  it("muestra el motivo y permite pedir una revisión con mensaje", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    render(<ListingActions {...moderated} moderationNote="Las fotos no corresponden al inmueble" reviewRequestedAt={null} />);
    expect(screen.getByText(/Motivo: Las fotos no corresponden al inmueble/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pedir revisión" }));
    fireEvent.change(screen.getByLabelText(/Qué corregiste/), { target: { value: "Cambié las fotos por las reales del inmueble." } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
    await waitFor(() => expect(stubs.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toEqual({ op: "review-request", id: ID, message: "Cambié las fotos por las reales del inmueble." });
  });
  it("si ya pidió revisión no deja pedir otra", () => {
    render(<ListingActions {...moderated} moderationNote={null} reviewRequestedAt="2026-11-16T10:00:00Z" />);
    expect(screen.queryByRole("button", { name: "Pedir revisión" })).toBeNull();
    expect(screen.getByText(/Ya pediste una revisión/)).toBeTruthy();
  });
  it("la ruta valida el largo del mensaje y traduce la solicitud repetida", async () => {
    expect((await manage(post({ op: "review-request", id: ID, message: "corto" }))).status).toBe(400);
    expect(stubs.rpc).not.toHaveBeenCalled();
    stubs.rpc.mockResolvedValue({ data: null, error: { message: "REVIEW_ALREADY_REQUESTED" } });
    const response = await manage(post({ op: "review-request", id: ID, message: "Ya corregí el precio del anuncio." }));
    expect(response.status).toBe(409);
    expect(stubs.rpc).toHaveBeenCalledWith("owner_request_review", { p_id: ID, p_message: "Ya corregí el precio del anuncio." });
  });
  it("la migración limpia motivo y solicitud al volver a publicar y no concede nada a anon", () => {
    const sql = readFileSync("supabase/migrations/20261116090000_moderation_transparency.sql", "utf8");
    expect(sql).toMatch(/if new\.status = 'published' then\s+new\.moderation_note := null;\s+new\.review_requested_at := null;/);
    expect(sql).not.toMatch(/grant [^;]* to [^;]*anon/);
    expect(sql).toMatch(/r\.status <> 'archived' or r\.owner_paused or r\.deletion_requested_at is not null/);
  });
});
