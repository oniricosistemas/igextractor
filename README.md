# IGExtractor

Instagram data extraction tool with a beautiful TUI interface.

## Features

| Feature | Free | Pro |
|---|---|---|
| Download images | ✓ (max 50) | ✓ Unlimited |
| Download stories | ✓ | ✓ |
| Download comments | ✗ | ✓ |
| Download followers | ✗ | ✓ |
| Download following | ✗ | ✓ |
| Proxy support | ✗ | ✓ |

---

## Installation

```bash
cd igextractor
npm install
npm link   # makes `igextractor` available globally
```

---

## Usage

### Start the TUI
```bash
igextractor init
```

### Add a Pro API key
```bash
igextractor -apiKey IGX-XXXXXXXX-XXXXXXXX-XXXXXXXX
```

Your key is saved to `~/.igextractor.env`.

---

## Backend (License Server)

The backend validates Pro API keys. You need to deploy it separately.

### Setup

```bash
cd igextractor-backend
npm install
cp .env.example .env
# Edit .env with your ADMIN_SECRET and KEY_SALT
node src/server.js
```

### Generate keys (admin)

```bash
curl -X POST http://localhost:3847/generate \
  -H "Content-Type: application/json" \
  -d '{"adminSecret": "your-admin-secret", "email": "customer@example.com", "count": 1}'
```

Response:
```json
{
  "success": true,
  "keys": ["IGX-A1B2C3D4-E5F6A7B8-C9D0E1F2"],
  "count": 1
}
```

### Revoke a key

```bash
curl -X POST http://localhost:3847/revoke \
  -H "Content-Type: application/json" \
  -d '{"adminSecret": "your-admin-secret", "key": "IGX-A1B2C3D4-E5F6A7B8-C9D0E1F2"}'
```

### View stats

```bash
curl "http://localhost:3847/stats?adminSecret=your-admin-secret"
```

---

## Configuration

### Backend URL

After deploying your backend, update the URL in `igextractor/src/license.js`:

```js
const API_BASE = 'https://your-server.com/api'; // ← update this
```

Or set the environment variable:
```bash
export IGX_API_URL=https://your-server.com/api
```

### Instagram Session ID (optional)

Providing a valid Instagram session ID improves extraction quality for private or rate-limited profiles:

```bash
export IG_SESSION_ID=your_session_id_here
```

---

## Project Structure

```
igextractor/          ← CLI tool (install globally with npm link)
├── bin/
│   └── igextractor.js    ← CLI entrypoint
├── src/
│   ├── index.js          ← Main router / CLI arg parsing
│   ├── ui.js             ← TUI: logo, progress bars, tables, boxes
│   ├── license.js        ← API key read/write/validate
│   ├── menu.js           ← Interactive menus (inquirer)
│   └── scraper.js        ← Instagram scraping logic
└── package.json

igextractor-backend/  ← License validation server (deploy separately)
├── src/
│   └── server.js         ← Express API
├── .env.example
└── package.json
```

---

## Offline behavior

If the license server is unreachable at startup, the app starts immediately:
- If a key is saved and matches the format `IGX-XXXXXXXX-XXXXXXXX-XXXXXXXX`, it gets **offline Pro grace**
- If no key or invalid format, it falls back to **Free plan**

Keys are re-validated on next successful connection.
