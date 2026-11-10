import Link from "next/link";
import { aHoraLocal } from "@checador/jornada";
import { esGestor, objecionesPendientes, requierePanel } from "@/lib/panel";

interface EnvioDia {
  fecha: string;
  total: number;
  enviados: number;
  fallidos: number;
  detalle: string | null;
}

export default async function Objeciones() {
  const ctx = await requierePanel();
  const hace60Dias = new Date(Date.now() - 60 * 864e5).toISOString();
  const [objeciones, { data: empresa }, { data: envios }] = await Promise.all([
    objecionesPendientes(ctx),
    ctx.supabase.from("empresas").select("recordatorios_conformidad").eq("id", ctx.empresa.id).single(),
    ctx.supabase
      .from("recordatorios_conformidad")
      .select("enviado_en, estado, detalle")
      .eq("empresa_id", ctx.empresa.id)
      .gte("enviado_en", hace60Dias)
      .order("enviado_en", { ascending: false })
      .limit(1000),
  ]);
  const activos = empresa?.recordatorios_conformidad ?? true;

  // Un renglón por día de envío (normalmente, cada lunes).
  const porDia = new Map<string, EnvioDia>();
  for (const e of envios ?? []) {
    const fecha = aHoraLocal(e.enviado_en, ctx.empresa.zonaHoraria).slice(0, 10);
    const d = porDia.get(fecha) ?? { fecha, total: 0, enviados: 0, fallidos: 0, detalle: null };
    d.total++;
    if (e.estado === "enviado") d.enviados++;
    if (e.estado === "fallido") {
      d.fallidos++;
      d.detalle ??= e.detalle;
    }
    porDia.set(fecha, d);
  }
  const dias = [...porDia.values()].slice(0, 6);

  return (
    <>
      <h1>Objeciones por atender</h1>
      <p className="ayuda">
        Semanas en las que el trabajador indicó que sus registros no son correctos y aún no ha vuelto a confirmar. Revisa,
        corrige con motivo y pídele que confirme de nuevo desde su app.
      </p>
      {objeciones.length === 0 ? (
        <p className="vacio">No hay objeciones pendientes.</p>
      ) : (
        <table className="tabla tabla-tarjetas">
          <thead><tr><th>Trabajador</th><th>Semana</th><th>Comentario</th><th>Fecha</th></tr></thead>
          <tbody>
            {objeciones.map((o) => (
              <tr key={`${o.trabajadorId}-${o.semana}`}>
                <td className="celda-titulo"><Link href={`/panel/trabajadores/${o.trabajadorId}/semana?semana=${o.semana}`}>{o.nombre}</Link></td>
                <td data-etiqueta="Semana">{o.semana}</td>
                <td data-etiqueta="Comentario">“{o.comentario}”</td>
                <td data-etiqueta="Fecha">{aHoraLocal(o.respondidoEn, ctx.empresa.zonaHoraria).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 id="recordatorios">Recordatorios por correo</h2>
      <p className="ayuda">
        Cada lunes a las 10:00 (hora del centro de México) Checador envía un correo a quien tenga semanas terminadas sin
        revisar, o semanas que objetó y que ya corregiste. Revisa las últimas 8 semanas y envía como máximo un correo por
        persona a la semana. Solo lo recibe quien tiene correo registrado; quien checa únicamente en el kiosco ve sus semanas pendientes ahí, al identificarse con su PIN.
        Responder sigue siendo voluntario; el correo lo dice así.
      </p>
      <p>
        Los recordatorios están <strong>{activos ? "activados" : "desactivados"}</strong>.{" "}
        {esGestor(ctx.rol) && <Link href="/panel/configuracion">Cambiar en Configuración</Link>}
      </p>
      {dias.length === 0 ? (
        <p className="vacio">Todavía no se ha enviado ningún recordatorio.</p>
      ) : (
        <table className="tabla tabla-tarjetas">
          <thead><tr><th>Fecha</th><th>Personas</th><th>Resultado</th></tr></thead>
          <tbody>
            {dias.map((d) => {
              const enProceso = d.total - d.enviados - d.fallidos;
              return (
                <tr key={d.fecha}>
                  <td className="celda-titulo">{d.fecha}</td>
                  <td data-etiqueta="Personas">{d.total}</td>
                  <td data-etiqueta="Resultado">
                    {d.enviados > 0 && <>{d.enviados} entregado(s) al servicio de correo. </>}
                    {enProceso > 0 && <>{enProceso} en proceso. </>}
                    {d.fallidos > 0 && (
                      <span className="texto-error">
                        {d.fallidos} no se pudo enviar{d.detalle ? `: ${d.detalle}` : "."}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
