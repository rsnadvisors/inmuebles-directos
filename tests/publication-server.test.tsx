// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/publicar/route";
import { MAX_PHOTO_BYTES, MAX_REQUEST_BYTES, PARTIAL_MESSAGE } from "../app/lib/publication";

const mock = vi.hoisted(() => ({ create: vi.fn(), property: vi.fn(), image: vi.fn(), upload: vi.fn(), url: vi.fn(), calls: [] as string[] }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { client: null, user: null };
  return { client: mock.create(), user: { id: "fixture-user" } };
} }));
const secretError = { message: "PRIVATE SQL secret bucket internals", code: "INTERNAL" };
function photo(type = "image/png", size = 4) { return new File([new Uint8Array(size)], "../../untrusted.exe", { type }); }
function form() {
  const data = new FormData();
  Object.entries({ title: " Casa ", description: " Descripción ", address: " Dirección ", city: "Piura", region: "Piura", operation: "Vender", type: "Casas", price: "100.50", currency: "USD", latitude: "-5.19", longitude: "-80.63", coordinatesConfirmed: "true" }).forEach(([k, v]) => data.set(k, v));
  data.append("images", photo());
  return data;
}
function request(data = form(), headers?: Record<string, string>) { return new Request("http://localhost:3103/api/publicar", { method: "POST", body: data, headers: { origin: "http://localhost:3103", ...headers } }); }
async function reject(data: FormData) {
  const response = await POST(request(data));
  expect(response.status).toBe(400);
  expect((await response.json()).code).toBe("VALIDATION_ERROR");
  expect(mock.calls).toEqual([]);
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:9999");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon");
  mock.calls.length = 0;
  mock.property.mockReset().mockImplementation(() => { mock.calls.push("property"); return { select: () => ({ single: async () => ({ data: { id: "fixture-id" }, error: null }) }) }; });
  mock.image.mockReset().mockImplementation(async () => { mock.calls.push("image"); return { error: null }; });
  mock.upload.mockReset().mockImplementation(async () => { mock.calls.push("upload"); return { error: null }; });
  mock.url.mockReset().mockReturnValue({ data: { publicUrl: "http://localhost/fixture.png" } });
  mock.create.mockReset().mockReturnValue({ from: (table: string) => ({ insert: table === "properties" ? mock.property : mock.image }), storage: { from: () => ({ upload: mock.upload, getPublicUrl: mock.url }) } });
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
  it.each(["status", "slug", "storage_path", "public_url", "owner_id", "agent_id", "is_cover", "sort_order"])("rejects controlled field %s", async key => {
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

describe("publication server: derived fields and sequential writes", () => {
  it.each([["Vender", "Casas", "sale", "house"], ["Alquilar", "Departamentos", "rent", "apartment"], ["Vender", "Terrenos", "sale", "land"]])("accepts %s %s", async (operation, type, listing, property) => {
    const data = form(); data.set("operation", operation); data.set("type", type);
    const response = await POST(request(data, { "sec-fetch-site": "same-origin" }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, status: "published", slug: expect.stringMatching(/^casa-[0-9a-f-]{36}$/) });
    expect(mock.property).toHaveBeenCalledWith(expect.objectContaining({ title: "Casa", description: "Descripción", address: "Dirección", price: 100.5, listing_type: listing, property_type: property, currency: "USD", city: "Piura", region: "Piura", owner_id: "fixture-user", status: "published", lat: -5.19, lng: -80.63 }));
    expect(mock.property.mock.calls[0][0].slug).toMatch(/^casa-[0-9a-f-]{36}$/);
    expect(mock.calls).toEqual(["property", "upload", "image"]);
  });
  it("accepts five max-size photos and uses canonical names, ordering and cover", async () => {
    const data = form(); data.delete("images");
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/png", "image/png"]) data.append("images", photo(type, MAX_PHOTO_BYTES));
    expect((await POST(request(data))).status).toBe(200);
    expect(mock.calls).toEqual(["property", ...Array.from({ length: 5 }, () => ["upload", "image"]).flat()]);
    const paths = mock.upload.mock.calls.map(call => call[0]);
    expect(new Set(paths).size).toBe(5);
    for (const [i, extension] of ["jpg", "png", "webp", "png", "png"].entries()) {
      expect(paths[i]).toMatch(new RegExp(`^fixture-user/fixture-id/[0-9a-f-]{36}\\.${extension}$`));
      expect(paths[i]).not.toContain("untrusted");
      expect(mock.image.mock.calls[i][0]).toMatchObject({ sort_order: i, is_cover: i === 0 });
      expect(mock.upload.mock.calls[i][2].upsert).toBe(false);
    }
  });
  it("reports missing configuration before any write", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const response = await POST(request()); expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("AUTH_REQUIRED");
  });
  it("normalizes client initialization exceptions", async () => {
    mock.create.mockImplementation(() => { throw secretError; });
    const response = await POST(request()); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE"); expect(mock.calls).toEqual([]);
  });
});

describe("partial/uncertain results never retry or leak internals", () => {
  async function partial(data = form()) {
    const response = await POST(request(data)); expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, code: "PARTIAL_OR_UNCERTAIN", message: PARTIAL_MESSAGE });
    expect(mock.property).toHaveBeenCalledTimes(1);
  }
  it("treats an INSERT error response as uncertain", async () => {
    mock.property.mockReturnValue({ select: () => ({ single: async () => ({ data: null, error: secretError }) }) });
    await partial(); expect(mock.upload).not.toHaveBeenCalled();
  });
  it("A: first upload fails after property", async () => {
    mock.upload.mockResolvedValue({ error: secretError }); await partial();
    expect(mock.upload).toHaveBeenCalledTimes(1); expect(mock.image).not.toHaveBeenCalled();
  });
  it("B: second upload fails after first image was recorded", async () => {
    mock.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: secretError });
    const data = form(); data.append("images", photo()); await partial(data);
    expect(mock.upload).toHaveBeenCalledTimes(2); expect(mock.image).toHaveBeenCalledTimes(1);
  });
  it("C: image row fails after upload", async () => {
    mock.image.mockResolvedValue({ error: secretError }); await partial();
    expect(mock.upload).toHaveBeenCalledTimes(1); expect(mock.image).toHaveBeenCalledTimes(1);
  });
  it("D: unexpected exception after first write", async () => {
    mock.url.mockImplementation(() => { throw secretError; }); await partial();
    expect(mock.upload).toHaveBeenCalledTimes(1); expect(mock.image).not.toHaveBeenCalled();
  });
});
