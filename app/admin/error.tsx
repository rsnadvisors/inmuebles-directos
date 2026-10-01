"use client";
export default function AdminError({ reset }: { reset: () => void }) { return <section className="admin-panel"><h2>No se pudo cargar el panel</h2><p role="alert">Inténtalo más tarde.</p><button type="button" onClick={reset}>Reintentar</button></section>; }
