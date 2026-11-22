import Link from "next/link";

export type BreadcrumbStep = { name: string; path?: string };

/** Ruta de navegación compartida (ficha y páginas por zona): el último nivel, sin enlace, es la página actual. */
export default function Breadcrumb({ steps }: { steps: BreadcrumbStep[] }) {
  return <nav className="breadcrumb" aria-label="Ruta de navegación">
    <ol>
      {steps.map((step, index) => step.path && index < steps.length - 1
        ? <li key={`${index}-${step.name}`}><Link href={step.path}>{index === 0 && <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>}{step.name}</Link></li>
        : <li key={`${index}-${step.name}`} className="breadcrumb-current"><span aria-current="page" title={step.name}>{step.name}</span></li>)}
    </ol>
  </nav>;
}
