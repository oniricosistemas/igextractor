# Tasks: follow-count-discrepancy

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Delivery strategy | auto-chain |

### Dependencies
1. Task A: Agregar guardas condicionales en Layer 1 de navigateAndCapture

---

### Task A: Agregar guardas condicionales en Layer 1 de navigateAndCapture
**Effort**: Small
**Depends on**: none
**Files**: `src/scraper.js` (líneas 939–941)

#### Implementation
En `src/scraper.js`, en las 3 asignaciones de contadores dentro del bloque Layer 1 (parseo de `og:description` del HTML crudo), agregar la guarda `&& !result.user.<campo>` para que no sobrescriban valores que ya fueron asignados por Layer 0 (API directa).

Cambio diff:

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

No modificar la línea 942 (`full_name`) ni ningún otro campo.

#### Verification
1. **Diff check**: `git diff src/scraper.js` — debe mostrar solo cambios en líneas 939–941
2. **Inspección visual**: confirmar que las 3 asignaciones tienen la guarda `!result.user.<campo>`
3. **Caso API ok**: en un perfil donde la API responda, los contadores finales deben ser los de API, no los del CDN
4. **Caso sin API**: en un perfil bloqueado/429, Layer 1 debe seguir asignando los contadores desde `metaCounts` (fallback funciona)
5. **Caso parcial**: si la API devuelve solo `follower_count`, los otros dos contadores se asignan desde meta tag
