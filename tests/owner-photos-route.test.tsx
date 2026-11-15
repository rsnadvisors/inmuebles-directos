// @vitest-environment node
// Multipart bodies need the runtime FormData (jsdom serializes its own as text).
import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({ verified: vi.fn(), rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), rows: vi.fn(), refresh: vi.fn(), cookieDelete: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: stubs.refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [{ name: "sb-ref-auth-token" }, { name: "otra" }], delete: stubs.cookieDelete }) }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: stubs.verified }));

import { POST as uploadPhoto } from "../app/api/mis-propiedades/fotos/route";


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

describe("subida de fotos", () => {
  it("reserva, sube a la ruta reservada y confirma", async () => {
    const response = await uploadPhoto(photoRequest(photoForm()));
    expect(response.status).toBe(200);
    expect(stubs.rpc.mock.calls.map(c => c[0])).toEqual(["owner_pending_image_cleanup", "owner_begin_image_upload", "owner_finish_image_upload"]);
    expect(stubs.upload).toHaveBeenCalledWith(`${OWNER}/${ID}/${IMG[0]}.png`, expect.any(File), { contentType: "image/png", upsert: false });
  });
  it("rechaza un archivo que no es imagen aunque diga image/png", async () => {
    const response = await uploadPhoto(photoRequest(photoForm(new TextEncoder().encode("<svg/>"), "image/png")));
    expect(response.status).toBe(400); expect(stubs.rpc).not.toHaveBeenCalled(); expect(stubs.upload).not.toHaveBeenCalled();
  });
  it("rechaza otro origen, campos extra y rutas reservadas fuera de su carpeta", async () => {
    expect((await uploadPhoto(photoRequest(photoForm(), "https://evil.example"))).status).toBe(403);
    const extra = photoForm(); extra.set("owner", "x");
    expect((await uploadPhoto(photoRequest(extra))).status).toBe(400);
    stubs.rpc.mockImplementation(async (name: string) => name === "owner_begin_image_upload"
      ? { data: { image_id: IMG[0], path: `otro/${ID}/${IMG[0]}.png` }, error: null } : { data: { paths: [] }, error: null });
    expect((await uploadPhoto(photoRequest(photoForm()))).status).toBe(503);
    expect(stubs.upload).not.toHaveBeenCalled();
  });
  it("si la base rechaza la subida, borra los bytes", async () => {
    stubs.rpc.mockImplementation(async (name: string) => name === "owner_finish_image_upload" ? { data: { accepted: false }, error: null }
      : name === "owner_begin_image_upload" ? { data: { image_id: IMG[0], path: `${OWNER}/${ID}/${IMG[0]}.png` }, error: null } : { data: { paths: [] }, error: null });
    const response = await uploadPhoto(photoRequest(photoForm()));
    expect(response.status).toBe(409); expect(stubs.remove).toHaveBeenCalledWith([`${OWNER}/${ID}/${IMG[0]}.png`]);
  });
  it("traduce el límite de 5 fotos", async () => {
    stubs.rpc.mockImplementation(async (name: string) => name === "owner_begin_image_upload" ? { data: null, error: { message: "TOO_MANY_IMAGES" } } : { data: { paths: [] }, error: null });
    const response = await uploadPhoto(photoRequest(photoForm()));
    expect(response.status).toBe(409); expect((await response.json()).message).toContain("5 fotos");
  });
});

