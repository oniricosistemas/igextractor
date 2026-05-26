'use strict';
const SESSION  = process.argv[2] || '';
const USERNAME = process.argv[3] || 'todonoticias';
const sleep    = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const puppeteer = require('puppeteer');
  const browser   = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  if (SESSION) {
    await page.setCookie({ name: 'sessionid', value: SESSION, domain: '.instagram.com', path: '/', httpOnly: true, secure: true });
  }

  console.log('Step 1: Homepage...');
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(1500);

  if (SESSION) {
    await page.setCookie({ name: 'sessionid', value: SESSION, domain: '.instagram.com', path: '/', httpOnly: true, secure: true });
  }

  console.log('Step 2: Profile page...');
  page.on('response', async (res) => {
    const url = res.url();
    const ct  = res.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    if (res.status() !== 200) return;

    try {
      const json = await res.json().catch(() => null);
      if (!json) return;
      const topKeys  = Object.keys(json).join(', ');
      const dataKeys = json.data ? Object.keys(json.data).join(', ') : '';
      console.log(`\n[JSON] ${url.slice(0, 100)}`);
      console.log(`  top: ${topKeys}`);
      if (dataKeys) console.log(`  data: ${dataKeys}`);

      // Print any key that looks like a user profile
      function findUser(obj, path) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.username && (obj.pk || obj.id)) {
          console.log(`  *** FOUND USER at ${path}: username=${obj.username} id=${obj.pk || obj.id}`);
          return;
        }
        for (const k of Object.keys(obj)) {
          findUser(obj[k], path + '.' + k);
        }
      }
      findUser(json, 'root');
    } catch {}
  });

  await page.goto(`https://www.instagram.com/${USERNAME}/`, { waitUntil: 'networkidle2', timeout: 35000 });
  await sleep(4000);

  console.log('\nDone.');
  await browser.close();
}

run().catch(console.error);
