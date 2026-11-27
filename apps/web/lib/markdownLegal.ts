/**
 * Lee los documentos legales (apps/web/content/legal/*.md) para publicarlos en la app. Solo el
 * Markdown que usan: títulos, párrafos, listas, tablas, negritas y código. Sin dependencias.
 * Quita el recuadro inicial (notas de borrador, con la versión) y la sección "Notas para el
 * abogado", que no forman parte del texto publicado.
 */
export type Bloque =
  | { tipo: "h1" | "h2" | "h3" | "p"; texto: string }
  | { tipo: "ul"; items: string[] }
  | { tipo: "ol"; items: string[]; inicio: number }
  | { tipo: "tabla"; filas: string[][] };

export interface DocumentoLegal {
  titulo: string;
  version: string;
  fecha: string;
  bloques: Bloque[];
}

export type Parte = { tipo: "texto" | "negrita" | "codigo" | "pendiente"; texto: string };

/** Negritas, código y datos pendientes entre corchetes. */
export function partes(texto: string): Parte[] {
  const salida: Parte[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\])/g;
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index! > ultimo) salida.push({ tipo: "texto", texto: texto.slice(ultimo, m.index) });
    const t = m[0];
    salida.push(t.startsWith("**") ? { tipo: "negrita", texto: t.slice(2, -2) }
      : t.startsWith("`") ? { tipo: "codigo", texto: t.slice(1, -1) }
      : { tipo: "pendiente", texto: t });
    ultimo = m.index! + t.length;
  }
  if (ultimo < texto.length) salida.push({ tipo: "texto", texto: texto.slice(ultimo) });
  return salida;
}

export function leerDocumentoLegal(md: string): DocumentoLegal {
  const lineas = md.replace(/\r/g, "").split("\n");
  const encabezado = lineas.filter((l) => l.startsWith(">")).join(" ");
  const version = /Versión\s+([0-9]+(?:\.[0-9]+)*)/.exec(encabezado)?.[1];
  if (!version) throw new Error("El documento no indica su versión («Versión X.Y» en el recuadro inicial).");
  const fecha = /Versión\s+[0-9.]+\s*·\s*([^.]+)\./.exec(encabezado)?.[1]?.trim() ?? "";

  const bloques: Bloque[] = [];
  let titulo = "";
  let i = 0;
  const continua = (l: string | undefined) => l !== undefined && l.trim() !== "" && !/^(#|>|\||-\s|\d+\.\s|---)/.test(l.trim());
  while (i < lineas.length) {
    const l = lineas[i]!;
    const t = l.trim();
    if (/^## Notas para el abogado/i.test(t)) break;
    if (!t || t === "---" || t.startsWith(">")) { i++; continue; }
    if (t.startsWith("# ")) { titulo = t.slice(2); i++; continue; }
    const h = /^(#{2,3}) (.*)$/.exec(t);
    if (h) { bloques.push({ tipo: h[1] === "##" ? "h2" : "h3", texto: h[2]! }); i++; continue; }
    if (t.startsWith("|")) {
      const filas: string[][] = [];
      while (i < lineas.length && lineas[i]!.trim().startsWith("|")) {
        const f = lineas[i]!.trim();
        if (!/^\|[\s|:-]+\|$/.test(f)) filas.push(f.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      bloques.push({ tipo: "tabla", filas });
      continue;
    }
    const lista = /^(-|(\d+)\.)\s+(.*)$/.exec(t);
    if (lista) {
      const ordenada = Boolean(lista[2]);
      const items: string[] = [];
      while (i < lineas.length) {
        const m = /^(-|(\d+)\.)\s+(.*)$/.exec(lineas[i]!.trim());
        if (!m || Boolean(m[2]) !== ordenada) break;
        let item = m[3]!;
        i++;
        while (i < lineas.length && /^\s{2,}\S/.test(lineas[i]!) && !/^\s*(-|\d+\.)\s/.test(lineas[i]!)) { item += " " + lineas[i]!.trim(); i++; }
        items.push(item);
      }
      bloques.push(ordenada ? { tipo: "ol", items, inicio: Number(lista[2]) } : { tipo: "ul", items });
      continue;
    }
    let texto = t;
    i++;
    while (continua(lineas[i])) { texto += " " + lineas[i]!.trim(); i++; }
    bloques.push({ tipo: "p", texto });
  }
  return { titulo, version, fecha, bloques };
}
