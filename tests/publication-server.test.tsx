// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/publicar/route";
import { MAX_PHOTO_BYTES, MAX_REQUEST_BYTES } from "../app/lib/publication";
const mock = vi.hoisted(() => ({ create: vi.fn(), prepare: vi.fn(), rpc: vi.fn(), upload: vi.fn(), delivery: vi.fn(),
  storageFrom: vi.fn(), remove: vi.fn(), calls: [] as string[], plans: new Map<string, any>() }));
vi.mock("../app/lib/property-images", () => ({
  PRIVATE_PROPERTY_IMAGE_BUCKET: "property-images-private", anonymousImageClient: () => ({}), loadPublishedPrivateImage: mock.delivery,
}));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedPublicationUser: async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { client: null, user: null, reason: "AUTH_REQUIRED" };
  return { client: mock.create(), user: { id: "11111111-1111-4111-8111-111111111111",
    is_anonymous: false, email: "publisher@example.invalid", email_confirmed_at: "2026-10-01T00:00:00Z" }, reason: null };
} }));
const secretError = { message: "PRIVATE SQL secret bucket internals", code: "INTERNAL" };
function photo(type = "image/png", size = 4) { return new File([new Uint8Array(size)], "../../untrusted.exe", { type }); }
function form() {
  const data = new FormData();
  Object.entries({ contact_phone: "900 000 001", title: " Casa ", description: " Descripción ", address: " Dirección ", city: "Piura", region: "Piura", operation: "Vender", type: "Casas", price: "100.50", currency: "USD", latitude: "-5.19", longitude: "-80.63", coordinatesConfirmed: "true" }).forEach(([k, v]) => data.set(k, v));
  data.append("images", photo()); return data;
}
function request(data = form(), headers?: Record<string, string>) { return new Request("http://localhost:3103/api/publicar", { method: "POST", body: data, headers: { origin: "http://localhost:3103", ...headers } }); }
async function reject(data: FormData) {
  const response = await POST(request(data)); expect(response.status).toBe(400);
  expect((await response.json()).code).toBe("VALIDATION_ERROR"); expect(mock.calls).toEqual([]);
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:9999");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon");
  vi.stubEnv("PUBLICATION_BOUNDARY_HMAC_KEY", "ab".repeat(32)); vi.stubEnv("PUBLICATION_BOUNDARY_HMAC_KEY_ID", "test");
  mock.calls.length = 0; mock.plans.clear(); mock.prepare.mockReset();
  mock.delivery.mockReset().mockImplementation(async () => { mock.calls.push("delivery"); return new Blob(["image"], { type: "image/png" }); });
  mock.remove.mockReset().mockResolvedValue({ error: null });
  mock.upload.mockReset().mockImplementation(async (path: string) => {
    mock.calls.push("upload");
    for (const p of mock.plans.values()) for (const s of p.slots) if (s.path === path) s.observation = "PRESENT";
    return { error: null };
  });
  mock.storageFrom.mockReset().mockReturnValue({ upload: mock.upload, remove: mock.remove });
  mock.rpc.mockReset().mockImplementation(async (rpc: string, proof: { p_envelope: string }) => {
    const e = JSON.parse(proof.p_envelope); mock.calls.push(e.purpose === "reconcile" ? e.action : e.purpose);
    let p = mock.plans.get(e.request_id);
    if (rpc === "prepare_publication_attempt") {
      mock.prepare(e);
      if (p && p.fingerprint !== e.fingerprint) return { error: { message: "PUBLICATION_REQUEST_MISMATCH", code: "23505" }, data: null };
      if (!p) {
        p = { requestId: e.request_id, fingerprint: e.fingerprint, state: "ACTIVE", revision: 0, parentValid: true,
          slug: "casa-" + e.request_id, slots: e.manifest.map((m: any, i: number) => ({ ...m,
            path: e.uid + "/" + e.request_id + "/" + m.imageId + "." + ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as any)[m.mime],
            sortOrder: i, state: "RESERVED", metadataValid: true, observation: "ABSENT" })) };
        mock.plans.set(e.request_id, p);
      }
    } else if (!p) return { data: null, error: { code: "P0002", message: "Publication not found" } };
    if (rpc === "finalize_publication_attempt") { p.state = "FINALIZED"; p.revision++; p.slots.forEach((s: any) => s.state = "FINALIZED"); }
    return { data: structuredClone(p), error: null };
  });
  mock.create.mockReset().mockReturnValue({
    from: () => { throw new Error("Direct application DML forbidden"); },
    storage: { from: mock.storageFrom }, rpc: mock.rpc,
  });
});
describe("publication contact phone", () => {
  it("persists normalized listing phone in the draft insert without profile writes", async () => {
    const response = await POST(request(form()));
    expect(response.status).toBe(200);
    expect(mock.prepare.mock.calls[0][0].fields).toMatchObject({ contact_phone: "+51900000001" });
  });
  it.each(["", "123", "abc", "javascript:alert(1)", "+51900000001?text=bad", "+1234567890123456"])("rejects invalid phone before writes: %s", async value => {
    const data = form(); data.set("contact_phone", value);
    await reject(data);
  });
  it("rejects missing listing phone before writes", async () => {
    const data = form(); data.delete("contact_phone"); await reject(data);
  });
});

describe("R01: conclusive rejection before preparation", () => {
  const requestId = "22222222-2222-4222-8222-222222222222";
  const subject = "11111111-1111-4111-8111-111111111111";
  it.each(["validation", "content-type", "declared-size", "multipart"])("correlates %s rejection without RPC or upload", async kind => {
    const data = form();
    if (kind === "validation") data.set("title", "");
    const req = kind === "content-type" || kind === "multipart"
      ? new Request("http://localhost:3103/api/publicar", { method: "POST", body: "invalid", headers: {
        origin: "http://localhost:3103", "x-publication-request-id": requestId,
        "content-type": kind === "content-type" ? "application/json" : "multipart/form-data; boundary=missing" } })
      : request(data, { "x-publication-request-id": requestId,
        ...(kind === "declared-size" ? { "content-length": String(MAX_REQUEST_BYTES + 1) } : {}) });
    const response = await POST(req);
    expect(response.status).toBe(kind === "content-type" ? 415 : kind === "declared-size" ? 413 : 400);
    expect(await response.json()).toMatchObject({ ok: false, preparation: "NOT_STARTED", requestId, subject });
    expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.upload).not.toHaveBeenCalled();
  });
  it.each([undefined, "invalid"])("does not attest an uncorrelated request ID %s", async supplied => {
    const data = form(); data.set("title", "");
    const response = await POST(request(data, supplied === undefined ? {} : { "x-publication-request-id": supplied }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).not.toHaveProperty("preparation"); expect(body).not.toHaveProperty("subject");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("R02: never attests rejection after entering preparation", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: secretError });
    const response = await POST(request(form(), { "x-publication-request-id": requestId }));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("preparation");
    expect(mock.rpc).toHaveBeenCalledOnce(); expect(mock.upload).not.toHaveBeenCalled();
  });
});

describe("publication server: validation before any write", () => {
  it.each(["title", "description", "address", "city", "region", "operation", "type", "price", "currency", "latitude", "longitude", "coordinatesConfirmed"])("rejects missing %s", async key => {
    const data = form(); data.delete(key); await reject(data);
  });
  it.each(["title", "description", "address"])("rejects whitespace %s", async key => {
    const data = form(); data.set(key, " \n "); await reject(data);
  });
  it.each([["title", 121], ["description", 3001], ["address", 251]] as const)("caps %s", async (key, size) => {
    const data = form(); data.set(key, "x".repeat(size)); await reject(data);
  });
  it.each(["operation", "type"])("rejects unknown/prototype enum %s", async key => {
    const data = form(); data.set(key, "toString"); await reject(data);
  });
  it.each(["", " ", "0", "-1", "NaN", "Infinity", "1e309", "1000000001"])("rejects price %s", async value => {
    const data = form(); data.set("price", value); await reject(data);
  });
  it.each([["latitude", ""], ["latitude", "NaN"], ["latitude", "Infinity"], ["latitude", "-19.01"], ["latitude", "1.01"], ["longitude", ""], ["longitude", "-82.01"], ["longitude", "-67.99"], ["coordinatesConfirmed", "false"]])("rejects %s=%s", async (key, value) => {
    const data = form(); data.set(key, value); await reject(data);
  });
  it.each(["status", "slug", "storage_path", "storage_bucket", "public_url", "owner_id", "agent_id", "is_cover", "sort_order"])("rejects controlled field %s", async key => {
    const data = form(); data.set(key, "attacker-value"); await reject(data);
  });
  it("rejects duplicate scalar values", async () => { const data = form(); data.append("price", "200"); await reject(data); });
  it("rejects a File in a string field", async () => { const data = form(); data.set("title", photo()); await reject(data); });
  it("rejects text pretending to be an image", async () => { const data = form(); data.set("images", "not-a-file"); await reject(data); });
  it.each([0, 6])("rejects image count %i", async count => {
    const data = form(); data.delete("images"); for (let i = 0; i < count; i++) data.append("images", photo()); await reject(data);
  });
  it.each([["image/gif", 4], ["image/png", 0], ["image/jpeg", MAX_PHOTO_BYTES + 1]] as const)("rejects image %s size %i", async (type, size) => {
    const data = form(); data.append("images", photo(type, size)); await reject(data);
  });
  it("rejects content type without constructing a client", async () => {
    const response = await POST(new Request("http://localhost/api/publicar", { method: "POST", body: "{}", headers: { "content-type": "application/json", origin: "http://localhost" } }));
    expect(response.status).toBe(415);
  });
  it("rejects malformed multipart", async () => {
    const response = await POST(new Request("http://localhost/api/publicar", { method: "POST", body: "broken", headers: { "content-type": "multipart/form-data; boundary=missing", origin: "http://localhost" } }));
    expect(response.status).toBe(400); expect(mock.calls).toEqual([]);
  });
  it("rejects explicit browser cross-site signal", async () => {
    expect((await POST(request(form(), { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  });
  it("rejects an oversized declared length before reading", async () => {
    const req = request(form(), { "content-length": String(MAX_REQUEST_BYTES + 1) });
    const read = vi.spyOn(req.body!, "getReader");
    expect((await POST(req)).status).toBe(413); expect(read).not.toHaveBeenCalled(); expect(mock.calls).toEqual([]);
  });
  it.each([undefined, "1"])("counts actual body bytes with content-length %s", async length => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel });
    const headers: Record<string, string> = { "content-type": "multipart/form-data; boundary=fixture", origin: "http://localhost" };
    if (length) headers["content-length"] = length;
    const req = new Request("http://localhost/api/publicar", { method: "POST", body: stream, headers, duplex: "half" } as RequestInit);
    const response = await POST(req);
    expect(response.status).toBe(413); expect(cancel).toHaveBeenCalledOnce();
  });
});


describe("publication server: durable plan and retry", () => {
  it.each([["Vender", "Casas", "sale", "house"], ["Alquilar", "Departamentos", "rent", "apartment"], ["Vender", "Terrenos", "sale", "land"], ["Alquilar", "Oficinas", "rent", "office"], ["Vender", "Locales comerciales", "sale", "commercial"]])("accepts %s %s through signed preparation", async (operation, type, listing, property) => {
    const data = form(); data.set("operation", operation); data.set("type", type);
    const response = await POST(request(data)); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: "published", slug: expect.stringMatching(/^casa-[0-9a-f-]{36}$/) });
    expect(mock.prepare.mock.calls[0][0].fields).toMatchObject({ listing_type: listing, property_type: property, price: 100.5, currency: "USD" });
    expect(mock.calls).toEqual(["prepare", "upload", "inspect", "finalize", "delivery"]);
    expect(mock.upload.mock.calls[0][2].upsert).toBe(false); expect(mock.remove).not.toHaveBeenCalled();
  });
  it("creates exactly five stable paths before upload and never uses original filenames", async () => {
    const data = form(); data.delete("images");
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/png", "image/png"]) data.append("images", photo(mime, MAX_PHOTO_BYTES));
    expect((await POST(request(data))).status).toBe(200);
    expect(mock.prepare.mock.calls[0][0].manifest).toHaveLength(5);
    const paths = mock.upload.mock.calls.map(c => c[0]); expect(new Set(paths).size).toBe(5);
    expect(paths.every(p => !p.includes("untrusted"))).toBe(true);
  });
  it("requires a private key before preparation or upload", async () => {
    vi.stubEnv("PUBLICATION_BOUNDARY_HMAC_KEY", "");
    const response = await POST(request()); expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("PUBLICATION_BOUNDARY_UNAVAILABLE"); expect(mock.calls).toEqual([]);
  });
  it("normalizes client initialization exceptions without exposing internals", async () => {
    mock.create.mockImplementation(() => { throw secretError; });
    const response = await POST(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE");
  });
  it("reports missing authentication without writes", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""); expect((await POST(request())).status).toBe(401); expect(mock.calls).toEqual([]);
  });
  it("retries failed upload using identical slots/path and never cleans up or creates metadata", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    mock.upload.mockResolvedValueOnce({ error: secretError });
    expect((await POST(request(form(), { "x-publication-request-id": id }))).status).toBe(502);
    const path = mock.upload.mock.calls[0][0];
    expect((await POST(request(form(), { "x-publication-request-id": id }))).status).toBe(200);
    expect(mock.upload.mock.calls[1][0]).toBe(path);
    expect(mock.plans.size).toBe(1); expect(mock.plans.get(id).slots).toHaveLength(1); expect(mock.remove).not.toHaveBeenCalled();
  });
  it("reads back a committed upload when the response was lost instead of uploading twice", async () => {
    const original = mock.upload.getMockImplementation()!;
    mock.upload.mockImplementationOnce(async (...args) => { await original(...args); return { error: secretError }; });
    expect((await POST(request())).status).toBe(200); expect(mock.upload).toHaveBeenCalledOnce();
  });
  it("keeps the same plan on an unknown inspection and performs no cleanup", async () => {
    const original = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation(async (name, proof) => name === "reconcile_publication_attempt"
      ? { data: null, error: secretError } : original(name, proof));
    expect((await POST(request())).status).toBe(503);
    expect(mock.calls).not.toContain("finalize"); expect(mock.remove).not.toHaveBeenCalled(); expect(mock.plans.size).toBe(1);
  });
  it("refuses malformed reconciliation observations rather than treating them as absence", async () => {
    const original = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation(async (name, proof) => {
      const r = await original(name, proof);
      if (name === "reconcile_publication_attempt") r.data.slots[0].observation = "UNKNOWN";
      return r;
    });
    expect((await POST(request())).status).toBe(503); expect(mock.calls).not.toContain("finalize");
  });
  it("does not recreate metadata deleted from an existing plan", async () => {
    const original = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation(async (name, proof) => {
      const r = await original(name, proof); r.data.slots[0].metadataValid = false; return r;
    });
    expect((await POST(request())).status).toBe(503); expect(mock.upload).not.toHaveBeenCalled();
  });
  it("resolves lost finalize acknowledgement as published without deleting anything", async () => {
    const original = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation(async (name, proof) => {
      const r = await original(name, proof); return name === "finalize_publication_attempt" ? { error: secretError, data: null } : r;
    });
    expect((await POST(request())).status).toBe(200); expect(mock.remove).not.toHaveBeenCalled();
  });
  it("reports delivery failure honestly after publication without cleanup", async () => {
    mock.delivery.mockRejectedValue(secretError);
    const response = await POST(request()); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "published", imageDelivery: "unconfirmed" }); expect(mock.remove).not.toHaveBeenCalled();
  });
  it("replays exactly published without another upload or finalize", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    expect((await POST(request(form(), { "x-publication-request-id": id }))).status).toBe(200);
    expect((await POST(request(form(), { "x-publication-request-id": id }))).status).toBe(200);
    expect(mock.upload).toHaveBeenCalledOnce(); expect(mock.calls.filter(c => c === "finalize")).toHaveLength(1);
  });
  it("rejects changed content for the same published request", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    await POST(request(form(), { "x-publication-request-id": id }));
    const changed = form(); changed.set("title", "Changed");
    expect((await POST(request(changed, { "x-publication-request-id": id }))).status).toBe(409);
    expect(mock.upload).toHaveBeenCalledOnce();
  });
  it.each(["CANCELLED", "CANCEL_PENDING"])("never uploads from terminal/frozen state %s", async state => {
    const original = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation(async (name, proof) => { const r = await original(name, proof); r.data.state = state; return r; });
    expect((await POST(request())).status).toBe(409); expect(mock.upload).not.toHaveBeenCalled();
  });
  it("rejects malformed request IDs before preparation", async () => {
    expect((await POST(request(form(), { "x-publication-request-id": "invalid" }))).status).toBe(400); expect(mock.calls).toEqual([]);
  });
});
