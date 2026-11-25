import { BotonSalir } from "./BotonSalir";
import { Navegacion } from "./Navegacion";
import { RevisarVinculo } from "./RevisarVinculo";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * La persona entró, pero ningún empleador la ha dado de alta con ese correo. El caso más común
 * es que la dieron de alta con otro correo: por eso se muestra con cuál entró.
 */
export async function SinVinculo() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const correo = typeof data?.claims?.email === "string" ? data.claims.email : null;

  return (
    <main>
      <Navegacion />
      <section className="sin-vinculo">
        <div className="sin-vinculo-icono" aria-hidden>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 4 8M8 12h3M3 3l18 18" />
          </svg>
        </div>
        <h1>Tu cuenta aún no está vinculada a un empleador</h1>
        {correo && (
          <p className="sin-vinculo-correo">
            Entraste con <strong>{correo}</strong>
          </p>
        )}
        <p className="ayuda">
          Tu empleador te da de alta en Checador con tu correo. Si no encuentra el tuyo, normalmente es porque usó otro.
        </p>

        <ol className="sin-vinculo-pasos">
          <li>
            <span>1</span>
            <div><strong>Pregunta con qué correo te dio de alta.</strong> Debe ser exactamente el de arriba.</div>
          </li>
          <li>
            <span>2</span>
            <div><strong>Si usó otro, sal y entra con ese correo.</strong> O pídele que lo cambie en tu ficha.</div>
          </li>
          <li>
            <span>3</span>
            <div><strong>Cuando lo corrija, toca Volver a revisar.</strong> Tu cuenta se vincula con tus registros.</div>
          </li>
        </ol>

        <div className="sin-vinculo-acciones">
          <RevisarVinculo />
          <BotonSalir className="boton-secundario">Entrar con otro correo</BotonSalir>
        </div>
        <p className="sin-vinculo-negocio">
          ¿Tienes un negocio? <a href="/alta-empresa">Registra tu empresa</a> y da de alta a tu personal.
        </p>
      </section>
    </main>
  );
}
