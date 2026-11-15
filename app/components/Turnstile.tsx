"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { TURNSTILE_SITE_KEY, type TurnstileAction } from "../lib/turnstile";

type TurnstileApi = {
  render(element: HTMLElement, options: Record<string, unknown>): string | undefined;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loader) loader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("TURNSTILE_UNAVAILABLE"));
    script.onerror = () => { loader = null; script.remove(); reject(new Error("TURNSTILE_UNAVAILABLE")); };
    document.head.appendChild(script);
  });
  return loader;
}

export type TurnstileHandle = { token(): string; reset(): void };

/** Widget invisible en la mayoría de casos; los tokens son de un solo uso, así que el formulario llama a reset() tras cada envío. */
const Turnstile = forwardRef<TurnstileHandle, { action: TurnstileAction }>(function Turnstile({ action }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const token = useRef("");
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    token: () => token.current,
    reset: () => {
      token.current = "";
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    },
  }), []);

  useEffect(() => {
    let alive = true;
    const mount = (api: TurnstileApi) => {
      if (!alive || !box.current || widgetId.current) return;
      widgetId.current = api.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY, action, language: "es", size: "flexible",
        // No hidden <input name="cf-turnstile-response">: the token travels explicitly, and the
        // publication form rejects unknown fields.
        "response-field": false,
        callback: (value: string) => { token.current = value; setFailed(false); },
        "expired-callback": () => { token.current = ""; },
        "error-callback": () => { token.current = ""; },
      }) ?? null;
    };
    // Script already present (navigation between forms): render synchronously.
    if (window.turnstile) mount(window.turnstile);
    else loadTurnstile().then(mount).catch(() => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
      token.current = "";
    };
  }, [action]);

  return <div className="turnstile-box" data-action={action}>
    <div ref={box} />
    {failed && <small role="alert">No pudimos cargar la verificación de seguridad. Revisa tu conexión y recarga la página.</small>}
  </div>;
});

export default Turnstile;
