# Diseño: follow-count-discrepancy

## Resumen

Agregar guardas condicionales en Layer 1 (parseo de `og:description` del HTML crudo) para que no sobrescriba `follower_count`, `following_count` ni `media_count` si Layer 0 (API directa) ya los asignó.

## Flujo Actual

El scraper usa un fallback de 4 capas para obtener contadores del perfil:

```
Layer 0: fetchProfileFromApi(username)
  └─ API directa de Instagram → result.user con contadores vivos
  └─ Si falla (429, bloqueo, etc.) → result.user = null

Layer 1: Parseo de og:description del HTML crudo (raw HTML)
  └─ Lee <meta property="og:description"> vía regex
  └─ SIN GUARDA: sobrescribe follower_count/following_count/media_count
     incluso si Layer 0 ya los setteó ← BUG

Layer 2: page.evaluate sobre og:description del DOM renderizado
  └─ Guarda: if (!result.user.follower_count)

Layer 3: fetch /api/v1/users/<pk>/info/ via browser evaluate
  └─ Guarda: if (!result.user.follower_count && result.user.pk)

Layer 4: Extracción de user_id desde scripts inline de la página
  └─ Solo completa pk/id, no toca contadores
```

### El bug

Layer 0 obtiene datos vivos de la API (`follower_count: 802`). Luego Layer 1 parsea el meta tag `og:description` del HTML crudo servido por el CDN de Instagram, que tiene contadores obsoletos (`follower_count: 814`). Como Layer 1 asigna sin condición, **pisotea los valores correctos de la API con datos stale del CDN**.

Layer 2 y Layer 3 ya tienen el patrón correcto (`if (!result.user.follower_count)`), pero Layer 1 no.

## Cambio Propuesto

En `src/scraper.js:939-941`, reemplazar las asignaciones incondicionales por asignaciones con guarda que respeten valores ya existentes:

```diff
- if (metaCounts.follower_count)  result.user.follower_count  = metaCounts.follower_count;
- if (metaCounts.following_count) result.user.following_count = metaCounts.following_count;
- if (metaCounts.media_count)     result.user.media_count     = metaCounts.media_count;
+ if (metaCounts.follower_count && !result.user.follower_count)
+   result.user.follower_count = metaCounts.follower_count;
+ if (metaCounts.following_count && !result.user.following_count)
+   result.user.following_count = metaCounts.following_count;
+ if (metaCounts.media_count && !result.user.media_count)
+   result.user.media_count = metaCounts.media_count;
```

Esto replica el mismo patrón que Layer 2 (línea 951) y Layer 3 (línea 988) ya usan.

No se modifican las líneas que asignan `full_name` (línea 942) porque ese campo no presenta el bug.

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `src/scraper.js:939-941` | Guardas condicionales en Layer 1 para no sobrescribir contadores de API |

## Data Flow

### Antes (con bug)

```
Layer 0: API → result.user = { follower_count: 802, following_count: 245, media_count: 42 }
Layer 1: og:description → follower_count = 814 (pisó 802) ✗
                          following_count = 256 (pisó 245) ✗
                          media_count     = 41  (pisó 42)  ✗
Layer 2: no corre (follower_count ya tiene valor)
Layer 3: no corre (follower_count ya tiene valor)

Resultado final: contadores stale del CDN
```

### Después (con fix)

```
Layer 0: API → result.user = { follower_count: 802, following_count: 245, media_count: 42 }
Layer 1: og:description → guarda: !result.user.follower_count? → NO → skip ✓
                          guarda: !result.user.following_count? → NO → skip ✓
                          guarda: !result.user.media_count? → NO → skip ✓
Layer 2: no corre (follower_count ya tiene valor)
Layer 3: no corre (follower_count ya tiene valor)

Resultado final: contadores vivos de la API
```

### Sin API (fallback sigue funcionando)

```
Layer 0: API → null (429 o bloqueo)
Layer 1: og:description → guarda: !result.user.follower_count? → SÍ (undefined) → asigna 814 ✓
                          idem following_count, media_count
Layer 2: no corre (ya tiene follower_count de Layer 1)
Layer 3: no corre

Resultado final: contadores de meta tag (mejor que nada)
```

## Pruebas

### Verificación manual

1. Abrir `src/scraper.js` y confirmar que líneas 939-941 tengan las guardas
2. Buscar perfiles conocidos, comparar contadores del scraper vs perfil real en Instagram
3. Verificar que perfiles con API exitosa tengan contadores correctos (no los del CDN)

### Verificación por diff

```bash
git diff src/scraper.js
# Debe mostrar solo cambios en líneas 939-941
```

### Cobertura de casos

| Caso | Layer 0 | Layer 1 (con fix) | Resultado esperado |
|------|---------|-------------------|--------------------|
| API responde ok | contadores vivos | skip por guardas | contadores vivos OK |
| API 429 / bloqueo | null | asigna meta tags | contadores de CDN (aceptable) |
| Perfil nuevo sin API seed | null | asigna meta tags | contadores de CDN → Layer 2/3 pueden refinarlos |
