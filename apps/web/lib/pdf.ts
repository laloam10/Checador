import "server-only";

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { ETIQUETA_ORIGEN, ETIQUETA_TIPO, type DatosTrabajadorExport } from "./exportacion";
import { sumarDias } from "./fechas";
import { fechaHoraNumerica, fechaLarga, fechaNumerica } from "./formato";

/**
 * Constancia en PDF para inspección o juicio (LFT art. 132 fr. XXXIV y art. 804).
 * Diseño sobrio para imprimir en blanco y negro: la identidad de Jemba solo en una franja y
 * en los acentos. El contenido (datos, totales, bitácora) no depende del diseño.
 */
const A4: [number, number] = [595.28, 841.89];
const MARGEN = 40;
const ANCHO = A4[0] - MARGEN * 2;

const NEGRO = rgb(0.075, 0.157, 0.039); // tinta de la marca (#13280a)
const VERDE = rgb(0.184, 0.431, 0.063); // #2f6e10
const NOCHE = rgb(0.039, 0.129, 0.012); // #0a2103
const LIMA = rgb(0.784, 0.902, 0); // #c8e600
const VERDE_CLARO = rgb(0.906, 0.941, 0.851);
const FONDO = rgb(0.96, 0.97, 0.94);
const LINEA = rgb(0.82, 0.85, 0.78);
const GRIS = rgb(0.38, 0.42, 0.36);
const ROJO = rgb(0.6, 0.1, 0.1);
const ROJO_CLARO = rgb(0.99, 0.91, 0.91);

// Caracteres extra de WinAnsi (las fuentes estándar de PDF no cubren Unicode completo).
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
/** Reemplaza lo que la fuente estándar no puede dibujar, para que un carácter raro no impida emitir el documento. */
export function seguro(texto: string): string {
  return texto
    .replace(/[→⇒]/g, "->")
    .replace(/[\t\r]/g, " ")
    .replace(/./gu, (c) => {
      const cp = c.codePointAt(0)!;
      return (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRA.includes(c) || c === "\n" ? c : "?";
    });
}

const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface Columna {
  titulo: string;
  ancho: number;
  derecha?: boolean;
}

class Documento {
  private pagina!: PDFPage;
  private y = 0;
  readonly paginas: PDFPage[] = [];

  constructor(
    private readonly pdf: PDFDocument,
    private readonly normal: PDFFont,
    private readonly negrita: PDFFont,
  ) {
    this.nuevaPagina();
  }

  nuevaPagina() {
    this.pagina = this.pdf.addPage(A4);
    this.paginas.push(this.pagina);
    // Franja de la marca en todas las páginas.
    this.pagina.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: NOCHE });
    this.pagina.drawRectangle({ x: 0, y: A4[1] - 6, width: 90, height: 6, color: LIMA });
    this.y = A4[1] - MARGEN;
  }

  private espacio(alto: number) {
    if (this.y - alto < MARGEN + 34) this.nuevaPagina();
  }

  partir(texto: string, ancho: number, tam: number, fuente = this.normal): string[] {
    const lineas: string[] = [];
    for (const parrafo of seguro(texto).split("\n")) {
      let actual = "";
      for (const palabra of parrafo.split(" ")) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (fuente.widthOfTextAtSize(prueba, tam) <= ancho || !actual) actual = prueba;
        else {
          lineas.push(actual);
          actual = palabra;
        }
      }
      lineas.push(actual);
    }
    return lineas;
  }

  private escribir(t: string, x: number, y: number, tam: number, fuente: PDFFont, color: RGB = NEGRO) {
    this.pagina.drawText(seguro(t), { x, y, size: tam, font: fuente, color });
  }

  texto(t: string, { tam = 9, negrita = false, color = NEGRO, sangria = 0 } = {}) {
    const fuente = negrita ? this.negrita : this.normal;
    for (const l of this.partir(t, ANCHO - sangria, tam, fuente)) {
      this.espacio(tam + 3);
      this.escribir(l, MARGEN + sangria, this.y - tam, tam, fuente, color);
      this.y -= tam + 3;
    }
  }

  separar(alto = 6) {
    this.y -= alto;
  }

  /** Encabezado de la primera página: marca, empresa y título del documento. */
  encabezado(empresa: string, titulo: string, subtitulo: string) {
    this.escribir("checador", MARGEN, this.y - 10, 11, this.negrita, VERDE);
    const marca = "registro de jornada · por Jemba";
    this.escribir(marca, MARGEN + this.negrita.widthOfTextAtSize("checador", 11) + 6, this.y - 10, 7, this.normal, GRIS);
    const emp = seguro(empresa);
    const ancho = Math.min(this.negrita.widthOfTextAtSize(emp, 9), ANCHO * 0.55);
    this.escribir(this.partir(emp, ANCHO * 0.55, 9, this.negrita)[0]!, MARGEN + ANCHO - ancho, this.y - 10, 9, this.negrita);
    this.y -= 34;
    this.texto(titulo, { tam: 16, negrita: true, color: NOCHE });
    this.y -= 1;
    this.texto(subtitulo, { tam: 8.5, color: GRIS });
    this.y -= 10;
  }

  /** Título de sección con una línea de acento. */
  titulo(t: string) {
    this.espacio(46);
    this.y -= 12;
    this.texto(t, { tam: 11, negrita: true, color: NOCHE });
    this.pagina.drawRectangle({ x: MARGEN, y: this.y - 1, width: 26, height: 2, color: VERDE });
    this.y -= 9;
  }

  /** Datos en dos columnas: etiqueta pequeña arriba, valor abajo. */
  ficha(pares: [string, string][]) {
    const col = (ANCHO - 16) / 2;
    for (let i = 0; i < pares.length; i += 2) {
      const fila = pares.slice(i, i + 2).map(([e, v]) => ({ e, lineas: this.partir(v, col, 9) }));
      const alto = 11 + Math.max(...fila.map((f) => f.lineas.length)) * 11 + 6;
      this.espacio(alto);
      fila.forEach((f, j) => {
        const x = MARGEN + j * (col + 16);
        this.escribir(f.e.toUpperCase(), x, this.y - 7, 6.5, this.negrita, GRIS);
        f.lineas.forEach((l, k) => this.escribir(l, x, this.y - 18 - k * 11, 9, this.normal));
      });
      this.y -= alto;
    }
  }

  /** Cifras clave del periodo en recuadros. */
  cifras(items: { etiqueta: string; valor: string; acento?: boolean }[]) {
    const sep = 8;
    const w = (ANCHO - sep * (items.length - 1)) / items.length;
    const alto = 46;
    this.espacio(alto + 4);
    items.forEach((it, i) => {
      const x = MARGEN + i * (w + sep);
      this.pagina.drawRectangle({ x, y: this.y - alto, width: w, height: alto, color: it.acento ? VERDE_CLARO : FONDO, borderColor: LINEA, borderWidth: 0.5 });
      this.escribir(it.etiqueta.toUpperCase(), x + 8, this.y - 13, 6.5, this.negrita, GRIS);
      this.escribir(it.valor, x + 8, this.y - 35, 17, this.negrita, it.acento ? VERDE : NOCHE);
    });
    this.y -= alto + 4;
  }

  /** Recuadro con fondo para avisos (integridad, acuerdo). */
  caja(lineas: { t: string; tam?: number; negrita?: boolean; color?: RGB }[], { fondo = FONDO, borde = LINEA, acento = VERDE } = {}) {
    const ancho = ANCHO - 22;
    const partidas = lineas.map((l) => ({ ...l, tam: l.tam ?? 8.5, lineas: this.partir(l.t, ancho, l.tam ?? 8.5, l.negrita ? this.negrita : this.normal) }));
    const alto = partidas.reduce((s, p) => s + p.lineas.length * (p.tam + 3.5), 0) + 14;
    this.espacio(alto + 4);
    this.pagina.drawRectangle({ x: MARGEN, y: this.y - alto, width: ANCHO, height: alto, color: fondo, borderColor: borde, borderWidth: 0.5 });
    this.pagina.drawRectangle({ x: MARGEN, y: this.y - alto, width: 3, height: alto, color: acento });
    let y = this.y - 8;
    for (const p of partidas) {
      for (const l of p.lineas) {
        this.escribir(l, MARGEN + 14, y - p.tam, p.tam, p.negrita ? this.negrita : this.normal, p.color ?? NEGRO);
        y -= p.tam + 3.5;
      }
    }
    this.y -= alto + 4;
  }

  /** Barra de título de un bloque (semana). */
  barra(izquierda: string, derecha: string) {
    // Que no quede el título solo al pie: título, encabezado y al menos tres renglones.
    this.espacio(95);
    const alto = 17;
    this.pagina.drawRectangle({ x: MARGEN, y: this.y - alto, width: ANCHO, height: alto, color: NOCHE });
    this.escribir(izquierda, MARGEN + 7, this.y - 11.5, 8.5, this.negrita, rgb(1, 1, 1));
    const d = seguro(derecha);
    this.escribir(d, MARGEN + ANCHO - 7 - this.normal.widthOfTextAtSize(d, 7.5), this.y - 11.5, 7.5, this.normal, rgb(0.86, 0.92, 0.78));
    this.y -= alto;
  }

  /**
   * Tabla con encabezado sombreado (se repite al cambiar de página), renglones alternados y,
   * si se pide, el último renglón como total.
   */
  tabla(columnas: Columna[], filas: string[][], { tam = 7.5, total = false } = {}) {
    const suma = columnas.reduce((s, c) => s + c.ancho, 0);
    const anchos = columnas.map((c) => (c.ancho / suma) * ANCHO);
    const dibujar = (celdas: string[], tipo: "cabecera" | "fila" | "total", par: boolean, reservar = 0) => {
      const fuente = tipo === "fila" ? this.normal : this.negrita;
      const t = tipo === "cabecera" ? tam - 0.5 : tam;
      const partidas = celdas.map((c, i) => this.partir(c, anchos[i]! - 8, t, fuente));
      const alto = Math.max(...partidas.map((p) => p.length)) * (t + 2.5) + 7;
      if (tipo !== "cabecera" && this.y - alto - reservar < MARGEN + 34) {
        this.nuevaPagina();
        dibujar(columnas.map((c) => c.titulo), "cabecera", false);
      } else if (tipo === "cabecera") {
        this.espacio(alto + 20);
      }
      const fondo = tipo === "cabecera" ? VERDE_CLARO : tipo === "total" ? FONDO : par ? rgb(0.985, 0.988, 0.975) : null;
      if (fondo) this.pagina.drawRectangle({ x: MARGEN, y: this.y - alto, width: ANCHO, height: alto, color: fondo });
      let x = MARGEN;
      partidas.forEach((lineas, i) => {
        lineas.forEach((l, j) => {
          const w = fuente.widthOfTextAtSize(l, t);
          const xl = columnas[i]!.derecha ? x + anchos[i]! - 4 - w : x + 4;
          this.escribir(l, xl, this.y - 4.5 - t - j * (t + 2.5), t, fuente, tipo === "cabecera" ? NOCHE : NEGRO);
        });
        x += anchos[i]!;
      });
      this.y -= alto;
      this.pagina.drawLine({
        start: { x: MARGEN, y: this.y },
        end: { x: MARGEN + ANCHO, y: this.y },
        thickness: tipo === "cabecera" ? 0.8 : 0.3,
        color: tipo === "cabecera" ? VERDE : LINEA,
      });
    };
    dibujar(columnas.map((c) => c.titulo), "cabecera", false);
    // El total no se queda solo en otra página: el renglón anterior reserva su lugar.
    filas.forEach((f, i) =>
      dibujar(f, total && i === filas.length - 1 ? "total" : "fila", i % 2 === 1, total && i === filas.length - 2 ? tam + 10 : 0));
  }

  pies(texto: (n: number, total: number) => string) {
    this.paginas.forEach((p, i) => {
      p.drawLine({ start: { x: MARGEN, y: 34 }, end: { x: MARGEN + ANCHO, y: 34 }, thickness: 0.4, color: LINEA });
      for (const [j, l] of this.partir(texto(i + 1, this.paginas.length), ANCHO, 6.5).entries()) {
        p.drawText(l, { x: MARGEN, y: 24 - j * 8, size: 6.5, font: this.normal, color: GRIS });
      }
    });
  }
}

export interface MetaExportacion {
  id: string;
  emitidoEn: Date;
  emitidoPor: string;
  empresa: { razonSocial: string; rfc: string | null };
  lunesInicio: string;
  domingoFin: string;
  integridad: { integra: boolean; primeraInvalida: number | null; secuencia: number; hash: string };
  hashDatos: string;
}

/** Constancia en PDF de los registros de un trabajador en un periodo. */
export async function generarPdf(d: DatosTrabajadorExport, meta: MetaExportacion): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(seguro(`Registro de jornada - ${d.trabajador.nombre} - ${meta.lunesInicio} a ${meta.domingoFin}`));
  pdf.setAuthor(seguro(meta.empresa.razonSocial));
  pdf.setCreator("Checador");
  const doc = new Documento(pdf, await pdf.embedFont(StandardFonts.Helvetica), await pdf.embedFont(StandardFonts.HelveticaBold));
  const zona = d.trabajador.zonaHoraria;
  const num = (iso: string) => fechaHoraNumerica(iso, zona);
  const periodo = `Del lunes ${fechaLarga(meta.lunesInicio)} al domingo ${fechaLarga(meta.domingoFin)}`;

  // Totales del periodo (se muestran arriba, como resumen).
  const total = d.semanas.reduce(
    (t, s) => ({
      t: t.t + s.resultado.totales.trabajadoMin,
      o: t.o + s.resultado.totales.ordinariaMin,
      d: t.d + s.resultado.totales.extraDobleMin,
      x: t.x + s.resultado.totales.extraTripleMin,
    }),
    { t: 0, o: 0, d: 0, x: 0 },
  );

  doc.encabezado(meta.empresa.razonSocial, "REGISTRO ELECTRÓNICO DE LA JORNADA DE TRABAJO", "Constancia para inspección o juicio · LFT art. 132 fr. XXXIV y art. 804");

  doc.ficha([
    ["Persona trabajadora", `${d.trabajador.nombre}${d.ficha.numero ? ` · n.º ${d.ficha.numero}` : ""}`],
    ["Empresa", `${meta.empresa.razonSocial}${meta.empresa.rfc ? ` · RFC ${meta.empresa.rfc}` : ""}`],
    ["CURP", d.ficha.curp ?? "No registrada"],
    ["Centro de trabajo", `${d.trabajador.centro} (zona horaria ${zona})`],
    ["Relación laboral", `Ingreso el ${fechaLarga(d.ficha.fechaIngreso)}${d.ficha.fechaBaja ? ` · baja el ${fechaLarga(d.ficha.fechaBaja)}` : " · activa"}`],
    ["Periodo", `${periodo} (semanas completas)`],
  ]);
  doc.texto(`Emitido el ${num(meta.emitidoEn.toISOString())} por ${meta.emitidoPor} · exportación ${meta.id}`, { tam: 7.5, color: GRIS });
  doc.separar(8);

  doc.cifras([
    { etiqueta: "Trabajado", valor: hm(total.t) },
    { etiqueta: "Jornada ordinaria", valor: hm(total.o) },
    { etiqueta: "Extra al doble", valor: hm(total.d), acento: total.d > 0 },
    { etiqueta: "Extra al triple", valor: hm(total.x), acento: total.x > 0 },
  ]);

  doc.titulo("Integridad de la bitácora");
  if (meta.integridad.integra) {
    doc.caja([
      { t: "VERIFICADA AL EMITIR", tam: 8, negrita: true, color: VERDE },
      {
        t: `Ningún registro de la empresa ha sido alterado. Cada registro está encadenado al anterior con SHA-256. Último registro de la cadena: n.º ${meta.integridad.secuencia}, huella ${meta.integridad.hash}.`,
      },
      { t: `Huella SHA-256 de los datos de esta constancia (bitácora en CSV): ${meta.hashDatos}`, tam: 7, color: GRIS },
    ], { fondo: VERDE_CLARO, borde: LINEA, acento: VERDE });
  } else {
    doc.caja([
      { t: "ALERTA DE INTEGRIDAD", tam: 8, negrita: true, color: ROJO },
      {
        t: `La verificación detectó una alteración a partir del registro n.º ${meta.integridad.primeraInvalida}. Este documento refleja el estado actual de la base de datos.`,
        negrita: true,
        color: ROJO,
      },
      { t: `Huella SHA-256 de los datos de esta constancia (bitácora en CSV): ${meta.hashDatos}`, tam: 7, color: GRIS },
    ], { fondo: ROJO_CLARO, borde: rgb(0.9, 0.7, 0.7), acento: ROJO });
  }

  doc.titulo("Acuerdo de registro electrónico (art. 132 fr. XXXIV, 3.er párrafo)");
  if (!d.acuerdos.length) {
    doc.caja([{ t: "No hay acuerdo de registro electrónico generado para esta persona trabajadora." }], { acento: rgb(0.85, 0.6, 0) });
  }
  for (const a of d.acuerdos) {
    doc.caja([
      {
        t: `Versión ${a.version} · folio ${a.folio} · ${a.vigenteDesde ? `firmado por ambas partes; vigente desde el ${fechaLarga(a.vigenteDesde)}` : "sin firma de ambas partes"}`,
        negrita: true,
      },
      ...a.firmas.map((f) => ({ t: f, tam: 8 })),
    ], { acento: a.vigenteDesde ? VERDE : rgb(0.85, 0.6, 0) });
  }

  doc.titulo("Resumen semanal");
  for (const s of d.semanas) {
    const r = s.resultado;
    doc.barra(
      `Semana del ${fechaNumerica(s.lunes)} al ${fechaNumerica(sumarDias(s.lunes, 6))}`,
      `máximo legal ${hm(r.jornadaSemanalMaxMin)} · acuerdo: ${s.acuerdo ?? "sin acuerdo firmado"}`,
    );
    if (!s.turnos.length && r.totales.trabajadoMin === 0) {
      doc.tabla([{ titulo: "Sin registros en la semana", ancho: 1 }, { titulo: "0:00", ancho: 1, derecha: true }], [], { tam: 7.5 });
    } else {
      const turnosDe = (fecha: string) =>
        s.turnos
          .filter((t) => t.inicio.startsWith(fecha))
          .map((t) => {
            const pausas = (t.pausas ?? []).map((p) => ` pausa ${p.inicio.slice(11)}-${p.fin.slice(11)}${p.puedeSalir ? "" : " (computa)"}`).join("");
            return `${t.inicio.slice(11)}-${t.fin.slice(11)}${pausas}${t.tieneDiferidos ? " [sin conexión]" : ""}`;
          })
          .join("; ");
      doc.tabla(
        [
          { titulo: "Día", ancho: 1.1 }, { titulo: "Turnos", ancho: 4 }, { titulo: "Trabajado", ancho: 1, derecha: true },
          { titulo: "Ordinaria", ancho: 1, derecha: true }, { titulo: "Extra doble", ancho: 1, derecha: true }, { titulo: "Extra triple", ancho: 1, derecha: true },
        ],
        [
          ...r.dias.map((dia) => [
            `${DIAS[dia.diaSemana]} ${fechaNumerica(dia.fecha).slice(0, 5)}`, turnosDe(dia.fecha) || "—", hm(dia.trabajadoMin),
            hm(dia.ordinariaMin), hm(dia.extraDobleMin), hm(dia.extraTripleMin),
          ]),
          ["Total", "", hm(r.totales.trabajadoMin), hm(r.totales.ordinariaMin), hm(r.totales.extraDobleMin), hm(r.totales.extraTripleMin)],
        ],
        { total: true },
      );
    }
    for (const a of r.alertas) doc.texto(`Alerta: ${a.mensaje} (${a.fundamento})`, { tam: 7.5, color: ROJO, sangria: 4 });
    doc.separar(2);
    doc.texto(
      s.conformidad
        ? `Conformidad: ${s.conformidad.respuesta === "conforme" ? "CONFORME" : "OBJETÓ"} el ${num(s.conformidad.respondido_en)}${s.conformidad.comentario ? ` ("${s.conformidad.comentario}")` : ""} · anclada al registro n.º ${s.conformidad.cadena_secuencia}`
        : "Conformidad: la persona trabajadora no ha respondido.",
      { tam: 7.5, sangria: 4, color: s.conformidad ? NEGRO : GRIS },
    );
    doc.separar(8);
  }
  doc.texto(
    `Total del periodo: trabajado ${hm(total.t)} · ordinaria ${hm(total.o)} · extra al doble ${hm(total.d)} · extra al triple ${hm(total.x)}`,
    { negrita: true },
  );
  if (d.incidencias.length) {
    doc.titulo("Registros incompletos");
    for (const i of d.incidencias) doc.texto(`• ${i.mensaje}`, { tam: 8 });
  }

  doc.titulo("Bitácora completa del periodo");
  doc.texto(
    "Todos los registros en orden de la cadena. Nada se borra: las correcciones y anulaciones son registros nuevos que señalan al registro original. Horas en la zona del centro de trabajo.",
    { tam: 7.5, color: GRIS },
  );
  doc.separar(4);
  doc.tabla(
    [
      { titulo: "N.º", ancho: 0.6 }, { titulo: "Registro", ancho: 1.6 }, { titulo: "Hora efectiva", ancho: 1.5 },
      { titulo: "Recibido", ancho: 1.5 }, { titulo: "Origen", ancho: 0.8 }, { titulo: "Observaciones", ancho: 2.9 },
      { titulo: "Huella", ancho: 1.3 },
    ],
    d.bitacora.map((e) => [
      String(e.secuencia),
      ETIQUETA_TIPO[e.tipo] ?? e.tipo,
      num(e.hora_efectiva),
      num(e.hora_servidor),
      ETIQUETA_ORIGEN[e.origen] ?? e.origen,
      [
        e.corrige_evento_id ? `sobre el evento ${e.corrige_evento_id}` : `evento ${e.id}`,
        e.diferido ? `sin conexión; hora del dispositivo ${e.hora_dispositivo ? num(e.hora_dispositivo) : "?"}` : "",
        e.tipo === "inicio_pausa" ? (e.puede_salir ? "puede salir" : "no puede salir: computa") : "",
        e.motivo ? `motivo: ${e.motivo}` : "",
      ].filter(Boolean).join(" · "),
      e.hash.replace(/^\\x/, "").slice(0, 12),
    ]),
    { tam: 7 },
  );

  doc.pies(
    (n, t) =>
      `Página ${n} de ${t} · ${meta.empresa.razonSocial} · ${d.trabajador.nombre} · ${fechaNumerica(meta.lunesInicio)} al ${fechaNumerica(meta.domingoFin)} · exportación ${meta.id} · comprueba este archivo en Checador > Exportar > Verificar un archivo`,
  );
  return pdf.save();
}
