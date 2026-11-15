// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSON_BODY_TIMEOUT_MS, UPLOAD_BODY_TIMEOUT_MS } from "../app/lib/bounded-body";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), prepare: vi.fn(), cancel: vi.fn(), from: vi.fn() }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedPublicationUser: mocks.auth, getVerifiedUser: mocks.auth }));
vi.mock("../app/lib/publication-boundary-server", () => ({
  preparePublication: mocks.prepare, cancelPublication: mocks.cancel, inspectPublication: vi.fn(), finalizePublication: vi.fn(),
  PUBLICATION_REQUEST_ID: /^[0-9a-f-]{36}$/, PublicationBoundaryError: class extends Error {},
}));
vi.mock("../app/lib/property-images", () => ({ PRIVATE_PROPERTY_IMAGE_BUCKET: "private", anonymousImageClient: vi.fn(), loadPublishedPrivateImage: vi.fn() }));
import { POST as publish } from "../app/api/publicar/route";
import { POST as cancel } from "../app/api/publicar/cancelar/route";
const id = "11111111-1111-4111-8111-111111111111";
const paths = [
  { name: "publish", path: "/api/publicar", type: "multipart/form-data; boundary=fixture", method: "POST", ms: UPLOAD_BODY_TIMEOUT_MS, call: publish },
  { name: "cancel", path: "/api/publicar/cancelar", type: "application/json", method: "POST", ms: JSON_BODY_TIMEOUT_MS, call: cancel },
];
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); vi.stubEnv("NODE_ENV", "test");
  mocks.auth.mockResolvedValue({ user: { id }, client: { from: mocks.from }, reason: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe.each(paths)("$name boundary", route => {
  it("returns 408 before any DB/RPC/Storage operation for a stalled body", async () => {
    const request = new Request(`http://localhost${route.path}`, { method: route.method,
      headers: { origin: "http://localhost", "content-type": route.type },
      body: new ReadableStream(), duplex: "half" } as RequestInit);
    const result = route.call(request);
    await vi.advanceTimersByTimeAsync(route.ms);
    const response = await result;
    expect(response.status).toBe(408); expect((await response.json()).code).toBe("REQUEST_TIMEOUT");
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
    expect(request.body!.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it("still refuses anonymous requests before reading their body", async () => {
    mocks.auth.mockResolvedValue({ user: null, client: null, reason: null });
    const request = new Request(`http://localhost${route.path}`, { method: route.method,
      headers: { origin: "http://localhost", "content-type": route.type },
      body: new ReadableStream(), duplex: "half" } as RequestInit);
    expect((await route.call(request)).status).toBe(401); expect(request.bodyUsed).toBe(false);
  });
});
