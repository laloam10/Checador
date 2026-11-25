import { FormAccion } from "@/components/panel/FormAccion";
import { BotonUbicacionCentro } from "@/components/panel/UbicacionCentro";
import { esGestor, requierePanel, ZONAS_MX } from "@/lib/panel";
import { guardarCentro } from "../acciones";

interface Centro {
  id: string;
  nombre: string;
  direccion: string | null;
  zona_horaria: string;
  pausa_puede_salir: boolean;
  ubicacion_celular: boolean;
  ubicacion_kiosco: boolean;
  latitud: number | null;
  longitud: number | null;
  radio_m: number;
}

function CamposCentro({ c, zonaDefecto }: { c?: Centro; zonaDefecto: string }) {
  return (
    <>
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="campos">
        <label>Nombre<input name="nombre" required defaultValue={c?.nombre ?? ""} /></label>
        <label>Dirección (opcional)<input name="direccion" defaultValue={c?.direccion ?? ""} /></label>
        <label>
          Zona horaria
          <select name="zona_horaria" defaultValue={c?.zona_horaria ?? zonaDefecto}>
            {ZONAS_MX.map((z) => <option key={z.zona} value={z.zona}>{z.etiqueta}</option>)}
          </select>
        </label>
      </div>
      <label className="casilla-linea">
        <input type="checkbox" name="pausa_puede_salir" defaultChecked={c?.pausa_puede_salir ?? true} />
        El personal puede salir del lugar durante la pausa de comida
      </label>
      <p className="ayuda">
        Si no puede salir, el tiempo de la pausa cuenta como jornada de trabajo (art. 64 LFT). Esto se aplica
        automáticamente a las checadas del celular y del kiosco.
      </p>
      <fieldset className="ubicacion-centro">
        <legend>Ubicación al checar (opcional)</legend>
        <p className="ayuda">
          Registra dónde estaba el dispositivo al momento de checar y si estaba dentro del radio del centro. Nunca impide
          checar: sin permiso o sin señal, la checada se registra igual. Se borra a los 90 días. El GPS puede fallar en
          interiores y se puede falsear: tómalo como un indicio, no como prueba.
        </p>
        <label className="casilla-linea">
          <input type="checkbox" name="ubicacion_celular" defaultChecked={c?.ubicacion_celular ?? false} />
          En los celulares de las personas de este centro
        </label>
        <label className="casilla-linea">
          <input type="checkbox" name="ubicacion_kiosco" defaultChecked={c?.ubicacion_kiosco ?? false} />
          En el kiosco de este centro
        </label>
        <div className="campos">
          <label>Latitud<input name="latitud" type="number" step="0.00001" min="-90" max="90" inputMode="decimal" defaultValue={c?.latitud ?? ""} /></label>
          <label>Longitud<input name="longitud" type="number" step="0.00001" min="-180" max="180" inputMode="decimal" defaultValue={c?.longitud ?? ""} /></label>
          <label>Radio del centro (metros)<input name="radio_m" type="number" min="25" max="5000" step="5" defaultValue={c?.radio_m ?? 150} /></label>
        </div>
        <BotonUbicacionCentro />
        <p className="aviso">
          Al activarla o quitarla, los acuerdos de registro de las personas de este centro quedan desactualizados: el
          acuerdo debe decir que se registra la ubicación, así que deben firmar una versión nueva. Actualiza también tu
          aviso de privacidad.
        </p>
      </fieldset>
    </>
  );
}

export default async function Centros() {
  const ctx = await requierePanel();
  const [{ data: centros }, { data: personal }] = await Promise.all([
    ctx.supabase
      .from("centros_trabajo")
      .select("id, nombre, direccion, zona_horaria, pausa_puede_salir, ubicacion_celular, ubicacion_kiosco, latitud, longitud, radio_m")
      .eq("empresa_id", ctx.empresa.id)
      .order("nombre"),
    ctx.supabase.from("trabajadores").select("centro_trabajo_id").eq("empresa_id", ctx.empresa.id).is("fecha_baja", null),
  ]);
  const gestor = esGestor(ctx.rol);
  const lista = (centros ?? []) as Centro[];
  const personas = new Map<string, number>();
  for (const t of personal ?? []) personas.set(t.centro_trabajo_id, (personas.get(t.centro_trabajo_id) ?? 0) + 1);
  const zona = (z: string) => ZONAS_MX.find((x) => x.zona === z)?.etiqueta ?? z;

  return (
    <>
      <h1>Centros de trabajo</h1>
      <p className="ayuda">
        Cada sucursal o lugar de trabajo, con su zona horaria y la regla de la pausa de comida, que se aplica sola a
        todas las checadas de ese centro.
      </p>
      <div className="centros">
        {lista.map((c) => (
          <section key={c.id} className="centro">
            <div className="centro-cabecera">
              <div>
                <h2>{c.nombre}</h2>
                {c.direccion && <p className="ayuda">{c.direccion}</p>}
              </div>
              <span className="indicador-detalle">
                {personas.get(c.id) ?? 0} {(personas.get(c.id) ?? 0) === 1 ? "persona" : "personas"}
              </span>
            </div>
            <div className="centro-datos">
              <span className={`insignia-estado ${c.pausa_puede_salir ? "insignia-neutra" : "insignia-aviso"}`}>
                {c.pausa_puede_salir ? "Pausa: puede salir" : "Pausa: cuenta como jornada (art. 64)"}
              </span>
              <span className="insignia-estado insignia-neutra">{zona(c.zona_horaria)}</span>
              {(c.ubicacion_celular || c.ubicacion_kiosco) && (
                <span className="insignia-estado insignia-aviso">
                  Ubicación: {[c.ubicacion_celular && "celular", c.ubicacion_kiosco && "kiosco"].filter(Boolean).join(" y ")} · radio {c.radio_m} m
                </span>
              )}
            </div>
            {gestor && (
              <details open={lista.length === 1}>
                <summary>Editar</summary>
                <FormAccion accion={guardarCentro} boton="Guardar">
                  <CamposCentro c={c} zonaDefecto={ctx.empresa.zonaHoraria} />
                </FormAccion>
              </details>
            )}
          </section>
        ))}
      </div>
      {gestor && (
        <details className="nuevo-centro" open={lista.length === 0}>
          <summary>+ Agregar otro centro de trabajo</summary>
          <FormAccion accion={guardarCentro} boton="Crear centro">
            <CamposCentro zonaDefecto={ctx.empresa.zonaHoraria} />
          </FormAccion>
        </details>
      )}
    </>
  );
}
