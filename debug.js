'use strict';
const SESSION   = process.argv[2] || '';
const POST_CODE = process.argv[3] || '';
const sleep     = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const puppeteer = require('puppeteer');
  const browser   = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  await page.setCookie({ name: 'sessionid', value: SESSION, domain: '.instagram.com', path: '/', httpOnly: true, secure: true });
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(2000);
  await page.setCookie({ name: 'sessionid', value: SESSION, domain: '.instagram.com', path: '/', httpOnly: true, secure: true });
  await page.goto('https://www.instagram.com/p/' + POST_CODE + '/', { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(2000);

  const result = await page.evaluate(() => {
    // Search for the comment text directly — look for "argentinos" or any text > 20 chars near a username
    const target = 'fiorellaved';
    const allSpans = [...document.querySelectorAll('span._aade')];
    const fiorella = allSpans.find(s => s.innerText?.trim() === target);
    if (!fiorella) return { error: 'fiorellaved span not found' };

    // Go up 7 levels to get username container
    let el = fiorella;
    for (let i = 0; i < 7; i++) el = el.parentElement;
    // el = div with username+date

    // Now go up MORE levels and print full innerText at each level
    const levels = [];
    let cur = el;
    for (let i = 0; i < 8; i++) {
      cur = cur.parentElement;
      if (!cur) break;
      const text = cur.innerText?.trim().slice(0, 400);
      const childCount = cur.children.length;
      const cls = cur.className.slice(0, 80);
      levels.push({ level: i, tag: cur.tagName, cls, childCount, text });
      // Stop once we see the comment text
      if (text && text.includes('argentinos')) {
        levels[levels.length-1].FOUND_COMMENT = true;
        break;
      }
    }
    return { levels };
  });

  if (result.error) {
    console.log('ERROR:', result.error);
  } else {
    console.log('=== Walking up from fiorellaved username ===\n');
    result.levels.forEach(l => {
      console.log(`Level ${l.level}: <${l.tag} class="${l.cls}" children=${l.childCount}>`);
      console.log(`  text: "${l.text}"`);
      if (l.FOUND_COMMENT) console.log('  *** COMMENT TEXT FOUND HERE ***');
      console.log();
    });
  }

  await browser.close();
}
run().catch(e => console.error('Fatal:', e.message));
