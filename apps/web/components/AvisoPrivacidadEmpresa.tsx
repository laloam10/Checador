/** Enlace al aviso de privacidad de la empresa para su personal (lo captura en Configuración). */
export function AvisoPrivacidadEmpresa({ empresa, url }: { empresa: string; url: string | null }) {
  if (!url) return null;
  return (
    <p className="aviso-privacidad-empresa">
      <a href={url} target="_blank" rel="noopener">Aviso de privacidad de {empresa}</a>: cómo trata tus datos de registro de jornada.
    </p>
  );
}
