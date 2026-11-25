/**
 * Estructura del texto del acuerdo para mostrarlo como documento. Solo presentación: el
 * texto es el mismo que se firmó y del que se calculó la huella.
 */
export type Bloque =
  | { tipo: "titulo" | "meta" | "apartado" | "inciso" | "parrafo"; texto: string }
  | { tipo: "clausula"; nombre: string; texto: string };

// Nombre de una o dos palabras ("PRIMERA", "DÉCIMA PRIMERA") y título de la cláusula. Sin
// cuantificadores anidados: con ellos, una línea larga en mayúsculas tardaría muchísimo.
const CLAUSULA = /^([A-ZÁÉÍÓÚÑ]+(?: [A-ZÁÉÍÓÚÑ]+)?\. [^.]+\.) ([\s\S]*)$/;

export function bloquesAcuerdo(texto: string): Bloque[] {
  const bloques: Bloque[] = [];
  texto.split("\n").forEach((l, i) => {
    if (!l.trim()) return;
    if (i === 0) return void bloques.push({ tipo: "titulo", texto: l });
    if (i === 1) return void bloques.push({ tipo: "meta", texto: l });
    if (l === "CLÁUSULAS") return void bloques.push({ tipo: "apartado", texto: l });
    const c = CLAUSULA.exec(l);
    if (c) return void bloques.push({ tipo: "clausula", nombre: c[1]!, texto: c[2]! });
    bloques.push({ tipo: /^[a-z]\) /.test(l) ? "inciso" : "parrafo", texto: l });
  });
  return bloques;
}
