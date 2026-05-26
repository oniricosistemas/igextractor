# Changelog - Strict Grid Fixes

- **FIX-3**: Debug directories are now created under `outputDir/debug` (`grid_payloads`, `post_payloads`, `dom_payloads`) in `extractProfile` when `options.debug` is true.
- **FIX-5**: `buildPostsFromShortcodes` now saves raw HTML if all fetch attempts fail, and saves JSON on success to `post_payloads`.
- **FIX-2**: Replaced page navigation with `page.evaluate` fetch calls for `api/v1/media/{id}/info/` and fallback JSON endpoints (`?__a=1&__d=dis`).
- **FIX-1 & FIX-7**: Added `gridShortcodesIndexMap` and `gridPkIndexMap` to `navigateAndCapture` for faster and more accurate grid index mapping in `runMediaDownload`.
- **FIX-4**: `options.username` is now set immediately at the start of `extractProfile`.
- **FIX-6**: Added `--strict-grid-mode` CLI flag supporting `auto-fallback` and `fail-loud`. `runMediaDownload` now aborts if `fail-loud` is set and no media is found.
- **Atomic Writes**: `saveDebugFile` now uses temporary files and `fs.renameSync` for all debug outputs.

Files modified:
- `src/index.js`
- `src/scraper.js`
