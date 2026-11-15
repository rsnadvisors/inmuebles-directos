/** Cloudflare Turnstile: la Site Key es pública; la Secret Key vive solo en el Worker y en Supabase. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAGB-7LVdf9wdUwFZ";
export const TURNSTILE_ACTIONS = { login: "login", register: "register", recovery: "recovery", publish: "publish" } as const;
export type TurnstileAction = typeof TURNSTILE_ACTIONS[keyof typeof TURNSTILE_ACTIONS];
export const TURNSTILE_HEADER = "x-turnstile-token";
export const TURNSTILE_MISSING_MESSAGE = "Espera a que termine la verificación de seguridad e inténtalo de nuevo.";
