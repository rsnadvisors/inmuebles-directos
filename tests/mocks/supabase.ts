import { vi } from "vitest";
import { properties } from "../fixtures/properties";

let rows: unknown[] = structuredClone(properties);
type Response = { data: unknown; error: unknown };
let responder: (() => Promise<Response>) | null = null;
let refresh: (() => Promise<void>) | null = null;
export function resetInventory() { rows = structuredClone(properties); responder = null; refresh = null; }
export function setInventory(value: unknown[]) { rows = structuredClone(value); }
export function setResponse(value: () => Promise<Response>) { responder = value; }
export function refreshInventory() { return refresh?.(); }

const forbidden = () => { throw new Error("PR-0: writes/Auth/Storage are forbidden in smoke tests"); };
const channel = { on: vi.fn(), subscribe: vi.fn() };
channel.on.mockImplementation((_event, _filter, callback) => { refresh = callback; return channel; });
channel.subscribe.mockImplementation(() => channel);

export const supabase = {
  from: vi.fn((table: string) => {
    if (table !== "properties") throw new Error(`Unexpected table: ${table}`);
    return {
      select: vi.fn(() => ({
        eq: vi.fn(async () => responder ? responder() : ({ data: structuredClone(rows), error: null })),
      })),
      insert: forbidden, update: forbidden, delete: forbidden,
    };
  }),
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(async () => "ok"),
  storage: { from: forbidden },
  auth: new Proxy({}, { get: () => forbidden }),
};
