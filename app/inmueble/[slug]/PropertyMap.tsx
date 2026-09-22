"use client";

import dynamic from "next/dynamic";
import type { MappableListing } from "../../lib/inventory";

const PiuraMap = dynamic(() => import("../../PiuraMap"), { ssr: false });

export default function PropertyMap({ property }: { property: MappableListing }) {
  return <div className="property-full-map"><PiuraMap properties={[property]} center={property.coords} /></div>;
}
