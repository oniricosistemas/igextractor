# IGExtractor

**Backup completo de cualquier perfil de Instagram — un solo comando.**

CLI multiplataforma que descarga fotos, reels, stories, comentarios, seguidores y seguidos de cualquier perfil público de Instagram. Sin webs falopa, sin pegar links uno por uno, sin extensiones de browser.

[⬇ Descargar última versión](https://github.com/oniricosistemas/igextractor/releases) &nbsp;·&nbsp; [🌐 Landing page](https://oniricosistemas.github.io/igextractor/) &nbsp;·&nbsp; [☕ Comprar Pro](https://cafecito.app/igextractor)

---

## Features

| Feature | Free | Pro |
|---------|:----:|:---:|
| Fotos y reels | ✓ (max 5) | ✓ Ilimitado |
| Stories | ✗ | ✓ |
| Textos de publicaciones | ✓ | ✓ |
| Comentarios (JSON) | ✗ | ✓ |
| Seguidores / Seguidos | ✗ | ✓ |
| Offline grace (Pro sin internet) | — | ✓ |
| Multi-sesión (IGX_SESSION / IG_SESSION_ID) | ✓ | ✓ |
| Actualizacion automatica de ubicacion | ✓ | ✓ |

---

## Quick Start

```bash
# Opcion 1: Descarga el ZIP de la release
# https://github.com/oniricosistemas/igextractor/releases

# Opcion 2: Desde source (Node.js 18+)
npm install
npm start
```

Ejecutalo sin argumentos y la TUI interactiva te guía:

```bash
igextractor
```

O en modo no-interactivo:

```bash
igextractor --profile nasa --scan-limit 20 --output ./misdatos
```

---

## Modo de uso

### Interactivo (TUI)

```
igextractor
```

Menú paso a paso: seleccionás perfil, tipo de contenido, límites y proxy. Ideal para uso diario.

### CLI directo

```bash
igextractor --profile todonoticias --images --reels --stories --comments --followers --following
```

| Flag | Descripción |
|------|-------------|
| `--profile <user>` | Nombre de usuario (sin @) |
| `--images` | Descargar fotos |
| `--reels` | Descargar reels |
| `--stories` | Descargar stories (Pro) |
| `--comments` | Exportar comentarios a JSON (Pro) |
| `--followers` | Exportar lista de seguidores (Pro) |
| `--following` | Exportar lista de seguidos (Pro) |
| `--scan-limit <N>` | Máximo de elementos a descargar |
| `--output <dir>` | Directorio de salida |
| `--proxy <url>` | Proxy HTTP/HTTPS |
| `--apiKey <key>` | Guardar API Key Pro |
| `--debug` | Log detallado para troubleshooting |

### Session ID

Podés pasar el session de Instagram de dos formas:

```bash
# Variable de entorno (recomendado)
set IGX_SESSION=sessionid=123%3A...  # Windows
export IGX_SESSION="sessionid=123:..."  # Linux/Mac

# O por flag
igextractor --session "sessionid=123:..."
```

La primera vez que ingresás la session en la TUI, se guarda localmente en `~/.igextractor.env` para reuso.

---

## Ejemplo de salida

```
  ✓ Perfil @todonoticias encontrado!
  ╔═════════════════════  Perfil de Instagram  ══════════════════════╗
  ║  @todonoticias                                                   ║
  ║  TN - Todo Noticias                                              ║
  ║  Posts      47,000                                               ║
  ║  Seguidores 8,000,000                                            ║
  ║  Seguidos   15                                                   ║

  ▸ Descargando Imagenes + Reels
  ████████████████████████████░ 94% │ 16/17 │ imagen

  ▸ Descargando Comentarios
  ██████████████████████████████ 100% │ 5/5 │ comentarios

  ╭─────────────────────┬───────────────────────────────────╮
  │ Metric              │ Value                             │
  ├─────────────────────┼───────────────────────────────────┤
  │ Imagenes            │ 5                                 │
  │ Reels               │ 11                                │
  │ Stories             │ 7                                 │
  │ Comentarios         │ 353                               │
  │ Seguidores          │ 50                                │
  │ Seguidos            │ 15                                │
  ╰─────────────────────┴───────────────────────────────────╯
```

---

## Pro

☕ [Comprar Pro en cafecito.app](https://cafecito.app/igextractor) — pago único, acceso de por vida.

Después de comprar, completá el formulario con tu email y recibís tu API key. La registrás:

```bash
igextractor --apiKey IGX-XXXXXXXX-XXXXXXXX-XXXXXXXX
```

Y listo, todas las funciones desbloqueadas.

### Offline Pro Grace

Si el servidor de licencias no responde:
- Key válida → **Pro offline** hasta reconexión
- Sin key o inválida → **Free** automático

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js 18+ |
| Browser automation | Puppeteer |
| Compilación | pkg v5 (binario standalone) |
| UI | Terminal interactiva (TUI) con progreso en tiempo real |
| Persistencia | Engram (memoria entre sesiones) |
| Metodología | SDD (Spec-Driven Development) + subagentes Gentle AI |
| Modelos usados | DeepSeek V4 Flash, Gemma 4, Ninimax M3, Claude Sonnet, GPT-5-mini |

---

## Build desde source

```bash
npm install
node scripts/build.js win      # Windows .exe
node scripts/build.js mac       # macOS binary
node scripts/build.js linux     # Linux binary
```

---

## Project Structure

```
bin/
└── igextractor.js        ← CLI entrypoint
src/
├── index.js              ← Main router / CLI arg parsing
├── ui.js                 ← TUI: logo, progress bars, tables
├── license.js            ← API key read/write/validate
├── menu.js               ← Interactive menus
└── scraper.js            ← Instagram scraping logic
scripts/
└── build.js              ← Build distributable with pkg
docs/
└── index.html            ← Landing page (GitHub Pages)
```

---

## Disclaimer

No afiliado ni avalado por Instagram o Meta. Usá responsablemente y respetá los Términos de Servicio de Instagram.
