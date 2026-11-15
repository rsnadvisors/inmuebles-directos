import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { moved, sniffImage, withCover } from "../app/lib/listing-photos";

const stubs = vi.hoisted(() => ({ verified: vi.fn(), rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), rows: vi.fn(), refresh: vi.fn(), cookieDelete: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: stubs.refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [{ name: "sb-ref-auth-token" }, { name: "otra" }], delete: stubs.cookieDelete }) }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: stubs.verified }));

import { POST as manage } from "../app/api/mis-propiedades/route";
import { POST as deleteAccount } from "../app/api/mi-cuenta/eliminar/route";
import { GET as downloadData } from "../app/api/mi-cuenta/datos/route";
import PhotoManager from "../app/components/account/PhotoManager";
import DeleteAccountForm from "../app/components/account/DeleteAccountForm";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "34da4627-df58-4b7d-bff8-e51f1fd7190b";
const IMG = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const ORIGIN = "http://localhost:3103";

function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) chain[m] = () => chain;
  chain.maybeSingle = async () => result;
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}
function client() {
  return {
    rpc: stubs.rpc,
    from: (table: string) => query(stubs.rows(table)),
    storage: { from: () => ({ upload: stubs.upload, remove: stubs.remove }) },
  };
}
const photoRequest = (form: FormData, origin = ORIGIN) => new Request(`${ORIGIN}/api/mis-propiedades/fotos`, { method: "POST", body: form, headers: { origin } });
const jsonRequest = (url: string, body: unknown) => new Request(`${ORIGIN}${url}`, { method: "POST", body: JSON.stringify(body), headers: { origin: ORIGIN, "content-type": "application/json" } });
function photoForm(bytes: Uint8Array = PNG, type = "image/png") {
  const form = new FormData(); form.set("id", ID); form.set("image", new File([bytes as BlobPart], "x.png", { type })); return form;
}

beforeEach(() => {
  stubs.verified.mockResolvedValue({ client: client(), user: { id: OWNER, email: "dueno@example.test", user_metadata: { legal_version: "2026-11-15" } } });
  stubs.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === "owner_begin_image_upload") return { data: { image_id: IMG[0], path: `${OWNER}/${ID}/${IMG[0]}.png` }, error: null };
    if (name === "owner_finish_image_upload") return { data: { accepted: true, image_id: IMG[0] }, error: null };
    if (name === "owner_pending_image_cleanup") return { data: { paths: [] }, error: null };
    if (name === "owner_begin_listing_deletion") return { data: { paths: [`${OWNER}/${ID}/a.png`] }, error: null };
    return { data: { ok: true }, error: null };
  });
  stubs.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  stubs.remove.mockReset().mockResolvedValue({ data: [], error: null });
  stubs.rows.mockReset().mockReturnValue({ data: [], error: null });
  stubs.refresh.mockReset(); stubs.cookieDelete.mockReset();
});

describe("utilidades de fotos", () => {
  it("reconoce JPG, PNG y WebP por su firma, no por el nombre", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
  it("portada y movimientos", () => {
    expect(withCover(IMG, IMG[2])).toEqual([IMG[2], IMG[0], IMG[1]]);
    expect(moved(IMG, IMG[0], 1)).toEqual([IMG[1], IMG[0], IMG[2]]);
    expect(moved(IMG, IMG[0], -1)).toEqual(IMG);
  });
});

describe("quitar y ordenar fotos", () => {
  it("quita una foto y limpia los bytes pendientes", async () => {
    const response = await manage(jsonRequest("/api/mis-propiedades", { op: "image-remove", id: ID, imageId: IMG[1] }));
    expect(response.status).toBe(200);
    expect(stubs.rpc).toHaveBeenCalledWith("owner_remove_listing_image", { p_id: ID, p_image_id: IMG[1] });
    expect(stubs.rpc).toHaveBeenCalledWith("owner_pending_image_cleanup");
  });
  it("ordena con ids válidos y rechaza listas raras", async () => {
    expect((await manage(jsonRequest("/api/mis-propiedades", { op: "image-order", id: ID, order: IMG }))).status).toBe(200);
    expect(stubs.rpc).toHaveBeenCalledWith("owner_set_image_order", { p_id: ID, p_order: IMG });
    for (const order of [[], ["x"], [...IMG, ...IMG]]) expect((await manage(jsonRequest("/api/mis-propiedades", { op: "image-order", id: ID, order }))).status).toBe(400);
  });
  it("la última foto no se puede quitar", async () => {
    stubs.rpc.mockResolvedValue({ data: null, error: { message: "LAST_IMAGE" } });
    const response = await manage(jsonRequest("/api/mis-propiedades", { op: "image-remove", id: ID, imageId: IMG[0] }));
    expect(response.status).toBe(409); expect((await response.json()).message).toContain("al menos una foto");
  });
});

describe("gestor de fotos", () => {
  const photos = IMG.map(id => ({ id, src: `/api/property-images/${id}` }));
  it("marca la portada y envía el nuevo orden al elegir otra", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    render(<PhotoManager listingId={ID} photos={photos} />);
    expect(screen.getAllByText("Portada")).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Hacer portada" })[1]);
    await waitFor(() => expect(stubs.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toEqual({ id: ID, op: "image-order", order: [IMG[2], IMG[0], IMG[1]] });
  });
  it("con una sola foto no permite quitarla y con 5 no ofrece añadir", () => {
    const { unmount } = render(<PhotoManager listingId={ID} photos={photos.slice(0, 1)} />);
    expect(screen.getByRole("button", { name: "Quitar" }).hasAttribute("disabled")).toBe(true);
    unmount();
    render(<PhotoManager listingId={ID} photos={[...photos, ...photos.slice(0, 2)].map((p, i) => ({ ...p, id: `${p.id}-${i}` }))} />);
    expect(screen.queryByText("Añadir foto")).toBeNull();
  });
});

describe("mis datos y baja de cuenta", () => {
  it("descarga los datos propios como adjunto JSON sin caché", async () => {
    stubs.rows.mockImplementation((table: string) => table === "profiles" ? { data: { id: OWNER, full_name: "Dueño" }, error: null } : { data: [], error: null });
    const response = await downloadData();
    expect(response.headers.get("content-disposition")).toMatch(/attachment; filename="inmuebles-directos-mis-datos-/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.cuenta).toMatchObject({ id: OWNER, correo: "dueno@example.test", textos_legales_aceptados: { version: "2026-11-15" } });
  });
  it("exige la frase de confirmación", async () => {
    const response = await deleteAccount(jsonRequest("/api/mi-cuenta/eliminar", { confirm: "si" }));
    expect(response.status).toBe(400); expect(stubs.rpc).not.toHaveBeenCalled();
  });
  it("borra cada anuncio, limpia fotos, elimina la cuenta y las cookies de sesión", async () => {
    stubs.rows.mockReturnValue({ data: [{ id: ID, status: "published" }], error: null });
    const response = await deleteAccount(jsonRequest("/api/mi-cuenta/eliminar", { confirm: "ELIMINAR" }));
    expect(response.status).toBe(200);
    expect(stubs.rpc.mock.calls.map(c => c[0])).toEqual(["owner_begin_listing_deletion", "owner_finish_listing_deletion", "owner_pending_image_cleanup", "owner_delete_account"]);
    expect(stubs.remove).toHaveBeenCalledWith([`${OWNER}/${ID}/a.png`]);
    expect(stubs.cookieDelete).toHaveBeenCalledWith("sb-ref-auth-token");
    expect(stubs.cookieDelete).not.toHaveBeenCalledWith("otra");
  });
  it("no elimina la cuenta si queda una publicación sin terminar", async () => {
    stubs.rows.mockReturnValue({ data: [{ id: ID, status: "draft" }], error: null });
    const response = await deleteAccount(jsonRequest("/api/mi-cuenta/eliminar", { confirm: "ELIMINAR" }));
    expect(response.status).toBe(409); expect(stubs.rpc).not.toHaveBeenCalled();
  });
  it("el botón solo se activa al escribir ELIMINAR", () => {
    render(<DeleteAccountForm />);
    const button = screen.getByRole("button", { name: "Eliminar mi cuenta definitivamente" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ELIMINAR" } });
    expect(button.hasAttribute("disabled")).toBe(false);
  });
});

describe("migración de la fase 2", () => {
  const sql = readFileSync("supabase/migrations/20261116010000_owner_photos_and_account.sql", "utf8");
  it("no concede nada a anon y fija search_path vacío en todas las funciones", () => {
    expect(sql).not.toMatch(/grant [^;]* to [^;]*anon/i);
    const fns = sql.match(/create or replace function/g)?.length ?? 0;
    expect(sql.match(/set search_path = ''/g)?.length).toBe(fns);
  });
  it("la admisión de subida exige fila pendiente reciente, del dueño y con su tipo", () => {
    expect(sql).toMatch(/u\.owner_id = auth\.uid\(\) and u\.state = 'PENDING'\s+and u\.created_at > now\(\) - interval '15 minutes' and lower\(coalesce\(p_mime, ''\)\) = u\.mime/);
    expect(sql).toMatch(/alter policy "publication exact private slot admission"/);
  });
  it("la baja de cuenta exige que no queden anuncios ni fotos y protege administradores", () => {
    for (const code of ["ADMIN_ACCOUNT", "LISTINGS_REMAIN", "PUBLICATION_PENDING", "IMAGES_REMAIN"]) expect(sql).toContain(`'${code}'`);
    expect(sql.indexOf("'IMAGES_REMAIN'")).toBeLessThan(sql.indexOf("delete from auth.users"));
  });
});
