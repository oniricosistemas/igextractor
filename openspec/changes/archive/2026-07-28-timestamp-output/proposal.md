# Proposal: Timestamp in filenames and output

## Intent

Add human-readable publication timestamps (Y-m-d H:i:s) to downloaded filenames, caption exports, and summary display so users can identify when posts were published without checking Instagram.

## Scope

### In Scope
- Filename format: `YYYY-MM-DD_HH-mm-SS_media_N.jpg` (hyphenated, Windows-safe)
- Caption export: include `taken_at` datetime alongside caption text in `captions.json`
- Summary table: show oldest and newest post dates
- New i18n keys for summary date labels

### Out of Scope
- Timestamps in comments/stories/followers export
- Reordering files by date on disk (sorted by shortcode order as today)
- GUI/TUI changes beyond summary table rows

## Capabilities

### New Capabilities
- `timestamp-formatter`: Unix→Y-m-d H:i:s conversion, handles 0/falsy gracefully, returns `""` for missing timestamps

### Modified Capabilities
- None (pure enhancement, no spec-level behavior change)

## Approach

1. Add `formatTs(ts)` helper in `scraper.js` that converts Unix seconds → `YYYY-MM-DD_HH-mm-SS` or `YYYY-MM-DD HH:mm:ss` depending on context (filename vs display).
2. **Filenames**: In `runMediaDownload` at line 1737, replace `postTs` prefix logic with `formatTs(postTs, 'file')` producing `2024-12-25_14-30-00_media_1.jpg`.
3. **Captions**: In `runCaptionDownload`, add a `taken_at` field formatted as `YYYY-MM-DD HH:mm:ss` to each entry in `captions.json`.
4. **Summary**: In `extractProfile` / `printSummary`, compute min/max timestamps from `allPosts` and add two rows to the stats table via existing i18n keys + `ui.statsTable`.
5. Add 4 i18n keys: `summaryOldest`, `summaryNewest`, and their value placeholders.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/scraper.js` | Modified | `runMediaDownload` filename format, `runCaptionDownload` output, `extractProfile` summary dates |
| `src/menu.js` | Modified | `printSummary` — add date rows to stats table |
| `src/i18n.js` | Modified | 4 new translation keys |
| `src/ui.js` | None | `statsTable` is generic, no changes needed |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing downloads with old filenames break user scripts | Med | Document in changelog; old format was already unstable (unix prefix only appeared when ts>0) |
| Timezone ambiguity | Low | Use UTC explicitly in field name / docs; timestamps are already Unix epoch from Instagram |

## Rollback Plan

- Revert the 3-file change in a single commit; the feature is additive — no data loss on rollback.

## Dependencies

- None. `getPostTimestamp()` already returns Unix timestamps.

## Success Criteria

- [ ] Downloaded filenames show `2024-12-25_14-30-00_media_1.jpg` instead of `1735129800_media_1.jpg` (or plain `media_1.jpg` when ts=0)
- [ ] `captions.json` entries include `"taken_at": "2024-12-25 14:30:00"`
- [ ] Summary table shows two new rows: "Oldest post" and "Newest post"
