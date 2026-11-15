import "server-only";

/** Respuestas comunes de las rutas de gestión del anunciante: códigos estables y mensajes en español, sin detalles internos. */
export const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status });
export const failure = (code: string, message: string, status: number) => reply(status, { ok: false, code, message });

export const OWNER_ERRORS: Record<string, [number, string]> = {
  LISTING_NOT_FOUND: [404, "No encontramos ese anuncio en tu cuenta."],
  LISTING_NOT_EDITABLE: [409, "Este anuncio no se puede modificar en su estado actual."],
  INVALID_TRANSITION: [409, "Esa acción no está disponible para el estado actual del anuncio. Recarga la página."],
  INVALID_FIELDS: [400, "Algún dato no es válido. Revisa el formulario."],
  AUTH_REQUIRED: [401, "Inicia sesión para gestionar tus anuncios."],
  IMAGES_REMAIN: [502, "No pudimos borrar todas las fotos. Vuelve a intentarlo en unos minutos."],
  DELETION_NOT_REQUESTED: [409, "Vuelve a intentar la eliminación."],
  LEGACY_IMAGES: [409, "Este anuncio antiguo no admite este cambio desde aquí. Escríbenos y lo hacemos por ti."],
  INVALID_IMAGE: [400, "La foto debe ser JPG, PNG o WebP y pesar como máximo 5 MiB."],
  TOO_MANY_IMAGES: [409, "Un anuncio admite como máximo 5 fotos."],
  UPLOAD_DAILY_LIMIT: [429, "Alcanzaste el límite de fotos subidas por hoy. Inténtalo mañana."],
  UPLOAD_NOT_FOUND: [409, "La subida caducó. Vuelve a elegir la foto."],
  IMAGE_NOT_FOUND: [404, "Esa foto ya no está en el anuncio. Recarga la página."],
  LAST_IMAGE: [409, "El anuncio necesita al menos una foto. Añade otra antes de quitar esta."],
  INVALID_ORDER: [409, "Las fotos cambiaron. Recarga la página e inténtalo de nuevo."],
  ADMIN_ACCOUNT: [409, "Las cuentas de administración no se pueden eliminar desde aquí."],
  LISTINGS_REMAIN: [409, "Aún quedan anuncios en tu cuenta. Vuelve a intentarlo."],
  PUBLICATION_PENDING: [409, "Tienes una publicación sin terminar. Ve a «Publicar» y cancélala antes de eliminar la cuenta."],
};

export function ownerFailure(code: string | undefined): Response {
  const known = code ? OWNER_ERRORS[code] : undefined;
  return known ? failure(code!, known[1], known[0])
    : failure("MANAGEMENT_UNAVAILABLE", "No pudimos completar la operación. Inténtalo más tarde.", 503);
}

export function rpcFailure(error: { message?: string; code?: string } | null): Response {
  if (error?.message && OWNER_ERRORS[error.message]) return ownerFailure(error.message);
  if (error?.code === "PT404") return ownerFailure("LISTING_NOT_FOUND");
  return ownerFailure(undefined);
}
