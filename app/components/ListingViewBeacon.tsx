"use client";

import { useEffect } from "react";
import { trackListingEvent } from "../lib/listing-events";

/** Cuenta una visita a la ficha (una por pestaña). No renderiza nada. */
export default function ListingViewBeacon({ id }: { id: string | number | undefined }) {
  useEffect(() => { trackListingEvent(id, "view"); }, [id]);
  return null;
}
