# Spec: timestamp-formatter

## Requirements

1. `formatTs(ts, formatType)` converts Unix seconds → formatted string
   - formatType='file': YYYY-MM-DD_HH-mm-SS (Windows-safe)
   - formatType='display': YYYY-MM-DD HH:mm:ss
   - ts=0 or falsy: returns empty string

2. Filename format in runMediaDownload: `{date}_{type}_{N}.{ext}`
   - When ts available: `2024-12-25_14-30-00_media_1.jpg`
   - When ts missing: `media_1.jpg` (no date prefix)

3. Caption JSON output includes:
   - `taken_at` field: `"2024-12-25 14:30:00"` (display format, UTC)
   - When ts missing: `taken_at: ""`

4. Summary table in printSummary / extractProfile shows:
   - "Oldest post": formatted date or "—"
   - "Newest post": formatted date or "—"

## New i18n keys

- `summaryOldest`: "Post mas antiguo" / "Oldest post"
- `summaryNewest`: "Post mas reciente" / "Newest post"

These must be added to `src/i18n.js` in both `en` and `es` sections, placed alongside the existing `summary*` keys (lines 119-130 for `en`, lines 375-387 for `es`).

## Affected files

- `src/scraper.js` — `formatTs` helper, filename in `runMediaDownload`, caption in `runCaptionDownload`, summary dates in `extractProfile`
- `src/i18n.js` — 2 new keys (en + es = 4 entries total)
- `src/menu.js` — `printSummary` date rows in stats table

## Implementation notes

- `formatTs(ts, formatType)` uses UTC methods (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`, `getUTCHours`, `getUTCMinutes`, `getUTCSeconds`) on `new Date(ts * 1000)` to stay timezone-agnostic
- Zero-pad all numeric components to 2 digits with `String(x).padStart(2, '0')`
- In `runMediaDownload`: prepend `formatTs(postTs, 'file') + '_'` only when the result is non-empty
- In `runCaptionDownload`: write `taken_at: formatTs(postTs, 'display')` to each caption entry
- In `extractProfile`: compute `Math.min`/`Math.max` of `node.taken_at_timestamp` across all posts, format each via `formatTs(ts, 'display')`, fall back to `"—"` when empty
