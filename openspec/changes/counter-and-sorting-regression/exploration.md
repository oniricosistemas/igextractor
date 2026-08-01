# Exploration: counter-and-sorting-regression

## Current State — Counter Flow

Los contadores del perfil pasan por tres pipelines distintos:

**Pipeline de Display (TUI):**
1. `fetchProfileFromApi()` — Layer 0: llama a `/api/v1/users/web_profile_info/` vía axios o browser fetch.
2. `navigateAndCapture()` registra un handler de respuestas que intercepta TODAS las respuestas JSON 200 durante la navegación. `deepFindUser()` busca en el JSON un objeto con `username + pk/id`. Si encuentra uno con más followers, reemplaza `result.user`.
3. Cuatro capas de metadata:
   - **Layer 0**: API directa (fetchProfileFromApi)
   - **Layer 1**: `og:description` del HTML crudo — desde v1.0.64 tiene guard `!result.user.X_count`
   - **Layer 2**: `og:description` vía `page.evaluate` — solo si `!result.user.follower_count`
   - **Layer 3**: `/api/v1/users/{pk}/info/` vía browser fetch — solo si `!result.user.follower_count`
4. `normalizeProfile()` mapea los campos.
5. `profileCard()` en ui.js lee `edge_followed_by.count` y `edge_follow.count`.

**Pipeline de archivos guardados:**
- `runFollowersDownload()` / `runFollowingDownload()` — llamadas API paginadas independientes a `/api/v1/friendships/{userId}/followers/` y `/api/v1/friendships/{userId}/following/`. Cada página usa `browserFetchJson()`. Results se ordenan por username y se escriben a JSON.

**Diferencia clave**: el display usa `result.user.following_count` del cascade Layer 0-3; el archivo guardado usa paginación API independiente y cuenta los items reales. Pueden divergir.

## Bug A — Following count (814 vs 802 vs 801)

### Display muestra 814
**Causa raíz: stale `og:description` del CDN de Instagram.**

El meta tag `og:description` es server-rendered y cacheado agresivamente por el CDN de Instagram. Cuando el CDN sirvió la página, el meta tag contenía "814 Following" (un snapshot stale de cuando la cuenta tenía esa cantidad).

**¿Por qué el guard de v1.0.64 no lo previno?** Dos escenarios:

1. **`fetchProfileFromApi()` falla o devuelve datos incompletos.** Si la API devuelve null (429, network error, cookies faltantes), `result.user` nunca se setea por Layer 0. El `response` handler (líneas 686-695) puede encontrar un usuario en una respuesta graphql/timeline que contiene `edge_follow.count` pero NO el campo directo `following_count`. Entonces `result.user.following_count` es `undefined` cuando corre Layer 1, el guard `!result.user.following_count` pasa como true, y asigna 814 del CDN stale.

2. **El response handler reemplaza `result.user` con datos stale.** Si una respuesta graphql lleva un user object con `following_count: 814` Y ese mismo user tiene un `follower_count` mayor que el actual, la línea 691 (`foundCount > currentCount`) causa el reemplazo. Ahora `result.user.following_count` ya es 814 de la respuesta stale, y Layer 1 guard (`!result.user.following_count`) previene la corrección.

### Archivo guardado muestra 801
**Causa raíz: off-by-one en paginación por cursor.**

Instagram usa `max_id` como cursor **exclusivo** (items estrictamente antes de ese ID). Al paginar 802 items (8 páginas de 100 + 1 de 2), el cálculo del cursor saltea exactamente 1 item. La lógica `hasMore`/`nextMaxId` (líneas 2301-2303, 2340-2342) es correcta para range semantics, pero la API de Instagram consistentemente pierde un item en el boundary.

## Bug B — Followers off-by-one (377 vs 376)

### Display muestra 377 (correcto)
El display lee de `result.user.follower_count` que fue poblado por Layer 0 (`fetchProfileFromApi()`). El fix de v1.0.64 previene que og:description lo pise.

### Archivo guardado muestra 376
**Mismo off-by-one de paginación que Bug A.** Con 377 followers: 3 páginas completas (300) + 1 última página (77). El cursor boundary saltea exactamente 1 item.

El hecho de que ambos casos pierdan exactamente 1 item confirma que es un **issue sistémico de paginación**, no corrupción de datos.

## Bug C — Sorting regression

**NO es una regresión de código.** El sorting en líneas 2312 y 2351 es **byte-idéntico** entre v1.0.63 y v1.0.64:

```js
results.sort((a, b) => a.username.localeCompare(b.username, 'en', { sensitivity: 'base' }));
```

El único cambio entre versiones es el guard de Layer 1 (navigateAndCapture), que **no tiene ningún efecto** sobre `runFollowingDownload`/`runFollowersDownload` — esas solo consumen `profileData.pk` para el userId.

Las diferencias entre corridas son causadas por **variabilidad natural de la API de Instagram**:
- La paginación por cursor de Instagram es no-determinista. Distintos servidores, caches y timing producen diferente orden de items en cada página.
- El off-by-one en paginación causa que un item diferente se incluya/excluya entre corridas, propagándose al output ordenado.

## Key Files

- **src/scraper.js**
  - `fetchProfileFromApi()` — líneas 371-477: Layer 0 API directa
  - `response` handler en `navigateAndCapture()` — líneas 686-695: reemplazo peligroso de `result.user`
  - Layer 1 (og:description raw HTML) — líneas 896-951: fuente de datos stale del CDN
  - Layer 2 (og:description vía evaluate) — líneas 954-988: guard solo por `!follower_count`
  - Layer 3 (browser API fetch) — líneas 991-1020: guard solo por `!follower_count`
  - `normalizeProfile()` — líneas 1246-1267: mapeo de campos
  - `runFollowersDownload()` — líneas 2278-2314: paginación con off-by-one
  - `runFollowingDownload()` — líneas 2317-2354: paginación con off-by-one
  - Sorting — líneas 2312 y 2351: código idéntico

- **src/ui.js**
  - `profileCard()` — líneas 207-234: display TUI lee edge_followed_by.count y edge_follow.count

## Ready for Proposal

**Sí.**

| Bug | Root Cause | Prioridad |
|-----|-----------|-----------|
| A display 814 | Stale og:description CDN + response handler reemplaza user | Alta |
| A saved 801 + B saved 376 | Pagination off-by-one: Instagram max_id exclusivo | Alta |
| C sorting | No es bug — variabilidad natural de API | Ninguna |

Fix approach recomendado:
1. **Display fix**: Las Layers 2 y 3 deberían chequear TANTO `follower_count` como `following_count` independientemente (hoy solo checkean `follower_count`). Además, el response handler (línea 691) no debería reemplazar `result.user` si el user actual ya tiene `following_count` de la API directa.
2. **Pagination fix**: Usar un Map keyed by `pk` para deduplicar resultados en `runFollowersDownload` y `runFollowingDownload`, absorbiendo el off-by-one del cursor.
