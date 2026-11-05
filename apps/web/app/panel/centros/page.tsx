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
  const { data: centros } = await ctx.supabase
    .from("centros_trabajo")
    .select("id, nombre, direccion, zona_horaria, pausa_puede_salir")
    .eq("empresa_id", ctx.empresa.id)
    .order("nombre");
  const gestor = esGestor(ctx.rol);

  return (
    <>
      <h1>Centros de trabajo</h1>
      {(centros ?? []).map((c) =>
        gestor ? (
          <FormAccion key={c.id} accion={guardarCentro} boton="Guardar">
            <CamposCentro c={c} zonaDefecto={ctx.empresa.zonaHoraria} />
          </FormAccion>
        ) : (
          <p key={c.id}><strong>{c.nombre}</strong> · {c.direccion}</p>
        ),
      )}
      {gestor && (
        <>
          <h2>Nuevo centro</h2>
          <FormAccion accion={guardarCentro} boton="Crear centro">
            <CamposCentro zonaDefecto={ctx.empresa.zonaHoraria} />
          </FormAccion>
        </>
      )}
    </>
  );
}
