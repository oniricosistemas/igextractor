# Spec: follow-count-discrepancy

## Resumen
Evitar que Layer 1 (parser de `og:description`) sobrescriba `follower_count`, `following_count` y `media_count` cuando estos ya fueron obtenidos de la API en vivo (Layer 0).

## Comportamiento Actual
`navigateAndCapture()` ejecuta `fetchProfileFromApi()` (Layer 0) y asigna los contadores reales a `result.user`. Luego Layer 1 parsea el meta tag `og:description` del HTML y **sobrescribe sin condición** (`scraper.js:939-941`) los tres contadores con los valores del CDN de Instagram, que pueden estar obsoletos por horas o días. Layers 2 y 3 ya tienen la guarda `!result.user.follower_count` (solo corren si faltan contadores), pero Layer 1 no.

## Comportamiento Esperado
Layer 1 solo debe asignar `follower_count`, `following_count` y `media_count` si `result.user` aún no los tiene (`!result.user.follower_count`, etc.), replicando el mismo patrón de guarda que usan Layers 2 y 3. Los demás campos (`full_name`, `bio`, etc.) no se modifican.

## Escenarios
### Escenario 1: API responde con datos vivos
- **Dado**: un perfil de Instagram cuya API devuelve `follower_count: 802`, `following_count: 450`, `media_count: 120`
- **Cuando**: Layer 1 parsea `og:description` con valores del CDN `814 seguidores`, `460 seguidos`, `125 publicaciones`
- **Entonces**: `result.user.follower_count` debe mantener `802` (no sobrescribirse a `814`), `following_count` debe mantener `450`, `media_count` debe mantener `120`

### Escenario 2: API no responde (sin sesión o bloqueada)
- **Dado**: un perfil donde `fetchProfileFromApi()` retorna `null` por falta de sesión
- **Cuando**: Layer 1 parsea `og:description` con valores del CDN
- **Entonces**: `result.user.follower_count` se asigna desde el meta tag (no hay dato previo que proteger)

### Escenario 3: API responde parcialmente (solo algunos contadores)
- **Dado**: la API devuelve `follower_count: 802` pero `following_count: 0` y `media_count: 0`
- **Cuando**: Layer 1 parsea `og:description` con `814 seguidores`, `460 seguidos`, `125 publicaciones`
- **Entonces**: `follower_count` mantiene `802` (de API), `following_count` y `media_count` se asignan desde meta tag

## Requerimientos
- [ ] REQ-1: Agregar guarda `!result.user.follower_count` antes de asignar `result.user.follower_count` desde `metaCounts` en Layer 1
- [ ] REQ-2: Agregar guarda `!result.user.following_count` antes de asignar `result.user.following_count` desde `metaCounts` en Layer 1
- [ ] REQ-3: Agregar guarda `!result.user.media_count` antes de asignar `result.user.media_count` desde `metaCounts` en Layer 1
- [ ] REQ-4: No modificar la asignación de `full_name` ni otros campos no-contador
- [ ] REQ-5: Verificar que Layers 2 y 3 ya tienen las guardas equivalentes (`!result.user.follower_count`)
