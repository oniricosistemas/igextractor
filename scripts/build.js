#!/usr/bin/env node
/**
 * build.js — compila IGExtractor para Win / macOS / Linux con pkg
 *
 * Estrategia para Puppeteer:
 *   - Puppeteer descarga Chromium en node_modules durante `npm install`
 *   - pkg NO puede empaquetar el binario de Chromium dentro del exe
 *   - Solución: distribuir un ZIP por plataforma que contiene:
 *       igextractor(.exe)  ← compilado por pkg
 *       chromium/          ← copiado desde node_modules
 *   - En runtime, scraper.js detecta si hay un chromium/ junto al exe
 *     y lo usa como executablePath
 *
 * Uso:
 *   node scripts/build.js           → todas las plataformas
 *   node scripts/build.js win       → solo Windows
 *   node scripts/build.js mac       → solo macOS
 *   node scripts/build.js linux     → solo Linux
 */

'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const DIST    = path.join(ROOT, 'dist');
const VERSION = require(path.join(ROOT, 'package.json')).version;

const TARGETS = {
  win:   { pkgTarget: 'node18-win-x64',    out: `igextractor-${VERSION}-win-x64.exe`,   zip: `igextractor-${VERSION}-win-x64.zip`   },
  mac:   { pkgTarget: 'node18-macos-x64',  out: `igextractor-${VERSION}-macos-x64`,     zip: `igextractor-${VERSION}-macos-x64.zip` },
  linux: { pkgTarget: 'node18-linux-x64',  out: `igextractor-${VERSION}-linux-x64`,     zip: `igextractor-${VERSION}-linux-x64.zip` },
};

// Which platforms to build
const requested = process.argv.slice(2);
const platforms = requested.length
  ? requested.filter(p => TARGETS[p])
  : Object.keys(TARGETS);

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

// Locate the Chromium binary bundled by puppeteer
function findChromiumDir() {
  // puppeteer v22+ stores it under .local-chromium or .cache/puppeteer
  const candidates = [
    path.join(ROOT, 'node_modules', 'puppeteer', '.local-chromium'),
    path.join(ROOT, 'node_modules', 'puppeteer', '.cache', 'puppeteer', 'chrome'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.cache', 'puppeteer', 'chrome'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log(`  Chromium found at: ${c}`);
      return c;
    }
  }
  return null;
}

function run(cmd) {
  console.log(`\n  > ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

for (const platform of platforms) {
  const t = TARGETS[platform];
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Building: ${platform.toUpperCase()} → ${t.out}`);
  console.log('─'.repeat(60));

  const exePath = path.join(DIST, t.out);

  // 1. Compile with pkg
  run(`npx pkg bin/igextractor.js --targets ${t.pkgTarget} --output "${exePath}" --compress GZip`);

  // 2. Create staging dir for zip
  const stagingName = `igextractor-${VERSION}-${platform}-x64`;
  const staging = path.join(DIST, stagingName);
  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
  fs.mkdirSync(staging, { recursive: true });

  // 3. Copy binary
  const binName = platform === 'win' ? 'igextractor.exe' : 'igextractor';
  fs.copyFileSync(exePath, path.join(staging, binName));

  // 4. Copy Chromium
  const chromiumSrc = findChromiumDir();
  if (chromiumSrc) {
    console.log(`  Copying Chromium → ${staging}/chromium ...`);
    copyDirSync(chromiumSrc, path.join(staging, 'chromium'));
  } else {
    console.warn('  ⚠ Chromium not found locally. Run `npm install` first.');
    console.warn('    The binary will attempt to download Chromium on first run.');
  }

  // 5. Add README
  fs.writeFileSync(path.join(staging, 'README.txt'), [
    'IGExtractor v' + VERSION,
    '',
    platform === 'win'
      ? 'Run: igextractor.exe'
      : 'Run: ./igextractor   (you may need: chmod +x igextractor)',
    '',
    'The chromium/ folder must stay next to the executable.',
    '',
    'Get Pro: https://cafecito.app/igextractor',
    'GitHub:  https://github.com/oniricosistemas/igextractor',
  ].join('\n'));

  // 6. Zip (platform-aware)
  const zipPath = path.join(DIST, t.zip);
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

  try {
    if (platform === 'win') {
      run(`powershell -Command "Compress-Archive -Path '${staging}\\*' -DestinationPath '${zipPath}' -Force"`);
    } else {
      run(`zip -r "${zipPath}" "${stagingName}"` );
    }
    console.log(`  ✓ ${t.zip}`);
  } catch (e) {
    console.warn(`  ⚠ Could not create zip (${e.message}). Staging folder kept at: ${staging}`);
  }
}

console.log('\n✓ Build complete. Check dist/\n');

// ── helpers ──────────────────────────────────────────────────────────────────
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}
