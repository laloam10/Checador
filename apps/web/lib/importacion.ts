/**
 * Alta masiva de trabajadores desde un archivo CSV (Excel: "Guardar como → CSV").
 *
 * Funciones puras (sin base de datos) para poder probarlas: decodificar el archivo,
 * leer el CSV y validar cada fila. La inserción la hace la acción del panel, toda o
 * nada, y la base vuelve a validar (RLS, formato de correo y CURP, números únicos).
 */

export const MAX_FILAS = 500;
export const MAX_BYTES = 512 * 1024; // debajo del límite de 1 MB de las Server Actions

export const COLUMNAS_PLANTILLA = [
  "nombre",
  "numero_empleado",
  "correo",
  "curp",
  "centro",
  "fecha_ingreso",
  "dia_descanso",
] as const;

export interface CentroImportacion {
  id: string;
  nombre: string;
}

export interface TrabajadorImportado {
  nombre: string;
  numero_empleado: string | null;
  email: string | null;
  curp: string | null;
  centro_trabajo_id: string;
  fecha_ingreso: string;
  dia_descanso: number;
  dias_descanso_adicionales: number[];
}

export interface ErrorFila {
  fila: number; // número de renglón en el archivo (el encabezado es el 1)
  mensaje: string;
}

export interface ResultadoImportacion {
  trabajadores: TrabajadorImportado[];
  errores: ErrorFila[];
}

/** UTF-8 si es válido; si no, Windows-1252 (lo que guarda Excel en "CSV delimitado por comas"). */
export function decodificar(bytes: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder("windows-1252").decode(bytes);
  }
  return texto.replace(/^﻿/, "");
}

/** CSV con comillas dobles; separador "," o ";" (Excel en algunas configuraciones regionales). */
export function leerCsv(texto: string): string[][] {
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Encabezados aceptados (sin acentos ni mayúsculas) → columna. */
const ENCABEZADOS: Record<string, (typeof COLUMNAS_PLANTILLA)[number]> = {
  nombre: "nombre",
  "nombre completo": "nombre",
  numero: "numero_empleado",
  "numero empleado": "numero_empleado",
  "numero de empleado": "numero_empleado",
  "no empleado": "numero_empleado",
  correo: "correo",
  email: "correo",
  "correo electronico": "correo",
  curp: "curp",
  centro: "centro",
  "centro de trabajo": "centro",
  "fecha ingreso": "fecha_ingreso",
  "fecha de ingreso": "fecha_ingreso",
  ingreso: "fecha_ingreso",
  "dia descanso": "dia_descanso",
  "dia de descanso": "dia_descanso",
  descanso: "dia_descanso",
};

const DIAS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
  dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6,
};

/** "2026-03-15", "15/03/2026" o "15-03-2026" (día primero, como en México) → "2026-03-15". */
export function leerFecha(t: string): string | null {
  const v = t.trim();
  let a: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (r) [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v))) [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}

const RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RE_CURP = /^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HMX][A-Z]{5}[A-Z0-9][0-9]$/;
const RE_NUMERO = /^[0-9A-Za-z-]{1,20}$/;

/**
 * Valida el archivo completo. Si hay cualquier error, no se da de alta a nadie:
 * así no quedan altas a medias que luego haya que buscar.
 */
export function validarImportacion(
  texto: string,
  centros: CentroImportacion[],
  existentes: { numeros: string[]; correos: string[] },
  hoy: string,
): ResultadoImportacion {
  const errores: ErrorFila[] = [];
  const filas = leerCsv(texto).filter((f) => f.some((c) => c.trim() !== ""));
  if (filas.length < 2) return { trabajadores: [], errores: [{ fila: 1, mensaje: "El archivo no tiene renglones con datos." }] };

  const columnas = filas[0]!.map((h) => ENCABEZADOS[normalizar(h)] ?? null);
  if (!columnas.includes("nombre")) {
    return { trabajadores: [], errores: [{ fila: 1, mensaje: 'Falta la columna "nombre". Usa la plantilla.' }] };
  }
  if (!columnas.includes("fecha_ingreso")) {
    return { trabajadores: [], errores: [{ fila: 1, mensaje: 'Falta la columna "fecha_ingreso". Usa la plantilla.' }] };
  }
  if (filas.length - 1 > MAX_FILAS) {
    return { trabajadores: [], errores: [{ fila: 1, mensaje: `Máximo ${MAX_FILAS} personas por archivo.` }] };
  }

  const centroPorNombre = new Map(centros.map((c) => [normalizar(c.nombre), c.id]));
  const numeros = new Set(existentes.numeros.map((n) => n.toLowerCase()));
  const correos = new Set(existentes.correos.map((c) => c.toLowerCase()));
  const trabajadores: TrabajadorImportado[] = [];

  filas.slice(1).forEach((celdas, i) => {
    const fila = i + 2;
    const valor = (col: (typeof COLUMNAS_PLANTILLA)[number]) => {
      const idx = columnas.indexOf(col);
      return idx < 0 ? "" : (celdas[idx] ?? "").trim();
    };
    const problemas: string[] = [];

    const nombre = valor("nombre").replace(/\s+/g, " ");
    if (!nombre) problemas.push("falta el nombre");

    const numero = valor("numero_empleado") || null;
    if (numero && !RE_NUMERO.test(numero)) problemas.push(`número de empleado inválido "${numero}"`);
    else if (numero && numeros.has(numero.toLowerCase())) problemas.push(`el número ${numero} ya existe o está repetido`);

    const email = valor("correo").toLowerCase() || null;
    if (email && !RE_CORREO.test(email)) problemas.push(`correo inválido "${email}"`);
    else if (email && correos.has(email)) problemas.push(`el correo ${email} ya existe o está repetido`);

    const curp = valor("curp").toUpperCase() || null;
    if (curp && !RE_CURP.test(curp)) problemas.push(`CURP inválida "${curp}"`);

    let centroId: string | undefined;
    const centroTexto = valor("centro");
    if (centroTexto) {
      centroId = centroPorNombre.get(normalizar(centroTexto));
      if (!centroId) problemas.push(`no existe el centro "${centroTexto}"`);
    } else if (centros.length === 1) centroId = centros[0]!.id;
    else problemas.push("falta el centro de trabajo (hay más de uno)");

    const fechaTexto = valor("fecha_ingreso");
    const fecha = fechaTexto ? leerFecha(fechaTexto) : null;
    if (!fechaTexto) problemas.push("falta la fecha de ingreso");
    else if (!fecha) problemas.push(`fecha de ingreso inválida "${fechaTexto}" (usa 15/03/2026)`);
    else if (fecha > hoy) problemas.push("la fecha de ingreso es futura");

    // Uno o varios días: "domingo", "sábado y domingo", "sab, dom". El descanso semanal obligatorio
    // (art. 69) es el domingo si aparece (el art. 69 lo prefiere); si no, el primero. Los demás son adicionales.
    const palabras = normalizar(valor("dia_descanso")).split(" ").filter((w) => w && w !== "y" && w !== "e");
    let descanso = 0;
    let adicionales: number[] = [];
    if (palabras.length) {
      const dias = palabras.map((w) => (/^[0-6]$/.test(w) ? Number(w) : DIAS[w]));
      if (dias.some((d) => d === undefined)) problemas.push(`día de descanso inválido "${valor("dia_descanso")}"`);
      else {
        const unicos = [...new Set(dias as number[])];
        descanso = unicos.includes(0) ? 0 : unicos[0]!;
        adicionales = unicos.filter((d) => d !== descanso).sort();
        if (adicionales.length > 3) problemas.push("máximo 4 días de descanso (1 obligatorio y 3 adicionales)");
      }
    }

    if (!numero && !email) problemas.push("necesita número de empleado (kiosco) o correo (app) para poder checar");

    if (problemas.length) {
      errores.push({ fila, mensaje: problemas.join("; ") });
      return;
    }
    if (numero) numeros.add(numero.toLowerCase());
    if (email) correos.add(email);
    trabajadores.push({
      nombre,
      numero_empleado: numero,
      email,
      curp,
      centro_trabajo_id: centroId!,
      fecha_ingreso: fecha!,
      dia_descanso: descanso,
      dias_descanso_adicionales: adicionales,
    });
  });

  return { trabajadores: errores.length ? [] : trabajadores, errores };
}

/** Plantilla con un ejemplo, en UTF-8 con BOM para que Excel muestre bien los acentos. */
export function plantillaCsv(centroNombre: string): string {
  const centro = /[",;\r\n]/.test(centroNombre) ? `"${centroNombre.replace(/"/g, '""')}"` : centroNombre;
  return (
    "﻿" +
    [
      COLUMNAS_PLANTILLA.join(","),
      `María López Hernández,101,maria@ejemplo.mx,,${centro},15/03/2026,domingo`,
      `José Pérez,102,,,${centro},01/04/2026,sábado`,
    ].join("\r\n") +
    "\r\n"
  );
}
