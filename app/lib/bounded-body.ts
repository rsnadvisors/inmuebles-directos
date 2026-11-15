// Bounds this handler's body read only; ingress limits and global concurrency
// controls still belong to the deployment proxy/runtime.
export const JSON_BODY_TIMEOUT_MS = 15_000;
export const UPLOAD_BODY_TIMEOUT_MS = 120_000;
export class BodyReadError extends Error {
  constructor(readonly code: "REQUEST_TOO_LARGE" | "REQUEST_TIMEOUT" | "REQUEST_ABORTED" | "INVALID_REQUEST") {
    super(code);
    this.name = "BodyReadError";
  }
}

export async function readBoundedBody(request: Request, limit: number, timeoutMs: number): Promise<Blob> {
  if (!Number.isSafeInteger(limit) || limit <= 0 || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new BodyReadError("INVALID_REQUEST");
  }
  if (request.signal.aborted) throw new BodyReadError("REQUEST_ABORTED");
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > limit) throw new BodyReadError("REQUEST_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new BodyReadError("INVALID_REQUEST");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  let fail!: (error: BodyReadError) => void;
  const interrupted = new Promise<never>((_, reject) => { fail = reject; });
  const started = performance.now();
  const abort = () => fail(new BodyReadError("REQUEST_ABORTED"));
  const timer = setTimeout(() => fail(new BodyReadError("REQUEST_TIMEOUT")), timeoutMs);
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    // An absolute deadline, not a fresh timeout for each arriving chunk.
    if (request.signal.aborted) abort();
    while (true) {
      // Also enforce the deadline if immediately resolved reads starve timers.
      if (performance.now() - started >= timeoutMs) throw new BodyReadError("REQUEST_TIMEOUT");
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (request.signal.aborted) throw new BodyReadError("REQUEST_ABORTED");
      if (performance.now() - started >= timeoutMs) throw new BodyReadError("REQUEST_TIMEOUT");
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new BodyReadError("REQUEST_TOO_LARGE");
      if (value.byteLength) chunks.push(new Uint8Array(value));
    }
    return new Blob(chunks);
  } catch (error) {
    // Cancellation itself may stall/reject. Never await it or expose its error.
    try { void reader.cancel().catch(() => {}); } catch { /* no retry */ }
    if (error instanceof BodyReadError) throw error;
    throw new BodyReadError("INVALID_REQUEST");
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
