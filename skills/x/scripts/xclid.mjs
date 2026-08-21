// x-client-transaction-id generator — JS port of twscrape's `xclid.py`.
//
// X requires this header on its private GraphQL endpoints (search, writes).
// The value is normally computed by X's own obfuscated web bundle; reproducing
// it here lets the skill make signed requests WITHOUT driving a browser.
//
// Provenance: ported from vladkens/twscrape (MIT), which credits
// iSarabjitDhiman/XClientTransaction (MIT) for the original algorithm, and
// fa0311/twitter-tid-deobf for the deobfuscated reference.
//
// FRAGILITY: this parses X's live web bundle. When X reshuffles that bundle the
// parse breaks and generation throws. Callers MUST treat a throw as "fall back
// to the headed browser", never as a fatal error. See references/architecture.md.

import { createHash, randomInt } from 'node:crypto';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export class XClIdError extends Error {}

// ---------------------------------------------------------------------------
// Python-compatible numeric helpers
// ---------------------------------------------------------------------------

// Python's round(): half-to-even ("banker's rounding"). JS Math.round is
// half-up, which would diverge on exact .5 values.
function pyRound(x, digits = 0) {
  const m = Math.pow(10, digits);
  const v = x * m;
  const f = Math.floor(v);
  const diff = v - f;
  let r;
  if (Math.abs(diff - 0.5) < Number.EPSILON * Math.abs(v || 1) * 8 || diff === 0.5) {
    r = (f % 2 === 0) ? f : f + 1;           // tie -> even
  } else {
    r = Math.round(v);
  }
  return digits === 0 ? r : r / m;
}

function floatToHex(x) {
  const result = [];
  let quotient = Math.trunc(x);
  const fraction = x - quotient;
  let cur = x;
  while (quotient > 0) {
    quotient = Math.trunc(cur / 16);
    const remainder = Math.trunc(cur - quotient * 16);
    result.unshift(remainder > 9 ? String.fromCharCode(remainder + 55) : String(remainder));
    cur = quotient;
  }
  if (fraction === 0) return result.join('');
  result.push('.');
  let f = fraction;
  // Multiplying a double by 16 is an exact binary shift, so this terminates
  // (<= ~14 iterations for a 53-bit mantissa). Cap anyway as a guard.
  for (let i = 0; f > 0 && i < 32; i++) {
    f *= 16;
    const integer = Math.trunc(f);
    f -= integer;
    result.push(integer > 9 ? String.fromCharCode(integer + 55) : String(integer));
  }
  return result.join('');
}

// ---------------------------------------------------------------------------
// Cubic bezier solver (X animates a curve; its value seeds the key)
// ---------------------------------------------------------------------------

class Cubic {
  constructor(curves) { this.curves = curves; }
  static calculate(a, b, m) {
    return 3.0 * a * (1 - m) * (1 - m) * m + 3.0 * b * (1 - m) * m * m + m * m * m;
  }
  getValue(time) {
    let startGradient = 0, endGradient = 0, start = 0, mid = 0, end = 1.0;
    const c = this.curves;
    if (time <= 0.0) {
      if (c[0] > 0.0) startGradient = c[1] / c[0];
      else if (c[1] === 0.0 && c[2] > 0.0) startGradient = c[3] / c[2];
      return startGradient * time;
    }
    if (time >= 1.0) {
      if (c[2] < 1.0) endGradient = (c[3] - 1.0) / (c[2] - 1.0);
      else if (c[2] === 1.0 && c[0] < 1.0) endGradient = (c[1] - 1.0) / (c[0] - 1.0);
      return 1.0 + endGradient * (time - 1.0);
    }
    while (start < end) {
      mid = (start + end) / 2;
      const xEst = Cubic.calculate(c[0], c[2], mid);
      if (Math.abs(time - xEst) < 0.00001) return Cubic.calculate(c[1], c[3], mid);
      if (xEst < time) start = mid; else end = mid;
    }
    return Cubic.calculate(c[1], c[3], mid);
  }
}

function interpolate(fromList, toList, f) {
  return fromList.map((a, i) => a * (1 - f) + toList[i] * f);
}
function rotationMatrix(rotation) {
  const rad = (rotation * Math.PI) / 180;
  return [Math.cos(rad), -Math.sin(rad), Math.sin(rad), Math.cos(rad)];
}
function solve(value, minVal, maxVal, rounding) {
  const result = (value * (maxVal - minVal)) / 255 + minVal;
  return rounding ? Math.floor(result) : pyRound(result, 2);
}

function calcAnimKey(frames, targetTime) {
  const fromColor = [...frames.slice(0, 3), 1];
  const toColor = [...frames.slice(3, 6), 1];
  const fromRotation = [0.0];
  const toRotation = [solve(frames[6], 60.0, 360.0, true)];

  const rest = frames.slice(7);
  const curves = rest.map((x, i) => solve(x, i % 2 ? -1.0 : 0.0, 1.0, false));
  const val = new Cubic(curves).getValue(targetTime);

  let color = interpolate(fromColor, toColor, val).map((v) => Math.max(0, Math.min(255, v)));
  const rotation = interpolate(fromRotation, toRotation, val);
  const matrix = rotationMatrix(rotation[0]);

  const strArr = color.slice(0, -1).map((v) => pyRound(v, 0).toString(16));
  for (const value of matrix) {
    let rounded = pyRound(value, 2);
    if (rounded < 0) rounded = -rounded;
    const hexValue = floatToHex(rounded);
    strArr.push(hexValue.startsWith('.') ? `0${hexValue}`.toLowerCase() : (hexValue || '0'));
  }
  strArr.push('0', '0');
  return strArr.join('').replace(/[.-]/g, '');
}

// ---------------------------------------------------------------------------
// Page / bundle parsing
// ---------------------------------------------------------------------------

const ASSET_URL_RE = /https:\/\/[\w.-]+\/x-web\/[\w./-]+\.js/g;
const LOGGED_OUT_ENTRY_RE = /(?:^|\/)entry-client-logged-out(?:[-.][^/?#]+)?\.js(?:[?#].*)?$/;
const INDICES_FILE_RE = /(?:\.{0,2}\/)?[\w./-]*?\b(?:ondemand\.s|sign\.o)[\w.-]*\.js/;
const INDICES_RE = /(\(\w\[(\d{1,2})\],\s*16\))+/g;

async function getText(url, cookieHeader) {
  const rep = await fetch(url, { headers: { 'user-agent': UA, cookie: cookieHeader, accept: 'text/html,*/*' } });
  if (!rep.ok) throw new XClIdError(`fetch ${url} -> HTTP ${rep.status}`);
  const text = await rep.text();
  // X sometimes serves a JS redirect shim before the real document.
  if (text.includes('>document.location =')) {
    const next = text.split('document.location = "')[1]?.split('"')[0];
    if (next) return getText(next, cookieHeader);
  }
  return text;
}

function getScriptsList(text) {
  const urls = [...new Set(text.match(ASSET_URL_RE) || [])];
  if (urls.length) {
    if (urls.some((u) => LOGGED_OUT_ENTRY_RE.test(u))) {
      throw new XClIdError('X served the logged-out web app (cookies not applied)');
    }
    return urls;
  }
  // Legacy webpack build: reconstruct chunk URLs from the two embedded maps.
  const hashMap = {};
  for (const m of text.matchAll(/(\d+):"([0-9a-f]{7})"/g)) hashMap[m[1]] = m[2];
  if (!Object.keys(hashMap).length) throw new XClIdError('X web scripts not found');
  const nameMap = {};
  for (const m of text.matchAll(/(\d+):"([^"]+)"/g)) {
    if (!/^[0-9a-f]{7}$/.test(m[2])) nameMap[m[1]] = m[2];
  }
  return Object.entries(hashMap).map(([id, hash]) =>
    `https://abs.twimg.com/responsive-web/client-web/${nameMap[id] || id}.${hash}a.js`);
}

// The indices file is dynamically imported from a bundle chunk; scan chunks
// (bounded concurrency) and resolve the first reference found.
async function findIndicesUrl(scripts, cookieHeader) {
  const queue = [...scripts];
  let found = null;
  const worker = async () => {
    while (!found && queue.length) {
      const url = queue.shift();
      try {
        const rep = await fetch(url, { headers: { 'user-agent': UA, cookie: cookieHeader } });
        if (!rep.ok) continue;
        const body = await rep.text();
        const m = body.match(INDICES_FILE_RE);
        if (m && !found) { found = new URL(m[0], url).toString(); return; }
      } catch { /* chunk fetch failed; try the next */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(16, scripts.length) }, worker));
  if (!found) throw new XClIdError('Signing script not found in bundle chunks');
  return found;
}

function parseVkBytes(html) {
  const m = html.match(/<meta[^>]+name=["']twitter-site-verification["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter-site-verification["']/i);
  if (!m) throw new XClIdError('X verification key not found');
  const buf = Buffer.from(m[1], 'base64');
  if (!buf.length) throw new XClIdError('Invalid X verification key');
  return [...buf];
}

// svg[id^='loading-x-anim'] g:first-child path:nth-child(2)
function parseAnimArr(html, vkBytes) {
  const ds = [];
  for (const svg of html.matchAll(/<svg[^>]*id=["']loading-x-anim[^"']*["'][^>]*>([\s\S]*?)<\/svg>/g)) {
    const gMatch = svg[1].match(/<g[^>]*>([\s\S]*?)<\/g>/);
    if (!gMatch) continue;
    const paths = [...gMatch[1].matchAll(/<path[^>]*\sd=["']([^"']+)["']/g)];
    if (paths.length >= 2) ds.push(paths[1][1].trim());
  }
  if (!ds.length) throw new XClIdError('Animation data not found');
  const idx = vkBytes[5] % ds.length;
  const parts = ds[idx].slice(9).split('C');
  const arr = parts.map((x) => x.replace(/[^\d]+/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number));
  if (!arr.length || arr.some((row) => row.some((n) => Number.isNaN(n)))) {
    throw new XClIdError('Invalid animation data');
  }
  return arr;
}

async function parseAnimIdx(html, cookieHeader) {
  const scripts = getScriptsList(html);
  if (!scripts.length) throw new XClIdError('X web scripts not found');
  const direct = scripts.filter((s) => INDICES_FILE_RE.test(s));
  const url = direct.length ? direct[0] : await findIndicesUrl(scripts, cookieHeader);
  const text = await getText(url, cookieHeader);
  const items = [...text.matchAll(INDICES_RE)].map((m) => parseInt(m[2], 10));
  if (!items.length) throw new XClIdError('Signing indices not found');
  return items;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export class XClIdGen {
  constructor(vkBytes, animKey) { this.vkBytes = vkBytes; this.animKey = animKey; }

  // Build a generator by parsing X's live, AUTHENTICATED web build.
  static async create(cookieHeader) {
    if (!cookieHeader) throw new XClIdError('cookies are required to build the generator');
    const html = await getText('https://x.com/tesla', cookieHeader);
    const animIdx = await parseAnimIdx(html, cookieHeader);
    const vkBytes = parseVkBytes(html);
    const animArr = parseAnimArr(html, vkBytes);

    let frameTime = 1;
    for (const x of animIdx.slice(1)) frameTime *= vkBytes[x] % 16;
    frameTime = Math.floor(frameTime / 10 + 0.5) * 10;

    const frameIdx = vkBytes[animIdx[0]] % 16;
    const frameRow = animArr[frameIdx];
    if (!frameRow) throw new XClIdError('Animation frame row out of range');
    const animKey = calcAnimKey(frameRow, frameTime / 4096);
    return new XClIdGen(vkBytes, animKey);
  }

  calc(method, path) {
    const ts = Math.floor((Date.now() - 1682924400 * 1000) / 1000);
    const tsBytes = [0, 1, 2, 3].map((i) => (ts >> (i * 8)) & 0xff);
    const DKW = 'obfiowerehiring', DRN = 3;
    const payload = `${method.toUpperCase()}!${path}!${ts}${DKW}${this.animKey}`;
    const hash = [...createHash('sha256').update(payload).digest()];
    const pld = [...this.vkBytes, ...tsBytes, ...hash.slice(0, 16), DRN];
    const num = randomInt(0, 256);
    const bytes = Buffer.from([num, ...pld.map((x) => x ^ num)]);
    return bytes.toString('base64').replace(/=+$/, '');
  }
}
