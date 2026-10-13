// Full-journey check for the flow gate. Copy into the project (e.g. tools/flow.mjs), fill STEPS with the
// site's real journey, then run:  node tools/flow.mjs <baseUrl> <outDir> [chromium firefox webkit]
// Needs the `playwright` package and its browsers (npx playwright install chromium firefox webkit).
// Writes <outDir>/flow-<browser>.log, each ending in "FLOW PASS" or "FLOW FAIL: <reasons>"; record the three
// logs with: storyworld.mjs gate flow --evidence <outDir>/flow-chromium.log --evidence ... firefox ... webkit
import fs from 'node:fs';
import path from 'node:path';
import * as pw from 'playwright';

const [base, outDir = 'flow-logs', ...names] = process.argv.slice(2);
if (!base) { console.log('usage: node flow.mjs <baseUrl> <outDir> [chromium firefox webkit]'); process.exit(2); }
const BROWSERS = names.length ? names : ['chromium', 'firefox', 'webkit'];

// One entry per user action. Cover every route, every overlay opened and closed, scrubber moves, graph zoom
// and drag, storyline steps in both directions, language switch and share. `check` returns true when the step
// landed (the route, a visible element, a changed title).
const STEPS = [
  { name: 'home', run: (p) => p.goto(base, { waitUntil: 'load' }), check: (p) => p.locator('canvas').first().isVisible() },
  // { name: 'scrub to 2023', run: (p) => p.locator('[data-scrubber]').click({ position: { x: 300, y: 10 } }), check: (p) => p.url().includes('asOf=2023') },
];

fs.mkdirSync(outDir, { recursive: true });
let anyFail = false;
for (const name of BROWSERS) {
  const log = [];
  const fail = [];
  const say = (s) => { log.push(s); console.log(`[${name}] ${s}`); };
  const browser = await pw[name].launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => fail.push(`pageerror: ${e.message}`));
  page.on('crash', () => fail.push('renderer crashed'));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') fail.push(`console error: ${t.slice(0, 200)}`);
    if (/shader|compile|link(ing)? (failed|error)|WebGL: (CONTEXT_LOST|INVALID)/i.test(t)) fail.push(`gl: ${t.slice(0, 200)}`);
  });
  for (const s of STEPS) {
    try {
      await s.run(page);
      await page.waitForTimeout(s.waitMs ?? 1500);
      const ok = s.check ? await s.check(page) : true;
      say(`${ok ? 'ok  ' : 'MISS'} ${s.name} ${page.url()}`);
      if (!ok) fail.push(`step ${s.name} did not land`);
    } catch (e) {
      fail.push(`step ${s.name} threw: ${String(e.message).split('\n')[0]}`);
      say(`ERR  ${s.name}`);
      break;
    }
  }
  await browser.close();
  log.push(fail.length ? `FLOW FAIL: ${fail.join(' | ')}` : 'FLOW PASS');
  fs.writeFileSync(path.join(outDir, `flow-${name}.log`), log.join('\n') + '\n');
  console.log(`[${name}] ${log.at(-1)}`);
  anyFail ||= fail.length > 0;
}
process.exit(anyFail ? 1 : 0);
