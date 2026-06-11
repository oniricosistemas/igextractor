# Tasks: Timestamp in filenames and output

## Slice A — Foundation: i18n keys + `formatTs` helper

### Task A1: Add i18n keys

- **What**: Add `summaryOldest` and `summaryNewest` keys to both `en` and `es` locales.
- **Where**: `src/i18n.js` — after line 129 (`summaryFollowing`) in the `en` block; after line 386 in the `es` block.
- **Verification**: `i18n.t('summaryOldest')` returns `'Oldest post'` (en) / `'Post más antiguo'` (es).

### Task A2: Add `formatTs(ts, formatType)` helper

- **What**: Pure function converting Unix seconds → formatted string. `formatType='file'` produces `YYYY-MM-DD_HH-mm-SS`; `formatType='display'` produces `YYYY-MM-DD HH:mm:ss`. Returns `''` for falsy/zero ts. Uses UTC methods, zero-padded.
- **Where**: `src/scraper.js` — insert immediately after `getPostTimestamp()` (after line ~310).
- **Verification**: `formatTs(1735129800, 'file')` → `'2024-12-25_14-30-00'`; `formatTs(0, 'file')` → `''`.

---

## Slice B — Output changes: filenames + captions

### Task B1: Update filename format in `runMediaDownload`

- **What**: Replace the `postTs` integer prefix with `formatTs(postTs, 'file')`. When ts is available: `2024-12-25_14-30-00_media_1.jpg`. When ts is falsy: `media_1.jpg` (no prefix). Applies to both standalone and carousel paths.
- **Where**: `src/scraper.js` lines 1737–1741.
- **Verification**: Downloading a post with `taken_at=1735129800` produces `2024-12-25_14-30-00_media_1.jpg`. A post with no timestamp produces `media_1.jpg`.

### Task B2: Add `taken_at` to caption JSON output

- **What**: Each caption entry in `captions.json` gains a `taken_at` field formatted as `display` format, or `""` when missing. Current shape `{ code, text }` → `{ code, text, taken_at }`.
- **Where**: `src/scraper.js` line 1859 in `runCaptionDownload` — use `formatTs(getPostTimestamp(post), 'display')`.
- **Verification**: `captions.json` entries include `"taken_at": "2024-12-25 14:30:00"` for timestamped posts and `"taken_at": ""` for posts without timestamps.

---

## Slice C — Summary display: oldest/newest post dates

### Task C1: Compute summary date fields in `extractProfile`

- **What**: After all posts are collected, compute `Math.min`/`Math.max` of `node.taken_at_timestamp` across `allPosts`. Add `summary.oldestPost` and `summary.newestPost` formatted with `formatTs(ts, 'display')`, falling back to `'—'` when empty.
- **Where**: `src/scraper.js` — add computation around line 1530, just before the return statement.
- **Verification**: `result.summary.oldestPost` is a formatted UTC date string or `'—'`.

### Task C2: Add date rows to `printSummary`

- **What**: Add two rows to the stats table using the new i18n keys and `summary.oldestPost` / `summary.newestPost` values. Only render when the value is non-null (defensive).
- **Where**: `src/menu.js` — after line 357 in `printSummary`.
- **Verification**: Post-extraction summary table shows `"Oldest post"` / `"Post más antiguo"` and `"Newest post"` / `"Post más reciente"` rows with formatted dates or `"—"`.

---

## Chained PR plan

| PR | Slice | Files | Estimated Δ | Review budget |
|----|-------|-------|-------------|---------------|
| #1 | A | `src/i18n.js`, `src/scraper.js` | +~18 lines | Under 400 ✓ |
| #2 | B | `src/scraper.js` | +~12 lines | Under 400 ✓ |
| #3 | C | `src/scraper.js`, `src/menu.js` | +~20 lines | Under 400 ✓ |

**Stack**: PR #1 → PR #2 → PR #3 (each depends on prior formatTs availability, but each is independently reviewable).
