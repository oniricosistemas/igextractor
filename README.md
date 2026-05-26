# IGExtractor

Download photos, reels, stories, comments and followers from any Instagram profile — one command, everything saved.

## Features

| Feature | Free | Pro |
|---|---|---|
| Download photos & reels | ✓ (max 5) | ✓ Unlimited |
| Download stories | ✗ | ✓ |
| Export comments (JSON) | ✗ | ✓ |
| Export followers / following | ✗ | ✓ |
| Post captions | ✓ | ✓ |

---

## Download

👉 [Get the latest release](https://github.com/oniricosistemas/igextractor/releases)

Or run from source (requires Node.js 18+):

```bash
npm install
npm start
```

---

## Usage

### Interactive TUI

```bash
igextractor
```

Just run it — a menu will guide you through profile, download type and options.

### Add your Pro API key

```bash
igextractor -apiKey IGX-XXXXXXXX-XXXXXXXX-XXXXXXXX
```

Your key is saved locally to `~/.igextractor.env` and validated on each run.

---

## Get Pro

☕ [Buy me a coffee at cafecito.app/igextractor](https://cafecito.app/igextractor)

Pro is a one-time payment. After purchasing, fill out the form in the app or on the website and you'll receive your API key by email.

---

## Project Structure

```
bin/
└── igextractor.js    ← CLI entrypoint
src/
├── index.js          ← Main router / CLI arg parsing
├── ui.js             ← TUI: logo, progress bars, tables
├── license.js        ← API key read/write/validate
├── menu.js           ← Interactive menus
└── scraper.js        ← Instagram scraping logic
```

---

## Offline behavior

If the license server is unreachable at startup:
- Valid key format → **offline Pro grace** until reconnection
- No key or invalid format → falls back to **Free plan**

---

## Legal

Not affiliated with or endorsed by Instagram or Meta. Use responsibly and in accordance with Instagram's Terms of Service.
