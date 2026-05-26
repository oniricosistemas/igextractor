'use strict';

const chalk    = require('chalk');
const figlet   = require('figlet');
const _grad    = require('gradient-string');
const gradient = _grad.default || _grad;
const boxen    = require('boxen');
const cliProgress = require('cli-progress');
const Table    = require('cli-table3');

// ─── Safe hex helper ──────────────────────────────────────────────────────────
function hex(code) {
  try { const fn = chalk.hex(code); fn('x'); return fn; }
  catch { return chalk.white; }
}

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  brand:  hex('#E1306C'),
  gold:   hex('#F5A623'),
  cyan:   hex('#00D4FF'),
  green:  hex('#00FF88'),
  dim:    hex('#666666'),
  white:  chalk.white,
  red:    hex('#FF4444'),
  purple: hex('#C850C0'),
  orange: hex('#FF8C00'),
  gray:   chalk.gray,
};

const igGradient  = gradient(['#F58529', '#DD2A7B', '#8134AF', '#515BD4']);
const proGradient = gradient(['#F5A623', '#FFD700']);

// ─── Logo ─────────────────────────────────────────────────────────────────────
function printLogo() {
  let art;
  try {
    art = figlet.textSync('IGExtractor', { font: 'ANSI Shadow' });
  } catch {
    art = figlet.textSync('IGExtractor');
  }

  // Indent every line of the ASCII art by 4 spaces
  const indented = art.split('\n').map(line => '    ' + line).join('\n');
  console.log('\n' + igGradient(indented));

  const tagline = '  Instagram Data Extraction Tool  v0.5  ';
  const pad = 18;
  console.log(
    '    ' + C.dim('─'.repeat(pad)) +
    '  ' + C.brand(tagline) + '  ' +
    C.dim('─'.repeat(pad))
  );
  console.log('');
}

// ─── Spinner (simple animated dots) ──────────────────────────────────────────
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function createSpinner(message) {
  let i = 0;
  let timer = null;
  const isTTY = process.stdout.isTTY;

  const spin = {
    start() {
      if (!isTTY) { process.stdout.write('  ' + message + '...\n'); return spin; }
      process.stdout.write('\n');
      timer = setInterval(() => {
        const frame = SPINNER_FRAMES[i % SPINNER_FRAMES.length];
        process.stdout.write(`\r  ${C.cyan(frame)} ${C.white(message)}...`);
        i++;
      }, 80);
      return spin;
    },
    update(msg) {
      if (!isTTY) return spin;
      message = msg;
      return spin;
    },
    stop(finalMsg, success = true) {
      if (timer) { clearInterval(timer); timer = null; }
      if (isTTY) process.stdout.write('\r' + ' '.repeat(message.length + 20) + '\r');
      if (finalMsg) {
        const icon = success ? C.green('✓') : C.red('✗');
        console.log('  ' + icon + ' ' + (success ? C.green(finalMsg) : C.red(finalMsg)));
      }
      return spin;
    },
    fail(msg) { return spin.stop(msg, false); },
  };
  return spin;
}

// ─── Animated progress bar for indeterminate tasks ───────────────────────────
function createIndeterminateBar(label) {
  const isTTY = process.stdout.isTTY;
  let timer = null;
  let tick  = 0;
  const width = 30;

  const bar = {
    start() {
      if (!isTTY) { process.stdout.write('  ' + label + '...\n'); return bar; }
      timer = setInterval(() => {
        const pos     = tick % (width * 2);
        const bounce  = pos < width ? pos : width * 2 - pos;
        const filled  = '█'.repeat(3);
        const left    = '░'.repeat(bounce);
        const right   = '░'.repeat(Math.max(0, width - bounce - 3));
        process.stdout.write(`\r  ${C.cyan(left + filled + right)}  ${C.gray(label)}`);
        tick++;
      }, 80);
      return bar;
    },
    stop(msg, success = true) {
      if (timer) { clearInterval(timer); timer = null; }
      if (isTTY) process.stdout.write('\r' + ' '.repeat(width + label.length + 10) + '\r');
      if (msg) {
        const icon = success ? C.green('✓') : C.red('✗');
        console.log('  ' + icon + ' ' + (success ? C.green(msg) : C.red(msg)));
      }
      return bar;
    },
    fail(msg) { return bar.stop(msg, false); },
  };
  return bar;
}

// ─── Plan badge ───────────────────────────────────────────────────────────────
function planBadge(isPro) {
  const { t } = require('./i18n');
  return isPro ? proGradient(t('proBadge')) : C.gray(t('freeBadge'));
}

// ─── Section header ───────────────────────────────────────────────────────────
function sectionHeader(title) {
  const line = C.dim('─'.repeat(50));
  console.log('\n' + line);
  console.log(C.cyan('  ▸ ') + C.white.bold(title));
  console.log(line);
}

// ─── Info box ─────────────────────────────────────────────────────────────────
function infoBox(content, type = 'info') {
  const styles = {
    info:    { border: 'cyan',   title: C.cyan(' ℹ INFO ') },
    success: { border: 'green',  title: C.green(' ✓ SUCCESS ') },
    warning: { border: 'yellow', title: C.gold(' ⚠ WARNING ') },
    error:   { border: 'red',    title: C.red(' ✗ ERROR ') },
    pro:     { border: 'yellow', title: proGradient(' ★ PRO ') },
  };
  const s = styles[type] || styles.info;
  console.log(boxen(content, {
    padding:        { top: 0, bottom: 0, left: 1, right: 1 },
    margin:         { top: 0, bottom: 0, left: 2, right: 0 },
    borderStyle:    'round',
    borderColor:    s.border,
    title:          s.title,
    titleAlignment: 'left',
  }));
}

// ─── Determinate progress bar ─────────────────────────────────────────────────
function createProgressBar(label, colorKey = 'cyan') {
  const colorFn = C[colorKey] || C.cyan;
  const bar = new cliProgress.SingleBar({
    format:
      '  ' + colorFn('{bar}') + ' ' +
      C.white('{percentage}%') + C.dim(' │ ') +
      C.white('{value}') + C.dim('/') + C.white('{total}') + C.dim(' │ ') +
      C.gray(label),
    barCompleteChar:   '█',
    barIncompleteChar: '░',
    hideCursor:        true,
    clearOnComplete:   false,
    barsize:           30,
  }, cliProgress.Presets.shades_classic);

  // tick(current, total) — convenience wrapper used throughout scraper.js
  // Starts the bar on first call, then updates it.
  bar.tick = function (current, total) {
    const safeTotal = Math.max(total || current, current);
    if (!this.isActive) this.start(safeTotal, 0);
    else if (safeTotal > this.total) this.setTotal(safeTotal);
    this.update(current);
  };

  return bar;
}

// ─── Status lines ─────────────────────────────────────────────────────────────
function statusLine(icon, message, colorKey = 'white') {
  const fn = C[colorKey] || C.white;
  console.log('  ' + fn(icon + ' ' + message));
}

function ok(msg)   { statusLine('✓', msg, 'green');  }
function err(msg)  { statusLine('✗', msg, 'red');    }
function warn(msg) { statusLine('⚠', msg, 'gold');   }
function info(msg) { statusLine('◆', msg, 'cyan');   }
function dim(msg)  { console.log('  ' + C.dim(msg)); }

// ─── Profile card ─────────────────────────────────────────────────────────────
function profileCard(data) {
  const fmt   = n => (typeof n === 'number' ? n.toLocaleString() : String(n ?? '?'));
  const trunc = (s, n) => s && s.length > n ? s.slice(0, n) + '…' : (s || '');

  const { t } = require('./i18n');
  const lines = [
    C.white.bold('@' + (data.username || '?')),
    C.gray(data.full_name || ''),
    '',
    C.dim(t('cardPosts'))     + C.white(fmt(data.edge_owner_to_timeline_media?.count)),
    C.dim(t('cardFollowers')) + C.white(fmt(data.edge_followed_by?.count)),
    C.dim(t('cardFollowing')) + C.white(fmt(data.edge_follow?.count)),
    '',
    C.dim(t('cardPrivate'))   + (data.is_private  ? C.red(t('cardYes'))          : C.green(t('cardNo'))),
    C.dim(t('cardVerified'))  + (data.is_verified ? C.cyan('✓ ' + t('cardYes')) : C.gray(t('cardNo'))),
    '',
    C.gray(trunc(data.biography || '', 60)),
  ];

  console.log(boxen(lines.join('\n'), {
    padding:        { top: 0, bottom: 0, left: 2, right: 2 },
    margin:         { top: 0, bottom: 1, left: 2, right: 0 },
    borderStyle:    'double',
    borderColor:    'magenta',
    title:          C.brand(' Instagram Profile '),
    titleAlignment: 'center',
  }));
}

// ─── Stats table ──────────────────────────────────────────────────────────────
function statsTable(rows) {
  const table = new Table({
    head:  [C.cyan('Metric'), C.cyan('Value')],
    style: { border: ['dim'], head: [] },
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '╭', 'top-right': '╮',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '╰', 'bottom-right': '╯',
      'left': '│', 'right': '│', 'mid': '─', 'mid-mid': '┼',
      'left-mid': '├', 'right-mid': '┤', 'middle': '│',
    },
    colWidths: [25, 35],
  });
  rows.forEach(([k, v]) => table.push([C.gray(k), C.white(String(v))]));
  console.log('  ' + table.toString().split('\n').join('\n  '));
}

// ─── Free plan limit warning ──────────────────────────────────────────────────
function freeLimitWarning(current, max) {
  const pct    = Math.round((current / max) * 100);
  const filled = Math.round(pct / 5);
  const empty  = 20 - filled;
  const color  = pct >= 80 ? C.red : pct >= 50 ? C.gold : C.green;
  const bar    = '  ' + color('█'.repeat(filled)) + C.dim('░'.repeat(empty)) + C.gray(' ' + pct + '%');

  const { t: tw } = require('./i18n');
  infoBox(
    C.gold(tw('freeLimitTitle') + ' ') + C.white(`${current}/${max}`) + '\n' +
    bar + '\n\n' +
    C.gray(tw('freeLimitUpgrade') + ' ') + proGradient(tw('freeLimitPro')) + C.gray(' ' + tw('freeLimitRemove') + '\n') +
    C.gray(tw('freeLimitRun') + ' ') + C.cyan('igextractor -apiKey YOUR-KEY'),
    'warning'
  );
}

// ─── Upgrade box ──────────────────────────────────────────────────────────────
function upgradeBox(feature) {
  const { t } = require('./i18n');
  infoBox(proGradient(' ★ PRO FEATURE REQUIRED\n\n') + C.gray(t('upgradeRequired', feature)), 'pro');
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function separator() { console.log('\n  ' + C.dim('─'.repeat(52)) + '\n'); }
function newline()   { console.log(''); }
function fmt(n)         { return typeof n === 'number' ? n.toLocaleString() : String(n); }
function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + '…' : (s || ''); }

module.exports = {
  C, igGradient, proGradient,
  printLogo, planBadge,
  sectionHeader, infoBox,
  createProgressBar, createSpinner, createIndeterminateBar,
  ok, err, warn, info, dim,
  profileCard, statsTable,
  freeLimitWarning, upgradeBox,
  separator, newline,
  fmt, truncate,
};
