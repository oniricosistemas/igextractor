'use strict';

const path  = require('path');
const fs    = require('fs');
const { pipeline } = require('stream');
const axios = require('axios');
const ui    = require('./ui');
const { isPro, readSessionId, saveSessionId } = require('./license');
const { t }          = require('./i18n');
const { dbg }        = require('./debug');

// Utility to parse Instagram's number formats (e.g., "1.2M", "7,890", "1.200" in EU)
function parseNum(s) {
  if (!s) return 0;
  s = s.trim();
  const m = s.match(/^([\d.,]+)\s*([KMBkmb]?)$/);
  if (!m) return 0;
  let numStr = m[1];
  const suffix = m[2].toLowerCase();
  if (suffix) {
    numStr = numStr.replace(/[.,](?=\d{3}$)/, '');
    numStr = numStr.replace(/,/g, '');
  } else {
    numStr = numStr.replace(/[.,](?=\d{3})/g, '');
    numStr = numStr.replace(/,/g, '.');
  }
  const n = parseFloat(numStr) || 0;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[suffix] || 1;
  return Math.round(n * mult);
}

function deepFindUser(obj, targetUsername) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.username && (obj.pk || obj.id)) {
    if (String(obj.username).toLowerCase() === String(targetUsername).toLowerCase()) return obj;
  }
  for (const key in obj) {
    try {
      const val = obj[key];
      if (val && typeof val === 'object') {
        const found = deepFindUser(val, targetUsername);
        if (found) return found;
      }
    } catch (e) {}
  }
  return null;
}

function extractMedia(obj, result) {
  if (!obj || typeof obj !== 'object') return;
  if (!obj.carousel_parent_id && (obj.shortcode || obj.code || (obj.pk && obj.edge_media_to_caption) || (obj.pk && obj.media_type && obj.taken_at))) {
    const code = getPostCode(obj);
    if (code) {
      if (!result.posts.some(p => getPostCode(p) === code)) {
        dbg('[capture] CAPTURED POST OBJECT:', JSON.stringify(obj).substring(0, 300) + '...');
        result.posts.push(obj);
      }
    }
  }
  for (const key in obj) {
    try {
      const val = obj[key];
      if (val && typeof val === 'object') extractMedia(val, result);
    } catch (e) {}
  }
}


let _debugBase = null;

const FREE_LIMIT  = 10;
const IG_BASE     = 'https://www.instagram.com';
const sleep       = ms => new Promise(r => setTimeout(r, ms));

// ─── Browser singleton ────────────────────────────────────────────────────────
let _browser        = null;
let _browserPromise = null;
let _page           = null;
let _sessionId      = '';

/**
 * Locate Chromium when running as a pkg-compiled binary.
 * The build script places chromium/ next to the executable.
 * Returns executablePath string or undefined (puppeteer uses its own default).
 */
function _findBundledChromium() {
  try {
    if (!process.pkg) return undefined;
    const exeDir = path.dirname(process.execPath);
    const chromiumDir = path.join(exeDir, 'chromium');
    if (!fs.existsSync(chromiumDir)) return undefined;

    // Check if the binary is directly in chromium/ (flat layout from CI)
    const directCandidates = [
      path.join(chromiumDir, 'chrome.exe'),
      path.join(chromiumDir, 'chrome'),
      path.join(chromiumDir, 'Chromium'),
    ];
    for (const c of directCandidates) {
      if (fs.existsSync(c)) return c;
    }

    // Legacy nested layout candidates
    const nestedCandidates = [
      path.join(chromiumDir, 'chrome-win', 'chrome.exe'),
      path.join(chromiumDir, 'chrome-win64', 'chrome.exe'),
      path.join(chromiumDir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      path.join(chromiumDir, 'chrome-linux', 'chrome'),
      path.join(chromiumDir, 'chrome-linux64', 'chrome'),
    ];
    for (const c of nestedCandidates) {
      if (fs.existsSync(c)) return c;
    }

    // Deep walk fallback
    return _walkForChrome(chromiumDir, 5);
  } catch { return undefined; }
}

function _walkForChrome(dir, depth) {
  if (depth < 0) return undefined;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && /^(chrome|chromium)(\.exe)?$/i.test(entry.name)) return full;
      if (entry.isDirectory()) {
        const found = _walkForChrome(full, depth - 1);
        if (found) return found;
      }
    }
  } catch { /* ignore permission errors */ }
  return undefined;
}

async function launchBrowser(headless = true) {
  if (_browserPromise) return _browserPromise;
  const puppeteer = require('puppeteer');

  const launchOpts = {
    headless: headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
    ],
    defaultViewport: { width: 1920, height: 1080 },
  };
  const bundled = _findBundledChromium();
  if (bundled) {
    launchOpts.executablePath = bundled;
    dbg('[DEBUG] Using bundled Chromium:', bundled);
  } else {
    dbg('[DEBUG] No bundled Chromium found, using puppeteer default. process.pkg=', !!process.pkg, 'execPath=', process.execPath);
  }
  _browserPromise = (async () => {
    try {
      _browser = await puppeteer.launch(launchOpts);
      return _browser;
    } catch (e) {
      _browserPromise = null;
      throw e;
    }
  })();
  return _browserPromise;
}

async function getPage() {
  // Path A: cached _page exists → just set session cookie and return
  // Path B: first call → launch browser, create page, navigate with session
  if (_page) {
    if (_sessionId) {
      await _page.setCookie({
        name: 'sessionid', value: _sessionId,
        domain: '.instagram.com', path: '/',
        httpOnly: true, secure: true,
      });
    }
    return _page;
  }
  await launchBrowser();
  _page = await _browser.newPage();

  try {
    const BLOCK_RES = (process.env.IG_BLOCK_RESOURCES || 'true') !== 'false';
    const DEFAULT_BLOCKED_RESOURCES = ['image','stylesheet','font','manifest','ping','other'];
    if (BLOCK_RES) {
      await _page.setRequestInterception(true);
      _page.on('request', (req) => {
        try {
          const type = req.resourceType();
          if (DEFAULT_BLOCKED_RESOURCES.includes(type)) return req.abort();
        } catch (e) {}
        try { req.continue(); } catch (e) { /* ignore */ }
      });
      dbg('[getPage] request interception enabled - blocking:', DEFAULT_BLOCKED_RESOURCES.join(', '));
    }
  } catch (e) {
    dbg('[getPage] request interception setup failed:', e && e.message);
  }

  await _page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-AR', 'es', 'en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3] });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => ({
        brands: [{ brand: 'Not A Brand', version: '99' }, { brand: 'Chromium', version: '122' }, { brand: 'Google Chrome', version: '122' }],
        mobile: false,
        platform: 'Windows'
      })
    });
  });

  await _page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  );
  
  // Step 1: navigate to instagram.com without session so browser gets baseline cookies (csrftoken, mid, etc.)
  try {
    await _page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(1500);
    const url1 = _page.url();
    if (!url1 || !url1.includes('instagram.com')) {
      throw new Error(t('navFailFirstGoto'));
    }
  } catch (e) {
    if (e.message && e.message.includes('Navigation failed')) throw e;
  }

  if (_sessionId) {
    // Step 2: inject sessionid AFTER baseline navigation so Instagram sees it as a cookie update, not a foreign cookie
    await _page.setCookie({
      name: 'sessionid', value: _sessionId,
      domain: '.instagram.com', path: '/',
      httpOnly: true, secure: true,
      sameSite: 'Lax',
    });
    dbg('[getPage] sessionid cookie set. All cookies:', (await _page.cookies()).map(c => c.name).join(', '));
    // Step 3: reload so Instagram picks up the session
    try {
      await _page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(1500);
      const url2 = _page.url();
      if (!url2 || !url2.includes('instagram.com')) {
        throw new Error(t('navFailSessionGoto'));
      }
    } catch (e) {
      if (e.message && e.message.includes('Navigation failed')) throw e;
    }
  }

  return _page;
}

async function closeBrowser() {
  try {
    if (_browser) { await _browser.close(); _browser = null; _page = null; _browserPromise = null; }
  } catch {}
}

// Clean up Chrome on process exit to prevent zombie processes
// process.on('exit') is synchronous — can't await, use process.kill()
process.on('exit', () => {
  if (_browser && _browser.process) {
    try { _browser.process().kill('SIGTERM'); } catch (e) {}
    _browser = null; _page = null;
  }
});

function getPostCode(node) {
  return node.code || node.shortcode || node.pk || node.id || null;
}

function getPostTimestamp(node) {
  if (!node || typeof node !== 'object') return 0;
  const n = node;
  const pick = (v) => (v === undefined || v === null) ? 0 : Number(v) || 0;
  const candidates = [
    n.taken_at, n.taken_at_timestamp, n.taken_at_ms, n.timestamp, n.created_time, n.date, n.uploaded_time, n.reel_media_taken_at
  ];
  if (n.media && typeof n.media === 'object') {
    candidates.push(n.media.taken_at, n.media.taken_at_timestamp, n.media.taken_at_ms, n.media.timestamp);
  }
  if (n.edge_sidecar_to_children && Array.isArray(n.edge_sidecar_to_children.edges) && n.edge_sidecar_to_children.edges.length) {
    for (const e of n.edge_sidecar_to_children.edges) {
      if (e && e.node) {
        candidates.push(e.node.taken_at, e.node.taken_at_timestamp, e.node.taken_at_ms, e.node.timestamp);
      }
    }
  }
  if (n.edge_media_to_caption && Array.isArray(n.edge_media_to_caption.edges) && n.edge_media_to_caption.edges.length) {
    const cap = n.edge_media_to_caption.edges[0] && n.edge_media_to_caption.edges[0].node;
    if (cap && cap.taken_at) candidates.push(cap.taken_at);
  }

  for (const c of candidates) {
    const v = pick(c);
    if (v && v > 0) return v;
  }
  return 0;
}

function isReel(node) {
  if (!node) return false;
  if (node.__typename === 'GraphVideo' && node.product_type === 'clips') return true;
  if (node.media_type === 2 && node.product_type === 'clips') return true;
  if (node.video_versions && node.video_versions.length) return true;
  if (node.is_video) return true;
  return false;
}

function getVideoUrl(node) {
  if (!node) return null;
  if (node.video_versions && node.video_versions.length) return node.video_versions[0].url;
  if (node.video_url) return node.video_url;
  const children = node.edge_media_to_children?.edges;
  const first = children?.[0];
  if (first?.node?.video_url) return first.node.video_url;
  return null;
}

function __getImageUrl(node) {
  if (!node) return null;
  if (node.image_versions2 && node.image_versions2.candidates && node.image_versions2.candidates.length) {
    return node.image_versions2.candidates[0].url;
  }
  if (node.display_url)    return node.display_url;
  if (node.thumbnail_src)  return node.thumbnail_src;
  const children = node.edge_media_to_children?.edges;
  const first = children?.[0];
  if (first?.node?.display_url) return first.node.display_url;
  return null;
}

function getCarouselItems(node) {
  if (!node) return [];
  if (node.carousel_media && node.carousel_media.length) return node.carousel_media;
  if (node.edge_sidecar_to_children && node.edge_sidecar_to_children.edges) {
    return node.edge_sidecar_to_children.edges.map(e => e.node);
  }
  return [node];
}

async function fetchProfileFromApi(username) {
  if (!_sessionId) return null;
  const apiUrl = `${IG_BASE}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;

  // Collect baseline cookies from the browser (csrftoken, mid, ig_did, datr, etc.)
  // These are required alongside sessionid to avoid 429s on direct API calls
  let cookieHeader = `sessionid=${_sessionId}`;
  try {
    const page = await getPage(); // Primary path: Browser required for this operation
    const cookies = await page.cookies('https://www.instagram.com');
    const cookieMap = {};
    for (const c of cookies) cookieMap[c.name] = c.value;
    // Always override sessionid with ours, merge the rest
    cookieMap['sessionid'] = _sessionId;
    cookieHeader = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
    dbg('[profileApi] cookie header built with:', Object.keys(cookieMap).join(', '));
  } catch (e) {
    dbg('[profileApi] could not get browser cookies, using sessionid only:', e.message);
  }

  try {
    dbg('[profileApi] trying axios:', apiUrl);
    const resp = await axios.get(apiUrl, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${IG_BASE}/${username}/`,
      },
      timeout: 15000,
    });
    dbg('[DEBUG] profileApi axios status:', resp.status, 'keys:', Object.keys(resp.data || {}).join(', '));
    const json = resp.data;
    if (typeof json === 'object' && json) {
      dbg('[profileApi] axios response keys:', Object.keys(json).join(', '));
      const user = (json.data && json.data.user) || json.user || null;
      if (user && (user.pk || user.id)) {
        dbg('[profileApi] FOUND user via axios:', user.username);
        return user;
      }
    }
  } catch (e) {
    dbg('[DEBUG] profileApi axios failed:', e.message, 'status:', e.response && e.response.status);
  }

  try {
    const page = await getPage();
    dbg('[profileApi] trying browser fetch:', apiUrl);

    // Inject sessionid cookie so the fetch is authenticated even on a cold browser
    if (_sessionId) {
      try {
        await page.setCookie({
          name: 'sessionid', value: _sessionId,
          domain: '.instagram.com', path: '/', httpOnly: true, secure: true,
        });
      } catch (e) {
        dbg('[profileApi] setCookie failed:', e.message);
      }
    }

    // Navigate to instagram.com first so cookies apply (fetch is same-origin)
    const currentUrl = page.url();
    if (!currentUrl.includes('instagram.com')) {
      dbg('[profileApi] navigating to instagram.com to establish origin');
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    }

    const json = await page.evaluate(new Function('url', `
      return (async () => {
        try {
          const r = await fetch(url, {
            headers: {
              'X-IG-App-ID': '936619743392459',
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': '*/*',
            },
            credentials: 'include',
          });
          if (!r.ok) return { error: r.status };
          return await r.json();
        } catch (err) {
          return { error: err.message };
        }
      })();
    `), apiUrl);
    if (json && !json.error) {
      dbg('[profileApi] browser fetch response keys:', Object.keys(json).join(', '));
      const user = (json.data && json.data.user) || json.user || null;
      if (user && (user.pk || user.id)) {
        dbg('[profileApi] FOUND user via browser fetch:', user.username);
        return user;
      } else {
        dbg('[DEBUG] profileApi browser fetch: got json but no user. keys:', Object.keys(json).join(', '), '| json.data:', JSON.stringify(json.data)?.substring(0, 200));
      }
    } else {
      dbg('[DEBUG] profileApi browser fetch error:', json && json.error);
    }
  } catch (e) {
    dbg('[profileApi] browser fetch failed:', e.message);
  }

  return null;
}

async function buildPostsFromShortcodes(shortcodes = [], limit = 50, options = {}) {
  const results = [];
  if (!shortcodes || !shortcodes.length) return results;
  const page = await getPage(); // Primary path: Browser required for this operation
  const max = Math.min(shortcodes.length, limit || shortcodes.length);
  for (let i = 0; i < max; i++) {
    const code = shortcodes[i];
    try {
      let json = null;
      let lastHtml = null;
      
      const apiInfoUrl = `${IG_BASE}/api/v1/media/${code}/info/`;
      dbg('[rebuild] trying API info fetch for', code, apiInfoUrl);
      try {
        json = await page.evaluate(new Function('url', `
          return (async () => {
            const r = await fetch(url, { 
              credentials: 'include', 
              headers: { 'X-IG-App-ID': '936619743392459' }
            });
            if (!r.ok) return null;
            return await r.json();
          })();
        `), apiInfoUrl);
      } catch (e) { dbg('[rebuild] API info fetch error:', e.message); }

      if (!json) {
        const pUrl = `${IG_BASE}/p/${code}/?__a=1&__d=dis`;
        dbg('[rebuild] trying /p/ fallback for', code, pUrl);
        try {
          json = await page.evaluate(new Function('url', `
            return (async () => {
              const r = await fetch(url, { credentials: 'include' });
              if (!r.ok) return null;
              return await r.json();
            })();
          `), pUrl);
        } catch (e) { dbg('[rebuild] /p/ fallback error:', e.message); }
      }

      if (!json) {
        const reelUrl = `${IG_BASE}/reel/${code}/?__a=1&__d=dis`;
        dbg('[rebuild] trying /reel/ fallback for', code, reelUrl);
        try {
          json = await page.evaluate(new Function('url', `
            return (async () => {
              const r = await fetch(url, { credentials: 'include' });
              if (!r.ok) return null;
              return await r.json();
            })();
          `), reelUrl);
        } catch (e) { dbg('[rebuild] /reel/ fallback error:', e.message); }
      }

      if (!json) {
        const prevUrl = page.url();
        const fetchUrl = `${IG_BASE}/p/${code}/`;
        const response = await page.goto(fetchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        lastHtml = await response.text();
        if (prevUrl && prevUrl.includes('instagram.com')) {
          await page.goto(prevUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        }
        throw new Error(t('noJsonPayload'));
      }

      if (options.debug) {
        await saveDebugFile('post_payloads', `${code}_${Date.now()}.json`, json);
      }

      const node = json.items ? json.items[0] : (json.data ? json.data : json);
      if (node) {
        results.push(node);
        dbg('[rebuild] built post node for', code);
      }
    } catch (e) {
      dbg('[rebuild] failed for', code, e.message);
      if (options.debug && typeof lastHtml === 'string') {
        await saveDebugFile('post_payloads', `${code}_fail_${Date.now()}.html`, lastHtml);
      }
    }
  }
  return results;
}

async function fetchPostsFromGraphql(userId, limit = 50, options = {}, exampleUrls = []) {
  const results = [];
  if (!userId) return results;
  if (!Array.isArray(exampleUrls)) exampleUrls = [];
  if (!exampleUrls.length) return results;
  const url = require('url');
  let parsed;
  try {
    parsed = new URL(exampleUrls[0]);
  } catch (e) {
    return results;
  }

  const qp = Object.fromEntries(parsed.searchParams.entries());
  const query_hash = qp.query_hash || qp.query_id || null;
  let variables = null;
  if (qp.variables) {
    try { variables = JSON.parse(qp.variables); } catch (e) { variables = null; }
  }
  if (!variables) variables = { id: String(userId), first: 12 };

  const axiosInstance = axios.create({ timeout: 15000, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  if (_sessionId || process.env.IGX_SESSION || process.env.IG_SESSION_ID) axiosInstance.defaults.headers.Cookie = `sessionid=${_sessionId || process.env.IGX_SESSION || process.env.IG_SESSION_ID}`;

  let hasNext = true;
  let end_cursor = variables.after || null;
  while (hasNext && results.length < limit) {
    try {
      const vars = Object.assign({}, variables, { id: String(userId) });
      if (end_cursor) vars.after = end_cursor;
      const params = { variables: JSON.stringify(vars) };
      if (qp.query_hash) params.query_hash = qp.query_hash;
      if (qp.query_id) params.query_id = qp.query_id;

      const endpoint = `${IG_BASE}/graphql/query/`;
      dbg('[graphql] fetching', endpoint, params);
      const resp = await axiosInstance.get(endpoint, { params });
      const json = resp.data;
      if (!json) break;
      const timeline = (json.data && json.data.user && json.data.user.edge_owner_to_timeline_media) ||
                        (json.data && json.data.xdt_api__v1__feed__user_timeline_graphql_connection);
      if (timeline && timeline.edges) {
        for (const e of timeline.edges) {
          if (e && e.node) results.push(e.node);
          if (results.length >= limit) break;
        }
        hasNext = timeline.page_info && timeline.page_info.has_next_page;
        end_cursor = timeline.page_info && timeline.page_info.end_cursor;
      } else {
        if (json.items && Array.isArray(json.items)) {
          for (const it of json.items) { results.push(it); if (results.length >= limit) break; }
          hasNext = false;
        } else {
          hasNext = false;
        }
      }
    } catch (e) {
      dbg('[graphql] request failed:', e && e.message);
      break;
    }
  }

  if (options.debug && results.length) {
    try { await saveDebugFile('grid_payloads', `graphql_retrieved_${userId}_${Date.now()}.json`, { userId, count: results.length, sample: results.slice(0,5) }); } catch (e) {}
  }
  return results;
}

async function navigateAndCapture(username, options = {}) {
  const page   = await getPage(); // Primary path: Browser required for this operation
  const result = { user: null, posts: [], gridShortcodes: [], domShortcodes: [], graphqlQueries: [] };

  const apiUser = await fetchProfileFromApi(username);
  if (apiUser) {
    result.user = apiUser;
    dbg('[capture] profile loaded from API, skipping DOM intercept for metadata');
  }
  
  const handler = async (response) => {
    try {
      const url = response.url();
      const status = response.status();
      if (status !== 200) return;
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      let json = null;
      try { json = await response.json(); } catch (e) { json = null; }
      if (!json) return;

      if (options && options.debug) {
          await saveDebugFile('grid_payloads', `${options.username || username || 'unknown'}_grid_${Date.now()}.json`, json).catch(() => {});
          try {
            const safeName = `network_${(url && url.replace(/[^a-z0-9_\-\.]/gi, '_').slice(0,120))}_${Date.now()}.json`;
            await saveDebugFile('network', safeName, { url, status, json }).catch(() => {});
          } catch (e) {}
        }

      const timeline = (json.data && json.data.user && json.data.user.edge_owner_to_timeline_media) ||
                        (json.data && json.data.xdt_api__v1__feed__user_timeline_graphql_connection) ||
                        (json.items && Array.isArray(json.items) && { edges: json.items.map(i => ({ node: i })) });
      if (timeline && timeline.edges) {
        dbg('[capture] Detected grid payload, extracting shortcodes...');
        const edges = timeline.edges;
        const shortcodes = edges.map(e => getPostCode(e.node)).filter(Boolean);
        if (shortcodes.length > 0) {
          result.gridShortcodes = shortcodes;
          result.gridShortcodesIndexMap = new Map(shortcodes.map((s, i) => [s, i]));
          result.gridPkIndexMap = new Map();
          edges.forEach((e, i) => {
            const pk = e.node && (e.node.pk || e.node.id);
            if (pk) result.gridPkIndexMap.set(String(pk), i);
          });
          dbg('[capture] Grid captured: ', shortcodes.length, 'items');
        }
      }

      try {
        if (url && url.includes('/graphql/query/')) {
          result.graphqlQueries = result.graphqlQueries || [];
          if (!result.graphqlQueries.includes(url)) result.graphqlQueries.push(url);
        }
      } catch (e) {}

      const foundUser = deepFindUser(json, username);
      if (foundUser) {
        const foundCount = (foundUser.follower_count || (foundUser.edge_followed_by && foundUser.edge_followed_by.count) || 0);
        const currentCount = result.user ? (result.user.follower_count || (result.user.edge_followed_by && result.user.edge_followed_by.count) || 0) : 0;
        // Update if we found a better user (more followers than current, or current has none)
        if (!result.user || foundCount > currentCount) {
          dbg('[DIAG] capture updating result.user:', foundUser.username, '| followers:', foundCount, '| posts:', foundUser.media_count || (foundUser.edge_owner_to_timeline_media && foundUser.edge_owner_to_timeline_media.count) || 0);
          result.user = foundUser;
        }
      }

      extractMedia(json, result);
    } catch (err) {
      // swallow
    }
  };

  page.on('response', handler);
  let reqFinishedHandler = null;
  if (options && options.debug) {
    reqFinishedHandler = async (request) => {
      try {
        const reqUrl = request.url();
        const method = request.method();
        const headers = request.headers();
        if (headers['Cookie']) { headers['Cookie'] = headers['Cookie'].replace(/sessionid=[^;]+/, 'sessionid=***'); }
        const postData = request.postData ? request.postData() : null;
        const safeName = `request_${(reqUrl && reqUrl.replace(/[^a-z0-9_\-\.]/gi, '_').slice(0,120))}_${Date.now()}.json`;
        await saveDebugFile('network', safeName, { url: reqUrl, method, headers, postData }).catch(() => {});
      } catch (e) {}
    };
    page.on('requestfinished', reqFinishedHandler);
  }

  try {
    dbg('[DEBUG] navigateAndCapture: goto', username);
    await page.goto(`${IG_BASE}/${username}/`, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(async (gotoErr) => {
      dbg('[DEBUG] goto failed:', gotoErr.message);
    });
    dbg('[DEBUG] goto1 url:', page.url().substring(0, 80));
    // If redirected away from profile (bot detection), wait longer and retry once
    if (!page.url().includes(`/${username}`)) {
      dbg('[DEBUG] redirected, retrying after 5s');
      await sleep(5000);
      await page.goto(`${IG_BASE}/${username}/`, { waitUntil: 'domcontentloaded', timeout: 35000 });
      dbg('[DEBUG] goto2 url:', page.url().substring(0, 80));
    }
    // Give JS/XHR a moment to fire after DOM is ready
    await sleep(3000);

    // Skip login-redirect check if we reached the profile page
    if (!page.url().includes(`/${username}`)) {
      try {
        const loginRedirect = await page.evaluate(new Function(`
          const url = location.href;
          const title = document.title;
          const html = document.documentElement.innerHTML;
          const isLoginUrl = url.includes('/accounts/login');
          const isLoginTitle = title === 'Log in • Instagram' || title === 'Instagram - Log in';
          const hasLoginForm = document.querySelector('form input[name="username"]') !== null;
          return (isLoginUrl || isLoginTitle || hasLoginForm) ? { url, title, html } : null;
        `));
        if (loginRedirect && options.debug) {
          dbg('[capture] LOGIN REDIRECT DETECTED');
          const timestamp = Date.now();
          await saveDebugFile('dom_payloads', `login_redirect_${username}_${timestamp}.html`, loginRedirect.html);
          await saveDebugFile('dom_payloads', `login_redirect_${username}_${timestamp}.json`, { url: loginRedirect.url, title: loginRedirect.title });
        }
        if (loginRedirect) {
          throw new Error('login-redirect');
        }
      } catch (e) {
        if (e.message === 'login-redirect') throw e;
        dbg('[capture][login-detect] error:', e.message);
      }
    }

    const start = Date.now();
    const timeoutMs = 25000; 
    let lastScroll = 0;

    while ((Date.now() - start) < timeoutMs) {
      const elapsed = Date.now() - start;
      if (elapsed - lastScroll >= 3000) {
        try {
          await page.evaluate('window.scrollBy(0, 1200)');
          dbg('[capture] scrolling to force feed load...');
        } catch (e) {}
        lastScroll = elapsed;
      }
      if (result.user && result.posts.length >= (options.scanLimit || 10)) {
        dbg('[capture] sufficient posts captured, stopping scroll.');
        break;
      }
      await sleep(500);
    }
  } finally {
    page.off('response', handler);
    if (reqFinishedHandler) page.off('requestfinished', reqFinishedHandler);
  }

    if (result.gridShortcodes.length < 6) {
      dbg('[capture] Grid shortcodes empty or below threshold (6), trying DOM extraction...');
      try {
        const domCodes = await page.evaluate(new Function(`
          const codes = new Set();
          const links = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
          links.forEach(function(a) {
            const href = a.getAttribute('href') || '';
            const match = href.match(/\\/(p|reel)\\/([^\\/?#]+)/);
            if (match && match[2]) codes.add(match[2]);
          });
          document.querySelectorAll('[data-shortcode]').forEach(function(el) {
            const code = el.getAttribute('data-shortcode');
            if (code) codes.add(code);
          });
          return Array.from(codes);
        `));
        if (domCodes.length > 0) {
          result.domShortcodes = domCodes;
          dbg('[capture] DOM extraction found', domCodes.length, 'shortcodes');
          if (options && options.debug) {
            await saveDebugFile('dom_payloads', `dom_shortcodes_${username}_${Date.now()}.json`, domCodes).catch(() => {});
          }
        }
      } catch (e) {
        dbg('[capture] DOM extraction failed:', e.message);
      }
    }

  if (!result.user) {
    try {
      dbg('[capture] attempting script/JSON embedded fallback');
      const scriptUser = await page.evaluate(new Function('targetUsername', `
        function deepFind(obj, uname) {
          if (!obj || typeof obj !== 'object') return null;
          if (obj.username && (obj.pk || obj.id) &&
              obj.username.toLowerCase() === uname.toLowerCase()) return obj;
          for (const k in obj) {
            const r = deepFind(obj[k], uname);
            if (r) return r;
          }
          return null;
        }
        if (window._sharedData) {
          const u = deepFind(window._sharedData, targetUsername);
          if (u) return u;
        }
        if (window.__additionalDataLoaded) {
          for (const key of Object.keys(window.__additionalDataLoaded)) {
            const u = deepFind(window.__additionalDataLoaded[key], targetUsername);
            if (u) return u;
          }
        }
        const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));
        for (const s of scripts) {
          try {
            const json = JSON.parse(s.textContent);
            const u = deepFind(json, targetUsername);
            if (u) return u;
          } catch {}
        }
        const allScripts = Array.from(document.querySelectorAll('script:not([src])'));
        for (const s of allScripts) {
          const txt = s.textContent || '';
          if (!txt.includes(targetUsername)) continue;
          const matches = txt.match(/\\{[^{}]{0,5000}"username"\\s*:\\s*"[^"]+"/g) || [];
          for (const m of matches) {
            try {
              const startIdx = txt.indexOf(m);
              let depth = 0, i = startIdx, end = -1;
              for (; i < Math.min(startIdx + 20000, txt.length); i++) {
                if (txt[i] === '{') depth++;
                else if (txt[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
              }
              if (end === -1) continue;
              const blob = JSON.parse(txt.substring(startIdx, end + 1));
              const u = deepFind(blob, targetUsername);
              if (u) return u;
            } catch {}
          }
        }
        return null;
      `), username).catch(() => null);

      if (scriptUser) {
        dbg('[capture] script fallback FOUND user:', scriptUser.username);
        result.user = scriptUser;
      } else {
        dbg('[capture] script fallback: user not found in page scripts');
      }
    } catch (e) {
      dbg('[capture] script fallback failed:', e && e.message);
    }
  }

  // ── Layer 1: Parse og:description from raw HTML (fast, no wait) ──────────
  try {
    const rawHtml = await page.content();
    const ogDescMatch  = rawHtml.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
    const ogTitleMatch = rawHtml.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
    const ogImageMatch = rawHtml.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i);
    dbg('[capture] raw html og:description:', ogDescMatch ? ogDescMatch[1].substring(0, 80) : 'NOT FOUND');
    if (ogDescMatch || ogTitleMatch) {
      const ogDesc  = ogDescMatch  ? ogDescMatch[1]  : null;
      const ogTitle = ogTitleMatch ? ogTitleMatch[1] : null;
      const ogImage = ogImageMatch ? ogImageMatch[1] : null;

      const content = ogDesc || '';
      const followers = content.match(/([\d.,]+[KMBkmb]?)\s*(?:Followers?|seguidores)/i);
      const following = content.match(/([\d.,]+[KMBkmb]?)\s*(?:Following|seguidos)/i);
      const posts     = content.match(/([\d.,]+[KMBkmb]?)\s*(?:Posts?|publicaciones)/i);

      const metaCounts = {
        follower_count:  followers ? parseNum(followers[1]) : 0,
        following_count: following ? parseNum(following[1]) : 0,
        media_count:     posts     ? parseNum(posts[1])     : 0,
      };

      let full_name = '';
      if (ogTitle) {
        const nameMatch = ogTitle.match(/^(.+?)\s*\(@/);
        if (nameMatch) full_name = nameMatch[1].trim();
      }

      if (!result.user) {
        dbg('[capture] raw html: building minimal user from meta tags');
        result.user = {
          username:    username,
          full_name:   full_name,
          pk:          null,
          id:          null,
          is_private:  false,
          is_verified: false,
          profile_pic_url: ogImage || '',
        };
      }

      if (metaCounts.follower_count || metaCounts.following_count || metaCounts.media_count) {
        dbg('[capture] raw html og counts:', metaCounts, '| current follower_count:', result.user.follower_count);
        if (metaCounts.follower_count)  result.user.follower_count  = metaCounts.follower_count;
        if (metaCounts.following_count) result.user.following_count = metaCounts.following_count;
        if (metaCounts.media_count)     result.user.media_count     = metaCounts.media_count;
        if (!result.user.full_name && full_name) result.user.full_name = full_name;
        dbg('[capture] after raw html fill: follower_count:', result.user.follower_count);
      }
    }
  } catch (e) {
    dbg('[capture] raw html og parse failed:', e.message);
  }

  // ── Layer 2: try page.evaluate (wait for DOM render) if we still have no counters ──
  if (result.user && !result.user.follower_count) {
    try {
      await page.waitForSelector('meta[property="og:description"]', { timeout: 15000 }).catch(() => {});
      const ogData = await page.evaluate(new Function(`
        const desc  = document.querySelector('meta[property="og:description"]');
        const title = document.querySelector('meta[property="og:title"]');
        const image = document.querySelector('meta[property="og:image"]');
        return {
          desc:  desc  ? desc.getAttribute('content')  : null,
          title: title ? title.getAttribute('content') : null,
          image: image ? image.getAttribute('content') : null,
        };
      `));
      dbg('[capture] evaluate og:description:', ogData.desc ? ogData.desc.substring(0, 80) : 'NOT FOUND');
      if (ogData.desc) {
        // full_name from og:title
        let full_name = '';
        if (ogData.title) {
          const nm = ogData.title.match(/^(.+?)\s*\(@/);
          if (nm) full_name = nm[1].trim();
        }
        const content = ogData.desc || '';
        const ff = content.match(/([\d.,]+[KMBkmb]?)\s*(?:Followers?|seguidores)/i);
        const fg = content.match(/([\d.,]+[KMBkmb]?)\s*(?:Following|seguidos)/i);
        const pp = content.match(/([\d.,]+[KMBkmb]?)\s*(?:Posts?|publicaciones)/i);
        if (ff) result.user.follower_count  = parseNum(ff[1]);
        if (fg) result.user.following_count = parseNum(fg[1]);
        if (pp) result.user.media_count     = parseNum(pp[1]);
        if (!result.user.full_name && full_name) result.user.full_name = full_name;
        dbg('[capture] evaluate fill: follower_count:', result.user.follower_count);
      }
    } catch (e) {
      dbg('[capture] evaluate og fallback failed:', e.message);
    }
  }

  // ── Layer 3: fetch user info directly via browser API (bypass 429) ──
  if (result.user && !result.user.follower_count && result.user.pk) {
    try {
      const apiData = await page.evaluate(new Function('pk', `
        return (async () => {
          try {
            const res = await fetch('https://www.instagram.com/api/v1/users/' + pk + '/info/', {
              credentials: 'include',
              headers: { 'X-IG-App-ID': '936619743392459', 'User-Agent': navigator.userAgent },
            });
            if (!res.ok) return null;
            const json = await res.json();
            return json.user || json;
          } catch (e) { return null; }
        })();
      `), result.user.pk);
      if (apiData && (apiData.follower_count || apiData.following_count || apiData.media_count)) {
        dbg('[capture] api fill: followers:', apiData.follower_count, 'following:', apiData.following_count, 'posts:', apiData.media_count);
        if (apiData.follower_count)  result.user.follower_count  = apiData.follower_count;
        if (apiData.following_count) result.user.following_count = apiData.following_count;
        if (apiData.media_count)     result.user.media_count     = apiData.media_count;
        if (!result.user.full_name && apiData.full_name) result.user.full_name = apiData.full_name;
        if (!result.user.profile_pic_url && apiData.profile_pic_url) result.user.profile_pic_url = apiData.profile_pic_url;
        dbg('[capture] after api fill: follower_count:', result.user.follower_count);
      } else {
        dbg('[capture] api fill returned no counters (pk:', result.user.pk, ')');
      }
    } catch (e) {
      dbg('[capture] api fill failed:', e.message);
    }
  }

  // ── Layer 4: try to extract user_id from page scripts if pk still missing ──
  if (!result.user || !result.user.pk) {
    try {
      const scriptData = await page.evaluate(new Function(`
        const scripts = document.querySelectorAll('script:not([src])');
        for (const s of scripts) {
          const text = s.textContent || '';
          if (text.includes('"user_id"')) {
            const match = text.match(/"user_id"\\s*:\\s*"(\\d+)"/);
            if (match) return match[1];
          }
        }
        return null;
      `));
      if (scriptData) {
        if (result.user) { result.user.pk = scriptData; result.user.id = scriptData; }
        dbg('[capture] script pk extraction:', scriptData);
      }
    } catch (e) {
      dbg('[capture] script pk extraction failed:', e.message);
    }
  }

  dbg('[capture] result.user:', result.user ? result.user.username : null);
  return result;
}

async function scrollForMorePosts(existingPosts, limit) {
  const page  = await getPage(); // Primary path: Browser required for this operation
  const posts = [...existingPosts];
  const seen  = new Set(posts.map(p => getPostCode(p)).filter(Boolean));

  const handler = async (response) => {
    const url = response.url();
    // Accept broad range of Instagram API endpoints
    if (!url.includes('graphql') && !url.includes('api/v1/') && !url.includes('xdt_api')) return;
    try {
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const json = await response.json().catch(() => null);
      if (!json) return;

      // Modern GraphQL endpoint (xdt_api__v1__feed__user_timeline_graphql_connection)
      const newFeed = json.data && json.data.xdt_api__v1__feed__user_timeline_graphql_connection;
      if (newFeed && newFeed.edges) {
        newFeed.edges.forEach(e => {
          const code = e.node && getPostCode(e.node);
          if (code && !seen.has(code)) { seen.add(code); posts.push(e.node); }
        });
      }
      // Legacy GraphQL format (via /graphql/query/)
      const oldEdges = json.data && json.data.user &&
                        json.data.user.edge_owner_to_timeline_media &&
                        json.data.user.edge_owner_to_timeline_media.edges;
      if (oldEdges) {
        oldEdges.forEach(e => {
          const code = e.node && getPostCode(e.node);
          if (code && !seen.has(code)) { seen.add(code); posts.push(e.node); }
        });
      }
      // REST API format (items array, from api/v1/feed/ user endpoint)
      if (json.items && Array.isArray(json.items) && json.items.length > 0) {
        json.items.forEach(item => {
          const code = getPostCode(item);
          if (code && !seen.has(code)) { seen.add(code); posts.push(item); }
        });
      }
      // Direct edges array at response root level (some endpoints)
      if (json.edges && Array.isArray(json.edges)) {
        json.edges.forEach(e => {
          const node = e.node || e;
          const code = getPostCode(node);
          if (code && !seen.has(code)) { seen.add(code); posts.push(node); }
        });
      }
    } catch {}
  };

  page.on('response', handler);

  const maxScrolls = Math.min(Math.ceil(limit / 12), 100);
  const maxTimeMs  = 120_000; // hard timeout: 2 minutes
  const startTime  = Date.now();
  let staleCount   = 0;       // consecutive scrolls with 0 new posts
  let prevCount    = posts.length;

  for (let i = 0; i < maxScrolls && posts.length < limit; i++) {
    // Check hard timeout
    if (Date.now() - startTime > maxTimeMs) {
      dbg('[scroll] max time reached', maxTimeMs / 1000, 'sec, stopping early');
      break;
    }

    await page.evaluate('window.scrollBy(0, 1500)').catch(e => {
      dbg('[scroll] scroll evaluate failed:', e.message);
    });
    await sleep(2500);

    // Early exit: if no new posts after several scrolls, page is exhausted
    const added = posts.length - prevCount;
    if (added === 0) {
      staleCount++;
      if (staleCount >= 5) {
        dbg('[scroll] no new posts for 5 scrolls, stopping early');
        break;
      }
    } else {
      staleCount = 0; // reset on success
    }
    prevCount = posts.length;

    // Progress log every 10 scrolls
    if ((i + 1) % 10 === 0) {
      dbg(`[scroll] progress: ${i + 1}/${maxScrolls} scrolls, ${posts.length} posts captured`);
    }
  }
  page.off('response', handler);

  // Fallback: try to extract any remaining posts from DOM after scrolling
  if (posts.length < limit) {
    try {
      const domCodes = await page.evaluate(() => {
        const codes = new Set();
        document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').forEach(a => {
          const href = a.getAttribute('href') || '';
          const match = href.match(/\/(p|reel)\/([^\/?#]+)/);
          if (match && match[2]) codes.add(match[2]);
        });
        document.querySelectorAll('[data-shortcode]').forEach(el => {
          const code = el.getAttribute('data-shortcode');
          if (code) codes.add(code);
        });
        return Array.from(codes);
      });
      dbg('[scroll] DOM fallback extracted', domCodes.length, 'additional shortcodes');
      if (domCodes.length > posts.length) {
        posts._domShortcodes = domCodes;
      }
    } catch (e) {
      dbg('[scroll] DOM fallback failed:', e.message);
    }
  }

  return posts;
}

async function normalizeProfile(u) {
  const n = {
    id:          u.id  || u.pk  || null,
    pk:          u.pk  || u.id  || null,
    username:    u.username  || '',
    full_name:   u.full_name || '',
    biography:   u.biography || '',
    is_private:  u.is_private  || false,
    is_verified: u.is_verified || u.verified || false,
    profile_pic_url:     u.profile_pic_url || (u.hd_profile_pic_url_info && u.hd_profile_pic_url_info.url) || '',
    profile_pic_url_hd:  (u.hd_profile_pic_url_info && u.hd_profile_pic_url_info.url) || u.profile_pic_url || '',
    external_url:        u.external_url || '',
    category_name:       u.category_name || '',
    is_business_account:     u.is_business_account     || false,
    is_professional_account: u.is_professional_account || false,
    edge_followed_by:             { count: u.follower_count  || (u.edge_followed_by && u.edge_followed_by.count)   || 0 },
    edge_follow:                  { count: u.following_count || (u.edge_follow && u.edge_follow.count)             || 0 },
    edge_owner_to_timeline_media: { count: u.media_count     || (u.edge_owner_to_timeline_media && u.edge_owner_to_timeline_media.count) || 0 },
  };
  dbg('[DIAG] normalizeProfile for', u.username, '| pk:', n.pk, '| followers:', n.edge_followed_by.count, '| following:', n.edge_follow.count, '| posts:', n.edge_owner_to_timeline_media.count);
  return n;
}

async function downloadFile(url, dest) {
  try {
    const res = await axios.get(url, {
      responseType: 'stream',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://www.instagram.com/',
        'X-IG-App-ID': '936619743392459',
      },
    });
    const writer = fs.createWriteStream(dest);
    await new Promise((resolve, reject) => {
      pipeline(res.data, writer, err => {
        if (err) reject(err);
        else resolve();
      });
    });
    return true;
  } catch (e) {
    dbg('[download] Axios stream failed:', url, e.message);
    try {
      const page = await getPage();
      const base64Chunks = await page.evaluate(`
        (async () => {
          try {
            const resp = await fetch(${JSON.stringify(url)});
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const reader = resp.body.getReader();
            const chunks = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              let binary = '';
              for (let i = 0; i < value.length; i++) {
                binary += String.fromCharCode(value[i]);
              }
              chunks.push(btoa(binary));
            }
            return chunks;
          } catch (e) { return { __error: e.message }; }
        })()
      `);
      if (base64Chunks && Array.isArray(base64Chunks)) {
        const fd = fs.openSync(dest, 'w');
        for (const c of base64Chunks) {
          fs.writeSync(fd, Buffer.from(c, 'base64'));
        }
        fs.closeSync(fd);
        return true;
      }
      throw new Error(t('emptyResponse'));
    } catch (e2) {
      dbg('[download] Puppeteer fallback also failed:', e2.message);
      return false;
    }
  }
}

async function fetchProfileOnly(username, options) {
  // Wrap in try/catch to prevent crash on malformed percent-encoding
  _sessionId = (options && options.sessionId) || '';
  const spinner = ui.createSpinner(t('spinLaunching'));
  spinner.start();
  try {
    spinner.update(t('spinLoadingProfile'));
    const { user } = await navigateAndCapture(username);
    spinner.stop(null);
    return user ? normalizeProfile(user) : null;
  } catch (e) {
    spinner.fail(null);
    dbg('[ERROR] fetchProfileOnly failed:', e && e.message);
    throw e;
  }
}

async function extractProfile(username, options = {}) {
  options.username = username;
  const pro = isPro();
  _sessionId = options.sessionId || process.env.IGX_SESSION || process.env.IG_SESSION_ID || '';
  dbg('[extractProfile] _sessionId length:', _sessionId.length, 'options.sessionId length:', (options.sessionId||'').length);
  
  const planMax      = pro ? Infinity : FREE_LIMIT;
  const customLimit  = options.downloadLimit || 0;
  const effectiveMax = customLimit > 0
    ? (pro ? customLimit : Math.min(customLimit, FREE_LIMIT))
    : planMax;

  const outputDir = options.outputDir
    ? path.resolve(options.outputDir)
    : path.join(process.cwd(), `ig_${username}`);
  
  if (options.debug) {
    try { dbg('[extractProfile] options.debug =', !!options.debug, ' _debugBase will be set to', path.join(outputDir, 'debug')); } catch (e) {}
    options._debugDir = path.join(outputDir, 'debug');
    _debugBase = options._debugDir;
    try {
      if (!fs.existsSync(options._debugDir)) {
        fs.mkdirSync(options._debugDir, { recursive: true });
        dbg('[extractProfile] Created debug base dir:', options._debugDir);
      }
    } catch (e) {
      dbg('[extractProfile] failed to create debug base dir:', e && e.message);
    }
    const subdirs = ['grid_payloads', 'post_payloads', 'dom_payloads', 'network'];
    subdirs.forEach(sd => {
      try { fs.mkdirSync(path.join(options._debugDir, sd), { recursive: true }); } catch (e) { dbg('[extractProfile] failed to create debug subdir', sd, e && e.message); }
    });
    dbg('[extractProfile] Debug directories created under', options._debugDir);
  }
  
  if (options.scanLimit !== undefined) {
  } else if (customLimit > 0) {
    options.scanLimit = customLimit * 20;
  } else {
    options.scanLimit = 500;
  }
  
  ui.sectionHeader(t('extractingProfile', username));
  ui.info(t('outputDir', outputDir));
  ui.info(t('planLabel', pro ? t('planPro') : t('planFree')));
  ui.newline();
  
  let profileData  = null;
  let initialPosts = [];
  
  let resultCapture;
  try {
    const spin = ui.createSpinner(t('spinLoadingPosts'));
    spin.start();
    try {
      resultCapture = await navigateAndCapture(username, options);
    } finally {
      spin.stop(null);
    }
    
    const { user, posts, gridShortcodes, domShortcodes } = resultCapture;
    profileData  = options.profileData || (user ? normalizeProfile(user) : null);
    initialPosts = posts;
    
    if (!profileData) {
      ui.err(t('profileNotFound', username));
      ui.warn(t('abortingExtraction'));
      await closeBrowser();
      return { username, outputDir: null, summary: {}, profileData: null, aborted: true };
    }
    
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    const totalKnown = (profileData.edge_owner_to_timeline_media && profileData.edge_owner_to_timeline_media.count) || 0;
    let allPosts = [...initialPosts];

    try {
      const gqlUrls = (resultCapture && Array.isArray(resultCapture.graphqlQueries)) ? resultCapture.graphqlQueries : [];
      if (gqlUrls.length > 0 && profileData && (profileData.pk || profileData.id)) {
        dbg('[extractProfile] attempting GraphQL fetch using observed URLs:', gqlUrls.length);
        const fetchLimit = effectiveMax === Infinity ? Math.min(500, totalKnown || 500) : effectiveMax;
        try {
          const fetched = await fetchPostsFromGraphql(profileData.pk || profileData.id, fetchLimit, options, gqlUrls);
          if (fetched && fetched.length) {
            dbg('[extractProfile] GraphQL fetch returned', fetched.length, 'nodes - merging with captured posts');
            const seen = new Set(allPosts.map(p => getPostCode(p)).filter(Boolean));
            for (const n of fetched) {
              const code = getPostCode(n);
              if (!code || seen.has(code)) continue;
              seen.add(code);
              allPosts.push(n);
            }
            if (options.debug) {
              await saveDebugFile('grid_payloads', `graphql_merge_${profileData.username || profileData.pk || Date.now()}.json`, { fetched: fetched.length, sample: fetched.slice(0,5) }).catch(() => {});
            }
          }
        } catch (e) { dbg('[extractProfile] GraphQL fetch failed:', e && e.message); }
      }
    } catch (e) { dbg('[extractProfile] GraphQL integration error:', e && e.message); }
    
    let rebuiltFromShortcodes = false;
    if (options.strictGrid && Array.isArray(domShortcodes) && domShortcodes.length) {
      dbg('[strict-grid] prioritizing rebuild of allPosts from domShortcodes', domShortcodes.length);
      const rebuilt = await buildPostsFromShortcodes(domShortcodes, Math.min(domShortcodes.length, effectiveMax === Infinity ? domShortcodes.length : effectiveMax), options);
      if (rebuilt && rebuilt.length) {
        allPosts = rebuilt;
        rebuiltFromShortcodes = true;
        dbg('[strict-grid] rebuilt allPosts from domShortcodes:', rebuilt.length);
      } else {
        dbg('[strict-grid] rebuild returned 0, will continue with feed-based posts');
      }
    }

    if (!rebuiltFromShortcodes && allPosts.length === 0) {
      const sourceShortcodes = (Array.isArray(domShortcodes) && domShortcodes.length) ? domShortcodes : (Array.isArray(gridShortcodes) && gridShortcodes.length ? gridShortcodes : []);
      if (sourceShortcodes.length) {
        dbg('[recovery] no post objects captured - rebuilding from shortcodes', sourceShortcodes.length);
        try {
          const rebuilt = await buildPostsFromShortcodes(sourceShortcodes, Math.min(sourceShortcodes.length, effectiveMax === Infinity ? sourceShortcodes.length : effectiveMax), options);
          if (rebuilt && rebuilt.length) {
            allPosts = rebuilt;
            rebuiltFromShortcodes = true;
            dbg('[recovery] rebuilt allPosts from shortcodes:', rebuilt.length);
          } else {
            dbg('[recovery] rebuild returned 0');
          }
        } catch (e) {
          dbg('[recovery] rebuild failed:', e && e.message);
        }
      }
    }
    
    if (!rebuiltFromShortcodes && allPosts.length < Math.min(effectiveMax === Infinity ? Math.min(totalKnown || 2000, 2000) : effectiveMax, totalKnown)) {
      let spin2 = null;
      try {
        spin2 = ui.createSpinner(t('spinScrolling'));
        spin2.start();
        const scrollLimit = effectiveMax === Infinity ? Math.min(totalKnown || 2000, 2000) : effectiveMax;
        const scrollResult = await scrollForMorePosts(allPosts, scrollLimit);
        // Extract DOM shortcodes from scroll fallback BEFORE losing them in .filter()
        const scrollDomShortcodes = Array.isArray(scrollResult._domShortcodes) ? scrollResult._domShortcodes : [];
        delete scrollResult._domShortcodes;
        allPosts = scrollResult;
        if (spin2) spin2.stop(null);

        // If scroll captured more shortcodes from DOM than post objects, rebuild missing posts
        if (scrollDomShortcodes.length > allPosts.length) {
          dbg('[extractProfile] scroll fallback found', scrollDomShortcodes.length, 'shortcodes in DOM, rebuilding...');
          try {
            const rebuilt = await buildPostsFromShortcodes(scrollDomShortcodes, Math.min(scrollDomShortcodes.length, effectiveMax === Infinity ? scrollDomShortcodes.length : effectiveMax), options);
            if (rebuilt && rebuilt.length > allPosts.length) {
              const seenCodes = new Set(allPosts.map(p => getPostCode(p)).filter(Boolean));
              for (const p of rebuilt) {
                const code = getPostCode(p);
                if (code && !seenCodes.has(code)) {
                  seenCodes.add(code);
                  allPosts.push(p);
                }
              }
              dbg('[extractProfile] scroll DOM rebuild added', allPosts.length, 'total posts');
            }
          } catch (e) { dbg('[extractProfile] scroll DOM rebuild failed:', e && e.message); }
        }
      } catch (e) {
        dbg('[extractProfile] scroll block failed:', e && e.message);
        if (spin2) spin2.stop(null);
      }
    }
    
    const seen = new Set();
    allPosts = allPosts.filter(p => {
      const key = getPostCode(p);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    const summary = {};
    let imageMap  = {};
    
    const wantPhotos = options.photos ?? !options.reels;
    const wantReels  = options.reels  ?? !options.photos;
    if (wantPhotos || wantReels) {
      const result = await runMediaDownload(outputDir, allPosts, effectiveMax, wantPhotos, wantReels, pro, gridShortcodes, domShortcodes, { 
        ...options, 
        gridShortcodesIndexMap: resultCapture.gridShortcodesIndexMap, 
        gridPkIndexMap: resultCapture.gridPkIndexMap 
      });
      if (wantPhotos) summary.images = result.photos;
      if (wantReels)  summary.reels  = result.reels;
      imageMap = result.imageMap;
    }
    
    if (options.captions) {
      summary.captions = await runCaptionDownload(outputDir, allPosts, imageMap);
    }
    
    if (options.stories) {
      summary.stories = await runStoriesDownload(outputDir, profileData);
    }
    
    if (options.comments) {
      if (!pro) ui.upgradeBox(t('optComments'));
      else summary.comments = await runCommentDownload(outputDir, allPosts, profileData, options.commentLimit || 10);
    }
    if (options.followers) {
      if (!pro) ui.upgradeBox(t('optFollowers'));
      else summary.followers = await runFollowersDownload(outputDir, profileData);
    }
    if (options.following) {
      if (!pro) ui.upgradeBox(t('optFollowing'));
      else summary.following = await runFollowingDownload(outputDir, profileData);
    }
    
    fs.writeFileSync(path.join(outputDir, 'profile.json'), JSON.stringify(profileData, null, 2));
    ui.ok(t('savedMetadata'));
    
    return { username, outputDir, summary, profileData };
    
  } finally {
    await closeBrowser();
  }
}

async function saveDebugFile(dir, filename, content) {
  try {
    const debugBase = _debugBase || process.env.IG_DEBUG_BASE || path.resolve('debug');
    const targetDir = path.join(debugBase, dir);

    dbg(`[debug-save] Target: debugBase=${debugBase}, targetDir=${targetDir}, filename=${filename}`);

    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const tmpPath = path.join(targetDir, `${filename}.tmp`);
    const finalPath = path.join(targetDir, filename);

    fs.writeFileSync(tmpPath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    const stats = fs.statSync(tmpPath);
    dbg(`[debug-save] Written tmp file: ${tmpPath} (${stats.size} bytes)`);

    fs.renameSync(tmpPath, finalPath);
    dbg(`[debug-save] Renamed to final path: ${finalPath}`);
  } catch (e) {
    dbg('[debug-save] failed to save artifact:', e.message);

    try {
      const debugBase = _debugBase || process.env.IG_DEBUG_BASE || path.resolve('debug');
      const errorDir = path.join(debugBase, '_errors');
      if (!fs.existsSync(errorDir)) fs.mkdirSync(errorDir, { recursive: true });
      
      const errorFilename = `_save_error_${Date.now()}.json`;
      const errorPath = path.join(errorDir, errorFilename);
      const errorPayload = {
        dir,
        filename,
        error: e.message,
        stack: e.stack,
        timestamp: new Date().toISOString()
      };
      
      // Atomic write for error artifact
      const tmpErrPath = `${errorPath}.tmp`;
      fs.writeFileSync(tmpErrPath, JSON.stringify(errorPayload, null, 2));
      fs.renameSync(tmpErrPath, errorPath);
    } catch (err2) {
      dbg('[debug-save] failed to write error artifact to debugBase/_errors:', err2.message);
    }
  }
}

async function runMediaDownload(outputDir, allPosts, limit, wantPhotos, wantReels, pro, gridShortcodes = [], domShortcodes = [], options = {}) {
  const result = { photos: 0, reels: 0, imageMap: {} };
  let skippedCount = 0;
  
  let gridShortcodesIndexMap;
  if (options.gridShortcodesIndexMap instanceof Map) {
    gridShortcodesIndexMap = options.gridShortcodesIndexMap;
  } else if (options.gridShortcodesIndexMap && typeof options.gridShortcodesIndexMap === 'object') {
    gridShortcodesIndexMap = new Map(Object.entries(options.gridShortcodesIndexMap));
  } else {
    gridShortcodesIndexMap = new Map((Array.isArray(gridShortcodes) ? gridShortcodes : []).map((s, i) => [s, i]));
  }

  let gridPkIndexMap;
  if (options.gridPkIndexMap instanceof Map) {
    gridPkIndexMap = options.gridPkIndexMap;
  } else if (options.gridPkIndexMap && typeof options.gridPkIndexMap === 'object') {
    gridPkIndexMap = new Map(Object.entries(options.gridPkIndexMap));
  } else {
    gridPkIndexMap = new Map();
  }

  if (options.debug && gridShortcodes.length > 0) {
    await saveDebugFile('grid_payloads', `${options.username || 'unknown'}_grid_${Date.now()}.json`, {
      username: options.username,
      gridShortcodes
    });
  }

  if (wantPhotos && wantReels) {
    ui.sectionHeader(t('downloadingImagesReels'));
  } else if (wantPhotos) {
    ui.sectionHeader(t('downloadingImages'));
  } else if (wantReels) {
    ui.sectionHeader(t('downloadingReels'));
  }

  const photoLimit = wantPhotos ? (limit === Infinity ? Infinity : limit) : 0;
  const reelLimit  = wantReels  ? (limit === Infinity ? Infinity : limit) : 0;

  const filtered = allPosts.filter(p => {
    if (isReel(p)) return wantReels;
    return wantPhotos;
  });

  if (!filtered.length) {
    ui.warn(t('noMediaFound'));
    return result;
  }

  let ordered = filtered;
  try {
    ordered.sort((a, b) => getPostTimestamp(b) - getPostTimestamp(a));
  } catch (e) {
    dbg('[media] failed to sort posts by timestamp:', e.message);
  }
  if (options.maxAgeDays && typeof options.maxAgeDays === 'number' && options.maxAgeDays > 0) {
    const cutoff = Math.floor(Date.now() / 1000) - (options.maxAgeDays * 24 * 3600);
    try {
      const before = ordered.length;
      ordered = ordered.filter(p => (getPostTimestamp(p) || 0) >= cutoff);
      dbg('[media] maxAgeDays applied - filtered', before - ordered.length, 'posts older than', options.maxAgeDays, 'days');
    } catch (e) { dbg('[media] maxAgeDays filter failed:', e && e.message); }
  }
  const totalLimit = (options.downloadLimit && Number.isFinite(options.downloadLimit)) ? Number(options.downloadLimit) : null;
  if (totalLimit && totalLimit > 0) {
    try {
      ordered = ordered.slice(0, totalLimit);
      dbg('[media] downloadLimit applied as TOTAL limit:', totalLimit, 'posts will be considered');
    } catch (e) { dbg('[media] applying total downloadLimit failed:', e && e.message); }
  }
  let currentStrictGrid = options.strictGrid || false;
  let inspectedCount = 0;
  const scanLimit = options.scanLimit || 500;
  
  const totalTarget = (wantPhotos ? photoLimit : 0) + (wantReels ? reelLimit : 0);
  // Track inspected items for progress (stops bar from stalling on skipped posts)
  const barLimit = Math.min(filtered.length, scanLimit === Infinity ? filtered.length : scanLimit);
  const bar = ui.createProgressBar(wantReels && !wantPhotos ? t('reelLabel') : t('imageLabel'), 'brand');

  const mediaMap = [];

  const processPosts = async () => {
    for (let i = 0; i < ordered.length; i++) {
      if (inspectedCount >= scanLimit) {
        dbg('[media] reached scanLimit, stopping inspection');
        break;
      }
      inspectedCount++;
      const photoDone = result.photos >= photoLimit;
      const reelDone  = result.reels  >= reelLimit;
      if (photoDone && reelDone) break;
      if (!wantPhotos && reelDone) break;
      if (!wantReels  && photoDone) break;

      const post = ordered[i];
      const postIsReel = isReel(post);
      const code = getPostCode(post);
      const pk = post && (post.pk || post.id);

      if (currentStrictGrid && code && !gridShortcodesIndexMap.has(code) && !gridPkIndexMap.has(String(pk))) {
        dbg(`[media] skipping post ${code} because it's not in the initial grid`);
        skippedCount++;
        continue;
      }

      if (postIsReel && reelDone) continue;
      if (!postIsReel && photoDone) continue;

      const items = getCarouselItems(post);
      const isCarousel = items.length > 1;
      const postDir = path.join(outputDir, `post_${code}`);
      if (isCarousel && !fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });
      const postTs = getPostTimestamp(post) || 0;

      let firstDownloadedPath = null;
      let firstDownloadedUrl = null;

      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        const isV = isReel(item);
        const ext = isV ? 'mp4' : 'jpg';
        let url = isV ? getVideoUrl(item) : __getImageUrl(item);

        if (!url && currentStrictGrid) {
          dbg(`[media] No URL for ${code} item ${j+1}, attempting browser-fetch fallback...`);
          try {
            const page = await getPage();
            const fetchUrl = isV ? `${IG_BASE}/reel/${code}/` : `${IG_BASE}/p/${code}/`;
            const response = await page.goto(fetchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
            const body = await response.text();
            const json = JSON.parse(body.startsWith('for (;;);') ? body.slice(9) : body);
            if (options.debug) {
              await saveDebugFile('post_payloads', `${code}_${Date.now()}.json`, json);
            }
            const node = json.items ? json.items[0] : (json.data ? json.data : json);
            if (node) {
              url = isV ? getVideoUrl(node) : __getImageUrl(node);
              if (url) dbg(`[media] Fallback SUCCESS for ${code}: found ${url.substring(0,40)}...`);
            }
          } catch (e) {
            dbg(`[media] Fallback FAILED for ${code}: ${e.message}`);
          }
        }

        if (!url) {
          dbg(`[media] SKIPPING post ${code} item ${j+1}: no URL found`);
          continue;
        }

        const tsPrefix = postTs && postTs > 0 ? `${postTs}_` : '';
        const filename = `${tsPrefix}media_${j+1}.${ext}`;
        const finalPath = isCarousel
          ? path.join(postDir, filename)
          : path.join(outputDir, `${tsPrefix}media_${result.photos + result.reels + 1}.${ext}`);

        dbg(`[media] post ${code} item ${j+1}: ts=${postTs} type=${isV?'reel':'photo'} url=${url.substring(0,80)} -> ${finalPath}`);
        if (await downloadFile(url, finalPath)) {
          if (firstDownloadedPath === null) { firstDownloadedPath = finalPath; firstDownloadedUrl = url; }
          if (!isV) { result.imageMap[code] = result.imageMap[code] || []; result.imageMap[code].push(filename); }
          if (isV) result.reels++; else result.photos++;
          dbg(`[media] OK ${isV ? 'reel' : 'photo'} saved to ${finalPath}`);
        } else {
          dbg(`[media] FAILED to download ${url}`);
        }
      }

      // One media_map entry per post (after all items downloaded)
      if (firstDownloadedPath !== null) {
        try {
          let gridIndex = null;
          if (code && gridShortcodesIndexMap && typeof gridShortcodesIndexMap.get === 'function' && gridShortcodesIndexMap.has(code)) {
            gridIndex = gridShortcodesIndexMap.get(code);
          } else if (pk && gridPkIndexMap && typeof gridPkIndexMap.get === 'function' && gridPkIndexMap.has(String(pk))) {
            gridIndex = gridPkIndexMap.get(String(pk));
          } else if (domShortcodes && domShortcodes.length && code) {
            const di = domShortcodes.indexOf(code);
            if (di >= 0) gridIndex = di;
          }
          mediaMap.push({
            filename: path.relative(outputDir, firstDownloadedPath).replace(/\\/g, '/'),
            shortcode: code || null,
            ts: postTs || null,
            type: postIsReel ? 'reel' : (isCarousel ? 'carousel' : 'photo'),
            url: firstDownloadedUrl,
            caption: getCaptionText(post) || null,
            grid_index: gridIndex !== null && gridIndex !== undefined ? gridIndex : null,
            feed_source: (gridIndex !== null && gridIndex !== undefined) ? 'grid' : 'feed',
            ...(isCarousel ? { item_count: items.length } : {})
          });
        } catch (e) {
          dbg('[media] media_map entry failed for post', code, e && e.message);
        }
      }
      if (bar && typeof bar.tick === 'function') {
        const done = (wantPhotos ? result.photos : 0) + (wantReels ? result.reels : 0);
        bar.tick(done, barLimit);
      }
    }
  };

  await processPosts();

  // ── Grid Capture Audit ──────────────────────────────────────────────────────
  const nullIndices = mediaMap.filter(m => m.grid_index === null).length;
  if (mediaMap.length > 0 && nullIndices / mediaMap.length >= 0.5) {
    ui.warn(t('gridMismatch', nullIndices, mediaMap.length));
    await saveDebugFile('grid_payloads', `grid_capture_audit_${options.username || 'unknown'}_${Date.now()}.json`, {
      gridShortcodes,
      domShortcodes,
      mediaMap,
      diagnostic: `Missing grid_index for ${nullIndices} items. Grid captured: ${gridShortcodes.length}, DOM captured: ${domShortcodes.length}`
    });
  }

  // Post-process: ensure mediaMap entries are annotated with origin detail for auditing
  try {
    for (const m of mediaMap) {
      if (!m.feed_origin) {
        if (m.grid_index !== null && m.grid_index !== undefined) m.feed_origin = 'grid';
        else m.feed_origin = 'feed_or_rebuild';
      }
    }
  } catch (e) { dbg('[media] post-process annotate failed:', e && e.message); }

    if (currentStrictGrid && result.photos === 0 && result.reels === 0) {
      if (options.strictGridMode === 'fail-loud') {
        throw new Error(t('strictGridFailLoud', options.username));
      }
      ui.warn(t('strictGridEmpty'));
      currentStrictGrid = false;
      result.photos = 0;
      result.reels = 0;
      skippedCount = 0;
      if (typeof inspectedCount !== 'undefined') inspectedCount = 0;
      if (bar && typeof bar.stop === 'function') bar.stop();
      await processPosts();
      if (bar && typeof bar.stop === 'function') bar.stop();
      try {
        const tempPath = path.join(outputDir, 'media_map.json.tmp');
        fs.writeFileSync(tempPath, JSON.stringify(mediaMap, null, 2));
        fs.renameSync(tempPath, path.join(outputDir, 'media_map.json'));
        dbg('[media] media_map.json written atomically with', mediaMap.length, 'entries');
      } catch (e) {
        dbg('[media] failed to write media_map.json:', e.message);
      }
      return result;
    }

  if (bar && typeof bar.stop === 'function') bar.stop();
  if (options.strictGrid && skippedCount > 0) {
    ui.info(`${t('skippedItems', skippedCount)} ${t('notInGrid')}`);
  }
  try {
    const tempPath = path.join(outputDir, 'media_map.json.tmp');
    fs.writeFileSync(tempPath, JSON.stringify(mediaMap, null, 2));
    fs.renameSync(tempPath, path.join(outputDir, 'media_map.json'));
    dbg('[media] media_map.json written atomically with', mediaMap.length, 'entries');
  } catch (e) {
    dbg('[media] failed to write media_map.json:', e.message);
  }
  return result;
}

async function runCaptionDownload(outputDir, allPosts, imageMap) {
  const results = [];
  ui.sectionHeader(t('downloadingCaptions'));
  const bar = ui.createProgressBar(t('captionLabel'), 'brand');
  for (let i = 0; i < allPosts.length; i++) {
    const post = allPosts[i];
    const text = getCaptionText(post);
    if (text) {
      results.push({ code: getPostCode(post), text });
    }
    if (bar && typeof bar.tick === 'function') bar.tick(i + 1, allPosts.length);
  }
  if (bar && typeof bar.stop === 'function') bar.stop();
  fs.writeFileSync(path.join(outputDir, 'captions.json'), JSON.stringify(results, null, 2));
  return results.length;
}

async function handleManualLogin() {
  dbg('[Auth] starting manual login flow');
  ui.sectionHeader(t('authRequired'));
  ui.dim(t('authSessionExpired'));
  ui.info(t('authSteps1'));
  ui.info(t('authSteps2'));
  ui.info(t('authSteps3'));
  ui.info(t('authSteps4'));
  ui.info(t('authSteps5'));
  ui.info(t('authPaste'));

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const newSessionId = await new Promise(resolve => {
    const _onSigint = () => {
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
      process.exit(130);
    };
    process.once('SIGINT', _onSigint);
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    rl.question(t('authSessionIdPrompt'), answer => {
      process.removeListener('SIGINT', _onSigint);
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
      rl.close(); resolve(answer.trim());
    });
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      rl._writeToOutput = () => {};
    }
  });

  if (!newSessionId) {
    ui.err(t('authNoSessionId'));
    return;
  }

  // Validate the new sessionid by trying a simple API call via Node's native https
  const https = require('https');
  try {
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'www.instagram.com',
        port: 443,
        path: '/api/v1/users/web_profile_info/?username=instagram',
        method: 'GET',
        headers: {
          'Cookie': `sessionid=${newSessionId}`,
          'X-IG-App-ID': '936619743392459',
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode, data: parsed });
          } catch {
            resolve({ status: res.statusCode, data: data.substring(0, 500) });
          }
        });
      });
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      req.end();
    });
    
    dbg('[Auth] validation status:', result.status, '| data sample:', JSON.stringify(result.data).substring(0, 200));
    
    if (result.status === 200 && result.data && result.data.data && result.data.data.user) {
      ui.ok(t('authValidSession'));
      _sessionId = newSessionId;
      saveSessionId(_sessionId);
    } else if (result.status === 429) {
      ui.ok(t('authRateLimitAccept'));
      _sessionId = newSessionId;
      saveSessionId(_sessionId);
    } else if (result.status === 200) {
      ui.ok(t('authStatusOk'));
      _sessionId = newSessionId;
      saveSessionId(_sessionId);
    } else if (result.data && result.data.require_login) {
      ui.err(t('authRejected'));
      // NO save - poisoned session would overwrite a good one
    } else {
      ui.err(t('authValidationFailed', result.status));
      // NO save - don't overwrite a possibly valid session with garbage
    }
  } catch (e) {
    dbg('[Auth] validation error:', e.message);
    ui.err(t('authValidationError', e.message));
    // NO save - don't overwrite on connection errors either
  }
}

async function browserFetchJson(url) {
  const MAX_RETRIES = 1;
  let json;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const page = await getPage(); // Primary path: Browser required for this operation

    // Quick inject sessionid cookie
    if (_sessionId) {
      await page.setCookie({
        name: 'sessionid', value: _sessionId,
        domain: '.instagram.com', path: '/', httpOnly: true, secure: true,
      }).catch(() => {});
    }

    if (!page.url().includes('instagram.com')) {
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    }

    try {
      await page.evaluate(`window.__igx_fetch_url = ${JSON.stringify(url)};`);
      json = await page.evaluate(`
        (async () => {
          try {
            const resp = await fetch(window.__igx_fetch_url, {
              headers: {
                'Accept': 'application/json, text/plain, */*',
                'X-IG-App-ID': '936619743392459',
                'X-Requested-With': 'XMLHttpRequest',
              },
              credentials: 'include',
            });
            const text = await resp.text();
            if (!resp.ok) return { __error: resp.status, __body: text.substring(0, 500) };
            try {
              return JSON.parse(text);
            } catch {
              return { __error: 'JSON_PARSE_FAIL', __body: text.substring(0, 500) };
            }
          } catch (e) {
            return { __error: e.message };
          }
        })()
      `);
    } catch (evalErr) {
      dbg('[browserFetch] evaluate threw:', evalErr.message);
      json = { __error: evalErr.message };
    }

    // Check if auth is needed (only on first attempt)
    if (attempt < MAX_RETRIES && json && (json.__error === 401 || json.require_login === true || json.__error === 'JSON_PARSE_FAIL')) {
      const isLoginPage = json.__body && json.__body.includes('accounts/login');
      if (json.__error === 401 || json.require_login === true || isLoginPage) {
        if (!process.stdin.isTTY) {
          throw new Error(t('sessionExpired'));
        }
        dbg('[Auth] Session invalid detected via API. Triggering manual login.');
        await handleManualLogin();
        // Loop continues to retry with the new sessionid
        continue;
      }
    }

    // If we got here without retrying, break out of the loop
    break;
  }

  // If retries exhausted, return error
  if (json && (json.__error === 401 || json.require_login === true)) {
    dbg('[Auth] Session still invalid after retry. Aborting.');
    return { __error: 'MAX_RETRIES_EXCEEDED' };
  }

  return json;
}

async function runCommentDownload(outputDir, allPosts, profileData, limit = 10) {
  const commentsMap = {};
  ui.sectionHeader(t('downloadingComments'));
  const bar = ui.createProgressBar(t('commentLabel'), 'brand');

  const postsToScan = allPosts.slice(0, limit);
  for (let i = 0; i < postsToScan.length; i++) {
    const post    = postsToScan[i];
    const code    = getPostCode(post);
    // Instagram IDs can be "mediaId_userId" — we only need the numeric part before "_"
    const rawId   = post.pk || post.id || post.media_id || null;
    const mediaId = rawId ? String(rawId).split('_')[0] : null;
    if (!mediaId) {
      dbg('[comments] no media id for post', code);
      if (bar && typeof bar.tick === 'function') bar.tick(i + 1, postsToScan.length);
      continue;
    }

    const postComments = [];
    let nextMinId = null;
    let hasMore   = true;
    if (bar.isActive) bar.stop();
    const spinner = ui.createSpinner(t('commentSpinnerProgress', i + 1, postsToScan.length, code, t('commentSpinnerFetching')));
    spinner.start();

    try {
      let attempt = 0;
      while (hasMore && postComments.length < 500) {
        const params = new URLSearchParams({ can_support_threading: 'true', permalink_enabled: 'false' });
        if (nextMinId) params.set('min_id', nextMinId);
        const endpoint = `${IG_BASE}/api/v1/media/${mediaId}/comments/?${params}`;
        dbg('[comments] browser fetch', endpoint);
        const json = await browserFetchJson(endpoint);
        if (!json || json.__error) {
          dbg('[comments] API error:', json && json.__error);
          if (json && json.__error === 429 && attempt < 2) {
            // Rate limited — wait with backoff and retry
            attempt++;
            const delay = attempt * 5000;
            dbg('[comments] 429 rate limit, retrying after', delay, 'ms');
            await sleep(delay);
            continue;
          }
          if (json && (json.__error === 401 || json.require_login === true) && attempt === 0) {
            attempt++;
            await sleep(3000);
            continue;
          }
          break;
        }
        const items = json.comments || [];
        for (const c of items) {
          postComments.push({
            pk:        c.pk,
            text:      c.text,
            timestamp: c.created_at,
            user:      c.user ? { pk: c.user.pk, username: c.user.username } : null,
            likes:     c.comment_like_count || 0,
          });
        }
        spinner.update(t('commentSpinnerProgress', i + 1, postsToScan.length, code, t('commentSpinnerCount', postComments.length)));
        hasMore   = json.has_more_comments || json.has_more_headload_comments || false;
        nextMinId = json.next_min_id || null;
        if (!nextMinId) hasMore = false;
        if (hasMore) await sleep(800);
      }
      spinner.stop(t('commentSpinnerProgress', i + 1, postsToScan.length, code, t('commentSpinnerCount', postComments.length)));
      commentsMap[code] = postComments;
      dbg('[comments] post', code, '->', postComments.length, 'comments');
    } catch (e) {
      spinner.fail(t('commentSpinnerError', code));
      dbg('[comments] error for', code, e.message);
      commentsMap[code] = [];
    }
    bar.tick(i + 1, postsToScan.length);
    if (i < postsToScan.length - 1) await sleep(1200);
  }
  if (bar.isActive) bar.stop();
  fs.writeFileSync(path.join(outputDir, 'comments.json'), JSON.stringify(commentsMap, null, 2));
  return Object.values(commentsMap).reduce((acc, curr) => acc + curr.length, 0);
}

async function runStoriesDownload(outputDir, profileData) {
  const userId = profileData.pk || profileData.id;
  dbg('[DIAG][stories] userId:', userId, '| profileData keys:', Object.keys(profileData).join(', '));
  if (!userId) {
    ui.err(t('storiesNoUserId'));
    return 0;
  }
  ui.sectionHeader(t('downloadingStories'));
  const storiesDir = path.join(outputDir, 'stories');
  if (!fs.existsSync(storiesDir)) fs.mkdirSync(storiesDir, { recursive: true });

  const seenUrls = new Set();
  const storyItems = [];
  const addItem = (url, ext, ts = 0) => {
    if (url && !seenUrls.has(url)) { seenUrls.add(url); storyItems.push({ url, ext, ts: Number(ts) || 0 }); }
  };

  const apiEndpoints = [
    `${IG_BASE}/api/v1/feed/reels_media/?reel_ids=${userId}`,
    `${IG_BASE}/api/v1/feed/user/${userId}/story/`,
  ];

  for (const endpoint of apiEndpoints) {
    if (storyItems.length > 0) break;
    try {
      dbg('[stories] trying API endpoint:', endpoint);
      const json = await browserFetchJson(endpoint);
      if (!json || json.__error) {
        dbg('[stories] API error:', json && json.__error);
        continue;
      }
      dbg('[stories] API response top-level keys:', Object.keys(json).join(', '));
      dbg('[DIAG] stories endpoint:', endpoint.substring(0, 80), '| status:', json.status || 'ok', '| keys:', Object.keys(json).join(','));
      if (json.reels_media) dbg('[DIAG] reels_media length:', json.reels_media.length);
      if (json.reels) dbg('[DIAG] reels keys:', Object.keys(json.reels).join(','));
      const reelsMedia = json.reels_media ||
        (json.reel && [json.reel]) ||
        (json.reels && Object.values(json.reels)) ||
        [];
      for (const reel of reelsMedia) {
        for (const item of (reel.items || [])) {
          const ts = item.taken_at || item.taken_at_timestamp || 0;
          if (item.video_versions && item.video_versions.length) {
            addItem(item.video_versions[0].url, 'mp4', ts);
          } else if (item.image_versions2 && item.image_versions2.candidates && item.image_versions2.candidates.length) {
            addItem(item.image_versions2.candidates[0].url, 'jpg', ts);
          } else if (item.video_url) {
            addItem(item.video_url, 'mp4', ts);
          } else if (item.display_url) {
            addItem(item.display_url, 'jpg', ts);
          }
        }
      }
      dbg('[stories] API endpoint yielded', storyItems.length, 'items');
    } catch (e) {
      dbg('[stories] endpoint failed:', endpoint, e.message);
    }
  }

  if (storyItems.length > 1) {
    storyItems.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }
  dbg('[stories] total story items to download:', storyItems.length);

  if (storyItems.length === 0) {
    ui.warn(t('storiesNotFound'));
    return 0;
  }

  let downloadedCount = 0;
  const bar = ui.createProgressBar(t('storyLabel'), 'brand');
  for (let i = 0; i < storyItems.length; i++) {
    const item = storyItems[i];
    const tsPart = item.ts && item.ts > 0 ? `${item.ts}_` : '';
    const filename = `${tsPart}story_${i + 1}.${item.ext}`;
    const dest = path.join(storiesDir, filename);
    dbg(`[stories] downloading story ${i + 1}: ${item.url.substring(0, 80)} -> ${dest}`);
    try {
      if (await downloadFile(item.url, dest)) {
        downloadedCount++;
        dbg(`[stories] OK story ${i + 1} saved`);
      }
    } catch (e) {
      dbg(`[stories] FAILED story ${i + 1}:`, e.message);
    }
    if (bar && typeof bar.tick === 'function') bar.tick(i + 1, storyItems.length);
  }
  if (bar && typeof bar.stop === 'function') bar.stop();

  return downloadedCount;
}

async function runFollowersDownload(outputDir, profileData) {
  const userId = profileData.pk || profileData.id;
  if (!userId) { ui.err(t('noUserId')); return 0; }

  ui.sectionHeader(t('downloadingFollowers'));
  const bar = ui.createProgressBar(t('followerLabel'), 'brand');

  const results = [];
  let nextMaxId = null;
  let hasMore   = true;

  try {
    while (hasMore && results.length < 5000) {
      const params = new URLSearchParams({ count: '100', search_surface: 'follow_list_page' });
      if (nextMaxId) params.set('max_id', nextMaxId);
      const endpoint = `${IG_BASE}/api/v1/friendships/${userId}/followers/?${params}`;
      dbg('[followers] browser fetch', endpoint);
      const json = await browserFetchJson(endpoint);
      if (!json || json.__error) { dbg('[followers] API error:', json && json.__error); break; }
      const users = json.users || [];
      for (const u of users) {
        results.push({ pk: u.pk, username: u.username, full_name: u.full_name, is_private: u.is_private, is_verified: u.is_verified });
      }
      hasMore   = json.big_list || (json.next_max_id != null);
      nextMaxId = json.next_max_id || null;
      if (!nextMaxId) hasMore = false;
      if (bar && typeof bar.tick === 'function') bar.tick(results.length, 5000);
      if (hasMore) await sleep(1500);
    }
  } catch (e) {
    dbg('[followers] error:', e.message);
  }

  bar.stop();
  fs.writeFileSync(path.join(outputDir, 'followers.json'), JSON.stringify(results, null, 2));
  return results.length;
}

async function runFollowingDownload(outputDir, profileData) {
  const userId = profileData.pk || profileData.id;
  if (!userId) { ui.err(t('noUserId')); return 0; }

  ui.sectionHeader(t('downloadingFollowing'));
  const bar = ui.createProgressBar(t('followingLabel'), 'brand');

  const results = [];
  let nextMaxId = null;
  let hasMore   = true;

  try {
    while (hasMore && results.length < 5000) {
      const params = new URLSearchParams({ count: '100' });
      if (nextMaxId) params.set('max_id', nextMaxId);
      const endpoint = `${IG_BASE}/api/v1/friendships/${userId}/following/?${params}`;
      dbg('[following] browser fetch', endpoint);
      const json = await browserFetchJson(endpoint);
      if (!json || json.__error) { dbg('[following] API error:', json && json.__error); break; }
      const users = json.users || [];
      for (const u of users) {
        results.push({ pk: u.pk, username: u.username, full_name: u.full_name, is_private: u.is_private, is_verified: u.is_verified });
      }
      hasMore   = json.big_list || (json.next_max_id != null);
      nextMaxId = json.next_max_id || null;
      if (!nextMaxId) hasMore = false;
      if (bar && typeof bar.tick === 'function') bar.tick(results.length, 5000);
      if (hasMore) await sleep(1500);
    }
  } catch (e) {
    dbg('[following] error:', e.message);
  }

  bar.stop();
  fs.writeFileSync(path.join(outputDir, 'following.json'), JSON.stringify(results, null, 2));
  return results.length;
}

function getCaptionText(node) {
  if (!node) return null;
  return node.edge_media_to_caption && node.edge_media_to_caption.edges && node.edge_media_to_caption.edges.length > 0
    ? node.edge_media_to_caption.edges[0].node.text
    : (node.caption || null);
}

module.exports = {
  extractProfile,
  fetchProfileOnly,
  saveDebugFile
};
