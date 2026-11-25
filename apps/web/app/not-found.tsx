import Link from "next/link";
import { PantallaAviso } from "@/components/PantallaAviso";

export const metadata = { title: "Checador · Página no encontrada" };

export default function NoEncontrada() {
  return (
    <PantallaAviso codigo="404" titulo="No encontramos esta página">
      <p>Puede que el enlace esté incompleto o que la página ya no exista.</p>
      <div className="pantalla-aviso-acciones">
        <Link className="boton" href="/">Ir al inicio</Link>
      </div>
    </PantallaAviso>
  );
}
