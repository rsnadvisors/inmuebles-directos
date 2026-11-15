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
  if (typeof XMLHttpRequest !== "undefined") vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(noNetwork);
  // Synthetic Turnstile: never loads the remote script; issues a fresh fake token per render/reset.
  if (typeof window !== "undefined") {
    let serial = 0;
    const widgets = new Map<string, (token: string) => void>();
    (window as unknown as { turnstile?: unknown }).turnstile = {
      render: vi.fn((element: HTMLElement, options: { callback: (token: string) => void; "response-field"?: boolean }) => {
        // Mirrors the real widget: it injects a hidden response input unless response-field is false.
        if (options["response-field"] !== false) {
          const input = document.createElement("input"); input.type = "hidden"; input.name = "cf-turnstile-response"; element.appendChild(input);
        }
        const id = `w${++serial}`; widgets.set(id, options.callback); options.callback(`test-turnstile-${serial}`); return id;
      }),
      reset: vi.fn((id: string) => widgets.get(id)?.(`test-turnstile-${++serial}`)),
      remove: vi.fn((id: string) => { widgets.delete(id); }),
    };
  }
});

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") delete (window as unknown as { turnstile?: unknown }).turnstile;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
