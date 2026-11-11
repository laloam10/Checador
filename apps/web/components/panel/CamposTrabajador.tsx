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
}

export function CamposTrabajador({ t, centros }: { t?: DatosTrabajador; centros: { id: string; nombre: string }[] }) {
  return (
    <>
      {t?.id && <input type="hidden" name="id" value={t.id} />}
      <div className="campos">
        <label>Nombre completo<input name="nombre" required defaultValue={t?.nombre ?? ""} /></label>
        <label>
          Número de empleado
          <input name="numero_empleado" defaultValue={t?.numero_empleado ?? ""} placeholder="Solo dígitos, para el kiosco" />
        </label>
        <label>
          Correo (opcional)
          <input name="email" type="email" defaultValue={t?.email ?? ""} />
          <span className="ayuda">
            {t?.id
              ? "Si lo cambias, la cuenta del correo anterior pierde el acceso y la persona entra con el nuevo."
              : "Para entrar a la app desde su celular."}
          </span>
        </label>
        <label>
          Celular para WhatsApp (opcional)
          <input name="telefono" type="tel" inputMode="tel" autoComplete="off" placeholder="10 dígitos"
            defaultValue={t?.telefono ? t.telefono.replace(/^52(?=\d{10}$)/, "") : ""} />
          <span className="ayuda">
            Para checar por WhatsApp. La persona lo activa una vez con un código que generas en esta ficha; si cambias o borras el número, deja de poder
            checar desde el anterior.
          </span>
        </label>
        <label>CURP (opcional)<input name="curp" maxLength={18} defaultValue={t?.curp ?? ""} /></label>
        <label>
          Centro de trabajo
          <select name="centro_trabajo_id" required defaultValue={t?.centro_trabajo_id ?? centros[0]?.id}>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label>Fecha de ingreso<input name="fecha_ingreso" type="date" required defaultValue={t?.fecha_ingreso ?? ""} /></label>
        <label>
          Descanso semanal obligatorio
          <select name="dia_descanso" defaultValue={String(t?.dia_descanso ?? 0)}>
            {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <span className="ayuda">Uno por cada seis días de trabajo (art. 69). Trabajarlo se paga doble (art. 73).</span>
        </label>
      </div>
      <fieldset className="pregunta">
        <legend>Días de descanso adicionales (opcional)</legend>
        <div className="dias-semana">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label key={d} className="casilla-linea">
              <input type="checkbox" name="descanso_adicional" value={d}
                defaultChecked={t?.dias_descanso_adicionales?.includes(d) ?? false} />
              {DIAS[d]}
            </label>
          ))}
        </div>
        <span className="ayuda">
          Por ejemplo, el sábado en una semana de 5 días. Es un beneficio pactado: si se trabaja, Checador lo señala y las
          horas cuentan para el máximo semanal, pero no aplica el pago doble del art. 73. Máximo 3; si marcas el mismo día que
          el descanso obligatorio, se ignora.
        </span>
      </fieldset>
      <details>
        <summary>Jornada pactada por día (opcional, art. 58 LFT)</summary>
        <p className="ayuda">
          Horas ordinarias acordadas por día; las que excedan cuentan como tiempo extra. Vacío = jornada legal del art. 61
          (8 h diurna, 7 h nocturna, 7.5 h mixta).
        </p>
        <div className="campos">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label key={d}>
              {DIAS[d]}
              <input name={`pactada_${d}`} inputMode="decimal" placeholder="h"
                defaultValue={t?.jornada_pactada_min?.[String(d)] != null ? String(t.jornada_pactada_min[String(d)]! / 60) : ""} />
            </label>
          ))}
        </div>
      </details>
    </>
  );
}
