'use strict';

const inquirer = require('inquirer');
const ui       = require('./ui');
const { t }    = require('./i18n');
const { isPro }                          = require('./license');
const { readSessionId, saveSessionId }   = require('./license');
const { fetchProfileOnly, extractProfile } = require('./scraper');

// ─── Main menu ────────────────────────────────────────────────────────────────
async function mainMenu(licenseInfo) {
  const pro = licenseInfo.plan === 'pro';

  console.log('');
  ui.infoBox(
    ui.planBadge(pro) + '\n\n' +
    (pro ? ui.C.green(t('planLinePro')) : ui.C.gray(t('planLineFree'))),
    pro ? 'success' : 'info'
  );

  if (licenseInfo.offline && licenseInfo.valid) ui.warn(t('offlineGrace'));

  console.log('');

  const { action } = await inquirer.prompt([{
    type:    'list',
    name:    'action',
    message: ui.C.cyan(t('whatToDo')),
    prefix:  ' ',
    choices: [
      { name: ui.C.white('  ' + t('menuExtract').trim()), value: 'extract' },
      { name: ui.C.white('  ' + t('menuApiKey').trim()),  value: 'apikey'  },
      { name: ui.C.gray('  ─────────────────────────────'), value: 'sep', disabled: true },
      { name: ui.C.gray('  ' + t('menuExit').trim()),     value: 'exit'    },
    ],
  }]);

  switch (action) {
    case 'extract': await extractFlow(pro);  break;
    case 'apikey':  await apiKeyMenu();       break;
    case 'exit':
      ui.newline(); ui.dim(t('goodbye')); ui.newline();
      process.exit(0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXTRACTION FLOW — validate first, then ask options
// ─────────────────────────────────────────────────────────────────────────────
async function extractFlow(pro) {
  ui.sectionHeader(t('extractSetup'));

  // ── Step 1: ask username ───────────────────────────────────────────────────
  const { username } = await inquirer.prompt([{
    type:     'input',
    name:     'username',
    message:  ui.C.cyan(t('askUsername')),
    prefix:   ' ',
    validate: v => v.trim().length > 0 ? true : t('usernameEmpty'),
    filter:   v => v.trim().replace(/^@/, ''),
  }]);

  // ── Step 2: ask session ID (all plans) ────────────────────────────────────
  const savedSession = readSessionId();
  let sessionId = savedSession || '';

  if (!savedSession) {
    ui.newline();
    ui.infoBox(
      ui.C.cyan(t('sessionHint')) + '\n\n' +
      ui.C.gray('Chrome/Firefox: F12 -> Application -> Cookies -> instagram.com -> sessionid'),
      'info'
    );
    const { session } = await inquirer.prompt([{
      type:    'input',
      name:    'session',
      message: ui.C.cyan(t('askSessionAll')),
      prefix:  ' ',
      default: '',
    }]);

    if (session && session.trim()) {
      sessionId = session.trim();
      saveSessionId(sessionId);
      ui.ok(t('sessionSaved'));
    } else {
      ui.warn(t('noSessionWarn'));
    }
  } else {
    ui.dim(`Session ID: ${'*'.repeat(12)}...${savedSession.slice(-6)} (saved)`);
  }

  ui.newline();

  // ── Step 3: validate profile ───────────────────────────────────────────────
  const spin = ui.createSpinner(t('validatingProfile', username));
  spin.start();

  let profileData = null;
  try {
    profileData = await fetchProfileOnly(username, { sessionId });
  } catch {}

  if (!profileData) {
    spin.fail(t('profileNotFound', username));
    ui.newline();

    // Offer retry or back
    const { next } = await inquirer.prompt([{
      type:    'list',
      name:    'next',
      message: ui.C.cyan(t('tryAgainOrBack')),
      prefix:  ' ',
      choices: [
        { name: ui.C.white('  ' + t('optTryAgain').trim()), value: 'retry' },
        { name: ui.C.gray('  ' + t('optGoBack').trim()),    value: 'back'  },
      ],
    }]);

    if (next === 'retry') return extractFlow(pro);
    return mainMenu({ plan: isPro() ? 'pro' : 'free', valid: isPro() });
  }

  // Profile found — show card
  spin.stop(t('profileFound', username));
  ui.newline();
  ui.profileCard(profileData);

  // ── Step 4: ask what to download ──────────────────────────────────────────
  const downloadChoices = await inquirer.prompt([
    {
      type:    'list',
      name:    'mediaType',
      message: ui.C.cyan(t('askMediaType')),
      prefix:  ' ',
      choices: [
        { name: ui.C.white('  ' + t('optPhotos')),           value: 'photos' },
        { name: ui.C.white('  ' + t('optReels')),            value: 'reels'  },
        { name: ui.C.white('  ' + t('optBoth')),             value: 'both'   },
      ],
    },
    {
      type:    'checkbox',
      name:    'tasks',
      message: ui.C.cyan(t('askWhatDownload')),
      prefix:  ' ',
      choices: [
        {
          name:    ui.C.white(t('optStories')),
          value:   'stories',
          checked: false,
        },
        {
          name:    ui.C.white(t('optCaptions')),
          value:   'captions',
          checked: true,
        },
        {
          name:     (pro ? '' : ui.C.gray('[PRO] ')) + ui.C.white(t('optComments')),
          value:    'comments',
          checked:  false,
          disabled: pro ? false : t('proOnly'),
        },
        {
          name:     (pro ? '' : ui.C.gray('[PRO] ')) + ui.C.white(t('optFollowers')),
          value:    'followers',
          checked:  false,
          disabled: pro ? false : t('proOnly'),
        },
        {
          name:     (pro ? '' : ui.C.gray('[PRO] ')) + ui.C.white(t('optFollowing')),
          value:    'following',
          checked:  false,
          disabled: pro ? false : t('proOnly'),
        },
      ],
    },
    {
      type:     'input',
      name:     'downloadLimit',
      message:  ui.C.cyan(t('askDownloadLimit')),
      prefix:   ' ',
      default:  '0',
      validate: v => (!isNaN(parseInt(v)) && parseInt(v) >= 0) ? true : t('invalidLimit'),
      filter:   v => parseInt(v) || 0,
    },
    ...(pro ? [{
      type:    'input',
      name:    'proxy',
      message: ui.C.cyan(t('askProxy')),
      prefix:  ' ',
      default: '',
    }] : []),
    {
      type:    'input',
      name:    'outputDir',
      message: ui.C.cyan(t('askOutputDir')),
      prefix:  ' ',
      default: '',
    },
  ]);

  const { mediaType, tasks, downloadLimit, proxy, outputDir } = downloadChoices;

  // Show limit info
  if (downloadLimit > 0) {
    ui.info(t('limitCustom', downloadLimit));
  } else if (!pro) {
    ui.info(t('limitFree', 50));
  }

  // Ask comment limit separately (now tasks is defined)
  let commentLimit = 10;
  if (tasks.includes('comments') && pro) {
    const { cl } = await inquirer.prompt([{
      type:     'input',
      name:     'cl',
      message:  ui.C.cyan(t('askCommentLimit')),
      prefix:   ' ',
      default:  '10',
      validate: v => (!isNaN(parseInt(v)) && parseInt(v) > 0) ? true : t('invalidLimit'),
      filter:   v => parseInt(v) || 10,
    }]);
    commentLimit = cl;
    ui.info(t('commentLimitInfo', commentLimit));
  }

  // ── Step 5: confirm and run ───────────────────────────────────────────────
  ui.newline();
  const { confirm } = await inquirer.prompt([{
    type:    'confirm',
    name:    'confirm',
    message: ui.C.cyan(t('confirmExtract', username)),
    prefix:  ' ',
    default: true,
  }]);

  if (!confirm) { ui.warn(t('cancelled')); return mainMenu({ plan: isPro() ? 'pro' : 'free', valid: isPro() }); }

  try {
    const result = await extractProfile(username, {
      profileData,
      sessionId,
      photos:        mediaType === 'photos' || mediaType === 'both',
      reels:         mediaType === 'reels'  || mediaType === 'both',
      stories:       tasks.includes('stories'),
      captions:      tasks.includes('captions'),
      comments:      tasks.includes('comments'),
      commentLimit:  commentLimit || 10,
      followers:     tasks.includes('followers'),
      following:     tasks.includes('following'),
      downloadLimit: downloadLimit || 0,
      proxy:         proxy     || undefined,
      outputDir:     outputDir || undefined,
    });
    if (!result.aborted) printSummary(result);
  } catch (e) {
    ui.err('Extraction failed: ' + e.message);
  }

  ui.newline();
  const { again } = await inquirer.prompt([{
    type:    'confirm',
    name:    'again',
    message: ui.C.cyan(t('extractAnother')),
    prefix:  ' ',
    default: false,
  }]);

  if (again) await extractFlow(pro);
  else       await mainMenu({ plan: isPro() ? 'pro' : 'free', valid: isPro() });
}

// ─── API Key menu ─────────────────────────────────────────────────────────────
async function apiKeyMenu() {
  const license = require('./license');
  ui.sectionHeader(t('apiKeyMgmt'));

  const currentKey = license.readApiKey();
  if (currentKey) ui.info(t('currentKey', maskKey(currentKey)));
  else             ui.warn(t('noKey'));

  ui.newline();

  const { action } = await inquirer.prompt([{
    type:    'list',
    name:    'action',
    message: ui.C.cyan(t('chooseAction')),
    prefix:  ' ',
    choices: [
      { name: ui.C.white('  ' + t('setKey').trim()),    value: 'set' },
      ...(currentKey ? [{ name: ui.C.red('  ' + t('removeKey').trim()), value: 'remove' }] : []),
      { name: ui.C.gray('  ' + t('backMenu').trim()),   value: 'back' },
    ],
  }]);

  if (action === 'back') { await mainMenu({ plan: isPro() ? 'pro' : 'free', valid: isPro() }); return; }

  if (action === 'remove') {
    const { sure } = await inquirer.prompt([{
      type:    'confirm',
      name:    'sure',
      message: ui.C.red(t('confirmRemove')),
      prefix:  ' ',
      default: false,
    }]);
    if (sure) { license.removeApiKey(); ui.ok(t('keyRemoved')); }
    return;
  }

  const { newKey } = await inquirer.prompt([{
    type:     'input',
    name:     'newKey',
    message:  ui.C.cyan(t('enterKey')),
    prefix:   ' ',
    validate: v => /^IGX-[A-Fa-f0-9]{8}-[A-Fa-f0-9]{8}-[A-Fa-f0-9]{8}$/i.test(v.trim())
      ? true : t('invalidFormat'),
  }]);

  ui.info(t('validatingKey'));
  const result = await license.validateKey(newKey.trim());

  if (result.offline) {
    ui.warn(t('keySavedOffline'));
    license.saveApiKey(newKey.trim());
    return;
  }

  if (result.valid) {
    license.saveApiKey(newKey.trim());
    ui.newline();
    ui.infoBox(ui.proGradient(t('proActivated')), 'success');
  } else {
    ui.err(t('keyInvalidNotSaved', result.message));
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
function printSummary(result) {
  ui.sectionHeader(t('extractComplete'));

  const rows = [
    [t('summaryUsername'), '@' + result.username],
    [t('summaryOutput'),   result.outputDir],
  ];
  if (result.summary.images    != null) rows.push([t('summaryImages'),    String(result.summary.images)]);
  if (result.summary.reels     != null) rows.push(['Reels',               String(result.summary.reels)]);
  if (result.summary.stories   != null) rows.push([t('summaryStories'),   String(result.summary.stories)]);
  if (result.summary.captions  != null) rows.push(['Captions/Textos',     String(result.summary.captions)]);
  if (result.summary.comments  != null) rows.push([t('summaryComments'),  String(result.summary.comments)]);
  if (result.summary.followers != null) rows.push([t('summaryFollowers'), String(result.summary.followers)]);
  if (result.summary.following != null) rows.push([t('summaryFollowing'), String(result.summary.following)]);
  

  ui.statsTable(rows);
  ui.newline();
  ui.ok(t('allDone', result.outputDir));
}

function maskKey(key) {
  const p = key.split('-');
  return p.length < 4 ? key.slice(0, 8) + '...' : `${p[0]}-${p[1]}-****-****`;
}

module.exports = { mainMenu, extractFlow, apiKeyMenu };
