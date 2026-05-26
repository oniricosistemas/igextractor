const fs = require('fs');
const path = require('path');
const scraper = require('../../src/scraper');

async function runManualTest() {
  const debugBase = path.join(process.cwd(), 'ig_test_debug', Date.now().toString());
  process.env.IG_DEBUG_BASE = debugBase;
  
  console.log('Using debugBase:', debugBase);
  
  try {
    const dir = 'network';
    const filename = 'manual_test.json';
    const content = { ts: Date.now(), ok: true };
    
    await scraper.saveDebugFile(dir, filename, content);
    
    const expectedPath = path.join(debugBase, dir, filename);
    if (fs.existsSync(expectedPath)) {
      console.log('OK');
      process.exit(0);
    } else {
      console.error('FAIL: File not found at', expectedPath);
      process.exit(2);
    }
  } catch (e) {
    console.error('FAIL: Unexpected error:', e.message);
    process.exit(2);
  }
}

runManualTest();
