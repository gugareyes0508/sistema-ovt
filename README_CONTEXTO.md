# Sistema OVT — Contexto del proyecto

Control de horas extra (overtime) interno para Kyndryl Chile. ~22 especialistas
en dos cuentas de cliente: Banco de Chile (bcochile) y Sura. Un solo dev
(Gustavo) mantiene todo el stack.

## Stack e infraestructura
- Frontend: React → Vercel (https://sistema-ovt-three.vercel.app)
- Backend: Node.js/Express → Railway (https://sistema-ovt-production.up.railway.app)
- Base de datos: Firebase Firestore (proyecto: sistema-ovt-bcochile)
- GitHub: https://github.com/gugareyes0508/sistema-ovt
- Dev local: `~/sistema-ovt/` (Mac, migrado desde Windows en jul-2026)

## Roles del sistema
- `admin`: acceso total
- `dpe`: multi-cliente, gestiona usuarios/grupos
- `teamleader`: aprueba horas OVT, ve dashboard/analytics
- `especialista`: registra horas
- `itsm`: crea proyecciones

## Notas importantes para quien retome el proyecto
- **CI=true en Vercel**: los builds tratan warnings de ESLint como errores.
  Revisar imports/variables no usadas antes de entregar cualquier archivo
  React/JS.
- **Definir componentes a nivel de módulo**, nunca dentro del cuerpo de un
  componente padre (causa remounts en cada render).
- **Multi-tenancy**: el scoping por cliente debe aplicarse en cada capa
  (IDs de documento, filtros de query, headers HTTP, estado de React) —
  falta en una sola capa causa contaminación de datos entre clientes.
- **Migraciones de Firestore en dos fases**: desplegar el endpoint de
  backfill primero, verificar que termine, y solo después cambiar la query
  a server-side filtering — nunca simultáneo.
- **Límite de tamaño en Express**: el límite default de 100kb en
  `express.json()` falla en silencio con payloads grandes — configurar
  explícitamente (`limit: '25mb'`) para endpoints con datos pesados.
- **Estado de React y closures obsoletos**: para operaciones críticas como
  cambio de cliente, llamar a las APIs directamente con el nuevo valor en
  vez de esperar a que el estado se propague por cadenas de useCallback.

## Preferencias de trabajo de Gustavo
- Prefiere archivos completos de reemplazo, no diffs/parches parciales.
- Git: siempre `git add [archivo específico]`, nunca `git add .` ni `-A`.
- UI: propuestas de mockup visual antes de programar; espera un "dale" o
  "programar" explícito para empezar a codear.
- Shell: zsh (Terminal de Mac) en `~/sistema-ovt/`. Antes PowerShell/cmd.exe
  en Windows — usar `curl` para health checks (ya no aplica `Invoke-RestMethod`).
- Entorno Node: gestionado con `nvm` (Node 18.x fijado por el proyecto).
- Herramientas de Mac: Homebrew, GitHub CLI (`gh`) para autenticación con
  GitHub (login vía navegador, sin manejo manual de tokens/SSH keys).

## Herramientas / recursos
- IA: GROQ API (free tier), modelo `llama-3.1-8b-instant`, key en
  `REACT_APP_GROQ_API_KEY` (local y Vercel).
- Gráficos: Chart.js + react-chartjs-2 (`--legacy-peer-deps`).
- Diseño visual: fuentes Manrope + IBM Plex Mono, paneles glassmorphism,
  sidebar navy oscuro (gradiente `#061826` → `#0b2940`), color señal teal
  `#56d9d9`, acento primario kyn-red `#ff462d`, IBM Plex Mono para números/labels.

## Estado / pendientes al momento de este export
- Confirmar que el backend en Railway esté completamente restaurado tras
  un downgrade de plan (Pro → Free) que causó un 404 "Application not found".
- Completar migración de Firestore en `registros` (backfill de `clienteId`)
  y pasar `GET /api/registros` a filtrado server-side.
- Verificar que `Analytics_GROQ.jsx` esté correctamente integrado en
  `App.js` (import, botón de menú, render condicional).

> Nota: `backend/.env.example` es una plantilla sin secretos reales — el
> `.env` real con las credenciales de Firebase/JWT nunca se sube a git
> (ver `.gitignore`) y debe configurarse aparte en la nueva cuenta/entorno.
