import { Isotipo } from "@/components/Marca";

/** Pantalla centrada con la marca para errores, "no encontrada" y similares. */
export function PantallaAviso({
  codigo,
  titulo,
  children,
}: {
  codigo?: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <main className="pantalla-aviso">
      <div className="pantalla-aviso-tarjeta">
        <div className="pantalla-aviso-marca"><Isotipo tamano={44} /></div>
        {codigo && <p className="pantalla-aviso-codigo">{codigo}</p>}
        <h1>{titulo}</h1>
        {children}
      </div>
    </main>
  );
}
