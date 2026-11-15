import "server-only";
import type { TurnstileAction } from "./turnstile";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export type TurnstileVerdict = "PASS" | "FAIL" | "UNAVAILABLE";

/**
 * Verifica un token Turnstile en el servidor (un solo uso, 300 s de validez).
 * Sin TURNSTILE_SECRET_KEY: en producción falla cerrado; fuera de producción (tests y desarrollo) se omite.
 * Nunca registra el token ni la clave.
 */
export async function verifyTurnstile(token: string | null, remoteIp: string | null, action: TurnstileAction): Promise<TurnstileVerdict> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV === "production" ? "UNAVAILABLE" : "PASS";
  if (!token || token.length > 2048) return "FAIL";
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp.length <= 64) body.set("remoteip", remoteIp);
  try {
    const response = await fetch(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return "UNAVAILABLE";
    const result = await response.json() as { success?: unknown; action?: unknown };
    return result.success === true && result.action === action ? "PASS" : "FAIL";
  } catch {
    return "UNAVAILABLE";
  }
}
