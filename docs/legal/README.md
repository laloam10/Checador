# Documentos legales

| Documento | Dónde está | Se publica en |
|---|---|---|
| Términos y condiciones del servicio | `apps/web/content/legal/terminos.md` | `/terminos` |
| Aviso de privacidad de Checador (clientes y usuarios del panel) | `apps/web/content/legal/privacidad.md` | `/privacidad` |
| Modelo de aviso de privacidad para el personal de cada empresa | `docs/legal/modelo-aviso-privacidad-personal.md` | Lo completa y entrega cada empresa |

- Los dos primeros viven dentro de la app porque las páginas los leen tal cual: lo que se edita ahí es lo que se
  publica. La app quita el recuadro de "BORRADOR" del inicio y la sección "Notas para el abogado".
- **Versión:** la toma del encabezado (`Versión 1.0 · …`). Al cambiar un documento, sube su versión: el panel pedirá
  al propietario de cada empresa aceptar la nueva (`aceptaciones_legales`, migración `20261207000001`).
- **Publicación:** mientras la variable `LEGAL_PUBLICADO` no valga `1`, las páginas no existen en producción y en
  pruebas se ven marcadas como borrador; tampoco se pide aceptarlos al crear la empresa. Publicar solo cuando el
  abogado los haya revisado y estén llenos los datos entre corchetes.
