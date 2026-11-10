import { FormAccion } from "@/components/panel/FormAccion";
import { esGestor, requierePanel, ZONAS_MX } from "@/lib/panel";
import { guardarCentro } from "../acciones";

function CamposCentro({ c, zonaDefecto }: {
  c?: { id: string; nombre: string; direccion: string | null; zona_horaria: string; pausa_puede_salir: boolean };
  zonaDefecto: string;
}) {
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
    </>
  );
}

export default async function Centros() {
  const ctx = await requierePanel();
  const [{ data: centros }, { data: personal }] = await Promise.all([
    ctx.supabase
      .from("centros_trabajo")
      .select("id, nombre, direccion, zona_horaria, pausa_puede_salir")
      .eq("empresa_id", ctx.empresa.id)
      .order("nombre"),
    ctx.supabase.from("trabajadores").select("centro_trabajo_id").eq("empresa_id", ctx.empresa.id).is("fecha_baja", null),
  ]);
  const gestor = esGestor(ctx.rol);
  const lista = centros ?? [];
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
