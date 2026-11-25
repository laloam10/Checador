# Empresa de ejemplo para capturas

Crea **Cafetería Los Arcos SA de CV** (datos inventados) con 5 personas y 3½ semanas de uso
real, y toma capturas del panel, la app de la persona trabajadora y el kiosco. Sirve para el
manual, presentaciones y la tienda de Jemba.

> **Solo para el Supabase local.** Nunca contra pruebas ni producción: el generador cambia
> temporalmente funciones de la base para poder registrar fechas pasadas.

## La historia

Las fechas son relativas al día en que se corre: alta el viernes anterior a la primera semana,
tres semanas completas y la semana en curso hasta ese momento.

| Persona | Cómo checa | Qué muestra |
|---|---|---|
| Rosa Mendoza Ruiz (101), barista | App en su celular, con ubicación | Puntual; un día no dio permiso de ubicación |
| Jorge Castillo Vega (102), cocinero | Kiosco (sin correo) | Firma su acuerdo en el kiosco; olvida checar una salida, la empresa la captura, él objeta y se corrige; tiempo extra al doble y al triple |
| Daniela Ortiz Flores (103), cajera de medio tiempo | WhatsApp | Sale temprano un viernes; no ha revisado la semana pasada |
| Luis Hernández Soto (104), mesero | Kiosco (sin correo) | Acuerdo firmado en papel; retardos; entrada duplicada anulada; objeción pendiente de la semana pasada |
| Mariana Torres Gil (105), encargada de Plaza Norte | App en su iPhone; también supervisora | Trabaja en domingo; un día checa a 520 m del centro |

Dueño: `alejandro.ruiz@cafeteria-demo.mx`. Kiosco: `kiosco.matriz@cafeteria-demo.mx`. Para
entrar como cualquiera de ellos, el código llega a Mailpit (http://127.0.0.1:54324).

## Uso

Desde la raíz del repositorio, con el Supabase local levantado (`npx supabase start`) y la app
corriendo en `http://127.0.0.1:3000` conectada a él (`apps/web/.env.local` con
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`; `npm run build -w apps/web` y
`npx next start` en `apps/web`):

```bash
CHECADOR_EJEMPLO=local node scripts/ejemplo/generar.cjs
CHECADOR_EJEMPLO=local node scripts/ejemplo/capturar.cjs
```

Las capturas quedan en `scripts/ejemplo/salida/capturas/` (la carpeta `salida/` no se versiona).
Para regenerar la empresa, borra la base local con `npx supabase db reset` y vuelve a correr:
la bitácora es de solo inserción y el generador no borra nada.

## Protecciones

- Sin `CHECADOR_EJEMPLO=local`, no hace nada.
- La base (`EJEMPLO_DB_URL`, por omisión la del Supabase local) debe estar en `127.0.0.1` o
  `localhost`.
- La app de `:3000` (y el servidor auxiliar de `:3001`) deben estar conectados a un Supabase
  local: se revisa el `connect-src` de su CSP antes de cambiar nada.
- Mailpit debe responder (solo existe en el Supabase local).
- Si la cuenta que crea la app no aparece en la base de `psql`, se detiene antes de tocar las
  funciones.

## Cómo registra el pasado

- **Checadas, acuerdos, firmas y conformidades:** mientras corre, sus disparadores toman la hora
  de la tabla `public._reloj_carga` en lugar de `clock_timestamp()`. Todo se registra en orden
  cronológico, así que la cadena de la bitácora es válida (se verifica con `verificar_cadena`).
  Al terminar, o si algo falla, se restauran las funciones originales y se borra la tabla. Si
  una corrida se cortó sin restaurarlas, la siguiente lo hace antes de empezar.
- **Texto de los acuerdos:** lo genera la propia app, en un servidor auxiliar (`:3001`) que cree
  que es el día del alta (`fecha-falsa.cjs`), para que el acuerdo lleve esa fecha.
- **Conformidades:** pasan por las rutas reales de la app (celular y kiosco), así que el resumen
  es el que calcula la app.
- **Lo de hoy:** solo lo que ya pasó, hasta 3 minutos antes de correr.
