"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ACTION_CONFIRM, ACTION_LABELS, availableActions, LISTING_TTL_DAYS, type ListingAction } from "../../lib/listing-management";

type Props = { id: string; title: string; slug: string; status: string; listingType: string; isReserved: boolean;
  ownerPaused: boolean; deletionRequestedAt: string | null; publishedAt: string | null; renewedAt?: string | null };

const DELETE_CONFIRM = (title: string) => `Vas a eliminar definitivamente «${title}» y sus fotos. Esta acción no se puede deshacer.\n\nSi solo se vendió o alquiló, usa «Marcar como vendido/alquilado» en su lugar.\n\n¿Eliminar el anuncio?`;

/** Acciones de gestión de un anuncio propio. Cada cambio se confirma en el servidor y recarga la lista. */
export default function ListingActions(props: Props) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { actions, canEdit, canDelete, deleting, moderated } = availableActions({ status: props.status, listing_type: props.listingType,
    is_reserved: props.isReserved, owner_paused: props.ownerPaused, deletion_requested_at: props.deletionRequestedAt, published_at: props.publishedAt, renewed_at: props.renewedAt ?? null });

  async function send(body: Record<string, unknown>, confirmText?: string) {
    if (pending.current) return;
    if (confirmText && !window.confirm(confirmText)) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/mis-propiedades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null) as { ok?: boolean; message?: unknown } | null;
      if (!response.ok || !result?.ok) {
        setMessage(typeof result?.message === "string" ? result.message : "No pudimos completar la operación. Inténtalo más tarde.");
        if (response.status === 401) window.location.assign("/login?returnTo=/mis-propiedades");
        return;
      }
      setMessage(body.op === "delete" ? "Anuncio eliminado." : body.action === "renew" ? `Renovado: seguirá publicado otros ${LISTING_TTL_DAYS} días.` : "Cambios guardados.");
      router.refresh();
    } catch {
      setMessage("No pudimos conectar con el servidor. Inténtalo de nuevo.");
    } finally { pending.current = false; setBusy(false); }
  }

  const act = (action: ListingAction) => send({ op: "status", id: props.id, action }, ACTION_CONFIRM[action]);

  return <div className="acct-manage" aria-busy={busy}>
    <div className="acct-manage-buttons">
      {props.status === "published" && !deleting && <Link href={`/inmueble/${props.slug}`} className="acct-btn acct-btn-quiet">Ver ficha</Link>}
      {canEdit && <Link href={`/mis-propiedades/${props.id}/editar`} className="acct-btn acct-btn-quiet">Editar</Link>}
      {actions.map(action => <button key={action} type="button" className="acct-btn acct-btn-quiet" disabled={busy} onClick={() => act(action)}>{ACTION_LABELS[action]}</button>)}
      {canDelete && <button type="button" className="acct-btn acct-btn-danger" disabled={busy}
        onClick={() => send({ op: "delete", id: props.id }, deleting ? undefined : DELETE_CONFIRM(props.title))}>{deleting ? "Reintentar eliminación" : "Eliminar"}</button>}
    </div>
    {moderated && <p className="acct-manage-note">Este anuncio fue archivado tras una revisión. Escríbenos si crees que es un error.</p>}
    <p className="acct-manage-note" role="status">{message}</p>
  </div>;
}
