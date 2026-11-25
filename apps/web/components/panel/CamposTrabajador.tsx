import type { HorarioFila } from "@/lib/horarios";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export interface DatosTrabajador {
  id?: string;
  nombre?: string;
  numero_empleado?: string | null;
  email?: string | null;
  telefono?: string | null;
  curp?: string | null;
  centro_trabajo_id?: string;
  fecha_ingreso?: string;
  dia_descanso?: number;
  dias_descanso_adicionales?: number[] | null;
  jornada_pactada_min?: Record<string, number> | null;
  horario_id?: string | null;
  sin_horario_fijo?: boolean;
}

export function CamposTrabajador({
  t,
  centros,
  horarios = [],
  predeterminado = null,
}: {
  t?: DatosTrabajador;
  centros: { id: string; nombre: string }[];
  horarios?: HorarioFila[];
  predeterminado?: string | null;
}) {
  const deEmpresa = horarios.find((h) => h.id === predeterminado);
  // "(opcional)" en gris, sin cambiar el texto de la etiqueta (las pruebas y los lectores de pantalla lo usan).
  const opcional = <span className="opcional"> (opcional)</span>;
  const titulo = (texto: string, esOpcional = false) => <span className="etiqueta-campo">{texto}{esOpcional && opcional}</span>;
  return (
    <div className="ficha-campos">
      {t?.id && <input type="hidden" name="id" value={t.id} />}

      <section className="grupo-campos">
        <div className="grupo-titulo">
          <h3>Identificación</h3>
          <p>Cómo aparece la persona en Checador, en el acuerdo y en las exportaciones.</p>
        </div>
        <div className="campos campos-2">
          <label className="campo-2">Nombre completo<input name="nombre" required defaultValue={t?.nombre ?? ""} /></label>
          <label>
            Número de empleado
            <input name="numero_empleado" inputMode="numeric" defaultValue={t?.numero_empleado ?? ""} placeholder="Solo dígitos" />
          </label>
          <label>{titulo("CURP", true)}<input name="curp" maxLength={18} autoCapitalize="characters" defaultValue={t?.curp ?? ""} /></label>
        </div>
      </section>

      <section className="grupo-campos">
        <div className="grupo-titulo">
          <h3>Formas de checar</h3>
          <p>
            Necesita al menos una: <b>correo</b> para la app del celular, <b>número de empleado</b> con PIN para el kiosco o
            <b> celular</b> para WhatsApp (se activa con un código que generas {t?.id ? "abajo, en esta ficha" : "en su ficha, después del alta"}).
          </p>
        </div>
        <div className="campos campos-2">
          <label>
            {titulo("Correo", true)}
            <input name="email" type="email" autoComplete="off" defaultValue={t?.email ?? ""} />
            <span className="ayuda">
              {t?.id ? "Si lo cambias, el correo anterior pierde el acceso." : "Entra a la app con un código que llega a este correo."}
            </span>
          </label>
          <label>
            {titulo("Celular para WhatsApp", true)}
            <input name="telefono" type="tel" inputMode="tel" autoComplete="off" placeholder="10 dígitos"
              defaultValue={t?.telefono ? t.telefono.replace(/^52(?=\d{10}$)/, "") : ""} />
            <span className="ayuda">
              {t?.id ? "Si lo cambias o lo borras, el número anterior deja de poder checar." : "10 dígitos. La persona lo activa con un código de su ficha."}
            </span>
          </label>
        </div>
      </section>

      <section className="grupo-campos">
        <div className="grupo-titulo">
          <h3>Trabajo</h3>
          <p>El centro define la zona horaria y la regla de la pausa de comida. El horario sirve para ver retardos; se crea en Configuración.</p>
        </div>
        <div className="campos campos-3">
          <label>
            Centro de trabajo
            <select name="centro_trabajo_id" required defaultValue={t?.centro_trabajo_id ?? centros[0]?.id}>
              {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label>Fecha de ingreso<input name="fecha_ingreso" type="date" required defaultValue={t?.fecha_ingreso ?? ""} /></label>
          <input type="hidden" name="empresa_tiene_horario" value={deEmpresa ? "si" : "no"} />
          {horarios.length > 0 ? (
            <label>
              Horario
              <select name="horario" defaultValue={t?.sin_horario_fijo ? "sin" : (t?.horario_id ?? "")}>
                {deEmpresa ? (
                  <option value="">De la empresa ({deEmpresa.nombre})</option>
                ) : (
                  <option value="" data-manual="">Sin horario</option>
                )}
                {horarios.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                <option value="sin" data-manual="">Sin horario fijo (rota turnos)</option>
              </select>
            </label>
          ) : (
            <input type="hidden" name="horario" value="" />
          )}
        </div>
      </section>

      <section className="grupo-campos">
        <div className="grupo-titulo">
          <h3>Descanso y jornada</h3>
          <p>
            Un descanso obligatorio por cada seis días de trabajo (art. 69); trabajarlo se paga doble (art. 73). Los adicionales
            son un beneficio pactado: si se trabajan, Checador lo señala sin pago doble.
          </p>
        </div>
        <div className="grupo-cuerpo">
          <div className="campos campos-3">
            <label>
              Descanso semanal obligatorio
              <select name="dia_descanso" defaultValue={String(t?.dia_descanso ?? 0)}>
                {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="dias-adicionales">
            <legend>{titulo("Días de descanso adicionales", true)}</legend>
            <div className="dias-semana">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <label key={d} className="dia-chip">
                  <input type="checkbox" name="descanso_adicional" value={d}
                    defaultChecked={t?.dias_descanso_adicionales?.includes(d) ?? false} />
                  {DIAS[d]}
                </label>
              ))}
            </div>
            <span className="ayuda">Por ejemplo, el sábado en una semana de 5 días. Máximo 3; el día del descanso obligatorio se ignora.</span>
          </fieldset>
          <div className={`jornada-manual ${horarios.length ? "" : "siempre"}`}>
            <details>
              <summary>Jornada pactada por día (opcional, art. 58 LFT)</summary>
              <p className="ayuda">
                Horas ordinarias acordadas por día; las que excedan cuentan como tiempo extra. Vacío = jornada legal del art. 61
                (8 h diurna, 7 h nocturna, 7.5 h mixta).
              </p>
              <div className="campos campos-7">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <label key={d}>
                    {DIAS[d]}
                    <input name={`pactada_${d}`} inputMode="decimal" placeholder="h"
                      defaultValue={t?.jornada_pactada_min?.[String(d)] != null ? String(t.jornada_pactada_min[String(d)]! / 60) : ""} />
                  </label>
                ))}
              </div>
            </details>
          </div>
          {horarios.length > 0 && (
            <p className="ayuda jornada-horario">
              La jornada pactada por día (art. 58) se calcula del horario: de la entrada a la salida, sin la comida si en su
              centro de trabajo se puede salir a comer.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
