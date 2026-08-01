# Propuesta: follow-count-discrepancy

## Intención

Los contadores del perfil (`follower_count`, `following_count`, `media_count`) muestran valores
obsoletos del CDN de Instagram en lugar de los valores vivos de la API. La
capa 1 de `navigateAndCapture()` sobrescribe sin condición los datos correctos
provenientes de la API (capa 0) con el meta tag `og:description` cachead por CDN.

## Alcance

### Incluye
- Agregar guardas en Layer 1 (líneas 939–941 de `src/scraper.js`) para que **no**
  sobrescriba `follower_count`, `following_count` ni `media_count` si ya fueron
  asignados por la API (capa 0)
- Verificar que Layer 2 y Layer 3 ya tienen guardas equivalentes (solo corren si
  `!result.user.follower_count`)
- Confirmar que el cambio no afecta otros campos del perfil (bio, nombre, etc.)

### Excluye
- No se modifica la lógica de `normalizeProfile`, `profileCard`, ni la respuesta
  del interceptor de red
- No se introduce cacheo de perfiles ni lógica de dif de contadores
- No se toca `src/menu.js` ni `src/ui.js` (solo consumen datos, no los alteran)

## Enfoque

En `src/scraper.js`, dentro del bloque Layer 1 (parseo de `og:description` del
HTML en crudo), agregar una guarda por campo antes de asignar:

```
if (metaCounts.follower_count && !result.user.follower_count)
  result.user.follower_count = metaCounts.follower_count;
```

Ídem para `following_count` y `media_count`. Esta guarda replica el mismo patrón
que Layer 2 (línea 951) y Layer 3 (línea 988) ya usan.

No se modifican las líneas que asignan `full_name` ni otros campos — esos no
presentan el bug.

## Áreas Afectadas

| Archivo | Impacto | Descripción |
|---------|---------|-------------|
| `src/scraper.js:939-941` | Modificado | Guardas en Layer 1 para no sobrescribir contadores de API |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Perfiles sin API (solo meta tags) no reciben contadores | Baja | Layer 2 y 3 ya caen en `!follower_count` y llenarían el dato |

## Plan de Rollback

`git revert <commit>` del cambio. Es una modificación de 3 líneas en 1 archivo;
el revert es trivial.

## Criterios de Éxito

- [ ] `following_count` de API (802) ya no es sobrescrito por meta tag (814)
- [ ] `follower_count` y `media_count` siguen mismo patrón de guarda
- [ ] Perfiles sin API seed siguen obteniendo contadores vía Layers 2/3
- [ ] Ningún otro campo del perfil se ve afectado
