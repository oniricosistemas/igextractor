# Design: counter-and-sorting-regression

## Technical Approach

Two independent implementation-level fixes in `src/scraper.js`:

1. **Display fix**: Add `!result.user.following_count` as an independent guard alongside the existing `!result.user.follower_count` in Layer 2 (og:description via `page.evaluate`, line 954) and Layer 3 (API fetch, line 991) of `navigateAndCapture()`. This prevents stale CDN `og:description` metadata from overwriting a valid `following_count` from a higher-priority layer when the response handler splices in a `result.user` that lacks `following_count`.

2. **Pagination fix**: Wrap the `results` array accumulation in `runFollowersDownload()` (line 2285) and `runFollowingDownload()` (line 2324) with a `Map<pk, item>`. Insert each API response item only when `!map.has(item.pk)`, then spread `map.values()` into the final array before sorting. This absorbs Instagram's exclusive-cursor off-by-one without changing pagination logic.

## Architecture Decisions

### Decision: Independent following_count guard in Layers 2 and 3

| Option | Tradeoff |
|--------|----------|
| **A: Add `&& !result.user.following_count` to existing guard** | Changes Layer 2/3 entry condition; would skip both layers if either count is present — wrong when only one count is stale |
| **B: Bump entire guard to check both independently** | Each layer still enters to fill whichever count is missing; handles mixed-stale scenarios |

**Choice**: B — keep current guard for entry (either count missing triggers layer), then guard each field assignment independently.

**Rationale**: The entry condition should remain `!follower_count || !following_count` so the layer runs when ANY count is missing. Field-level guards (`if (apiData.follower_count)`) already exist — they're correct. The fix is purely about the entry condition.

### Decision: pk-based dedup Map for pagination

| Option | Tradeoff |
|--------|----------|
| **A: Set-based dedup with `seen.has(pk)`** | Minimal change, O(n) per insert amortized; same memory as Map |
| **B: Post-hoc dedup after full collection** | Requires O(n log n) sort + filter; misses the root issue |
| **C: Extend API page size** | Doesn't fix cursor boundary semantics |

**Choice**: A — `Map<pk, item>` for accumulation, `map.values()` before sort.

**Rationale**: Lowest delta from current code. Replace `results.push(...)` with `map.set(u.pk, u)`. The sort key is `username` (not `pk`), so the map fills naturally. The off-by-one means boundary items appear in two consecutive pages — same `pk`, same data — dedup by pk just skips the duplicate insert. The API pagination logic (`hasMore`, `nextMaxId`) stays untouched.

## Data Flow

```
Display pipeline (Bug A):
  navigateAndCapture()
    Layer 0: fetchProfileFromApi() → result.user
    Response handler → may replace result.user (missing following_count)
    Layer 1: raw HTML og:description → guarded (already correct)
    Layer 2: page.evaluate og:description → GUARD FIXED: enters if !follower_count || !following_count
    Layer 3: browser API fetch → GUARD FIXED: enters if !follower_count || !following_count
    → result.user now has both counts from best available source

Export pipeline (Bug B):
  runFollowersDownload() / runFollowingDownload()
    Page N: API returns users[] → map.set(u.pk, u)  [was: results.push(u)]
    Page N+1: API returns users[] → map.set(u.pk, u) (duplicate pk skipped)
    [...map.values()].sort(...)  [was: results.sort(...)]
    → final array has correct count, no duplicates
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/scraper.js:954` | Modify | Layer 2 guard: `if (result.user && (!result.user.follower_count \|\| !result.user.following_count))` |
| `src/scraper.js:991` | Modify | Layer 3 guard: same pattern, add `\|\| !result.user.following_count` |
| `src/scraper.js:2285` | Modify | `runFollowersDownload`: replace `const results = []` with `const resultsMap = new Map()` + dedup on push, spread before sort |
| `src/scraper.js:2324` | Modify | `runFollowingDownload`: same Map pattern |

## Testing Strategy

N/A — project has no test infrastructure.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. Changes are active immediately on next run.

## Open Questions

None

## Next Step

Ready for tasks (sdd-tasks).
