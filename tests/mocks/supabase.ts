import { vi } from "vitest";
import { properties } from "../fixtures/properties";

let rows = structuredClone(properties);
export function resetInventory() { rows = structuredClone(properties); }
export function setInventory(value: typeof properties) { rows = structuredClone(value); }

const forbidden = () => { throw new Error("PR-0: writes/Auth/Storage are forbidden in smoke tests"); };
const channel = { on: vi.fn(), subscribe: vi.fn() };
channel.on.mockImplementation(() => channel);
channel.subscribe.mockImplementation(() => channel);

export const supabase = {
  from: vi.fn((table: string) => {
    if (table !== "properties") throw new Error(`Unexpected table: ${table}`);
    return {
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: structuredClone(rows), error: null })),
      })),
      insert: forbidden, update: forbidden, delete: forbidden,
    };
  }),
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(async () => "ok"),
  storage: { from: forbidden },
  auth: new Proxy({}, { get: () => forbidden }),
};
