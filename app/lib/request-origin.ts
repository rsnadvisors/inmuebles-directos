import { developmentRequestOrigin, siteOrigin } from "./auth-origin";

export { developmentRequestOrigin };

/** Same-origin gate for state-changing publication routes.
 * Production compares only against the configured canonical origin. Development
 * accepts the browser's actual loopback origin on the same port. Forwarded
 * headers and remote development hosts are never trusted.
 */
export function isSamePublicationOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (process.env.NODE_ENV === "production") {
    try { return origin === siteOrigin(); } catch { return false; }
  }
  try {
    const supplied = new URL(origin);
    return supplied.origin === origin && !supplied.username && !supplied.password &&
      origin === developmentRequestOrigin(request);
  } catch { return false; }
}
