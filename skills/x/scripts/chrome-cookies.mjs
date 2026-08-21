#!/usr/bin/env node
// Self-contained X (Twitter) session-cookie extractor for Chromium-family browsers.
//
// Reads the `auth_token` and `ct0` cookies for x.com out of a locally installed
// browser's cookie store and decrypts them with the OS keystore key. This is the
// same mechanism Field Theory uses; ported here so the `x` skill has no runtime
// dependency on Field Theory being installed.
//
// Supported: macOS (Keychain), Linux (Secret Service / fixed key). Windows and
// everything else fall back to the manual path (pass values in via env).
//
// SECURITY: this prints cookie values to stdout ONLY as JSON so the caller can
// capture them into a locked file. Never log the returned object anywhere the
// user or a transcript can see it.

import { execFileSync } from 'node:child_process';
import { existsSync, copyFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform, homedir } from 'node:os';
import { pbkdf2Sync, createDecipheriv, randomUUID } from 'node:crypto';

const BROWSERS = {
  chrome: {
    dir: 'Google/Chrome',
    keychainService: 'Chrome Safe Storage',
    keychainAccount: 'Chrome',
    linuxApp: 'chrome',
  },
  brave: {
    dir: 'BraveSoftware/Brave-Browser',
    keychainService: 'Brave Safe Storage',
    keychainAccount: 'Brave',
    linuxApp: 'brave',
  },
  edge: {
    dir: 'Microsoft Edge',
    keychainService: 'Microsoft Edge Safe Storage',
    keychainAccount: 'Microsoft Edge',
    linuxApp: 'chrome',
  },
  chromium: {
    dir: 'Chromium',
    keychainService: 'Chromium Safe Storage',
    keychainAccount: 'Chromium',
    linuxApp: 'chromium',
  },
};

function userDataDir(browser) {
  const home = homedir();
  const os = platform();
  if (os === 'darwin') return join(home, 'Library', 'Application Support', browser.dir);
  if (os === 'linux') return join(home, '.config', browser.dir.toLowerCase().replace('google/', ''));
  throw new Error(`Automatic cookie extraction is not supported on ${os}. Pass X_CT0 and X_AUTH_TOKEN via env instead.`);
}

function macKey(browser) {
  const pw = execFileSync('security',
    ['find-generic-password', '-w', '-s', browser.keychainService, '-a', browser.keychainAccount],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  if (!pw) throw new Error(`Empty ${browser.keychainService} password from Keychain.`);
  return pbkdf2Sync(pw, 'saltysalt', 1003, 16, 'sha1');
}

function linuxKeys(browser) {
  const v10 = pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
  let v11 = null;
  try {
    const pw = execFileSync('secret-tool', ['lookup', 'application', browser.linuxApp],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }).trim();
    if (pw) v11 = pbkdf2Sync(pw, 'saltysalt', 1, 16, 'sha1');
  } catch { /* secret-tool absent -> v10 only */ }
  return { v10, v11 };
}

function cookieDbPath(dataDir, profile) {
  const net = join(dataDir, profile, 'Network', 'Cookies');
  if (existsSync(net)) return net;
  return join(dataDir, profile, 'Cookies');
}

function sqlite(dbPath, args) {
  const run = (p) => execFileSync('sqlite3', [...args.slice(0, -1), p, args[args.length - 1]],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }).trim();
  try { return run(dbPath); }
  catch {
    // Browser holds a lock while open; work on a copy.
    const tmp = join(tmpdir(), `x-ck-${randomUUID()}.db`);
    try { copyFileSync(dbPath, tmp); return run(tmp); }
    finally { try { unlinkSync(tmp); } catch {} }
  }
}

function dbVersion(dbPath) {
  try { return parseInt(sqlite(dbPath, ['-batch', "SELECT value FROM meta WHERE key='version';"]), 10) || 0; }
  catch { return 0; }
}

function decrypt(hex, key, ver, v11) {
  if (!hex) return '';
  const buf = Buffer.from(hex, 'hex');
  if (buf.length === 0) return '';
  const isV10 = buf[0] === 0x76 && buf[1] === 0x31 && buf[2] === 0x30;
  const isV11 = buf[0] === 0x76 && buf[1] === 0x31 && buf[2] === 0x31;
  if (!isV10 && !isV11) return buf.toString('utf8');
  const dkey = isV11 && v11 ? v11 : key;
  const iv = Buffer.alloc(16, 0x20);
  const decipher = createDecipheriv('aes-128-cbc', dkey, iv);
  let out = Buffer.concat([decipher.update(buf.subarray(3)), decipher.final()]);
  // Chrome DB version >= 24 prepends SHA256(host_key) to the plaintext.
  if (ver >= 24 && out.length > 32) out = out.subarray(32);
  return out.toString('utf8');
}

export function extractXCookies({ browser = 'chrome', profile = 'Default' } = {}) {
  const os = platform();
  const br = BROWSERS[browser];
  if (!br) throw new Error(`Unknown browser '${browser}'. Supported: ${Object.keys(BROWSERS).join(', ')}.`);
  const dataDir = userDataDir(br);
  const dbPath = cookieDbPath(dataDir, profile);
  if (!existsSync(dbPath)) {
    throw new Error(`No cookie DB for ${browser} profile '${profile}' at ${dbPath}. Log into x.com in that browser/profile first, or set --profile.`);
  }
  let key, v11;
  if (os === 'darwin') key = macKey(br);
  else if (os === 'linux') ({ v10: key, v11 } = linuxKeys(br));
  else throw new Error(`Unsupported OS ${os}.`);

  const ver = dbVersion(dbPath);
  const query = (domain) => {
    const sql = `SELECT name, hex(encrypted_value) AS ev, value FROM cookies WHERE host_key LIKE '%${domain}' AND name IN ('ct0','auth_token');`;
    const out = sqlite(dbPath, ['-json', '-batch', sql]);
    if (!out || out === '[]') return [];
    try { return JSON.parse(out); } catch { return []; }
  };
  let rows = query('.x.com');
  if (rows.length === 0) rows = query('.twitter.com');

  const vals = {};
  for (const r of rows) vals[r.name] = r.ev ? decrypt(r.ev, key, ver, v11) : (r.value || '');
  const ct0 = (vals.ct0 || '').trim();
  const authToken = (vals.auth_token || '').trim();
  if (!ct0 || !authToken) {
    throw new Error(`Not logged into X in ${browser} profile '${profile}' (missing ${!ct0 ? 'ct0' : 'auth_token'}). Open x.com there and log in, then retry.`);
  }
  if (!/^[\x21-\x7E]+$/.test(ct0)) {
    throw new Error(`Could not decrypt cookies (garbled ct0). Close ${browser} fully and retry, or pass X_CT0/X_AUTH_TOKEN via env.`);
  }
  return { ct0, authToken };
}

// CLI: prints JSON {ct0, authToken} to stdout. Caller must redirect to a 600 file.
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };
  // Manual override path: env beats extraction.
  if (process.env.X_CT0 && process.env.X_AUTH_TOKEN) {
    process.stdout.write(JSON.stringify({ ct0: process.env.X_CT0.trim(), authToken: process.env.X_AUTH_TOKEN.trim() }));
    process.exit(0);
  }
  try {
    const creds = extractXCookies({ browser: opt('browser', 'chrome'), profile: opt('profile', 'Default') });
    process.stdout.write(JSON.stringify(creds));
  } catch (e) {
    process.stderr.write(String(e.message || e));
    process.exit(1);
  }
}
