import Link from "next/link";
import { headers } from "next/headers";
import type { EstadoTrabajador } from "@/lib/acuerdosDatos";
import type { ContextoPanel } from "@/lib/panel";

interface Paso {
  hecho: boolean;
  titulo: string;
  detalle?: React.ReactNode;
  enlace?: { href: string; texto: string };
}

/**
 * Alta guiada: los pasos se calculan con los datos reales (no se marcan a mano)
 * y la tarjeta desaparece cuando todo está completo.
 */
export async function PrimerosPasos({ ctx, estados }: { ctx: ContextoPanel; estados: EstadoTrabajador[] }) {
  const [{ count: centros }, { data: conPin }, { count: kioscos }, { data: invitacionesKiosco }] = await Promise.all([
    ctx.supabase.from("centros_trabajo").select("id", { count: "exact", head: true }).eq("empresa_id", ctx.empresa.id),
    ctx.supabase.rpc("trabajadores_con_pin", { p_empresa: ctx.empresa.id }),
    ctx.supabase.from("miembros").select("user_id", { count: "exact", head: true }).eq("empresa_id", ctx.empresa.id).eq("rol", "kiosco"),
    ctx.supabase.from("invitaciones").select("email").eq("empresa_id", ctx.empresa.id).eq("rol", "kiosco").is("aceptada_en", null),
  ]);
  const pines = new Set((conPin ?? []) as string[]);
  const sinMetodo = estados.filter((e) => !e.email && !(e.numeroEmpleado && pines.has(e.trabajadorId)));
  const soloKiosco = estados.filter((e) => !e.email && e.numeroEmpleado);
  const empresaPorFirmar = estados.filter((e) => e.clave === "sin_acuerdo" || e.clave === "desactualizado");
  const trabajadorPorFirmar = estados.filter((e) => e.clave === "pendiente");
  const nombres = (l: EstadoTrabajador[]) => l.slice(0, 5).map((e) => e.nombre).join(", ") + (l.length > 5 ? ` y ${l.length - 5} más` : "");
  const h = await headers();
  const origen = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "tu-dominio"}`;

  const pasos: Paso[] = [
    {
      hecho: (centros ?? 0) > 0,
      titulo: "Registra tu centro de trabajo y la regla de la pausa",
      enlace: { href: "/panel/centros", texto: "Centros" },
    },
    {
      hecho: estados.length > 0,
      titulo: "Da de alta a tu personal",
      detalle: "Con correo si usará la app en su celular; con número de empleado si checará en el kiosco.",
      enlace: { href: "/panel/trabajadores", texto: "Trabajadores" },
    },
    {
      hecho: estados.length > 0 && sinMetodo.length === 0,
      titulo: "Cada persona tiene cómo checar",
      detalle: sinMetodo.length ? `Sin correo ni PIN de kiosco: ${nombres(sinMetodo)}.` : undefined,
      enlace: { href: "/panel/trabajadores", texto: "Trabajadores" },
    },
    soloKiosco.length === 0
      ? { hecho: true, titulo: "Kiosco: no es necesario (todos tienen la app)" }
      : {
          hecho: (kioscos ?? 0) > 0,
          titulo: `Instala un kiosco (${soloKiosco.length} persona(s) sin correo checarán ahí)`,
          detalle: (invitacionesKiosco ?? []).length
            ? `Invitación pendiente: en la tableta abre ${origen}/kiosco y entra con ${(invitacionesKiosco ?? []).map((i) => i.email).join(", ")}.`
            : "Invita un correo de la empresa con rol Kiosco y entra con él en la tableta.",
          enlace: { href: "/panel/accesos", texto: "Accesos" },
        },
    {
      hecho: estados.length > 0 && empresaPorFirmar.length === 0,
      titulo: "Firma los acuerdos de registro como empresa",
      detalle: empresaPorFirmar.length
        ? `Faltan ${empresaPorFirmar.length}: ${nombres(empresaPorFirmar)}. Puedes firmarlos todos de una vez.`
        : undefined,
      enlace: { href: "/panel/trabajadores#acuerdos", texto: "Firmar acuerdos" },
    },
    {
      hecho: estados.length > 0 && estados.every((e) => e.clave === "vigente"),
      titulo: "Cada persona firma su acuerdo",
      detalle: trabajadorPorFirmar.length
        ? `Esperando a: ${nombres(trabajadorPorFirmar)}. Lo firman en la app (sección Acuerdo), en el kiosco con su PIN o en papel. Los registros anteriores a la firma no quedan cubiertos por el acuerdo.`
        : undefined,
    },
  ];
  const hechos = pasos.filter((p) => p.hecho).length;
  if (hechos === pasos.length) return null;

  return (
    <section className="primeros-pasos">
      <h2>Primeros pasos ({hechos} de {pasos.length})</h2>
      <ol>
        {pasos.map((p) => (
          <li key={p.titulo} className={p.hecho ? "hecho" : ""}>
            <span aria-hidden>{p.hecho ? "✓" : "○"}</span>
            <div>
              <strong>{p.titulo}</strong>
              {!p.hecho && p.detalle && <p className="ayuda">{p.detalle}</p>}
            </div>
            {!p.hecho && p.enlace && <Link href={p.enlace.href}>{p.enlace.texto} →</Link>}
          </li>
        ))}
      </ol>
      <details>
        <summary>Cómo avisar a tu personal</summary>
        <ul className="ayuda">
          <li>Con celular: que abran <strong>{origen}</strong>, entren con el correo que registraste y la agreguen a su pantalla de inicio.</li>
          <li>Sin celular: que chequen en el kiosco con su número de empleado y el PIN que les entregues en persona.</li>
          <li>Todos: que revisen y firmen su acuerdo de registro, y cada semana den su conformidad con sus horarios.</li>
        </ul>
      </details>
    </section>
  );
}
