"use client";
import { useState } from "react";
import Link from "next/link";

export default function PublicarPage() {
  const [sent, setSent] = useState(false);
  return (
    <main className="publish-page">
      <header className="publish-header"><Link href="/" className="publish-brand"><b>ID</b><span>Inmuebles Directos</span><small>PIURA</small></Link><Link href="/" className="back-link">Volver al mapa</Link></header>
      <section className="publish-shell">
        <div className="publish-intro"><p className="eyebrow">PUBLICA GRATIS · PIURA</p><h1>Publica tu propiedad</h1><p className="lead">Comparte tu inmueble en el mapa de Piura. Completa los datos y recibe contactos de personas interesadas.</p><div className="steps"><span className="active">1 <b>Datos</b></span><i></i><span>2 <b>Ubicacion</b></span><i></i><span>3 <b>Publicar</b></span></div></div>
        {sent ? (<div className="success-card"><div className="success-icon">✓</div><h2>Solicitud recibida</h2><p>Tu propiedad quedo registrada para revision. Te contactaremos cuando este visible en el mapa.</p><Link href="/" className="primary-btn">Volver al mapa</Link></div>) : (
          <form className="publish-form" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
            <div className="form-section"><h2>Informacion del inmueble</h2><p>Describe lo esencial para que tu anuncio sea claro.</p><div className="field-grid"><label>Tipo de propiedad<select name="type" required defaultValue=""><option value="" disabled>Selecciona</option><option>Casa</option><option>Departamento</option><option>Terreno</option><option>Local comercial</option></select></label><label>Operacion<select name="operation" defaultValue="Comprar"><option>Comprar</option><option>Alquilar</option></select></label></div><label>Titulo del anuncio<input name="title" required placeholder="Ej. Terreno residencial en Castilla" /></label><label>Precio en USD<input name="price" required type="number" min="1" placeholder="72000" /></label><label>Descripcion<textarea name="description" required placeholder="Cuentanos sobre el inmueble, sus medidas y beneficios..."></textarea></label></div>
            <div className="form-section"><h2>Ubicacion y contacto</h2><p>La ubicacion se mostrara en el mapa para compradores cercanos.</p><label>Sector o distrito<input name="location" required placeholder="Castilla, Piura" /></label><div className="field-grid"><label>Area en m²<input name="area" required type="number" min="1" placeholder="420" /></label><label>Tu nombre<input name="name" required placeholder="Nombre del anunciante" /></label></div><label>WhatsApp o telefono<input name="phone" required type="tel" placeholder="+51 999 999 999" /></label></div>
            <button className="primary-btn" type="submit">Publicar gratis <span>→</span></button><p className="form-note">Al publicar aceptas que revisemos la informacion antes de mostrarla en el mapa.</p>
          </form>
        )}
      </section>
    </main>
  );
}
