import Link from "next/link";
import { notFound } from "next/navigation";
import { aHoraLocal } from "@checador/jornada";
import { BotonImprimir } from "@/components/panel/BotonImprimir";
import { folio } from "@/lib/acuerdo";
import { acuerdosDe, firmaDe, MODALIDAD } from "@/lib/acuerdosDatos";
import { requierePanel } from "@/lib/panel";

export default async function VerAcuerdo({ params }: { params: Promise<{ id: string; acuerdoId: string }> }) {
  const { id, acuerdoId } = await params;
  const ctx = await requierePanel();
  const [lista, { data: miembros }] = await Promise.all([
    acuerdosDe(ctx.supabase, id),
    ctx.supabase.rpc("miembros_de_empresa", { p_empresa: ctx.empresa.id }),
  ]);
  const a = lista.find((x) => x.id === acuerdoId);
  if (!a || a.empresa_id !== ctx.empresa.id) notFound();
  // Quién firmó en representación de la empresa (solo propietarios y administradores pueden verlo).
  const correoDe = new Map(((miembros ?? []) as { user_id: string; email: string }[]).map((m) => [m.user_id, m.email]));
  const zona = ctx.empresa.zonaHoraria;
  const hash = a.contenido_hash.replace(/^\\x/, "");

  return (
    <article className="documento">
      <p className="no-imprimir">
        <Link href={`/panel/trabajadores/${id}`}>← Volver</Link> <BotonImprimir />
      </p>
      <p className="folio">Folio {folio(a.contenido_hash)}</p>
      <pre className="texto-acuerdo">{a.contenido}</pre>

      <section className="firmas-documento">
        {(["empleador", "trabajador"] as const).map((quien) => {
          const f = firmaDe(a, quien);
          return (
            <div key={quien}>
              <div className="linea-firma" />
              <p>{quien === "empleador" ? "Por la persona empleadora" : "La persona trabajadora"}</p>
              {f && (
                <p className="ayuda">
                  {quien === "empleador" && correoDe.get(f.user_id) && <>Firmó: {correoDe.get(f.user_id)} · </>}
                  {MODALIDAD[f.modalidad]} · {aHoraLocal(f.firmado_en, zona).replace("T", " ")}
                  {f.modalidad === "autografa" && ` · resguardo: ${String(f.evidencia.resguardo ?? "")}`}
                </p>
              )}
            </div>
          );
        })}
      </section>

      <p className="ayuda hash">
        Huella digital (SHA-256) del texto: {hash}. Cualquier cambio en el texto produciría una huella distinta.
      </p>
    </article>
  );
}
