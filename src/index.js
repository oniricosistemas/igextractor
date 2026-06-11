'use strict';

const ui      = require('./ui');
const license = require('./license');
const i18n    = require('./i18n');
const { t, setLang, loadSavedLang, saveLang } = i18n;
const { setDebug } = require('./debug');

async function run() {
  const args = process.argv.slice(2);

  // ── Debug flag (-d / -debug) ─────────────────────────────────────────────────
  if (args.includes('-d') || args.includes('-debug') || args.includes('--debug')) {
    setDebug(true);
    ui.info(t('debugEnabled'));
  }
  const cmd  = args[0];

  // ── -apiKey flag ─────────────────────────────────────────────────────────────
  if (cmd === '-apiKey' || cmd === '--apiKey') {
    // Load saved language
    const savedLang = loadSavedLang();
    if (savedLang) setLang(savedLang);

    ui.printLogo();
    const key = args[1];

    if (!key) {
      ui.err(t('noKeyProvided'));
      process.exit(1);
    }

    ui.info(t('validatingDots', key));
    const result = await license.validateKey(key);

    if (result.offline) {
      ui.warn(t('keySavedOffline'));
      license.saveApiKey(key);
      ui.ok(t('keySavedTo', license.ENV_FILE));
      process.exit(0);
    }

    if (result.valid) {
      license.saveApiKey(key);
      ui.newline();
      ui.infoBox(ui.proGradient(t('proActivated')), 'success');
      ui.dim(t('keySavedTo', license.ENV_FILE));
    } else {
      ui.err(t('keyInvalidCli', result.message));
      process.exit(1);
    }
    return;
  }

  // ── Non-interactive Profile extraction (CLI) ────────────────────────────────
  const profileArg = args.find(a => a.startsWith('--profile=') || a === '--profile' || a === '-p');
  if (profileArg) {
    ui.printLogo();
    const savedLang = loadSavedLang();
    if (savedLang) setLang(savedLang);

    let username;
    if (profileArg.startsWith('--profile=')) {
      username = profileArg.split('=')[1];
    } else {
      username = args[args.indexOf(profileArg) + 1];
    }

    if (!username || username.startsWith('-')) {
      ui.err(t('needProfileAfterFlag'));
      process.exit(1);
    }

    const options = {
      photos: true,
      reels: true,
      stories: false,
      captions: true,
      comments: false,
      followers: false,
      following: false,
      strictGrid: false,
    };
    // propagate global debug flag into options so scraper can persist debug artifacts
    options.debug = args.includes('-d') || args.includes('-debug') || args.includes('--debug');

    const sessionIdArg = args.find(a => a.startsWith('--session-id=') || a === '--session-id');
    if (sessionIdArg) {
      options.sessionId = sessionIdArg.startsWith('--session-id=') 
        ? sessionIdArg.split('=')[1] 
        : args[args.indexOf(sessionIdArg) + 1];
      if (!options.sessionId || options.sessionId.startsWith('-')) {
        ui.err(t('missingSessionIdValue'));
        process.exit(1);
      }
    } else {
      // Auto-read from .igextractor.env if not provided via CLI
      options.sessionId = license.readSessionId() || process.env.IGX_SESSION || process.env.IG_SESSION_ID || '';
    }

    // Safe value extraction utility for CLI flags
    const getArgValue = (flag) => {
      const idx = args.indexOf(flag);
      if (idx === -1) return undefined;
      const val = args[idx + 1];
      return (val && !val.startsWith('-')) ? val : undefined;
    };

    const limitArg = args.find(a => a.startsWith('--download-limit=') || a === '--download-limit');
    if (limitArg) {
      const val = limitArg.startsWith('--download-limit=')
        ? parseInt(limitArg.split('=')[1], 10)
        : parseInt(getArgValue('--download-limit'), 10);
      if (!isNaN(val) && val > 0) options.downloadLimit = val;
      else ui.warn(t('invalidDownloadLimit'));
    }
    const scanLimitArg = args.find(a => a.startsWith('--scan-limit=') || a === '--scan-limit');
    if (scanLimitArg) {
      const val = scanLimitArg.startsWith('--scan-limit=')
        ? parseInt(scanLimitArg.split('=')[1], 10)
        : parseInt(getArgValue('--scan-limit'), 10);
      if (!isNaN(val) && val > 0) options.scanLimit = val;
      else ui.warn(t('invalidScanLimit'));
    }

    const maxAgeArg = args.find(a => a.startsWith('--max-age-days=') || a === '--max-age-days');
    if (maxAgeArg) {
      const val = maxAgeArg.startsWith('--max-age-days=')
        ? parseInt(maxAgeArg.split('=')[1], 10)
        : parseInt(getArgValue('--max-age-days'), 10);
      if (!isNaN(val) && val > 0) options.maxAgeDays = val;
      else ui.warn(t('invalidMaxAgeDays'));
    }

    const dirArg = args.find(a => a.startsWith('--output-dir=') || a === '--output-dir');
    if (dirArg) {
      options.outputDir = dirArg.startsWith('--output-dir=')
        ? dirArg.split('=')[1]
        : getArgValue('--output-dir');
      if (!options.outputDir) ui.warn(t('missingOutputDir'));
    }

    if (args.includes('--strict-grid')) options.strictGrid = true;
    const strictGridModeArg = args.find(a => a.startsWith('--strict-grid-mode='));
    if (strictGridModeArg) {
      options.strictGridMode = strictGridModeArg.split('=')[1];
    } else {
      options.strictGridMode = 'auto-fallback';
    }
    if (args.includes('--photos')) options.photos = true;
    if (args.includes('--no-photos')) options.photos = false;
    if (args.includes('--reels')) options.reels = true;
    if (args.includes('--no-reels')) options.reels = false;
    if (args.includes('--stories')) options.stories = true;
    if (args.includes('--no-stories')) options.stories = false;
    if (args.includes('--captions')) options.captions = true;
    if (args.includes('--no-captions')) options.captions = false;
    if (args.includes('--comments')) options.comments = true;
    if (args.includes('--followers')) options.followers = true;
    if (args.includes('--following')) options.following = true;

    const commentLimitArg = args.find(a => a.startsWith('--comment-limit=') || a === '--comment-limit');
    if (commentLimitArg) options.commentLimit = commentLimitArg.startsWith('--comment-limit=')
      ? parseInt(commentLimitArg.split('=')[1], 10)
      : parseInt(args[args.indexOf(commentLimitArg) + 1], 10);

    // ── -apiKey inline: validate + save before extraction so isPro() is correct ──
    const apiKeyArg = args.find(a => a === '-apiKey' || a === '--apiKey');
    if (apiKeyArg) {
      const key = args[args.indexOf(apiKeyArg) + 1];
      if (key && /^IGX-/i.test(key)) {
        const result = await license.validateKey(key);
        if (result.valid || result.offline) {
          license.saveApiKey(key);
          license.setPlan('pro');
          ui.ok(result.offline ? t('keySavedOffline') : t('proActivated').split('\n')[0]);
        } else {
          ui.err(t('keyInvalidCli', result.message));
          process.exit(1);
        }
      }
    }

    try {
      const { extractProfile } = require('./scraper');
      ui.info(t('nonInteractiveStart', username));
      await extractProfile(username, options);
      ui.ok(t('nonInteractiveEnd', username));
      process.exit(0);
    } catch (e) {
      ui.err(t('nonInteractiveFail', e.message));
      // Print stack for debugging when running from CLI
      try { console.error(e.stack); } catch (err) {}
      process.exit(1);
    }
  }


  // ── init flow ─────────────────────────────────────────────────────────────────
  ui.printLogo();

  // ── Language selection ───────────────────────────────────────────────────────
  const savedLang = loadSavedLang();
  if (savedLang) {
    setLang(savedLang);
  } else {
    await selectLanguage();
  }

  // ── License check with spinner ───────────────────────────────────────────────
  const licenseSpin = ui.createSpinner(t('wakingServer'));
  licenseSpin.start();
  // Ping backend to wake it up (Render free tier sleeps)
  // Wait up to 12s; checkLicense falls back to cache if unresponsive.
  try {
    const axios = require('axios');
    const API_BASE = process.env.IGX_API_URL || 'https://igextractor-backend.onrender.com';
    try {
      await axios.get(API_BASE + '/health', { timeout: 12000 });
    } catch {}
  } catch {}
  licenseSpin.update(t('checkingLicense'));
  const licenseInfo = await license.checkLicense();

  if (licenseInfo.plan === 'pro') {
    licenseSpin.stop(t('proVerified'), true);
    if (licenseInfo.offline) ui.warn(t('offlineMode'));
  } else {
    if (licenseInfo.key && !licenseInfo.valid) licenseSpin.stop(t('keyInvalid'), false);
    else                                        licenseSpin.stop(null);
  }

  const { mainMenu } = require('./menu');
  await mainMenu(licenseInfo);
}

// ─── Language selection prompt ────────────────────────────────────────────────
async function selectLanguage() {
  const inquirer = require('inquirer');
  const { lang } = await inquirer.prompt([{
    type:    'list',
    name:    'lang',
    message: ui.C.cyan(t('selectLanguage')),
    prefix:  ' ',
    choices: [
      { name: '🇺🇸  English', value: 'en' },
      { name: '🇦🇷  Español', value: 'es' },
    ],
  }]);
  setLang(lang);
  saveLang(lang);
  ui.newline();
}

// ─── Usage box ────────────────────────────────────────────────────────────────
function printUsage() {
  const boxen = require('boxen');
  const lines = [
    ui.C.white.bold(t('usageHeader')),
    '',
    ui.C.cyan(t('usageInit')),
    ui.C.cyan(t('usageApiKey')),
    '',
    ui.C.white.bold(t('usageExamplesHeader')),
    '',
    ui.C.gray(t('usageEx1')),
    ui.C.gray(t('usageEx2')),
    '',
    ui.C.dim(t('usageFreeLine')),
    ui.C.dim(t('usageProLine')),
  ];

  console.log(boxen(lines.join('\n'), {
    padding:        { top: 0, bottom: 0, left: 2, right: 2 },
    margin:         { top: 0, bottom: 1, left: 1, right: 0 },
    borderStyle:    'round',
    borderColor:    'cyan',
    title:          ui.C.cyan(t('usageTitle')),
    titleAlignment: 'center',
  }));
}

module.exports = { run };
