import { propertyContactLinks } from "../lib/contact-phone";

export default function PropertyContactActions({ phone, title, status }: { phone: string | null | undefined; title: string; status?: string }) {
  const links = status === "published" ? propertyContactLinks(phone, title) : null;
  if (!links) return null;
  return <nav className="property-contact-actions" aria-label="Contactar al anunciante">
    <a className="property-contact-call" href={links.tel} aria-label="Llamar al anunciante"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C9 21 3 15 3 5a2 2 0 0 1 2-2Z" /></svg>Llamar</a>
    <a className="property-contact-whatsapp" href={links.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Contactar al anunciante por WhatsApp"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a9 9 0 0 1-13.5 7.8L3 21l1.7-4.5A9 9 0 1 1 21 11.5Z" /><path d="M8 7c0 4 3 7 7 7l1-2-3-1-1 1-2-2 1-1-1-2Z" /></svg>WhatsApp</a>
  </nav>;
}
