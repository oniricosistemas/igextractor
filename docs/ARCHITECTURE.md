# IGExtractor — Architecture Interna

> CLI multiplataforma que descarga fotos, reels, stories, comentarios, seguidores y seguidos de cualquier perfil público de Instagram.

---

## Índice

- [Filosofía del proyecto](#filosofía-del-proyecto)
- [Estructura de módulos](#estructura-de-módulos)
- [Flujo de una extracción](#flujo-de-una-extracción)
- [Browser Singleton](#browser-singleton)
- [Pipeline de extracción de posts](#pipeline-de-extracción-de-posts)
- [Sistema Pro / Licencias](#sistema-pro--licencias)
- [i18n](#i18n)
- [Debugging](#debugging)
- [Build y distribución](#build-y-distribución)
- [Decisiones técnicas clave](#decisiones-técnicas-clave)
- [Metodología SDD](#metodología-sdd)

---

## Filosofía del proyecto

IGExtractor nace de una necesidad concreta: **backup completo de un perfil de Instagram en un solo comando**, sin depender de webs de terceros, extensions de browser, ni pegar links uno por uno.

Decisiones de diseño que gobiernan el código:

- **Sin estado compartido complejo.** Cada módulo es un archivo plano, no hay clases ni DI. El estado global se limita al singleton del browser y al plan de licencia cacheado.
- **Resiliencia sobre velocidad.** Instagram cambia su DOM y APIs constantemente. El scraper está diseñado para caer en múltiples capas de fallback antes de rendirse.
- **CLI + TUI, no API.** IGExtractor es una herramienta para personas, no un servicio. La interfaz es la terminal, no un REST endpoint.
- **Gratuito con Pro opcional.** Extracción básica gratis; features avanzadas (stories, comments, followers) bajo licencia de pago único.

---

## Estructura de módulos

```
src/
├── index.js         ← Entrypoint: parsea args, decide TUI vs CLI directo
├── menu.js          ← Menú interactivo (inquirer), orquesta el flujo TUI
├── scraper.js       ← Core: navegación Puppeteer, extracción, descarga (2367 LOCs)
├── ui.js            ↑ Helpers de UI: logo, spinners, progress bars, tablas, colores
├── license.js       ← Licencia Pro: validación contra backend, cache, persistencia
├── i18n.js          ↑ Internacionalización EN/ES con ~560 strings
├── debug.js         ← Flag global de debug, wrapper para console.log condicional
```

### Diagrama de dependencias

```
index.js ──→ ui.js ──→ i18n.js
    │            │
    ├──→ license.js ──→ (axios) API backend Render
    │
    ├──→ menu.js ──→ scraper.js ──→ license.js
    │                    │              │
    │                    ├──→ ui.js     └──→ i18n.js
    │                    ├──→ i18n.js
    │                    └──→ puppeteer
    │
    └──→ scraper.js (modo CLI directo)
```

### Responsabilidades de cada módulo

| Módulo | LOCs | Responsabilidad |
|--------|------|-----------------|
| `index.js` | 283 | Parsing de `process.argv`. Dos modos: `--profile` (CLI directo) o sin args (TUI interactiva). Wakeup del backend de licencias. |
| `menu.js` | 367 | Menú interactivo con inquirer. Flujo de extracción paso a paso: username, opciones, session ID. Delega a `scraper.js`. |
| `scraper.js` | 2367 | **El core.** Singleton de Puppeteer, navegación, interceptación de respuestas, scroll, descarga de archivos, exportación de comentarios/seguidores. |
| `ui.js` | 293 | Helpers visuales: figlet logo, spinner animado, progress bars (cli-progress), tablas (cli-table3), colores (chalk + gradient-string), cajas (boxen). |
| `license.js` | 105 | Lectura/escritura de `~/.igextractor.env`, validación contra backend REST, cache del plan (free/pro), offline grace. |
| `i18n.js` | 562 | ~560 strings en EN y ES. Función `t()` para lookup, persistencia del idioma elegido en `.igextractor.env`. |
| `debug.js` | 9 | Flag global `_debug`, función `dbg()` que solo loguea si está activo. |

---

## Flujo de una extracción

### Modo CLI directo (`igextractor --profile nasa`)

```
process.argv
     │
     ▼
index.js ──→ parsea --profile, --images, --stories, etc.
     │
     ├──→ license.readSessionId() o --session-id
     │
     ├──→ (opcional) license.validateKey() + license.saveApiKey()
     │
     └──→ scraper.extractProfile(username, options)
              │
              ├── 1. navigateAndCapture()
              │       ├── launchBrowser() / getPage()
              │       ├── fetchProfileFromApi()     ← API REST
              │       ├── page.goto(/username/)      ← navegación
              │       ├── intercept responses        ← captura posts del feed
              │       ├── scroll loop                ← lazy load
              │       ├── DOM extraction fallback    ← shortcodes desde HTML
              │       └── 4 capas de metadata        ← og:description, evaluate, API, scripts
              │
              ├── 2. fetchPostsFromGraphql()         ← más posts vía GraphQL
              ├── 3. buildPostsFromShortcodes()       ← rebuild desde shortcodes
              ├── 4. scrollForMorePosts()             ← scroll infinito
              │
              ├── 5. runMediaDownload()               ← descarga fotos/reels
              ├── 6. runCaptionDownload()              ← exporta captions JSON
              ├── 7. runStoriesDownload()              ← stories vía API (Pro)
              ├── 8. runCommentDownload()              ← comentarios vía API (Pro)
              ├── 9. runFollowersDownload()            ← seguidores vía API (Pro)
              ├── 10. runFollowingDownload()           ← seguidos vía API (Pro)
              │
              └── → profile.json + media_map.json + captions.json + ...
```

### Modo TUI interactivo (sin argumentos)

```
index.js → printLogo()
         → selectLanguage()           ← primera vez solo
         → checkLicense()             ← valida key contra backend
         → menu.mainMenu(licenseInfo)
              → extractFlow()
                   → ask username
                   → ask options (fotos, reels, stories, etc.)
                   → ask session ID
                   → scraper.fetchProfileOnly()   ← validar perfil
                   → scraper.extractProfile()     ← extracción completa
```

---

## Browser Singleton

`scraper.js` mantiene un singleton del browser Puppeteer para toda la vida del proceso:

```js
let _browser        = null;   // instancia de puppeteer.Browser
let _browserPromise = null;   // promesa para evitar launches concurrentes
let _page           = null;   // única página reutilizable
let _sessionId      = '';     // última session ID usada
```

### Ciclo de vida

1. **`getPage()`** — Primera llamada: `launchBrowser()` → crea página → configura **request interception** (bloquea imágenes, CSS, fonts para acelerar) → inyecta evasión de detección (`navigator.webdriver = undefined`, `navigator.languages`, `window.chrome`) → navega a instagram.com → inyecta session cookie → reloadea. Llamadas sucesivas: solo actualiza la cookie si cambió la sessionId.
2. **`closeBrowser()`** — Cierra browser y resetea los tres singletons.
3. **`process.on('exit')`** — Mata el proceso de Chrome vía `SIGTERM` para evitar zombies, porque `on('exit')` es síncrono.

### ¿Por qué una sola página?

Instagram usa sesión + cookies atadas a una sola página. Reutilizar la misma página en toda la extracción evita tener que re-autenticar y replica el comportamiento de un usuario real navegando.

### Request Interception

Por defecto se bloquean: `image`, `stylesheet`, `font`, `manifest`, `ping`, `other`. Esto acelera drásticamente la navegación porque Instagram intenta cargar decenas de imágenes en el feed. Solo pasan los requests `document`, `xhr`, `fetch`, `script`. Controlable vía `IG_BLOCK_RESOURCES=false`.

---

## Pipeline de extracción de posts

El mayor desafío técnico es obtener los posts de un perfil. Instagram tiene **múltiples capas de APIs y formatos**, y ninguna es completamente confiable. IGExtractor implementa una estrategia de **capas de fallback**:

### Capa 1: navegación + interceptación de respuestas

`navigateAndCapture()` navega a `instagram.com/{username}/` y **escucha todas las respuestas JSON** que se disparan durante la carga. Detecta:

- `edge_owner_to_timeline_media` (GraphQL legacy)
- `xdt_api__v1__feed__user_timeline_graphql_connection` (GraphQL moderno)
- `items[]` (REST API)
- URLs de `/graphql/query/`

Además, hace un **scroll loop** durante 25 segundos para forzar la carga lazy del feed.

### Capa 2: fetch vía API

`fetchProfileFromApi()` intenta dos enfoques en paralelo:

1. **Axios directo** con cookies del browser. Más rápido, pero sujeto a 429s.
2. **Fetch desde el browser** (`page.evaluate` con `credentials: 'include'`). Pasa por la misma sesión de Chrome, menos probable que rechace.

### Capa 3: GraphQL paginado

Si interceptó URLs de GraphQL durante la navegación, `fetchPostsFromGraphql()` hace requests paginados directos para traer más posts. Usa axios con Cookie del session.

### Capa 4: Rebuild desde shortcodes

Si ningún método anterior produjo objetos de post completos, `buildPostsFromShortcodes()` toma los shortcodes capturados del DOM (links `<a href="/p/...">`) y los reconstruye uno por uno vía:

1. `api/v1/media/{code}/info/`
2. `/p/{code}/?__a=1&__d=dis`
3. `/reel/{code}/?__a=1&__d=dis`
4. Navegación directa a `/p/{code}/` como último recurso

### Capa 5: Scroll infinito

`scrollForMorePosts()` hace scroll cíclico (hasta 100 iteraciones, 2 minutos máximo) escuchando respuestas JSON. Tiene detección de **stale scroll** (5 intentos sin nuevos posts = feed exhausto).

### Extracción de metadata del perfil (4 capas)

Si el perfil no se obtuvo de la API en el paso inicial:

1. **og:description del HTML** — Más rápido, disponible inmediatamente
2. **`page.evaluate` esperando el meta tag** — Espera a que el DOM renderice
3. **API directa vía fetch del browser** — `/api/v1/users/{pk}/info/`
4. **Scripts embebidos** — Busca `"user_id"` en scripts inline

---

## Sistema Pro / Licencias

### Flujo

```
checkLicense()
    │
    ├── Lee IGX_API_KEY de ~/.igextractor.env
    │
    ├── ¿Hay key?
    │   ├── No → plan='free'
    │   └── Sí → POST /validate { key } al backend
    │             │
    │             ├── Conexión exitosa + key válida → plan='pro'
    │             ├── Conexión exitosa + key inválida → plan='free'
    │             └── Error de red (offline)
    │                    └── ¿Formato IGX-XXXX... válido?
    │                         ├── Sí → plan='pro' (offline grace)
    │                         └── No → plan='free'
    │
    └── Cachea _cachedPlan
```

### Offline Grace Mode

Si el backend de licencias está caído (Render free tier se duerme a los 15 min de inactividad), IGExtractor hace **offline grace**: si la key local tiene formato `IGX-XXXXXXXX-XXXXXXXX-XXXXXXXX` válido, asume Pro igual. Esto evita que el usuario pierda acceso cuando el servidor está dormido.

### Backend

El backend corre en **Render** (`igextractor-backend.onrender.com`), un servicio Node.js mínimo con un endpoint `/validate` POST y `/health` GET. El código no está en este repo.

### Archivo de entorno

`~/.igextractor.env` almacena:
- `IGX_API_KEY=IGX-...`
- `IGX_SESSION=sessionid=...`
- `LANG=en|es`

Archivo con permisos `0600` (solo lectura para el owner).

---

## i18n

### Estructura

```js
const STRINGS = {
  en: {
    greeting:     'Hello!',
    menuExtract:  '  Extract Instagram profile data',
    ...
  },
  es: {
    greeting:     '¡Hola!',
    menuExtract:  '  Extraer datos de perfil de Instagram',
    ...
  },
};
```

- ~560 strings organizadas por feature
- Strings con parámetros usan arrow functions: `username => \`Verificando @${username}...\``
- El idioma se persiste en `~/.igextractor.env` como `LANG=en` o `LANG=es`
- En CLI directo, respeta el idioma guardado sin preguntar
- La TUI pregunta el idioma en el primer inicio

### Función `t()`

```js
t('key', ...args) // lookup + aplica args si es función
```

Si la key no existe en el idioma activo, fallback al inglés.

---

## Debugging

### Cómo activarlo

```bash
igextractor --debug                         # TUI
igextractor --profile nasa --debug          # CLI directo
IG_DEBUG_BASE=/ruta node bin/igextractor.js # directorio custom
```

### Qué genera

```
{outputDir}/debug/
├── grid_payloads/     ← payloads del grid feed
├── post_payloads/     ← respuestas de rebuild de posts
├── dom_payloads/      ← HTML capturado, login redirects, shortcodes
├── network/           ← requests y responses de red completos
└── _errors/           ← errores al escribir archivos de debug
```

Cada archivo se escribe con **write atómico** (`.tmp` → rename) para no corromperse si el proceso muere.

---

## Build y distribución

### Compilación con `pkg`

```bash
node scripts/build.js win|mac|linux
```

- Genera binarios standalone con Node.js 18+ empaquetado
- El build script descarga Chromium y lo coloca junto al binario en `chromium/`
- `_findBundledChromium()` busca el Chrome empaquetado en múltiples layouts (flat, nested por OS)
- Sin Chromium empaquetado, usa el Chromium que Puppeteer descarga en `node_modules/`

### Release

Los binarios compilados se distribuyen vía GitHub Releases. No hay npm publish.

---

## Decisiones técnicas clave

### ¿Por qué Puppeteer y no una librería tipo `instagram-private-api`?

- **Resiliencia.** Las librerías que wrappean la API privada de Instagram se rompen cada vez que Meta cambia algo. Puppeteer navega como un browser real; si cambia el DOM, se ajusta el selector. Es más trabajo pero más durable.
- **Sin rate limiting severo.** Las requests directas desde Node.js reciben 429 mucho más rápido que las que pasan por un browser real con cookies.
- **Evasion de detección.** Una request de axios sin los headers correctos es inmediatamente bloqueada. Puppeteer con las correcciones de `navigator.webdriver` y User-Agent real pasa desapercibido.

### ¿Por qué pkg y no Electron o Tauri?

IGExtractor es una **CLI**, no una app desktop con ventana. pkg produce un binario ejecutable desde la terminal, liviano, sin dependencias de sistema. Electron sería enorme al pedo para una TUI.

### ¿Por qué archivos planos y no base de datos?

El output del tool es un **backup**: archivos que el usuario puede explorar con cualquier herramienta (visor de fotos, editor JSON, etc.). Una base de datos ataría los datos a un engine específico. La estructura en disco es:

```
ig_{username}/
├── profile.json          ← metadata del perfil
├── media_map.json        ← índice de todo lo descargado
├── captions.json         ← textos de publicaciones (opcional)
├── comments.json         ← comentarios (Pro)
├── followers.json        ← seguidores (Pro)
├── following.json        ← seguidos (Pro)
├── stories/              ← stories (Pro)
├── {ts}_post_{code}/     ← carruseles (varias fotos)
├── {ts}_media_1.jpg      ← fotos individuales
└── {ts}_media_2.mp4      ← reels
```

### ¿Por qué Singleton del browser en lugar de abrir/cerrar por operación?

Cada navegación a Instagram con una sesión nueva implica:
1. Launch Puppeteer (~2-3 segundos)
2. Navegar a instagram.com
3. Setear cookie de sesión
4. Reload

Reutilizar la misma página para navegación, scroll, fetch, y descarga reduce el tiempo total de extracción drásticamente. Además, Instagram trackea la sesión por cookie; cambiar de página constantemente aumenta el riesgo de detección.

---

## Metodología SDD

IGExtractor se desarrolla con **Spec-Driven Development (SDD)** usando Gentle AI como orquestador y subagentes.

### ¿Qué significa SDD en la práctica?

1. **Toda feature nueva arranca con un proposal** — documento corto que describe qué problema resuelve, a quién afecta, y tradeoffs.
2. **Spec → Design → Tasks** — cada fase es un artifact reviewable.
3. **Apply en batches chicos** — implementación contra tasks.
4. **Verify** — validación contra spec y tasks.
5. **Archive** — cierre del cambio.

### Estado actual de los artifacts

- `openspec/changes/strict-grid-fix/` — Cambio activo
- `openspec/changes/archive/` — Cambios completados:
  - `2026-07-30-follow-count-discrepancy/`
  - `2026-07-28-timestamp-output/`

### Stack de modelos usados

| Propósito | Modelo |
|-----------|--------|
| Orquestación principal | DeepSeek V4 Flash |
| Spec/Design/Tasks | Gemma 4, Ninimax M3 |
| Apply/Verify | Claude Sonnet, GPT-5-mini |
| Review/Judgment Day | Claude Sonnet, DeepSeek V4 Flash |

---
