// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/publicar/route";
import { MAX_PHOTO_BYTES, MAX_REQUEST_BYTES } from "../app/lib/publication";

const mock = vi.hoisted(() => ({ create: vi.fn(), property: vi.fn(), image: vi.fn(), upload: vi.fn(), url: vi.fn(), delivery: vi.fn(), storageFrom: vi.fn(), finalize: vi.fn(), lookup: vi.fn(), remove: vi.fn(), cleanupImages: vi.fn(), cleanupProperty: vi.fn(), calls: [] as string[] }));
vi.mock("../app/lib/property-images", () => ({
  PRIVATE_PROPERTY_IMAGE_BUCKET: "property-images-private",
  anonymousImageClient: () => ({}),
  loadPublishedPrivateImage: mock.delivery,
}));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { client: null, user: null };
  return { client: mock.create(), user: { id: "fixture-user" } };
} }));
const secretError = { message: "PRIVATE SQL secret bucket internals", code: "INTERNAL" };
function photo(type = "image/png", size = 4) { return new File([new Uint8Array(size)], "../../untrusted.exe", { type }); }
function form() {
  const data = new FormData();
  Object.entries({ contact_phone: "900 000 001", title: " Casa ", description: " Descripción ", address: " Dirección ", city: "Piura", region: "Piura", operation: "Vender", type: "Casas", price: "100.50", currency: "USD", latitude: "-5.19", longitude: "-80.63", coordinatesConfirmed: "true" }).forEach(([k, v]) => data.set(k, v));
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
  mock.image.mockReset().mockImplementation(() => { mock.calls.push("image"); return { select: () => ({ single: async () => ({ data: { id: "11111111-1111-4111-8111-111111111111" }, error: null }) }) }; });
  mock.upload.mockReset().mockImplementation(async () => { mock.calls.push("upload"); return { error: null }; });
  mock.url.mockReset().mockReturnValue({ data: { publicUrl: "http://localhost/storage/v1/object/public/property-images/fixture.png" } });
  mock.delivery.mockReset().mockImplementation(async () => { mock.calls.push("delivery"); return new Blob(["image"], { type: "image/png" }); });
  mock.storageFrom.mockReset().mockImplementation(() => ({ upload: mock.upload, getPublicUrl: mock.url, remove: mock.remove }));
  mock.finalize.mockReset().mockImplementation(async () => { mock.calls.push("finalize"); return { data: mock.property.mock.calls[0][0].slug, error: null }; });
  mock.lookup.mockReset().mockResolvedValue({ data: { status: "draft" }, error: null });
  mock.remove.mockReset().mockImplementation(async () => { mock.calls.push("remove"); return { error: null }; });
  mock.cleanupImages.mockReset().mockImplementation(async () => { mock.calls.push("cleanup-images"); return { error: null }; });
  mock.cleanupProperty.mockReset().mockImplementation(async () => { mock.calls.push("cleanup-property"); return { error: null }; });
  mock.create.mockReset().mockReturnValue({
    from: (table: string) => ({
      insert: table === "properties" ? mock.property : mock.image,
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mock.lookup }), maybeSingle: mock.lookup }) }),
      delete: () => ({ eq: table === "properties" ? mock.cleanupProperty : mock.cleanupImages }),
    }),
    storage: { from: mock.storageFrom },
    rpc: mock.finalize,
  });
});

describe("publication contact phone", () => {
  it("persists normalized listing phone in the draft insert without profile writes", async () => {
    const response = await POST(request(form()));
    expect(response.status).toBe(200);
    expect(mock.property).toHaveBeenCalledWith(expect.objectContaining({ contact_phone: "+51900000001" }));
  });
  it.each(["", "123", "abc", "javascript:alert(1)", "+51900000001?text=bad", "+1234567890123456"])("rejects invalid phone before writes: %s", async value => {
    const data = form(); data.set("contact_phone", value);
    await reject(data);
  });
  it("rejects missing listing phone before writes", async () => {
    const data = form(); data.delete("contact_phone"); await reject(data);
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

describe("publication server: draft then controlled finalization", () => {
  it.each([["Vender", "Casas", "sale", "house"], ["Alquilar", "Departamentos", "rent", "apartment"], ["Vender", "Terrenos", "sale", "land"]])("accepts %s %s", async (operation, type, listing, property) => {
    const data = form(); data.set("operation", operation); data.set("type", type);
    const response = await POST(request(data, { "sec-fetch-site": "same-origin" }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, status: "published", slug: expect.stringMatching(/^casa-[0-9a-f-]{36}$/) });
    expect(mock.property).toHaveBeenCalledWith(expect.objectContaining({ title: "Casa", description: "Descripción", address: "Dirección", price: 100.5, listing_type: listing, property_type: property, currency: "USD", city: "Piura", region: "Piura", owner_id: "fixture-user", status: "draft", published_at: null, lat: -5.19, lng: -80.63 }));
    expect(mock.property.mock.calls[0][0].slug).toMatch(/^casa-[0-9a-f-]{36}$/);
    expect(mock.calls).toEqual(["property", "upload", "image", "finalize", "delivery"]);
    expect(mock.storageFrom).toHaveBeenCalledWith("property-images-private");
    expect(mock.url).not.toHaveBeenCalled();
    expect(mock.image.mock.calls[0][0]).toMatchObject({ storage_bucket: "property-images-private", public_url: null });
    expect(mock.finalize).toHaveBeenCalledWith("finalize_private_property_publication", { p_property_id: "fixture-id" });
  });
  it("accepts five max-size photos and uses canonical names, ordering and cover", async () => {
    const data = form(); data.delete("images");
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/png", "image/png"]) data.append("images", photo(type, MAX_PHOTO_BYTES));
    expect((await POST(request(data))).status).toBe(200);
    expect(mock.calls).toEqual(["property", ...Array.from({ length: 5 }, () => ["upload", "image"]).flat(), "finalize", "delivery"]);
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

describe("publication server: failures never finalize a partial draft", () => {
  async function failed(code: string, data = form()) {
    const response = await POST(request(data)); expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, code });
    expect(body.message).not.toContain("PRIVATE");
    expect(mock.finalize).toHaveBeenCalledTimes(code === "FINALIZATION_FAILED" ? 1 : 0);
  }
  it("treats an INSERT error response as an uncertain non-public draft", async () => {
    mock.property.mockReturnValue({ select: () => ({ single: async () => ({ data: null, error: secretError }) }) });
    await failed("DRAFT_CREATE_UNCERTAIN"); expect(mock.upload).not.toHaveBeenCalled();
  });
  it("A: first upload fails after property", async () => {
    mock.upload.mockImplementation(async () => { mock.calls.push("upload"); return { error: secretError }; }); await failed("UPLOAD_FAILED");
    expect(mock.upload).toHaveBeenCalledTimes(1); expect(mock.image).not.toHaveBeenCalled();
    expect(mock.calls).toEqual(["property", "upload", "remove", "cleanup-images", "cleanup-property"]);
  });
  it("B: second upload fails after first image was recorded", async () => {
    mock.upload.mockImplementationOnce(async () => { mock.calls.push("upload"); return { error: null }; })
      .mockImplementationOnce(async () => { mock.calls.push("upload"); return { error: secretError }; });
    const data = form(); data.append("images", photo()); await failed("UPLOAD_FAILED", data);
    expect(mock.upload).toHaveBeenCalledTimes(2); expect(mock.image).toHaveBeenCalledTimes(1);
    expect(mock.remove.mock.calls[0][0]).toHaveLength(2);
  });
  it("C: image row fails after upload", async () => {
    mock.image.mockImplementation(() => { mock.calls.push("image"); return { select: () => ({ single: async () => ({ data: null, error: secretError }) }) }; }); await failed("METADATA_FAILED");
    expect(mock.upload).toHaveBeenCalledTimes(1); expect(mock.image).toHaveBeenCalledTimes(1);
  });
  it("D: unexpected exception after first upload", async () => {
    mock.image.mockImplementation(() => { throw secretError; }); await failed("METADATA_FAILED");
    expect(mock.upload).toHaveBeenCalledTimes(1); expect(mock.image).toHaveBeenCalledOnce();
  });
  it("E: finalization fails while the property remains a draft", async () => {
    mock.finalize.mockImplementation(async () => { mock.calls.push("finalize"); return { data: null, error: secretError }; });
    await failed("FINALIZATION_FAILED");
    expect(mock.lookup).toHaveBeenCalledOnce();
    expect(mock.calls).toEqual(["property", "upload", "image", "finalize", "remove", "cleanup-images", "cleanup-property"]);
  });
  it("F: a lost finalization response resolves to success if published", async () => {
    mock.finalize.mockResolvedValue({ data: null, error: secretError });
    mock.lookup.mockResolvedValue({ data: { status: "published", slug: "confirmed-slug" }, error: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "published", slug: "confirmed-slug" });
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it("F: committed publication with failed image delivery reports published without cleanup or retry", async () => {
    mock.delivery.mockImplementation(async () => { mock.calls.push("delivery"); throw secretError; });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: "published", imageDelivery: "unconfirmed" });
    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.cleanupImages).not.toHaveBeenCalled();
    expect(mock.cleanupProperty).not.toHaveBeenCalled();
    expect(mock.property).toHaveBeenCalledOnce();
  });
  it("reuses a published result for the same request ID without a second insert, upload or finalization", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    mock.lookup.mockResolvedValue({ data: { id: "fixture-id", status: "published", slug: `casa-${id}` }, error: null });
    const response = await POST(request(form(), { "x-publication-request-id": id }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: "published", slug: `casa-${id}` });
    expect(mock.property).not.toHaveBeenCalled();
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.image).not.toHaveBeenCalled();
    expect(mock.finalize).not.toHaveBeenCalled();
  });
  it("publishes once and makes a subsequent identical POST idempotent", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    mock.lookup.mockResolvedValueOnce({ data: null, error: null });
    const first = await POST(request(form(), { "x-publication-request-id": id }));
    expect(first.status).toBe(200);
    expect((await first.json()).slug).toBe(`casa-${id}`);
    expect(mock.property).toHaveBeenCalledWith(expect.objectContaining({ id }));
    mock.lookup.mockResolvedValueOnce({ data: { id: "fixture-id", status: "published", slug: `casa-${id}` }, error: null });
    const changed = form(); changed.set("title", "Otro título");
    const second = await POST(request(changed, { "x-publication-request-id": id }));
    expect(second.status).toBe(200);
    expect((await second.json()).slug).toBe(`casa-${id}`);
    expect(mock.property).toHaveBeenCalledOnce();
    expect(mock.image).toHaveBeenCalledOnce();
    expect(mock.upload).toHaveBeenCalledOnce();
    expect(mock.finalize).toHaveBeenCalledOnce();
  });
  it("does not duplicate a draft when the same request ID is in progress", async () => {
    const response = await POST(request(form(), { "x-publication-request-id": "11111111-1111-4111-8111-111111111111" }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("PUBLICATION_IN_PROGRESS");
    expect(mock.property).not.toHaveBeenCalled();
  });
  it.each(["draft", "published"])("reconciles a racing insert conflict against the same %s property", async status => {
    const id = "11111111-1111-4111-8111-111111111111";
    mock.lookup.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id, status, slug: `casa-${id}` }, error: null });
    mock.property.mockReturnValue({ select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }) });
    const response = await POST(request(form(), { "x-publication-request-id": id }));
    expect(response.status).toBe(status === "published" ? 200 : 409);
    expect(await response.json()).toMatchObject(status === "published"
      ? { ok: true, status: "published", slug: `casa-${id}`, imageDelivery: "not_checked" }
      : { ok: false, code: "PUBLICATION_IN_PROGRESS" });
    expect(mock.property).toHaveBeenCalledOnce();
    expect(mock.upload).not.toHaveBeenCalled(); expect(mock.image).not.toHaveBeenCalled();
    expect(mock.finalize).not.toHaveBeenCalled(); expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.cleanupProperty).not.toHaveBeenCalled();
  });
  it("a lost insert acknowledgment keeps the existing draft and the retry performs no new write", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    mock.lookup.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValue({ data: { id, status: "draft", slug: `casa-${id}` }, error: null });
    mock.property.mockReturnValue({ select: () => ({ single: async () => { throw new Error("Lost insert reply"); } }) });
    expect((await POST(request(form(), { "x-publication-request-id": id }))).status).toBe(409);
    expect((await POST(request(form(), { "x-publication-request-id": id }))).status).toBe(409);
    expect(mock.property).toHaveBeenCalledOnce(); expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.image).not.toHaveBeenCalled(); expect(mock.finalize).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled(); expect(mock.cleanupProperty).not.toHaveBeenCalled();
  });
  it("rejects malformed request IDs before a write", async () => {
    const response = await POST(request(form(), { "x-publication-request-id": "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(mock.calls).toEqual([]);
  });
});
