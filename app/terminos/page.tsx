import Link from "next/link";
import LegalPage from "../components/LegalPage";
import { TITULAR } from "../lib/legal";

export const metadata = { title: "Términos y condiciones de uso | Inmuebles Directos" };

export default function Terminos() {
  const t = TITULAR;
  return (
    <LegalPage title="Términos y condiciones de uso">
      <h2>1. Quiénes somos</h2>
      <p>
        {t.marca} es un portal web operado por {t.nombre}, con RUC {t.ruc} y domicilio en {t.direccion}
        (en adelante, «el portal»). Contacto: <a href={`mailto:${t.correo}`}>{t.correo}</a>, teléfono {t.telefono}.
        Al usar el portal aceptas estos términos.
      </p>

      <h2>2. Qué ofrece el portal</h2>
      <p>
        El portal permite publicar gratuitamente anuncios de inmuebles en venta o alquiler y que los interesados
        contacten <strong>directamente</strong> con los anunciantes. El portal <strong>no es una inmobiliaria ni un
        corredor</strong>: no interviene en las negociaciones, no cobra comisiones por las operaciones, no recibe pagos
        entre las partes y no garantiza la celebración de ningún contrato.
      </p>

      <h2>3. Cuenta de usuario</h2>
      <ul>
        <li>Debes ser mayor de 18 años y proporcionar datos veraces.</li>
        <li>Eres responsable de mantener la confidencialidad de tu contraseña y de la actividad de tu cuenta.</li>
        <li>Puedes solicitar la cancelación de tu cuenta en cualquier momento escribiendo a {t.correo}.</li>
      </ul>

      <h2>4. Publicación de anuncios</h2>
      <p>Al publicar un anuncio declaras y garantizas que:</p>
      <ul>
        <li>Eres propietario del inmueble o cuentas con autorización suficiente para ofrecerlo.</li>
        <li>La información, el precio, la ubicación y las fotografías son verdaderos, actuales y corresponden al inmueble anunciado.</li>
        <li>Tienes los derechos sobre las fotografías publicadas y autorizas al portal a mostrarlas para difundir tu anuncio.</li>
        <li>Aceptas que el teléfono de contacto indicado sea visible públicamente en tu anuncio.</li>
      </ul>
      <p>Está prohibido publicar:</p>
      <ul>
        <li>Inmuebles inexistentes, ya vendidos o alquilados, o anuncios engañosos.</li>
        <li>Contenido ilícito, ofensivo, discriminatorio o que infrinja derechos de terceros.</li>
        <li>Datos personales de terceros sin su consentimiento.</li>
        <li>Publicidad ajena a la oferta del inmueble o anuncios duplicados.</li>
      </ul>

      <h2>5. Moderación</h2>
      <p>
        El portal puede revisar, ocultar, archivar o retirar anuncios y suspender cuentas que incumplan estos términos
        o la ley, o ante denuncias razonables, sin perjuicio de comunicar la medida al usuario cuando corresponda.
        Para denunciar un anuncio, escribe a {t.correo} indicando el enlace del anuncio y el motivo.
      </p>

      <h2>6. Responsabilidad</h2>
      <p>
        Los anunciantes son los únicos responsables del contenido de sus anuncios y de las operaciones que acuerden con
        los interesados. Recomendamos verificar la identidad de la contraparte y la situación legal del inmueble
        (por ejemplo, en SUNARP) antes de realizar cualquier pago. El portal no responde por la veracidad de los
        anuncios ni por los acuerdos entre usuarios, y procura mantener el servicio disponible sin garantizar su
        funcionamiento ininterrumpido.
      </p>

      <h2>7. Propiedad intelectual</h2>
      <p>
        La marca, el diseño y el software del portal pertenecen a su titular. Los anunciantes conservan los derechos
        sobre sus fotografías y textos y otorgan al portal una licencia gratuita y no exclusiva para mostrarlos
        mientras el anuncio esté publicado.
      </p>

      <h2>8. Datos personales</h2>
      <p>
        El tratamiento de datos personales se rige por la <Link href="/privacidad">Política de privacidad</Link>,
        conforme a la Ley N.º 29733.
      </p>

      <h2>9. Consultas y reclamos</h2>
      <p>
        Puedes enviar consultas, quejas o reclamos a <a href={`mailto:${t.correo}`}>{t.correo}</a> o al teléfono
        {" "}{t.telefono}. Los atenderemos en el menor plazo posible.
      </p>

      <h2>10. Cambios, ley aplicable y jurisdicción</h2>
      <p>
        Podemos modificar estos términos; la versión vigente es la publicada en esta página. Estos términos se rigen
        por las leyes de la República del Perú. Cualquier controversia se someterá a los jueces y tribunales de la
        ciudad de Piura, sin perjuicio de los derechos que la ley reconoce a los consumidores.
      </p>
    </LegalPage>
  );
}
