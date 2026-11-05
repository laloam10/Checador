"use client";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "borrar", "0", "ok"] as const;

export function Teclado({
  valor,
  onCambio,
  onOk,
  max,
  min,
  deshabilitado,
}: {
  valor: string;
  onCambio: (v: string) => void;
  onOk: () => void;
  max: number;
  min: number;
  deshabilitado?: boolean;
}) {
  return (
    <div className="teclado" role="group" aria-label="Teclado numérico">
      {TECLAS.map((t) =>
        t === "borrar" ? (
          <button key={t} type="button" className="tecla tecla-borrar" aria-label="Borrar"
            disabled={deshabilitado || !valor} onClick={() => onCambio(valor.slice(0, -1))}>
            ⌫
          </button>
        ) : t === "ok" ? (
          <button key={t} type="button" className="tecla tecla-ok" aria-label="Continuar"
            disabled={deshabilitado || valor.length < min} onClick={onOk}>
            OK
          </button>
        ) : (
          <button key={t} type="button" className="tecla" disabled={deshabilitado || valor.length >= max}
            onClick={() => onCambio(valor + t)}>
            {t}
          </button>
        ),
      )}
    </div>
  );
}
