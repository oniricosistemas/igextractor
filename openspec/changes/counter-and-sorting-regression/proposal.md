# Proposal: counter-and-sorting-regression

## Intent

The profile display shows a stale following count (814) from Instagram's CDN-cached `og:description` because Layers 2 and 3 only guard against stale data via `!result.user.follower_count` — they ignore `following_count` — and the response handler can replace `result.user` with API data lacking `following_count`. Independently, exported follower/following JSON files lose exactly 1 item each due to Instagram's exclusive cursor pagination (`max_id` skips the boundary item).

## Scope

### In Scope
1. Fix display counter: Layers 2 and 3 in `navigateAndCapture()` check both `follower_count` and `following_count` independently
2. Fix pagination off-by-one: deduplicate by `pk` in `runFollowersDownload()` and `runFollowingDownload()`

### Out of Scope
- Sorting regression (Bug C): confirmed not a bug, natural API variability
- Any changes to the Layer 0 API fetch, response handler user replacement, or Layer 1 raw HTML extraction

## Capabilities

### New Capabilities
None

### Modified Capabilities
None

## Approach

For the display fix, add `!result.user.following_count` as an independent guard alongside the existing `!result.user.follower_count` in both Layer 2 (`og:description` via `page.evaluate`) and Layer 3 (`/api/v1/users/{pk}/info/` browser fetch) inside `navigateAndCapture()`. This prevents stale CDN metadata from overwriting a valid `following_count` obtained by a higher-priority layer. For the pagination fix, wrap the `results` array accumulation in `runFollowersDownload()` and `runFollowingDownload()` with a `Map` keyed by `pk`. Insert each API response item only when `!map.has(item.pk)`, then spread the map values into the final array before sorting. This absorbs the exclusive-cursor off-by-one without changing the pagination logic itself.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| src/scraper.js — `navigateAndCapture()` Layer 2 (og:evaluate) | Modified | Add `!result.user.following_count` guard |
| src/scraper.js — `navigateAndCapture()` Layer 3 (API fetch) | Modified | Add `!result.user.following_count` guard |
| src/scraper.js — `runFollowersDownload()` | Modified | Add pk-based dedup Map |
| src/scraper.js — `runFollowingDownload()` | Modified | Add pk-based dedup Map |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Layer guard change doesn't fully fix display | Low | Existing Layers already work for `follower_count` — same pattern for `following_count` |
| Dedup by pk removes legitimate duplicates | Low | Instagram API shouldn't return same pk twice in one pagination sequence |

## Rollback Plan

Revert the changed lines in `scraper.js`. The changes are in 4 small, independent locations with no cross-dependency.

## Dependencies

None.

## Success Criteria

- [ ] Profile display shows `following_count` matching Instagram web (no stale `og:description`)
- [ ] Exported `followers.json` count matches Instagram web within API limits
- [ ] Exported `following.json` count matches Instagram web within API limits
- [ ] Followers/following files have no duplicate `pk` entries
