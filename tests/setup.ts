import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetInventory } from "./mocks/supabase";

vi.mock("../app/lib/supabase", async () => import("./mocks/supabase"));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => { throw new Error("Real Supabase SDK is forbidden in PR-0 tests"); },
}));
vi.mock("next/dynamic", async () => {
  const { default: Map } = await import("./mocks/Map");
  return { default: () => Map };
});

beforeEach(() => {
  resetInventory();
  const noNetwork = () => { throw new Error("Network access is forbidden in PR-0 tests"); };
  vi.stubGlobal("fetch", vi.fn(noNetwork));
  vi.stubGlobal("WebSocket", class { constructor() { noNetwork(); } });
  vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(noNetwork);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
