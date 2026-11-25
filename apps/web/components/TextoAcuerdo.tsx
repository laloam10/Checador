import { bloquesAcuerdo } from "@/lib/textoAcuerdo";

/** El acuerdo como documento: título, cláusulas con su nombre en negritas e incisos con sangría. */
export function TextoAcuerdo({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <article className={`texto-acuerdo ${className}`.trim()}>
      {bloquesAcuerdo(texto).map((b, i) => {
        switch (b.tipo) {
          case "titulo": return <h3 key={i} className="acuerdo-titulo">{b.texto}</h3>;
          case "meta": return <p key={i} className="acuerdo-meta">{b.texto}</p>;
          case "apartado": return <h4 key={i} className="acuerdo-apartado">{b.texto}</h4>;
          case "clausula": return <p key={i} className="acuerdo-clausula"><strong>{b.nombre}</strong> {b.texto}</p>;
          case "inciso": return <p key={i} className="acuerdo-inciso">{b.texto}</p>;
          default: return <p key={i}>{b.texto}</p>;
        }
      })}
    </article>
  );
}
