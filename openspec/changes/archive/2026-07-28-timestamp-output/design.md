# Design: Timestamp formatting

## formatTs helper

Add to `src/scraper.js`: a pure function that converts Unix seconds to string.

```javascript
function formatTs(ts, formatType) {
  if (!ts || ts <= 0) return '';
  const d = new Date(ts * 1000);
  const pad = n => String(n).padStart(2, '0');
  const Y = d.getUTCFullYear();
  const M = pad(d.getUTCMonth() + 1);
  const D = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const m = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  if (formatType === 'file') return `${Y}-${M}-${D}_${h}-${m}-${s}`;
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}
```

## File changes

### src/scraper.js

1. **`formatTs`** — add the helper function near `getPostTimestamp()`
2. **`runMediaDownload`** — around line 1737, replace `postTs` prefix:
   - Current: `${prefix}_media_${idx}.${ext}` where `prefix` is either `postTs` or `''`
   - New: `const tsStr = formatTs(postTs, 'file'); const prefix = tsStr ? tsStr + '_' : '';`
3. **`runCaptionDownload`** — in the caption entry object, add:
   - `taken_at: formatTs(takenAt, 'display') || ''`
4. **`extractProfile`** or where summary is generated:
   - Compute `minTs` / `maxTs` from `allPosts`
   - Build `summary.oldestPost` / `summary.newestPost` using `formatTs`

### src/i18n.js

Add 4 new keys (en + es):

```javascript
summaryOldest: { en: 'Oldest post', es: 'Post más antiguo' },
summaryNewest: { en: 'Newest post', es: 'Post más reciente' },
```

### src/menu.js

In `printSummary`, add two rows to the existing `statsTable`:

```javascript
{ label: i18n.t('summaryOldest'), value: summary.oldestPost || '—' },
{ label: i18n.t('summaryNewest'), value: summary.newestPost || '—' },
```

## Data flow

```
post object → getPostTimestamp() → Unix seconds → formatTs() → string
```

## Risks

- **UTC vs local**: using UTC is correct (Instagram already stores UTC). Document in code comment.
- **Filename sorting**: files sort chronologically by default (YYYY-MM-DD prefix). That's beneficial.
