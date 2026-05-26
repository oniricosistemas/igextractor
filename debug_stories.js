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
  await page.evaluateOnNewDocument(function() {
    Object.defineProperty(navigator, 'webdriver', { get: function() { return undefined; } });
  });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  // === REPLICATE EXACT SCRAPER FLOW ===
  // Step 1: set cookie
  await page.setCookie({ name: 'sessionid', value: SESSION, domain: '.instagram.com', path: '/', httpOnly: true, secure: true });

  // Step 2: visit homepage (same as getPage())
  console.log('Step 1: Homepage...');
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(1500);
  await page.setCookie({ name: 'sessionid', value: SESSION, domain: '.instagram.com', path: '/', httpOnly: true, secure: true });

  // Step 3: navigate to profile (same as navigateAndCapture)
  console.log('Step 2: Profile page...');
  await page.goto('https://www.instagram.com/' + USERNAME + '/', { waitUntil: 'networkidle2', timeout: 35000 });
  await sleep(3000);

  // Step 4: now navigate to stories (same as runStoriesDownload)
  const networkUrls = [];
  page.on('response', function(res) {
    const url = res.url();
    if (!url.includes('fbcdn') && !url.includes('cdninstagram')) return;
    if (url.includes('/o1/v/') || url.includes('/v/t50.') || url.includes('/v/t42.') || url.includes('/v/t39.')) {
      networkUrls.push({ url: url.slice(0,120), status: res.status() });
      console.log('[NETWORK VIDEO] ' + url.slice(0,100));
    }
  });

  console.log('Step 3: Stories page...');
  await page.goto('https://www.instagram.com/stories/' + USERNAME + '/', { waitUntil: 'networkidle2', timeout: 25000 });
  await sleep(3000);

  await page.screenshot({ path: 'dbg1_stories.png' });

  // Click Ver historia
  const clicked = await page.evaluate(function() {
    var all = document.querySelectorAll('button, [role="button"], a');
    for (var i = 0; i < all.length; i++) {
      var t = (all[i].textContent || '').trim().toLowerCase();
      if (t === 'ver historia' || t === 'view story' || t === 'ver' || t === 'view') {
        all[i].click(); return all[i].textContent.trim();
      }
    }
    return null;
  });
  console.log('Clicked:', clicked);
  await sleep(4000);

  await page.screenshot({ path: 'dbg2_after_click.png' });

  // Check DOM
  var dom1 = await page.evaluate(function() {
    var videos = [];
    document.querySelectorAll('video').forEach(function(v) {
      videos.push({ src: v.src.slice(0,80), currentSrc: v.currentSrc.slice(0,80), readyState: v.readyState });
    });
    var imgs = [];
    document.querySelectorAll('img').forEach(function(img) {
      if ((img.src||'').includes('fbcdn') && img.naturalWidth > 400) {
        imgs.push({ src: img.src.slice(0,100), w: img.naturalWidth, h: img.naturalHeight });
      }
    });
    return { url: location.href, videos, imgs };
  });

  console.log('\n=== DOM after click ===');
  console.log('URL:', dom1.url);
  console.log('Videos:', dom1.videos.length, JSON.stringify(dom1.videos));
  console.log('Large images:', dom1.imgs.length, JSON.stringify(dom1.imgs));

  // Press ArrowRight
  console.log('\nArrowRight...');
  await page.keyboard.press('ArrowRight');
  await sleep(3000);
  await page.screenshot({ path: 'dbg3_arrow.png' });

  var dom2 = await page.evaluate(function() {
    var videos = [];
    document.querySelectorAll('video').forEach(function(v) {
      videos.push({ src: v.src.slice(0,80), currentSrc: v.currentSrc.slice(0,80), readyState: v.readyState });
    });
    var imgs = [];
    document.querySelectorAll('img').forEach(function(img) {
      if ((img.src||'').includes('fbcdn') && img.naturalWidth > 400) {
        imgs.push({ src: img.src.slice(0,100), w: img.naturalWidth, h: img.naturalHeight });
      }
    });
    return { url: location.href, videos, imgs };
  });

  console.log('\n=== DOM after ArrowRight ===');
  console.log('URL:', dom2.url);
  console.log('Videos:', dom2.videos.length, JSON.stringify(dom2.videos));
  console.log('Large images:', dom2.imgs.length, JSON.stringify(dom2.imgs));
  console.log('\nNetwork video URLs captured:', networkUrls.length);
  networkUrls.forEach(function(u) { console.log(' ', u.status, u.url); });

  await browser.close();
}
run().catch(function(e) { console.error('Fatal:', e.message); });
