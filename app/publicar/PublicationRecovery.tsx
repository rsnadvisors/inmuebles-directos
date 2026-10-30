"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { PARTIAL_MESSAGE } from "../lib/publication";

const KEY = "publicationAttempt";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FINGERPRINT = /^[0-9a-f]{64}$/;
type Reference = { id: string; fingerprint: string | null };
type Phase = "initializing" | "empty" | "unverified" | "invalid" | "storage-error"
  | "active" | "cancel-pending" | "uncertain" | "cancelled" | "finalized";
type RecoveryState = { phase: Phase; reference: Reference | null; raw: string | null; resume: boolean };
type Operation = { generation: number; userId: string; canPublish: boolean; raw: string | null; reference: Reference | null;
  createdHere: boolean; sent: boolean; uncertain: boolean };
const initial: RecoveryState = { phase: "initializing", reference: null, raw: null, resume: false };

function decode(raw: string | null): RecoveryState {
  if (raw === null) return { ...initial, phase: "empty" };
  try {
    if (raw.length > 1024 || new TextEncoder().encode(raw).byteLength > 1024) throw new Error();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const record = value as Record<string, unknown>;
    if (typeof record.id !== "string" || !UUID.test(record.id)) throw new Error();
    return { phase: "unverified", raw, resume: false, reference: { id: record.id,
      fingerprint: typeof record.fingerprint === "string" && FINGERPRINT.test(record.fingerprint) ? record.fingerprint : null } };
  } catch { return { ...initial, phase: "invalid", raw }; }
}

function useController(userId: string, canPublish: boolean) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = useRef(initial);
  const operation = useRef<Operation | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const identity = useRef({ userId, canPublish });
  identity.current = { userId, canPublish };
  function update(next: RecoveryState) { current.current = next; setState(next); }
  function readStorage(): RecoveryState {
    try { return decode(window.sessionStorage.getItem(KEY)); }
    catch { return { ...current.current, phase: "storage-error", resume: false }; }
  }
  useEffect(() => {
    mounted.current = true; generation.current++; operation.current = null;
    setBusy(false); setMessage(""); update(readStorage());
    return () => { mounted.current = false; generation.current++; operation.current = null; };
  }, [userId, canPublish]);

  function live(op: Operation) {
    return mounted.current && operation.current === op && generation.current === op.generation
      && identity.current.userId === op.userId && identity.current.canPublish === op.canPublish;
  }
  function unchanged(op: Operation) {
    if (!live(op)) return false;
    try {
      if (window.sessionStorage.getItem(KEY) === op.raw && current.current.raw === op.raw) return true;
      generation.current++; operation.current = null; setBusy(false);
      update(readStorage());
      setMessage("La referencia cambió. Comprueba el intento vigente antes de continuar.");
    } catch {
      update({ ...current.current, phase: "storage-error", resume: false });
      setMessage("No pudimos acceder a la referencia. No iniciaremos otra publicación.");
    }
    return false;
  }
  function finish(op: Operation) {
    if (!live(op)) return;
    operation.current = null; setBusy(false);
  }
  function acquire(): Operation | null {
    if (!mounted.current || operation.current || current.current.phase === "initializing") return null;
    const op: Operation = { generation: generation.current, ...identity.current,
      reference: current.current.reference, raw: current.current.raw, createdHere: false, sent: false, uncertain: false };
    operation.current = op;
    if (!unchanged(op)) { finish(op); return null; }
    setBusy(true); return op;
  }
  function beginPublication(): Operation | null {
    const value = current.current;
    if (!canPublish || !(value.phase === "empty" || value.phase === "cancelled"
      || (value.phase === "active" && value.resume && value.reference?.fingerprint))) return null;
    return acquire();
  }
  function bindPublication(op: Operation, fingerprint: string): Reference | null {
    if (!op.canPublish || op.sent || !unchanged(op) || !FINGERPRINT.test(fingerprint)) return null;
    if (op.reference && op.reference.fingerprint !== fingerprint) {
      update({ ...current.current, resume: false });
      setMessage("Hay una publicación anterior pendiente de confirmar. Conserva los mismos datos o solicita su cancelación.");
      return null;
    }
    op.createdHere = op.reference === null;
    const reference = op.reference ?? { id: crypto.randomUUID(), fingerprint };
    const raw = op.raw ?? JSON.stringify(reference);
    // Retain the generated ID in memory even if persistence fails. Never POST on that failure.
    op.reference = reference;
    update({ phase: "unverified", reference, raw: op.raw, resume: false });
    setMessage("Publicación pendiente de confirmación.");
    try {
      window.sessionStorage.setItem(KEY, raw);
      op.raw = raw;
      update({ ...current.current, raw });
      if (window.sessionStorage.getItem(KEY) !== raw) {
        unchanged(op); return null;
      }
      return reference;
    } catch {
      update({ ...current.current, phase: "storage-error", resume: false });
      setMessage("No pudimos guardar el identificador del intento. No enviamos la publicación.");
      return null;
    }
  }
  function markPublicationSent(op: Operation) {
    if (!op.canPublish || op.sent || !op.reference || !op.raw || !unchanged(op)) return false;
    op.sent = true; return true;
  }
  function releaseRejectedPublication(op: Operation, status: number, result: unknown) {
    if (!op.createdHere || !op.sent || op.uncertain || !op.reference || !unchanged(op)
      || !result || typeof result !== "object" || Array.isArray(result)) return false;
    const body = result as Record<string, unknown>;
    const expectedStatus = body.code === "INVALID_CONTENT_TYPE" ? 415
      : body.code === "REQUEST_TOO_LARGE" ? 413
      : body.code === "VALIDATION_ERROR" || body.code === "INVALID_REQUEST" ? 400 : null;
    if (expectedStatus === null || status !== expectedStatus || body.ok !== false || body.preparation !== "NOT_STARTED"
      || body.requestId !== op.reference.id || body.subject !== op.userId) return false;
    try {
      window.sessionStorage.removeItem(KEY);
      if (window.sessionStorage.getItem(KEY) !== null) { unchanged(op); return false; }
      generation.current++; operation.current = null; setBusy(false);
      update({ ...initial, phase: "empty" }); setMessage("");
      return true;
    } catch {
      update({ ...current.current, phase: "storage-error", resume: false });
      setMessage("No pudimos cerrar la referencia rechazada. No iniciaremos otro intento.");
      return false;
    }
  }
  function uncertain(op: Operation) {
    if (!unchanged(op)) return;
    op.uncertain = true;
    update({ ...current.current, phase: "uncertain", resume: false }); setMessage(PARTIAL_MESSAGE);
  }
  function close(op: Operation, phase: "cancelled" | "finalized") {
    if (!op.reference || !unchanged(op)) return false;
    if (phase === "finalized") {
      // Retain the reference across remounts until a deliberate new intention.
      update({ ...current.current, phase, resume: false });
      setMessage("Tu publicación anterior ya fue registrada. Revísala en Mis propiedades; no vuelvas a publicarla.");
      return true;
    }
    try {
      window.sessionStorage.removeItem(KEY);
      if (window.sessionStorage.getItem(KEY) !== null) { unchanged(op); return false; }
      update({ phase, reference: null, raw: null, resume: false }); op.raw = null;
      setMessage("Intento cancelado y cierre confirmado. Puedes iniciar una nueva publicación cuando lo decidas.");
      return true;
    } catch {
      update({ ...current.current, phase: "storage-error", resume: false });
      setMessage("El servidor confirmó el resultado, pero no pudimos cerrar la referencia local. No inicies otro intento.");
      return false;
    }
  }
  function startNewPublication(resetForm: () => void) {
    if (!canPublish || current.current.phase !== "finalized") return false;
    const op = acquire(); if (!op?.reference) return false;
    try {
      window.sessionStorage.removeItem(KEY);
      if (window.sessionStorage.getItem(KEY) !== null) { unchanged(op); return false; }
      resetForm();
      generation.current++; operation.current = null; setBusy(false);
      update({ ...initial, phase: "empty" }); setMessage("");
      return true;
    } catch {
      update({ ...current.current, phase: "finalized", resume: false });
      setMessage("No pudimos iniciar otra publicación. Conservamos el bloqueo de la publicación finalizada.");
      return false;
    } finally { finish(op); }
  }
  async function resolve(action: "cancel" | "reconcile") {
    if (!current.current.reference || current.current.phase === "finalized") return;
    const op = acquire(); if (!op?.reference) return;
    try {
      const response = await fetch("/api/publicar/cancelar", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: op.reference.id, action }) });
      const result: unknown = await response.json();
      if (!unchanged(op)) return;
      if (!result || typeof result !== "object" || Array.isArray(result)) { uncertain(op); return; }
      const body = result as Record<string, unknown>;
      if (response.status === 409 && !response.ok && body.ok === false && body.code === "PUBLICATION_ALREADY_FINALIZED"
        && (body.requestId === undefined || body.requestId === op.reference.id) && body.state === undefined) {
        close(op, "finalized"); return;
      }
      if (response.status !== 200 || !response.ok || body.ok !== true || body.requestId !== op.reference.id || body.code !== undefined) {
        uncertain(op); return;
      }
      if (body.state === "CANCELLED") { close(op, "cancelled"); return; }
      if (body.state === "ACTIVE" && action === "reconcile") {
        update({ ...current.current, phase: "active", resume: false });
        setMessage("El intento sigue pendiente. Puedes comprobarlo o solicitar su cancelación.");
      } else if (body.state === "CANCEL_PENDING") {
        update({ ...current.current, phase: "cancel-pending", resume: false });
        setMessage("La cancelación sigue pendiente. Comprobar puede completar su cierre y eliminar los archivos asociados.");
      } else uncertain(op);
    } catch { uncertain(op); }
    finally { finish(op); }
  }
  function allowResume() {
    if (!canPublish || current.current.phase !== "active" || !current.current.reference?.fingerprint) return;
    const op = acquire(); if (!op) return;
    update({ ...current.current, resume: true }); setMessage("Reintentarás el mismo intento. Completa los mismos datos y fotografías.");
    finish(op);
  }
  const canSubmit = canPublish && !busy && (state.phase === "empty" || state.phase === "cancelled"
    || (state.phase === "active" && state.resume && !!state.reference?.fingerprint));
  return { state, busy, message, canPublish, canSubmit, beginPublication, bindPublication, markPublicationSent,
    releaseRejectedPublication, startNewPublication,
    isCurrent: unchanged, finishPublication: finish, publicationUncertain: uncertain,
    completePublication: (op: Operation) => close(op, "finalized"), resolve, allowResume };
}

const RecoveryContext = createContext<ReturnType<typeof useController> | null>(null);
export function usePublicationRecovery() {
  const value = useContext(RecoveryContext);
  if (!value) throw new Error("Publication recovery context is required");
  return value;
}
export default function PublicationRecovery({ userId, canPublish, children }: { userId: string; canPublish: boolean; children?: ReactNode }) {
  const controller = useController(userId, canPublish);
  return <RecoveryContext.Provider value={controller}>{canPublish ? children : <main className="publish-page">
    <h1>Recuperar publicación anterior</h1>
    <p>Para publicar necesitas una cuenta registrada con correo electrónico confirmado. Puedes resolver intentos propios anteriores.</p>
    <PublicationRecoveryPanel />
  </main>}</RecoveryContext.Provider>;
}
export function PublicationRecoveryPanel({ onStartNewPublication }: { onStartNewPublication?: () => void } = {}) {
  const recovery = usePublicationRecovery();
  const { state, busy } = recovery;
  if (state.phase === "empty" && recovery.canPublish) return null;
  const fallback = state.phase === "initializing" ? "Comprobando la referencia local…"
    : state.phase === "empty" ? "No hay una referencia local disponible. Esto no demuestra que no existan intentos anteriores."
    : state.phase === "invalid" ? "La referencia local no es válida. No iniciaremos otra publicación hasta resolver esta situación."
    : state.phase === "storage-error" ? "No pudimos acceder al almacenamiento del intento. No iniciaremos otra publicación."
    : state.reference?.fingerprint === null ? "La huella local no es válida. Solo puedes comprobar o cancelar el intento; no reanudarlo."
    : "Hay una referencia local pendiente de verificar. Comprueba el intento antes de continuar.";
  return <section aria-label="Recuperación de publicación" aria-busy={busy}>
    <p role={state.phase === "initializing" ? "status" : "alert"}>{recovery.message || fallback}</p>
    {state.reference && state.phase !== "finalized" && <>
      <p>Comprobar puede completar una cancelación y eliminar los archivos asociados. La titularidad se verifica en el servidor.</p>
      <div className="publish-success-links">
        <button type="button" disabled={busy} onClick={() => recovery.resolve("reconcile")}>Comprobar el intento pendiente</button>
        <button type="button" disabled={busy} onClick={() => recovery.resolve("cancel")}>Cancelar el intento pendiente</button>
        {recovery.canPublish && state.phase === "active" && state.reference.fingerprint && !state.resume
          && <button type="button" disabled={busy} onClick={recovery.allowResume}>Reintentar el mismo intento</button>}
      </div>
    </>}
    {state.phase === "finalized" && recovery.canPublish && onStartNewPublication
      && <button type="button" disabled={busy} onClick={() => recovery.startNewPublication(onStartNewPublication)}>Iniciar nueva publicación</button>}
    <Link href="/mis-propiedades">Revisar Mis propiedades</Link>
  </section>;
}
