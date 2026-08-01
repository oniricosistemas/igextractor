# Tasks: counter-and-sorting-regression

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~16 (4 locations × ~4 lines each) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: Display counter fix

- [x] 1.1 `src/scraper.js:954` — Change Layer 2 entry guard from `!result.user.follower_count` to `!result.user.follower_count || !result.user.following_count`
- [x] 1.2 `src/scraper.js:991` — Change Layer 3 entry guard from `!result.user.follower_count` to `!result.user.follower_count || !result.user.following_count`

## Phase 2: Pagination off-by-one fix

- [x] 2.1 `src/scraper.js:2285` — Replace `const results = []` with `const resultsMap = new Map()` in runFollowersDownload; dedup by pk; spread before sort
- [x] 2.2 `src/scraper.js:2324` — Same Map-based dedup pattern in runFollowingDownload
