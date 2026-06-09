'use strict';

const fs   = require('fs');
const path = require('path');
const axios = require('axios');

const ENV_FILE = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.igextractor.env');
const API_BASE = process.env.IGX_API_URL || 'https://igextractor-backend.onrender.com';
const TIMEOUT  = 6000;

let _cachedPlan = null;

// ─── Read/save env helpers (with BOM stripping for Windows) ──────────────────
function readEnvRaw() {
  try {
    if (!fs.existsSync(ENV_FILE)) return '';
    return fs.readFileSync(ENV_FILE, 'utf8').replace(/^\uFEFF/, '');
  } catch { return ''; }
}

function writeEnvRaw(content) {
  fs.writeFileSync(ENV_FILE, content.replace(/^\uFEFF/, ''), { mode: 0o600 });
}

// ─── Read/Write .env ──────────────────────────────────────────────────────────
function readApiKey() {
  try {
    const content = readEnvRaw();
    if (!content) return null;
    const match = content.match(/IGX_API_KEY=([^\s\n]+)/);
    return match ? match[1].trim() : null;
  } catch { return null; }
}

function saveApiKey(key) {
  let content = readEnvRaw();
  content = content.replace(/IGX_API_KEY=[^\n]*\n?/g, '');
  content += `IGX_API_KEY=${key.trim()}\n`;
  writeEnvRaw(content);
}

function removeApiKey() {
  let content = readEnvRaw();
  if (!content) return;
  content = content.replace(/IGX_API_KEY=[^\n]*\n?/g, '');
  writeEnvRaw(content);
}

function readSessionId() {
  try {
    const content = readEnvRaw();
    if (!content) return null;
    const m = content.match(/IGX_SESSION=([^\n]+)/);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

function saveSessionId(sessionId) {
  let content = readEnvRaw();
  content = content.replace(/IGX_SESSION=[^\n]*\n?/g, '');
  if (sessionId && sessionId.trim()) content += `IGX_SESSION=${sessionId.trim()}\n`;
  writeEnvRaw(content);
}

// ─── Validate key against backend ────────────────────────────────────────────
async function validateKey(key) {
  if (!key) return { valid: false, plan: 'free' };
  try {
    const res = await axios.post(
      `${API_BASE}/validate`,
      { key },
      { timeout: TIMEOUT, headers: { 'Content-Type': 'application/json' } }
    );
    return res.data;
  } catch (e) {
    if (['ECONNREFUSED','ENOTFOUND','ETIMEDOUT','ECONNABORTED'].includes(e.code)) {
      return { valid: false, plan: 'free', offline: true };
    }
    return { valid: false, plan: 'free', error: e.message };
  }
}

// ─── Boot check ───────────────────────────────────────────────────────────────
async function checkLicense() {
  const key = readApiKey();
  if (!key) { _cachedPlan = 'free'; return { plan: 'free', valid: false, key: null }; }

  const result = await validateKey(key);

  if (result.offline) {
    const formatOk = /^IGX-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/i.test(key);
    _cachedPlan = formatOk ? 'pro' : 'free';
    return { plan: _cachedPlan, valid: formatOk, offline: true, key };
  }

  _cachedPlan = result.valid ? 'pro' : 'free';
  return { plan: _cachedPlan, valid: result.valid, key, ...result };
}

function isPro()    { return _cachedPlan === 'pro'; }
function getPlan()  { return _cachedPlan || 'free'; }
function setPlan(p) { _cachedPlan = p; }

module.exports = { readApiKey, saveApiKey, removeApiKey, validateKey, checkLicense, isPro, getPlan, setPlan, ENV_FILE, readSessionId, saveSessionId };

module.exports.readSessionId = readSessionId;
module.exports.saveSessionId = saveSessionId;
