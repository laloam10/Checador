import { redirect } from "next/navigation";

// La pantalla del PIN ahora es parte de "Acceso".
export default function PaginaPin() {
  redirect("/acceso");
}
