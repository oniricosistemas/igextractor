# Proposal: Arreglo de strict-grid que descarga imágenes antiguas

Intento
Resolver el bug en --strict-grid donde la herramienta descarga posts antiguos porque no reconoce correctamente los posts del grid inicial (media_map.json muestra grid_index: null) y por lo tanto deshabilita strict-grid y baja el feed completo.

Objetivos y alcance
In Scope:
- Normalizar claves shortcodes/pk para comparación robusta.
- Reescribir buildPostsFromShortcodes para pedir JSON desde la página (page.evaluate) o la API interna en vez de parsear HTML con JSON.parse.
- Asegurar creación de directorios de debug y propagar options.debug
- Guardar payloads de debug (grid_payloads, post_payloads) y HTML raw en fallos.
- Añadir flag --strict-grid-mode con fallback controlado.

Out of scope:
- Reescribir la arquitectura de descarga completa del feed.
- Cambios en la persistencia de sesiones o autenticación.

Motivación y evidencia
- Observación: "Grid captured: 12 items" repetido, pero cada post es "skipping post ... because it's not in the initial grid".
- Diagnóstico clave: mismatch en formatos de claves: gridShortcodes son shortcodes alfanuméricos mientras que los nodos allPosts usan pk numérico u omiten shortcode; Set.has() por tanto falla.

Alternativas consideradas
1) Parsers locales y heurísticos: normalizar comparaciones construyendo ambos índices (shortcode↔pk) en memoria.
   - Pros: Bajo cambio en infra, rápido de implementar.
   - Cons: Fragilidad ante cambios en estructura JSON/HTML de la página.
2) Consultar la API interna/media endpoint desde la página (page.evaluate/fetch): obtener JSON canónico.
   - Pros: Robusto, evita parseo HTML; alineado con cómo la UI obtiene datos.
   - Cons: Requiere portar lógica a async evaluate y manejar fallbacks si endpoint rate-limita.

Solución propuesta (FIX-1..FIX-7)
FIX-1: Normalizar allowedShortcodes
- Construir un map bidireccional shortcode <-> pk al capturar el grid y exponer ambos sets a las rutinas de comparación.

FIX-2: Reescribir buildPostsFromShortcodes
- Usar page.evaluate(() => fetch('/api/v1/media/{shortcode}/info/').then(r=>r.json())) o fetch del endpoint que devuelve JSON en la página para cada shortcode/pk. Evitar JSON.parse sobre HTML.

FIX-3: Pre-crear directorios de debug
- Al inicializar con --debug crear outputDir/debug/{grid_payloads,post_payloads,dom_payloads} con writes atómicos.

FIX-4: Propagar options.debug/options.username
- Asegurar que las funciones utilitarias reciben options y escriben debug cuando corresponde.

FIX-5: Guardado de payloads
- Guardar grid_payloads/*.json y post_payloads/*.json en éxitos, y .html raw en fallos para análisis.

FIX-6: Añadir CLI --strict-grid-mode
- Valores: auto-fallback (comportamiento actual pero más seguro), fail-loud (fallar si mismatch) — documentado y probado.

FIX-7: Tests y validación
- Añadir test-integration (script CLI) que ejecute flujo con --debug y verifique media_map.json contiene grid_index != null para items capturados.

Archivos a cambiar (propuesto)
- bin/igextractor.js — propagar options, exponer nuevo flag CLI
- lib/build-posts.js — rebuild de buildPostsFromShortcodes usando page.evaluate
- lib/grid.js — normalización shortcode/pk, map bidireccional
- lib/debug.js (o lib/fs-utils.js) — ensureDebugDirs y escritura atómica
- lib/media-map.js — asignación de grid_index y persistencia

Parches de ejemplo (no aplicar) — cambios críticos

1) FIX-3: Pre-crear directorios de debug
Path: lib/debug.js
@@
+const fs = require('fs');
+const path = require('path');
+
+function ensureDebugDirs(outputDir) {
+  const base = path.join(outputDir, 'debug');
+  const dirs = ['grid_payloads', 'post_payloads', 'dom_payloads'].map(d => path.join(base, d));
+  dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
+}

+module.exports = { ensureDebugDirs };

2) FIX-2: Reescribir buildPostsFromShortcodes usando page.evaluate
Path: lib/build-posts.js
@@
-  // antiguo: response = await page.goto(url); const text = await response.text(); const data = JSON.parse(text);
-  // nuevo enfoque:
+async function fetchPostJsonFromPage(page, shortcodeOrPk) {
+  // intentar endpoint por shortcode, luego por pk
+  const paths = [
+    `/p/${shortcodeOrPk}/?__a=1`,
+    `/api/v1/media/${shortcodeOrPk}/info/`
+  ];
+  for (const p of paths) {
+    try {
+      const json = await page.evaluate(async (p) => {
+        const res = await fetch(p, { credentials: 'same-origin' });
+        if (!res.ok) return null;
+        return await res.json();
+      }, p);
+      if (json) return json;
+    } catch (e) {
+      // continue to next path
+    }
+  }
+  return null;
+}

@@

Validación y Criterios de aceptación
- Ejecutar: node bin/igextractor.js -p todonoticias --stories --strict-grid --strict-grid-mode=fail-loud --download-limit 5 --debug --session-id <id>
- Chequear: media_map.json para los posts del grid inicial debe tener grid_index: 0..N-1 (no null).
- Verificar que no aparecen mensajes "skipping post ... because it's not in the initial grid" para posts capturados en grid.
- Comprobar creación de directorios outputDir/debug/{grid_payloads,post_payloads,dom_payloads} y archivos JSON/HTML en ellos.

Estimación de esfuerzo
- FIX-1 Normalizar shortcodes/pk: Low
- FIX-2 Reescribir buildPostsFromShortcodes: Medium
- FIX-3 Crear debug dirs: Low
- FIX-4 Propagar options: Low
- FIX-5 Guardado payloads: Low
- FIX-6 CLI strict-grid-mode: Low
- FIX-7 Tests: Medium

Riesgos y mitigaciones
- Riesgo: Endpoint interno cambia o rate-limits → Mitigación: fallback a /p/{shortcode}/?__a=1 y cache local; modo fail-loud para entornos CI.
- Riesgo: Cambios en filesystem permissions → Mitigación: uso de writes atómicos y manejo de errores con logs claros.

Rollback
- Revertir cambios commit por commit; flag --strict-grid-mode mantiene comportamiento previo si se pasa auto-fallback.

Dependencias
- Ninguna externa; uso de Puppeteer ya existente.

Next steps
- Implementar FIX-3 y FIX-2 primero (parches adjuntos), ejecutar integración local con --debug, y abrir delta spec si los cambios afectan comportamiento externo.
