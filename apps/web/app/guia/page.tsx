import type { Metadata } from "next";
import { headers } from "next/headers";
import { PestanasInstalacion } from "@/components/guia/PestanasInstalacion";
import { Marca } from "@/components/Marca";

export const metadata: Metadata = {
  title: "Guía rápida · Checador",
  description: "Instala Checador y empieza a registrar la jornada de tu negocio: pasos para la empresa y para su personal.",
};

/**
 * Guía rápida pública (no requiere sesión; ver proxy.ts), para enlazar desde la página de Jemba.
 * Sin promesas de "cumplimiento garantizado" (CLAUDE.md).
 */
export default async function Guia() {
  const h = await headers();
  const dominio = h.get("x-forwarded-host") ?? h.get("host") ?? "checador.jemba.mx";
  const iphone = /iPhone|iPad|iPod/.test(h.get("user-agent") ?? "");

  return (
    <main className="guia">
      <a href="/entrar" className="guia-marca" aria-label="Entrar a Checador"><Marca tamano={30} /></a>
      <h1>Guía rápida</h1>
      <p className="guia-intro">
        Registra la jornada de tu negocio desde el celular, un kiosco o WhatsApp. Esto es lo básico para empezar.
      </p>
      <nav className="guia-indice" aria-label="Secciones de la guía">
        <a href="#instalar">Instalar</a>
        <a href="#empresa">Para la empresa</a>
        <a href="#personal">Para tu personal</a>
        <a href="#semana">Cada semana</a>
        <a href="#preguntas">Preguntas</a>
      </nav>

      <section aria-labelledby="instalar">
        <h2 id="instalar" className="guia-seccion">1 · Instala la app</h2>
        <PestanasInstalacion inicial={iphone ? "iphone" : "android"} dominio={dominio} />
      </section>

      <section aria-labelledby="empresa">
        <h2 id="empresa" className="guia-seccion">2 · Primeros pasos para la empresa</h2>
        <ol className="guia-pasos">
          <Paso n={1} titulo="Crea tu cuenta">
            <p>Entra con tu correo: te llega un <strong>código de 6 dígitos</strong>, sin contraseñas. Después registra tu negocio y tu primer <strong>centro de trabajo</strong>.</p>
          </Paso>
          <Paso n={2} titulo="Define tus horarios">
            <p>En <strong>Configuración → Horarios</strong> captura entrada, salida y comida de cada día, y la tolerancia para retardos. Checador compara las checadas con el horario; no descuenta nada.</p>
          </Paso>
          <Paso n={3} titulo="Da de alta a tu personal">
            <p>En <strong>Trabajadores</strong>, una persona a la vez o varias desde la plantilla de <strong>Excel</strong>. Cada quien checa como le acomode:</p>
            <ul>
              <li><strong>Celular:</strong> entra con su correo.</li>
              <li><strong>Kiosco:</strong> con su número de empleado y un PIN, sin correo.</li>
              <li><strong>WhatsApp:</strong> escanea desde su celular el QR de su ficha.</li>
            </ul>
          </Paso>
          <Paso n={4} titulo="Firma los acuerdos de registro">
            <p>En <strong>Trabajadores</strong> generas y firmas como empresa los acuerdos de todo tu personal en un paso. Cada persona firma el suyo en la app, en el kiosco o en papel.</p>
            <p className="guia-aviso">Sin acuerdo firmado, los registros no hacen prueba plena, y el acuerdo no es retroactivo: fírmalo desde el primer día (LFT, art. 132, fr. XXXIV).</p>
          </Paso>
          <Paso n={5} titulo="Prepara un kiosco (opcional)">
            <p>En <strong>Accesos → Invitar un kiosco</strong> usa un correo de la empresa. En la tableta, escanea el QR que aparece ahí y entra con ese correo: queda lista para checar con número y PIN.</p>
          </Paso>
          <Paso n={6} titulo="Activa la ubicación (opcional)">
            <p>En <strong>Centros</strong> puedes registrar dónde se checó, desde el celular o el kiosco. Solo al momento de checar, nunca impide checar y se borra a los 90 días.</p>
          </Paso>
        </ol>
      </section>

      <section aria-labelledby="personal">
        <h2 id="personal" className="guia-seccion">3 · Para tu personal</h2>
        <ol className="guia-pasos">
          <Paso n={1} titulo="Entra">
            <p>Con el correo que le dio a la empresa: le llega un código. Si no tiene correo, checa en el kiosco o por WhatsApp.</p>
          </Paso>
          <Paso n={2} titulo="Checa con un toque">
            <p><strong>Entrada</strong>, <strong>pausa</strong> y <strong>salida</strong>. Sin internet, la checada se guarda con su hora y se envía sola al volver la señal.</p>
          </Paso>
          <Paso n={3} titulo="Revisa su semana">
            <p>Cada lunes, en <strong>Registros</strong>, confirma que sus horas son correctas o explica qué no coincide. La empresa corrige con un motivo que la persona ve; nada se borra.</p>
          </Paso>
          <Paso n={4} titulo="Entra más rápido (opcional)">
            <p>En <strong>Acceso</strong> puede volver a entrar con su <strong>PIN</strong> o su <strong>huella</strong> en lugar del código del correo. La huella nunca sale de su teléfono.</p>
          </Paso>
          <Paso n={5} titulo="Activa los avisos">
            <p>En <strong>Avisos</strong> recibe en su teléfono las semanas por revisar, los acuerdos por firmar y los cambios en sus registros.</p>
          </Paso>
        </ol>
      </section>

      <section aria-labelledby="semana">
        <h2 id="semana" className="guia-seccion">4 · Cada semana</h2>
        <ul className="guia-rutina">
          <li><strong>Tablero</strong><span>Quién está en turno, las horas de cada persona y su tiempo extra frente al máximo legal.</span></li>
          <li><strong>Objeciones</strong><span>Lo que tu personal marcó como incorrecto. Corrige con motivo y pídele que confirme de nuevo.</span></li>
          <li><strong>Recordatorios</strong><span>Cada lunes, Checador avisa por correo a quien tiene semanas por revisar.</span></li>
          <li><strong>Exportar</strong><span>Registros en PDF o CSV con huella digital, para una inspección o un juicio.</span></li>
        </ul>
      </section>

      <section aria-labelledby="preguntas">
        <h2 id="preguntas" className="guia-seccion">5 · Preguntas frecuentes</h2>
        <div className="guia-preguntas">
          <Pregunta titulo="¿Tengo que descargar algo de una tienda de apps?">
            No. Checador funciona en el navegador del celular, la tableta o la computadora. Instalarlo en la pantalla de inicio es opcional, pero más cómodo.
          </Pregunta>
          <Pregunta titulo="¿Qué pasa si alguien olvida checar?">
            La empresa agrega la checada faltante o corrige la hora, siempre con un motivo. La persona ve el cambio en sus registros y el registro original se conserva.
          </Pregunta>
          <Pregunta titulo="¿Y si no hay internet?">
            El celular y el kiosco guardan la checada con la hora en que se hizo y la envían en cuanto vuelve la conexión.
          </Pregunta>
          <Pregunta titulo="¿Checador guarda huellas digitales o fotos?">
            No. Si alguien entra con su huella o su rostro, eso lo valida su propio teléfono; Checador solo recibe la confirmación.
          </Pregunta>
          <Pregunta titulo="¿Con Checador ya cumplo con la ley?">
            Checador te ayuda a llevar el registro electrónico de jornada del artículo 132, fracción XXXIV, de la Ley Federal del Trabajo: registros que no se pueden alterar, acuerdos firmados y la conformidad de tu personal. Cumplir también depende de tus horarios, tus pagos y tus contratos; revisa tu caso con tu asesor laboral.
          </Pregunta>
        </div>
      </section>

      <section className="guia-cierre">
        <h2>¿Listo para empezar?</h2>
        <p>Registra tu negocio y da de alta a tu personal hoy mismo.</p>
        <div className="guia-acciones">
          <a href="/entrar?siguiente=/alta-empresa" className="boton">Registrar mi empresa</a>
          <a href="/entrar" className="boton-secundario">Ya tengo cuenta</a>
        </div>
      </section>

      <footer className="guia-pie">
        Checador · registro de jornada · por <a href="https://jemba.mx">Jemba</a>
      </footer>
    </main>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="guia-circulo" aria-hidden>{n}</span>
      <div>
        <h3>{titulo}</h3>
        {children}
      </div>
    </li>
  );
}

function Pregunta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details>
      <summary>{titulo}</summary>
      <p>{children}</p>
    </details>
  );
}
