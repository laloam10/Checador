import Link from "next/link";
import { fecha, iniciales, telefonoLegible } from "@/lib/formato";

type Tono = "ok" | "aviso" | "error" | "neutro";

export interface ResumenAcuerdo {
  clave: "vigente" | "pendiente" | "desactualizado" | "sin_acuerdo";
  version: number | null;
}

// Íconos de trazo (24×24), los mismos del resto de la app.
const ICONO = {
  app: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  kiosco: "M4 5h16v11H4zM8 20h8M12 16v4M8 9h.01M12 9h.01M16 9h.01M8 12h.01M12 12h.01M16 12h.01",
  whatsapp: "M21 12a9 9 0 0 1-13.4 7.9L3 21l1.1-4.4A9 9 0 1 1 21 12zM9 9.5c0 3 2.5 5.5 5.5 5.5",
  acuerdo: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4",
};

function Estado({ href, icono, titulo, valor, detalle, tono }: {
  href: string;
  icono: keyof typeof ICONO;
  titulo: string;
  valor: string;
  detalle: string;
  tono: Tono;
}) {
  return (
    <a href={href} className={`estado-tile tono-${tono}`}>
      <span className="estado-icono" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONO[icono]} />
        </svg>
      </span>
      <span className="estado-texto">
        <small>{titulo}</small>
        <strong>{valor}</strong>
        <span>{detalle}</span>
      </span>
    </a>
  );
}

/**
 * Cabecera de la ficha: quién es la persona y, de un vistazo, si ya puede checar por cada
 * medio y si su registro tiene el respaldo de un acuerdo firmado (art. 132 fr. XXXIV LFT).
 */
export function CabeceraTrabajador({ t, centro, horario, tienePin, acuerdo }: {
  t: {
    id: string;
    nombre: string;
    numero_empleado: string | null;
    email: string | null;
    user_id: string | null;
    telefono: string | null;
    telefono_verificado_en: string | null;
    fecha_ingreso: string;
    fecha_baja: string | null;
  };
  centro: string;
  horario: string;
  tienePin: boolean;
  acuerdo: ResumenAcuerdo | null;
}) {
  const kioscoOk = tienePin && Boolean(t.numero_empleado) && /^\d+$/.test(t.numero_empleado ?? "");
  return (
    <header className={`perfil ${t.fecha_baja ? "perfil-baja" : ""}`}>
      <div className="perfil-principal">
        <div className="avatar" aria-hidden>{iniciales(t.nombre)}</div>
        <div className="perfil-nombre">
          <h1>{t.nombre}</h1>
          <ul className="perfil-datos">
            {t.numero_empleado && <li>N.º {t.numero_empleado}</li>}
            <li>{centro}</li>
            <li>Ingreso {fecha(t.fecha_ingreso)}</li>
            <li>{horario}</li>
            {t.fecha_baja && <li className="perfil-baja-etiqueta">Baja el {fecha(t.fecha_baja)}</li>}
          </ul>
        </div>
        <div className="perfil-acciones">
          <Link className="boton" href={`/panel/trabajadores/${t.id}/semana`}>Registros y correcciones</Link>
          <Link className="boton-secundario" href={`/panel/exportar?trabajador=${t.id}`}>Exportar</Link>
        </div>
      </div>
      {!t.fecha_baja && (
        <nav className="perfil-estados" aria-label="Estado de la persona">
          <Estado href="#datos" icono="app" titulo="App"
            tono={t.user_id ? "ok" : t.email ? "aviso" : "neutro"}
            valor={t.user_id ? "Vinculada" : t.email ? "Pendiente" : "Sin correo"}
            detalle={t.user_id ? (t.email ?? "Entra con su correo") : t.email ? `Entrará con ${t.email}` : "Agrega su correo en Datos"} />
          <Estado href="#kiosco" icono="kiosco" titulo="Kiosco"
            tono={kioscoOk ? "ok" : t.numero_empleado ? "aviso" : "neutro"}
            valor={kioscoOk ? "PIN asignado" : t.numero_empleado ? "Sin PIN" : "Sin número"}
            detalle={kioscoOk ? `N.º ${t.numero_empleado}` : t.numero_empleado ? "Asígnale un PIN" : "Agrega su número en Datos"} />
          <Estado href="#kiosco" icono="whatsapp" titulo="WhatsApp"
            tono={t.telefono_verificado_en && t.telefono ? "ok" : t.telefono ? "aviso" : "neutro"}
            valor={t.telefono ? (t.telefono_verificado_en ? "Activado" : "Pendiente de activar") : "Sin celular"}
            detalle={t.telefono ? telefonoLegible(t.telefono) : "Opcional"} />
          {acuerdo && (
            <Estado href="#acuerdo" icono="acuerdo" titulo="Acuerdo"
              tono={acuerdo.clave === "vigente" ? "ok" : acuerdo.clave === "sin_acuerdo" ? "error" : "aviso"}
              valor={{ vigente: "Vigente", pendiente: "Falta su firma", desactualizado: "Desactualizado", sin_acuerdo: "Sin acuerdo" }[acuerdo.clave]}
              detalle={acuerdo.clave === "vigente" ? `Versión ${acuerdo.version}` : acuerdo.clave === "sin_acuerdo" ? "Sus registros no tienen respaldo" : acuerdo.clave === "pendiente" ? `Versión ${acuerdo.version}` : "Genera una versión nueva"} />
          )}
        </nav>
      )}
    </header>
  );
}
