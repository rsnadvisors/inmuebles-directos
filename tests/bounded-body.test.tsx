// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readBoundedBody } from "../app/lib/bounded-body";

function streamed(stream: ReadableStream<Uint8Array>, signal?: AbortSignal, length?: string) {
  return new Request("http://localhost/upload", { method: "POST", body: stream, signal,
    ...(length ? { headers: { "content-length": length } } : {}), duplex: "half" } as RequestInit);
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("bounded request body", () => {
  it("reads actual bytes, including an exactly full body", async () => {
    const request = new Request("http://localhost", { method: "POST", body: "abcd" });
    const blob = await readBoundedBody(request, 4, 1000);
    expect(blob.size).toBe(4); expect(await blob.text()).toBe("abcd");
    expect(request.body!.locked).toBe(false);
  });
  it("accepts an empty stream", async () => {
    expect((await readBoundedBody(streamed(new ReadableStream({ start(c) { c.close(); } })), 4, 1000)).size).toBe(0);
  });
  it("rejects a declared oversized body without acquiring its reader", async () => {
    const request = streamed(new ReadableStream(), undefined, "5");
    const acquire = vi.spyOn(request.body!, "getReader");
    await expect(readBoundedBody(request, 4, 1000)).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
    expect(acquire).not.toHaveBeenCalled();
  });
  it.each([undefined, "1", "invalid"])("counts bytes even with content-length %s", async length => {
    const cancel = vi.fn();
    const request = streamed(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(5)); }, cancel }), undefined, length);
    await expect(readBoundedBody(request, 4, 1000)).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
    expect(cancel).toHaveBeenCalledOnce(); expect(request.body!.locked).toBe(false);
  });
  it("times out a stalled read, without waiting for a stalled cancellation", async () => {
    vi.useFakeTimers(); const cancel = vi.fn(() => new Promise<void>(() => {}));
    const request = streamed(new ReadableStream({ cancel }));
    const result = readBoundedBody(request, 4, 100);
    const rejection = expect(result).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(100); await rejection;
    expect(cancel).toHaveBeenCalledOnce(); expect(request.body!.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not reset the deadline when chunks arrive", async () => {
    vi.useFakeTimers(); let controller!: ReadableStreamDefaultController<Uint8Array>;
    const result = readBoundedBody(streamed(new ReadableStream({ start(c) { controller = c; } })), 10, 100);
    const rejection = expect(result).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(60); controller.enqueue(new Uint8Array(1));
    await vi.advanceTimersByTimeAsync(40); await rejection;
  });
  it("cannot starve the deadline with endless immediately available empty chunks", async () => {
    const cancel = vi.fn();
    const request = streamed(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(0)); }, cancel }));
    await expect(readBoundedBody(request, 4, 5)).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("does not acquire an already aborted request", async () => {
    const abort = new AbortController(); abort.abort(); const request = streamed(new ReadableStream(), abort.signal);
    await expect(readBoundedBody(request, 4, 100)).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    expect(request.body!.locked).toBe(false);
  });
  it("interrupts a pending read on disconnect and removes its timer", async () => {
    vi.useFakeTimers(); const abort = new AbortController(); const cancel = vi.fn();
    const request = streamed(new ReadableStream({ cancel }), abort.signal);
    const result = readBoundedBody(request, 4, 100);
    const rejection = expect(result).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    abort.abort(); await rejection;
    expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not replace the rejection if cancel throws", async () => {
    const request = streamed(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(5)); },
      cancel() { throw new Error("PRIVATE_TRANSPORT_DETAIL"); } }));
    await expect(readBoundedBody(request, 4, 100)).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
  });
  it("redacts stream failures", async () => {
    const request = streamed(new ReadableStream({ start(c) { c.error(new Error("PRIVATE_TRANSPORT_DETAIL")); } }));
    await expect(readBoundedBody(request, 4, 100)).rejects.toMatchObject({ message: "INVALID_REQUEST" });
  });
  it.each([[0, 100], [-1, 100], [4, 0], [4, NaN]])("refuses invalid internal bounds %s/%s", async (limit, timeout) => {
    await expect(readBoundedBody(new Request("http://localhost"), limit, timeout)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("rejects a missing body", async () => {
    await expect(readBoundedBody(new Request("http://localhost"), 4, 100)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("clears deadline and abort hooks after successful completion", async () => {
    vi.useFakeTimers(); const abort = new AbortController();
    const request = new Request("http://localhost", { method: "POST", body: "ok", signal: abort.signal });
    const remove = vi.spyOn(request.signal, "removeEventListener");
    await readBoundedBody(request, 4, 100);
    expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    abort.abort(); await vi.advanceTimersByTimeAsync(101);
  });
});
