import { notFound } from "next/navigation";
import { Marca } from "@/components/Marca";
import { documentoLegal, legalPublicado, legalVisible, type NombreLegal } from "@/lib/legal";
import { partes, type Bloque } from "@/lib/markdownLegal";

function Texto({ texto }: { texto: string }) {
  return (
    <>
      {partes(texto).map((p, i) =>
        p.tipo === "negrita" ? <strong key={i}>{p.texto}</strong>
        : p.tipo === "codigo" ? <code key={i}>{p.texto}</code>
        : p.tipo === "pendiente" ? <mark key={i}>{p.texto}</mark>
        : p.texto)}
    </>
  );
}

function Bloques({ bloques }: { bloques: Bloque[] }) {
  return bloques.map((b, i) => {
    switch (b.tipo) {
      case "h2": return <h2 key={i}><Texto texto={b.texto} /></h2>;
      case "h3": return <h3 key={i}><Texto texto={b.texto} /></h3>;
      case "p": return <p key={i}><Texto texto={b.texto} /></p>;
      case "ul": return <ul key={i}>{b.items.map((t, j) => <li key={j}><Texto texto={t} /></li>)}</ul>;
      case "ol": return <ol key={i} start={b.inicio}>{b.items.map((t, j) => <li key={j}><Texto texto={t} /></li>)}</ol>;
      case "tabla": {
        const [cabecera, ...filas] = b.filas;
        return (
          <div key={i} className="legal-tabla">
            <table>
              <thead><tr>{cabecera!.map((c, j) => <th key={j} scope="col"><Texto texto={c} /></th>)}</tr></thead>
              <tbody>{filas.map((f, j) => <tr key={j}>{f.map((c, k) => <td key={k}><Texto texto={c} /></td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      }
      default: return null;
    }
  });
}

/** Página pública de un documento legal (/terminos, /privacidad). Ver docs/legal/README.md. */
export function PaginaLegal({ nombre }: { nombre: NombreLegal }) {
  if (!legalVisible()) notFound();
  const doc = documentoLegal(nombre);
  return (
    <main className="legal">
      <a href="/guia" className="legal-marca" aria-label="Checador"><Marca tamano={28} /></a>
      {!legalPublicado() && (
        <p className="legal-borrador" role="note">
          <strong>Borrador en revisión legal.</strong> Este texto aún no está vigente; los datos resaltados están pendientes.
        </p>
      )}
      <h1>{doc.titulo}</h1>
      <p className="legal-version">Versión {doc.version}{doc.fecha && ` · ${doc.fecha}`}</p>
      <Bloques bloques={doc.bloques} />
      <footer className="legal-pie">
        <a href="/terminos">Términos del servicio</a> · <a href="/privacidad">Aviso de privacidad</a> · Checador por{" "}
        <a href="https://jemba.mx">Jemba</a>
      </footer>
    </main>
  );
}
