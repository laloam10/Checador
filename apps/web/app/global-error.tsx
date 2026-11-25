"use client";

/**
 * Error en el propio diseño base de la app: reemplaza todo el documento, así que no tiene los
 * estilos globales. Estilos en línea, con la paleta de Jemba.
 */
export default function ErrorGlobal({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="es-MX">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f8ec", color: "#13280a", fontFamily: "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <title>Checador · Algo salió mal</title>
        <div style={{ maxWidth: "26rem", margin: "1rem", padding: "2rem 1.5rem", background: "#fbfcf7", border: "1px solid #dfe6cf", borderRadius: "1rem", textAlign: "center" }}>
          <div style={{ width: 44, height: 44, margin: "0 auto 1rem", borderRadius: 12, background: "#0a2103", display: "grid", placeItems: "center" }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: "#c8e600" }} />
          </div>
          <h1 style={{ fontSize: "1.4rem", margin: "0 0 0.5rem" }}>Algo salió mal</h1>
          <p style={{ color: "#4b5a40", margin: "0 0 1.2rem" }}>No pudimos cargar Checador. Tus registros no se perdieron: intenta de nuevo en un momento.</p>
          <button type="button" onClick={() => retry()} style={{ background: "#2f6e10", color: "white", border: "none", borderRadius: 10, padding: "0.7rem 1.2rem", fontWeight: 600, fontSize: "1rem", cursor: "pointer" }}>
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}
