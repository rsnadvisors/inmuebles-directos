// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/property-images/[imageId]/route";

const IMAGE = "11111111-1111-4111-8111-111111111111";
const PROPERTY = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";
const OBJECT = "44444444-4444-4444-8444-444444444444";
const PATH = `${OWNER}/${PROPERTY}/${OBJECT}.png`;
const mock = vi.hoisted(() => ({ client: vi.fn() }));

vi.mock("../app/lib/property-images", async importOriginal => ({
  ...await importOriginal<typeof import("../app/lib/property-images")>(),
  anonymousImageClient: mock.client,
}));

function setup(imageChange: Record<string, unknown> = {}, propertyChange: Record<string, unknown> = {}) {
  const image = { id: IMAGE, property_id: PROPERTY, storage_bucket: "property-images-private", storage_path: PATH, ...imageChange };
  const property = { id: PROPERTY, owner_id: OWNER, status: "published", ...propertyChange };
  const download = vi.fn().mockResolvedValue({ data: new Blob(["png"], { type: "image/png" }), error: null });
  const from = vi.fn((table: string) => {
    const query = { eq: vi.fn(() => query), maybeSingle: vi.fn().mockResolvedValue({ data: table === "property_images" ? image : property, error: null }) };
    return { select: vi.fn(() => query) };
  });
  mock.client.mockReturnValue({ from, storage: { from: vi.fn(() => ({ download })) } });
  return { download };
}

async function request() {
  return GET(new Request(`http://localhost/api/property-images/${IMAGE}`), { params: Promise.resolve({ imageId: IMAGE }) });
}

beforeEach(() => mock.client.mockReset());

describe("public delivery checks metadata before fetching bytes", () => {
  it("serves only a canonical published image with safe headers", async () => {
    const { download } = setup();
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("png");
    expect(download).toHaveBeenCalledWith(PATH);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Content-Length")).toBe("3");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it.each([
    ["wrong owner", { storage_path: `${IMAGE}/${PROPERTY}/${OBJECT}.png` }, {}],
    ["wrong property path", { storage_path: `${OWNER}/${IMAGE}/${OBJECT}.png` }, {}],
    ["wrong bucket", { storage_bucket: "property-images" }, {}],
    ["missing owner", {}, { owner_id: null }],
    ["cross-linked property", { property_id: IMAGE }, {}],
    ["draft", {}, { status: "draft" }],
    ["extra segment", { storage_path: `${PATH}/extra` }, {}],
    ["empty segment", { storage_path: `${OWNER}//${OBJECT}.png` }, {}],
    ["dot segment", { storage_path: `${OWNER}/${PROPERTY}/.` }, {}],
    ["dot-dot segment", { storage_path: `${OWNER}/${PROPERTY}/..` }, {}],
    ["unsupported extension", { storage_path: `${OWNER}/${PROPERTY}/${OBJECT}.svg` }, {}],
  ])("returns 404 without downloading for %s", async (_label, imageChange, propertyChange) => {
    const { download } = setup(imageChange, propertyChange);
    expect((await request()).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects a mismatched MIME type after download", async () => {
    const { download } = setup();
    download.mockResolvedValue({ data: new Blob(["svg"], { type: "image/svg+xml" }), error: null });
    expect((await request()).status).toBe(503);
  });
});
