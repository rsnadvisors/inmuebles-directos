// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateImageMime, resolvePropertyImage } from "../app/lib/property-image-source";
import { GET as publicImage } from "../app/api/property-images/[imageId]/route";
import { GET as draftPreview } from "../app/api/property-images/[imageId]/preview/route";

const ID = "11111111-1111-4111-8111-111111111111";
const PROPERTY = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";
const OBJECT = "44444444-4444-4444-8444-444444444444";
const mock = vi.hoisted(() => ({ anon: vi.fn(), publicLoad: vi.fn(), auth: vi.fn() }));
vi.mock("../app/lib/property-images", () => ({
  PRIVATE_PROPERTY_IMAGE_BUCKET: "property-images-private",
  validImageId: (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value),
  anonymousImageClient: mock.anon,
  loadPublishedPrivateImage: mock.publicLoad,
  imageResponse: (blob: Blob, cache: string) => new Response(blob, {
    headers: { "Content-Type": blob.type, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" },
  }),
}));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: mock.auth }));

function context(imageId = ID) { return { params: Promise.resolve({ imageId }) }; }
function authClient(owner: string | null, status: string | null, imageFound = true) {
  const download = vi.fn().mockResolvedValue({ data: new Blob(["png"], { type: "image/png" }), error: null });
  const maybeSingleImage = vi.fn().mockResolvedValue({ data: imageFound ? { id: ID, property_id: PROPERTY, storage_path: "owner/property/random.png", storage_bucket: "property-images-private" } : null, error: null });
  const maybeSingleProperty = vi.fn().mockResolvedValue({ data: owner === "owner" && status === "draft" ? { id: PROPERTY } : null, error: null });
  const query = (single: typeof maybeSingleImage) => {
    const chain = { eq: vi.fn(() => chain), maybeSingle: single };
    return chain;
  };
  const client = { from: vi.fn((table: string) => ({ select: () => query(table === "property_images" ? maybeSingleImage : maybeSingleProperty) })),
    storage: { from: vi.fn(() => ({ download })) } };
  return { client, download };
}

beforeEach(() => {
  mock.anon.mockReset().mockReturnValue({});
  mock.publicLoad.mockReset().mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  mock.auth.mockReset().mockResolvedValue({ client: null, user: null });
});

describe("dual image source", () => {
  it("preserves legacy external and public bucket URLs without proxying", () => {
    for (const url of ["https://images.unsplash.com/a.jpg", "https://project.supabase.co/storage/v1/object/public/property-images/a.png"]) {
      expect(resolvePropertyImage({ public_url: url, storage_bucket: "property-images" })).toBe(url);
    }
  });
  it("builds a stable application URL only for valid private image IDs", () => {
    expect(resolvePropertyImage({ id: ID, storage_bucket: "property-images-private", public_url: null })).toBe(`/api/property-images/${ID}`);
    expect(resolvePropertyImage({ id: "invalid", storage_bucket: "property-images-private", public_url: null })).toBeNull();
    expect(resolvePropertyImage({ storage_bucket: "property-images", public_url: null })).toBeNull();
  });
});

describe("canonical private image path", () => {
  const image = { property_id: PROPERTY, storage_bucket: "property-images-private", storage_path: `${OWNER}/${PROPERTY}/${OBJECT}.png` };
  const property = { id: PROPERTY, owner_id: OWNER, status: "published" };
  it("accepts only the exact linked owner/property/object path and canonical extension", () => {
    expect(privateImageMime(image, property)).toBe("image/png");
    expect(privateImageMime({ ...image, storage_path: `${OWNER}/${PROPERTY}/${OBJECT}.jpg` }, property)).toBe("image/jpeg");
    expect(privateImageMime({ ...image, storage_path: `${OWNER}/${PROPERTY}/${OBJECT}.webp` }, property)).toBe("image/webp");
  });
  it.each([
    ["wrong owner", { storage_path: `${ID}/${PROPERTY}/${OBJECT}.png` }, {}],
    ["wrong property", { storage_path: `${OWNER}/${ID}/${OBJECT}.png` }, {}],
    ["wrong bucket", { storage_bucket: "property-images" }, {}],
    ["missing owner", {}, { owner_id: null }],
    ["missing property", {}, { id: null }],
    ["cross-linked property", { property_id: ID }, {}],
    ["draft", {}, { status: "draft" }],
    ["extra segment", { storage_path: `${OWNER}/${PROPERTY}/extra/${OBJECT}.png` }, {}],
    ["empty segment", { storage_path: `${OWNER}//${OBJECT}.png` }, {}],
    ["dot segment", { storage_path: `${OWNER}/${PROPERTY}/.` }, {}],
    ["dot-dot segment", { storage_path: `${OWNER}/${PROPERTY}/..` }, {}],
    ["non-UUID object", { storage_path: `${OWNER}/${PROPERTY}/photo.png` }, {}],
    ["unsupported extension", { storage_path: `${OWNER}/${PROPERTY}/${OBJECT}.svg` }, {}],
    ["uppercase extension", { storage_path: `${OWNER}/${PROPERTY}/${OBJECT}.PNG` }, {}],
  ])("rejects %s", (_label, imageChange, propertyChange) => {
    expect(privateImageMime({ ...image, ...imageChange }, { ...property, ...propertyChange })).toBeNull();
  });
});

describe("public image delivery", () => {
  it("returns a published image with no-store and correct MIME", async () => {
    const response = await publicImage(new Request("http://localhost/image"), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("hides drafts and invalid IDs", async () => {
    mock.publicLoad.mockResolvedValue(null);
    expect((await publicImage(new Request("http://localhost/image"), context())).status).toBe(404);
    expect((await publicImage(new Request("http://localhost/image"), context("invalid"))).status).toBe(404);
    expect(mock.publicLoad).toHaveBeenCalledTimes(1);
  });
  it("does not cache downstream failures", async () => {
    mock.publicLoad.mockRejectedValue(new Error("private backend detail"));
    const response = await publicImage(new Request("http://localhost/image"), context());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("authenticated draft preview", () => {
  it("denies anonymous requests", async () => {
    const response = await draftPreview(new Request("http://localhost/preview"), context());
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("allows only owner of the draft and never caches it publicly", async () => {
    const owner = authClient("owner", "draft");
    mock.auth.mockResolvedValue({ client: owner.client, user: { id: "owner" } });
    const response = await draftPreview(new Request("http://localhost/preview"), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(owner.download).toHaveBeenCalledWith("owner/property/random.png");
  });
  it("denies a different authenticated user, even when image metadata is visible", async () => {
    const other = authClient("other", "draft");
    mock.auth.mockResolvedValue({ client: other.client, user: { id: "other" } });
    const response = await draftPreview(new Request("http://localhost/preview"), context());
    expect(response.status).toBe(404);
    expect(other.download).not.toHaveBeenCalled();
  });
  it("does not keep the draft preview available after publication", async () => {
    const owner = authClient("owner", "published");
    mock.auth.mockResolvedValue({ client: owner.client, user: { id: "owner" } });
    expect((await draftPreview(new Request("http://localhost/preview"), context())).status).toBe(404);
    expect(owner.download).not.toHaveBeenCalled();
  });
});
