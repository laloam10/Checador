import { Navegacion } from "./Navegacion";

export function SinVinculo() {
  return (
    <main>
      <Navegacion />
      <section className="tarjeta">
        <h1>Tu cuenta aún no está vinculada</h1>
        <p>
          Pide a tu empleador que te dé de alta con el mismo correo con el que entraste. Después, sal y vuelve a
          entrar.
        </p>
        <p>
          ¿Eres empleador? <a href="/alta-empresa">Registra tu empresa</a>.
        </p>
      </section>
    </main>
  );
}
