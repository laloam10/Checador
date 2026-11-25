// Precarga SOLO para el servidor auxiliar de scripts/ejemplo/generar.cjs: hace creer al proceso
// que es FECHA_FALSA (el reloj avanza normalmente a partir de ahí) para generar los acuerdos con
// la fecha del alta. Conserva Date.parse, Date.UTC, etc. Nunca se usa en la app.
const base = Date.parse(process.env.FECHA_FALSA);
if (Number.isNaN(base)) throw new Error("FECHA_FALSA inválida");
const Real = Date;
const nowReal = Real.now.bind(Real);
const inicio = nowReal();
const ahora = () => base + (nowReal() - inicio);
Real.now = ahora;
global.Date = new Proxy(Real, {
  construct: (T, a) => (a.length ? new T(...a) : new T(ahora())),
  apply: (T, _, a) => new T(ahora()).toString(),
});
