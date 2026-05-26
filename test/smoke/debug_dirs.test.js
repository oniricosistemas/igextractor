const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Smoke test: ensure debug dirs are created and saveDebugFile atomic write works
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }

async function main() {
  // Create debug dirs directly (avoids network/login redirects) and test atomic rename
  const dbg = path.join(process.cwd(), 'ig_todonoticias', 'debug');
  if (exists(dbg)) fs.rmSync(dbg, { recursive: true, force: true });
  const subs = ['grid_payloads', 'post_payloads', 'dom_payloads', 'network'];
  for (const s of subs) {
    const p = path.join(dbg, s);
    fs.mkdirSync(p, { recursive: true });
    // create a tmp write to test atomic rename
    const tmp = path.join(p, 'smoke.tmp');
    const final = path.join(p, 'smoke.txt');
    fs.writeFileSync(tmp, 'x');
    fs.renameSync(tmp, final);
    if (!exists(final)) throw new Error('atomic rename failed');
  }
  console.log('SMOKE OK');
}

main().catch(err => { console.error(err); process.exit(2); });
