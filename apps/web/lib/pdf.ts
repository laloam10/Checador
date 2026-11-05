import "server-only";

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { aHoraLocal } from "@checador/jornada";
import { ETIQUETA_ORIGEN, ETIQUETA_TIPO, type DatosTrabajadorExport } from "./exportacion";
import { sumarDias } from "./fechas";

const A4: [number, number] = [595.28, 841.89];
const MARGEN = 40;
const ANCHO = A4[0] - MARGEN * 2;
const GRIS = rgb(0.4, 0.4, 0.4);
const ROJO = rgb(0.6, 0.1, 0.1);

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
    this.y = A4[1] - MARGEN;
  }

  private espacio(alto: number) {
    if (this.y - alto < MARGEN + 30) this.nuevaPagina();
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

  texto(t: string, { tam = 9, negrita = false, color = rgb(0, 0, 0), sangria = 0 } = {}) {
    const fuente = negrita ? this.negrita : this.normal;
    for (const l of this.partir(t, ANCHO - sangria, tam, fuente)) {
      this.espacio(tam + 3);
      this.pagina.drawText(l, { x: MARGEN + sangria, y: this.y - tam, size: tam, font: fuente, color });
      this.y -= tam + 3;
    }
  }

  titulo(t: string, tam = 12) {
    this.espacio(tam + 30);
    this.y -= 8;
    this.texto(t, { tam, negrita: true });
    this.y -= 2;
  }

  separar(alto = 6) {
    this.y -= alto;
  }

  tabla(columnas: { titulo: string; ancho: number }[], filas: string[][], tam = 7.5) {
    const total = columnas.reduce((s, c) => s + c.ancho, 0);
    const anchos = columnas.map((c) => (c.ancho / total) * ANCHO);
    const dibujarFila = (celdas: string[], negrita: boolean) => {
      const fuente = negrita ? this.negrita : this.normal;
      const partidas = celdas.map((c, i) => this.partir(c, anchos[i]! - 4, tam, fuente));
      const alto = Math.max(...partidas.map((p) => p.length)) * (tam + 2) + 4;
      this.espacio(alto);
      let x = MARGEN;
      partidas.forEach((lineas, i) => {
        lineas.forEach((l, j) => {
          this.pagina.drawText(l, { x: x + 2, y: this.y - 2 - tam - j * (tam + 2), size: tam, font: fuente });
        });
        x += anchos[i]!;
      });
      this.y -= alto;
      this.pagina.drawLine({
        start: { x: MARGEN, y: this.y },
        end: { x: MARGEN + ANCHO, y: this.y },
        thickness: 0.3,
        color: rgb(0.75, 0.75, 0.75),
      });
    };
    dibujarFila(columnas.map((c) => c.titulo), true);
    for (const f of filas) dibujarFila(f, false);
  }

  pies(texto: (n: number, total: number) => string) {
    this.paginas.forEach((p, i) => {
      for (const [j, l] of this.partir(texto(i + 1, this.paginas.length), ANCHO, 6.5).entries()) {
        p.drawText(l, { x: MARGEN, y: 22 - j * 8, size: 6.5, font: this.normal, color: GRIS });
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
  const local = (iso: string) => aHoraLocal(iso, zona).replace("T", " ");

  doc.texto("REGISTRO ELECTRÓNICO DE LA JORNADA DE TRABAJO", { tam: 14, negrita: true });
  doc.texto("Constancia para inspección o juicio (LFT art. 132 fr. XXXIV y art. 804)", { tam: 9, color: GRIS });
  doc.separar(8);

  doc.tabla(
    [{ titulo: "Concepto", ancho: 1 }, { titulo: "Detalle", ancho: 3 }],
    [
      ["Empresa", `${meta.empresa.razonSocial}${meta.empresa.rfc ? ` · RFC ${meta.empresa.rfc}` : ""}`],
      ["Centro de trabajo", `${d.trabajador.centro} (zona horaria ${zona})`],
      ["Persona trabajadora", `${d.trabajador.nombre}${d.ficha.numero ? ` · n.º ${d.ficha.numero}` : ""}${d.ficha.curp ? ` · CURP ${d.ficha.curp}` : ""}`],
      ["Relación laboral", `Ingreso ${d.ficha.fechaIngreso}${d.ficha.fechaBaja ? ` · baja ${d.ficha.fechaBaja}` : " · activa"}`],
      ["Periodo", `${meta.lunesInicio} al ${meta.domingoFin} (semanas completas de lunes a domingo)`],
      ["Emitido", `${aHoraLocal(meta.emitidoEn, zona).replace("T", " ")} por ${meta.emitidoPor} · exportación ${meta.id}`],
    ],
    8,
  );

  doc.titulo("Integridad de la bitácora");
  if (meta.integridad.integra) {
    doc.texto(
      `Verificada al emitir: ningún registro de la empresa ha sido alterado. Cada registro está encadenado al anterior con SHA-256. Último registro de la cadena: n.º ${meta.integridad.secuencia}, huella ${meta.integridad.hash}.`,
    );
  } else {
    doc.texto(
      `ALERTA: la verificación detectó una alteración a partir del registro n.º ${meta.integridad.primeraInvalida}. Este documento refleja el estado actual de la base de datos.`,
      { negrita: true, color: ROJO },
    );
  }
  doc.texto(`Huella SHA-256 de los datos de esta constancia (bitácora en CSV): ${meta.hashDatos}`, { tam: 8, color: GRIS });

  doc.titulo("Acuerdo de registro electrónico (art. 132 fr. XXXIV, 3.er párrafo)");
  if (!d.acuerdos.length) doc.texto("No hay acuerdo de registro electrónico generado para esta persona trabajadora.");
  for (const a of d.acuerdos) {
    doc.texto(
      `Versión ${a.version} · folio ${a.folio} · ${a.vigenteDesde ? `firmado por ambas partes; vigente desde ${a.vigenteDesde}` : "sin firma de ambas partes"}`,
      { negrita: true },
    );
    for (const f of a.firmas) doc.texto(f, { sangria: 10 });
  }

  doc.titulo("Resumen semanal");
  let total = { t: 0, o: 0, d: 0, x: 0 };
  for (const s of d.semanas) {
    const r = s.resultado;
    doc.texto(
      `Semana del ${s.lunes} al ${sumarDias(s.lunes, 6)} · máximo legal ${hm(r.jornadaSemanalMaxMin)} · acuerdo: ${s.acuerdo ?? "sin acuerdo firmado"}`,
      { negrita: true, tam: 8.5 },
    );
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
        { titulo: "Día", ancho: 1.1 }, { titulo: "Turnos", ancho: 4 }, { titulo: "Trabajado", ancho: 1 },
        { titulo: "Ordinaria", ancho: 1 }, { titulo: "Extra doble", ancho: 1 }, { titulo: "Extra triple", ancho: 1 },
      ],
      [
        ...r.dias.map((dia) => [
          `${DIAS[dia.diaSemana]} ${dia.fecha.slice(5)}`, turnosDe(dia.fecha), hm(dia.trabajadoMin),
          hm(dia.ordinariaMin), hm(dia.extraDobleMin), hm(dia.extraTripleMin),
        ]),
        ["Total", "", hm(r.totales.trabajadoMin), hm(r.totales.ordinariaMin), hm(r.totales.extraDobleMin), hm(r.totales.extraTripleMin)],
      ],
    );
    for (const a of r.alertas) doc.texto(`Alerta: ${a.mensaje} (${a.fundamento})`, { tam: 7.5, color: ROJO, sangria: 6 });
    doc.texto(
      s.conformidad
        ? `Conformidad: ${s.conformidad.respuesta === "conforme" ? "CONFORME" : "OBJETÓ"} el ${local(s.conformidad.respondido_en)}${s.conformidad.comentario ? ` ("${s.conformidad.comentario}")` : ""} · anclada al registro n.º ${s.conformidad.cadena_secuencia}`
        : "Conformidad: la persona trabajadora no ha respondido.",
      { tam: 7.5, sangria: 6 },
    );
    doc.separar(4);
    total = { t: total.t + r.totales.trabajadoMin, o: total.o + r.totales.ordinariaMin, d: total.d + r.totales.extraDobleMin, x: total.x + r.totales.extraTripleMin };
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
  doc.tabla(
    [
      { titulo: "N.º", ancho: 0.6 }, { titulo: "Registro", ancho: 1.6 }, { titulo: "Hora efectiva", ancho: 1.5 },
      { titulo: "Recibido", ancho: 1.5 }, { titulo: "Origen", ancho: 0.7 }, { titulo: "Observaciones", ancho: 3 },
      { titulo: "Huella", ancho: 1.3 },
    ],
    d.bitacora.map((e) => [
      String(e.secuencia),
      ETIQUETA_TIPO[e.tipo] ?? e.tipo,
      local(e.hora_efectiva),
      local(e.hora_servidor),
      ETIQUETA_ORIGEN[e.origen] ?? e.origen,
      [
        e.corrige_evento_id ? `sobre el evento ${e.corrige_evento_id}` : `evento ${e.id}`,
        e.diferido ? `sin conexión; hora del dispositivo ${e.hora_dispositivo ? local(e.hora_dispositivo) : "?"}` : "",
        e.tipo === "inicio_pausa" ? (e.puede_salir ? "puede salir" : "no puede salir: computa") : "",
        e.motivo ? `motivo: ${e.motivo}` : "",
      ].filter(Boolean).join(" · "),
      e.hash.replace(/^\\x/, "").slice(0, 12),
    ]),
    7,
  );

  doc.pies(
    (n, t) =>
      `Página ${n} de ${t} · ${meta.empresa.razonSocial} · ${d.trabajador.nombre} · ${meta.lunesInicio} al ${meta.domingoFin} · exportación ${meta.id} · comprueba este archivo en Checador > Exportar > Verificar un archivo`,
  );
  return pdf.save();
}
