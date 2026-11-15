import Link from "next/link";
import LegalPage from "../components/LegalPage";
import { TITULAR } from "../lib/legal";

export const metadata = { title: "Política de privacidad | Inmuebles Directos" };

export default function Privacidad() {
  const t = TITULAR;
  return (
    <LegalPage title="Política de privacidad">
      <p>
        Esta política explica cómo se tratan los datos personales en el portal {t.marca}, conforme a la Ley N.º 29733,
        Ley de Protección de Datos Personales, y su Reglamento.
      </p>

      <h2>1. Titular del banco de datos</h2>
      <p>
        {t.nombre}, con RUC {t.ruc}, con domicilio en {t.direccion}.
        Correo de contacto: <a href={`mailto:${t.correo}`}>{t.correo}</a>. Teléfono: {t.telefono}.
      </p>

      <h2>2. Datos que tratamos</h2>
      <ul>
        <li><strong>Cuenta:</strong> nombre completo, correo electrónico y contraseña (almacenada cifrada, nunca en texto plano).</li>
        <li><strong>Anuncios:</strong> datos del inmueble (tipo, operación, precio, dirección, ubicación en el mapa, características, descripción y fotografías) y el teléfono de contacto del anunciante.</li>
        <li><strong>Contactos:</strong> los datos que un interesado decida enviar para comunicarse con un anunciante.</li>
        <li><strong>Datos técnicos:</strong> registros de seguridad y funcionamiento (dirección IP, fecha y hora de acceso, navegador), y cookies técnicas necesarias para mantener la sesión iniciada.</li>
      </ul>
      <p>No solicitamos datos sensibles. El portal no está dirigido a menores de 18 años.</p>

      <h2>3. Finalidades</h2>
      <ul>
        <li>Crear y gestionar tu cuenta y permitirte iniciar sesión y recuperar tu contraseña.</li>
        <li>Publicar tus anuncios y mostrarlos en el buscador y en el mapa.</li>
        <li>Permitir que los interesados contacten directamente con el anunciante.</li>
        <li>Mantener la seguridad del portal, prevenir fraudes y abusos, y atender consultas y reclamos.</li>
        <li>Cumplir obligaciones legales.</li>
      </ul>
      <p>No vendemos tus datos ni los usamos para publicidad de terceros.</p>

      <h2>4. Información pública de los anuncios</h2>
      <p>
        Al publicar un anuncio, sus datos, fotografías y el <strong>teléfono de contacto</strong> que indiques serán
        visibles para cualquier visitante, con el fin de que puedan llamarte o escribirte por WhatsApp. Puedes
        archivar o modificar tus anuncios en cualquier momento.
      </p>

      <h2>5. Base legal y consentimiento</h2>
      <p>
        Tratamos tus datos con tu consentimiento libre, previo, expreso e informado, que otorgas al crear tu cuenta y al
        publicar un anuncio, y para ejecutar el servicio que solicitas. Puedes revocar tu consentimiento en cualquier
        momento, lo que puede implicar el cierre de tu cuenta y la retirada de tus anuncios.
      </p>

      <h2>6. Encargados y transferencias internacionales</h2>
      <p>
        Para prestar el servicio utilizamos proveedores tecnológicos que actúan como encargados del tratamiento:
        Supabase (base de datos, autenticación y almacenamiento de imágenes, con servidores en São Paulo, Brasil),
        Cloudflare (alojamiento y entrega del sitio web) y GitHub (copias de seguridad cifradas). Estos servicios
        implican un flujo transfronterizo de datos personales, que se realiza con medidas de seguridad adecuadas.
        No compartimos tus datos con otros terceros salvo obligación legal.
      </p>

      <h2>7. Conservación</h2>
      <p>
        Conservamos los datos de tu cuenta y tus anuncios mientras tu cuenta esté activa. Si solicitas la cancelación,
        los eliminamos o anonimizamos, salvo lo que debamos conservar por obligación legal. Las copias de seguridad
        cifradas se conservan hasta 90 días.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas para proteger tus datos: conexiones cifradas (HTTPS), contraseñas
        cifradas, control de acceso por usuario, imágenes de borradores en almacenamiento privado y copias de
        seguridad cifradas.
      </p>

      <h2>9. Tus derechos</h2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición (derechos ARCO), así como
        revocar tu consentimiento, escribiendo a <a href={`mailto:${t.correo}`}>{t.correo}</a> con el asunto
        «Derechos ARCO». Indica tu nombre, el derecho que deseas ejercer y adjunta una copia de tu documento de
        identidad. Responderemos dentro de los plazos establecidos por la normativa vigente.
      </p>
      <p>
        Si consideras que no se atendió tu solicitud, puedes presentar una reclamación ante la Autoridad Nacional de
        Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.
      </p>

      <h2>10. Cookies</h2>
      <p>
        Usamos únicamente cookies técnicas necesarias para iniciar y mantener tu sesión de forma segura. No usamos
        cookies de publicidad ni de seguimiento de terceros. Para mostrar a cada anunciante cuántas visitas y contactos recibe su anuncio, contamos
        de forma agregada (por día y anuncio) las visitas y los clics en «Llamar» y «WhatsApp», sin cookies, sin identificarte y sin guardar tu dirección IP.
      </p>

      <h2>11. Cambios</h2>
      <p>
        Podemos actualizar esta política. Publicaremos la nueva versión en esta página con su fecha de actualización.
        Consulta también los <Link href="/terminos">Términos y condiciones de uso</Link>.
      </p>
    </LegalPage>
  );
}
