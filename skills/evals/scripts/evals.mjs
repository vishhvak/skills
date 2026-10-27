#!/usr/bin/env node
// evals: a provider-neutral eval runner and hillclimb ledger.
//
// The runner never calls a model. The app under test and every grader are
// commands named in eval.json; the runner hands each one a JSON object on
// stdin and reads one JSON object from the last line of its stdout. That is
// the whole contract (reference/adapters.md), so any app, harness, model or
// gateway fits.
//
// Usage: node evals.mjs <command> [--eval <dir>] [flags]
// Commands: status init check smoke signoff approve run regrade split goal
//           score record report

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const SKILL_DIR = path.dirname(path.dirname(SELF));
// Pilot runs try the flow before approval; they never count as rounds.
const isPilot = (v) => v === 'pilot' || v.startsWith('pilot-');

// ---------- small utilities ----------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

function die(msg, code = 1) { console.log(msg); process.exit(code); }
function readJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die(`BLOCKED: ${p} is not valid JSON: ${e.message}`); }
}
function writeJson(p, v) { fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); }
function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  const out = [];
  fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try { out.push(JSON.parse(line)); }
    catch { die(`BLOCKED: ${p}:${i + 1} is not valid JSON`); }
  });
  return out;
}
function appendJsonl(p, v) { fs.appendFileSync(p, JSON.stringify(v) + '\n'); }
const safeId = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (x, d = 3) => {
  if (x === null || x === undefined || Number.isNaN(x)) return '-';
  const n = Math.abs(Number(x)) < 1e-12 ? 0 : Number(x);
  return n !== 0 && Math.abs(n) < 0.01 && d > 0 ? n.toPrecision(2) : n.toFixed(d);
};
const signed = (x, d) => (x === null || x === undefined ? '-' : `${x >= 0 ? '+' : ''}${fmt(x, d)}`);
const list = (v) => (v === undefined || v === true ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean));

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
// 95% half-width of a mean over n cases (normal approximation).
function halfWidth(xs) { return xs.length < 2 ? null : (1.96 * sd(xs)) / Math.sqrt(xs.length); }

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- locating and loading an eval ----------

function findEvalDir(args) {
  if (args.eval) return path.resolve(String(args.eval));
  if (fs.existsSync('eval.json')) return process.cwd();
  const roots = ['evals', '.evals'].filter((d) => fs.existsSync(d));
  const found = roots.flatMap((r) => fs.readdirSync(r).map((n) => path.join(r, n)))
    .filter((d) => fs.existsSync(path.join(d, 'eval.json')));
  if (found.length === 1) return path.resolve(found[0]);
  if (found.length > 1) die(`PICK: several evals here; pass one of:\n${found.map((d) => `  --eval ${d}`).join('\n')}`);
  return null;
}

function load(args) {
  const dir = findEvalDir(args);
  if (!dir || !fs.existsSync(path.join(dir, 'eval.json'))) {
    die(`NO_EVAL: no eval.json found.\nnext: node ${SELF} init --name <flow> [--dir evals/<flow>]`);
  }
  const config = readJson(path.join(dir, 'eval.json'));
  const state = readJson(path.join(dir, 'state.json'), {});
  const cases = readJsonl(path.join(dir, config.cases || 'cases.jsonl'));
  const expectedRows = config.expected ? readJsonl(path.join(dir, config.expected)) : [];
  const expected = new Map(expectedRows.map((r) => [String(r.id), r]));
  return { dir, config, state, cases, expected, runsDir: path.join(dir, 'runs') };
}

function saveState(ev) { writeJson(path.join(ev.dir, 'state.json'), ev.state); }

// The files whose change makes earlier numbers incomparable: the config,
// the cases and answers, every harness path, and this runner.
function harnessFiles(ev) {
  const files = ['eval.json', ev.config.cases || 'cases.jsonl'];
  if (ev.config.expected) files.push(ev.config.expected);
  for (const p of ev.config.harness_paths || []) files.push(p);
  const hashes = {};
  for (const f of [...new Set(files)]) {
    const abs = path.resolve(ev.dir, f);
    hashes[f] = fs.existsSync(abs) ? sha(fs.readFileSync(abs)) : 'MISSING';
  }
  // Which models run, at what price and how many reps does not change how
  // one trial is measured, so editing those keeps earlier runs comparable.
  const { models, prices, model_aliases, reps, description, ...measured } = ev.config;
  hashes['eval.json'] = sha(JSON.stringify(measured));
  hashes['<runner>'] = sha(fs.readFileSync(SELF));
  return hashes;
}
// The runner is approved like any harness file, but it is left out of the
// comparability hash: updating the skill should not make every run stale.
function harnessSha(hashes) {
  const { '<runner>': _runner, ...measured } = hashes;
  return sha(JSON.stringify(Object.entries(measured).sort()));
}
function harnessDrift(ev) {
  const cur = harnessFiles(ev);
  const approved = ev.state.approved?.files;
  if (!approved) return { status: 'UNAPPROVED', changed: [], sha: harnessSha(cur) };
  const changed = Object.keys({ ...cur, ...approved }).filter((k) => cur[k] !== approved[k]);
  return { status: changed.length ? 'CHANGED' : 'APPROVED', changed, sha: harnessSha(cur) };
}

// The app's own state: git HEAD plus every uncommitted change outside the
// eval directory. A run resumed under a different fingerprint would mix two
// versions of the app in one set of rows.
function appFingerprint(ev) {
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
  let root;
  try { root = git(ev.dir, 'rev-parse', '--show-toplevel').toString().trim(); } catch { return null; }
  const evalRel = path.relative(root, ev.dir);
  const spec = ['--', '.', ...(evalRel ? [`:(exclude)${evalRel}`] : [])];
  let head = 'no-commit';
  try { head = git(root, 'rev-parse', 'HEAD').toString().trim(); } catch { /* repository without commits */ }
  const h = crypto.createHash('sha256').update(head);
  try { h.update(git(root, 'diff', 'HEAD', '--binary', ...spec)); } catch { /* no HEAD to diff against */ }
  const untracked = git(root, 'ls-files', '--others', '--exclude-standard', ...spec).toString().split('\n').filter(Boolean).sort();
  for (const f of untracked) {
    h.update(f);
    try {
      const st = fs.statSync(path.join(root, f));
      h.update(st.size < 1 << 20 ? fs.readFileSync(path.join(root, f)) : `${st.size}:${st.mtimeMs}`);
    } catch { /* removed while hashing */ }
  }
  return `${head.slice(0, 12)}+${h.digest('hex').slice(0, 12)}`;
}

function problems(ev) {
  const out = [];
  const { config, cases, expected } = ev;
  if (!config.run?.command) out.push('eval.json has no run.command (the adapter that runs the app on one case)');
  if (!(config.graders || []).length) out.push('eval.json has no graders');
  if (!cases.length) out.push(`${config.cases || 'cases.jsonl'} has no cases`);
  const seen = new Map();
  for (const c of cases) {
    if (c.id === undefined) { out.push('a case has no id'); continue; }
    if (c.input === undefined) out.push(`case ${c.id} has no input`);
    if ('expected' in c || 'reference' in c) out.push(`case ${c.id} carries its answer in the cases file; move it to ${config.expected || 'expected.jsonl'} so the app never sees it`);
    if (/^example-\d+$/.test(String(c.id))) out.push(`case ${c.id} is the scaffold's example; replace the example cases with the real ones`);
    const s = safeId(c.id);
    if (seen.has(s)) out.push(`case ids ${seen.get(s)} and ${c.id} collide as file names`);
    seen.set(s, c.id);
  }
  if (config.expected) {
    for (const c of cases) if (!expected.has(String(c.id))) out.push(`case ${c.id} has no row in ${config.expected}`);
    const ids = new Set(cases.map((c) => String(c.id)));
    for (const id of expected.keys()) if (!ids.has(id)) out.push(`${config.expected} row ${id} matches no case`);
  }
  for (const p of config.harness_paths || []) if (!fs.existsSync(path.resolve(ev.dir, p))) out.push(`harness path ${p} does not exist`);
  return out;
}

// ---------- run layout ----------

function runDir(ev, variant, model) { return path.join(ev.runsDir, safeId(variant), safeId(model)); }
function listRuns(ev) {
  if (!fs.existsSync(ev.runsDir)) return [];
  const out = [];
  for (const v of fs.readdirSync(ev.runsDir)) {
    const vd = path.join(ev.runsDir, v);
    if (!fs.statSync(vd).isDirectory()) continue;
    for (const m of fs.readdirSync(vd)) {
      const md = path.join(vd, m);
      if (fs.statSync(md).isDirectory() && fs.existsSync(path.join(md, 'meta.json'))) {
        out.push({ variant: v, model: m, dir: md, meta: readJson(path.join(md, 'meta.json')) });
      }
    }
  }
  return out;
}

function selectCases(ev, spec) {
  const all = [...ev.cases].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!spec || spec === 'all') return all;
  if (spec === 'train' || spec === 'test') {
    const ids = ev.state.split?.[spec];
    if (!ids) die(`BLOCKED: --cases ${spec} needs a split.\nnext: node ${SELF} split`);
    const set = new Set(ids);
    return all.filter((c) => set.has(String(c.id)));
  }
  const set = new Set(list(spec));
  return all.filter((c) => set.has(String(c.id)));
}

// The first N cases taken round-robin across tags[0], so a pilot or a
// canary sees every kind of case, not the first few ids.
function spread(cases, n) {
  const groups = new Map();
  for (const c of cases) { const t = c.tags?.[0] ?? ''; if (!groups.has(t)) groups.set(t, []); groups.get(t).push(c); }
  const out = [];
  for (let i = 0; out.length < n && out.length < cases.length; i++) {
    for (const g of groups.values()) if (g[i] && out.length < n) out.push(g[i]);
  }
  return out;
}

function modelsFor(ev, args) {
  if (args.models === 'all') return ev.config.models?.length ? ev.config.models : ['default'];
  const named = list(args.model);
  if (named.length) return named;
  const configured = ev.config.models || [];
  if (configured.length <= 1) return configured.length ? configured : ['default'];
  die(`PICK: eval.json lists several models; pass --model <id>[,<id>] or --models all:\n  ${configured.join(', ')}`);
}

// ---------- spawning adapters and graders ----------

function runCommand(command, { input, cwd, env, timeoutS }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, { shell: true, cwd, env, detached: process.platform !== 'win32' });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const cap = 64 * 1024 * 1024;
    child.stdout.on('data', (d) => { if (stdout.length < cap) stdout += d; });
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-8192); });
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }, timeoutS * 1000);
    child.on('error', (e) => { stderr += String(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const seconds = (Date.now() - started) / 1000;
      const lines = stdout.trim().split('\n').filter((l) => l.trim());
      let json = null;
      for (let i = lines.length - 1; i >= 0 && json === null; i--) {
        try { const v = JSON.parse(lines[i]); if (v && typeof v === 'object' && !Array.isArray(v)) json = v; } catch { /* not the result line */ }
      }
      resolve({ code, json, stderr, timedOut, seconds });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(input));
  });
}

function normalizeGrade(grade, name) {
  if (grade === null || grade === undefined) return {};
  if (typeof grade === 'boolean' || typeof grade === 'number') return { [name]: grade };
  if (typeof grade === 'object') return grade;
  return {};
}

// A model id may carry settings after '@' (gpt-6-sol@high); the adapter
// reads them, and the served-model check and prices use the part before.
const baseModel = (m) => String(m ?? '').split('@')[0];

function servedMatches(ev, requestedFull, served) {
  const mode = ev.config.served_model_check || 'prefix';
  const requested = baseModel(requestedFull);
  if (mode === 'off' || requested === 'default') return true;
  if (!served) return false;
  const names = [requested, ...((ev.config.model_aliases || {})[requested] || [])];
  if (names.includes(served)) return true;
  if (mode === 'prefix') return names.some((n) => served.startsWith(n) || served.endsWith(`/${n}`));
  return false;
}

async function gradeTrial(ev, { kase, model, output, transcript, artifacts, workdir }) {
  const grade = {};
  const explanation = {};
  const judges = [];
  for (const g of ev.config.graders) {
    const name = g.name || 'grade';
    const res = await runCommand(g.command, {
      input: { case: kase, expected: ev.expected.get(String(kase.id)) ?? null, model, output, transcript, artifacts, workdir },
      cwd: ev.dir,
      env: { ...process.env, ...(g.env || {}), EVAL_WORKDIR: workdir || '' },
      timeoutS: g.timeout_s || 300,
    });
    if (res.timedOut || res.code !== 0 || !res.json || res.json.error) {
      return { error: { class: 'grader', grader: name, message: res.json?.error || (res.timedOut ? 'grader timed out' : `grader exit ${res.code}`), stderr: res.stderr.slice(-2000) } };
    }
    Object.assign(grade, normalizeGrade(res.json.grade, name));
    if (res.json.explanation) Object.assign(explanation, typeof res.json.explanation === 'string' ? { [name]: res.json.explanation } : res.json.explanation);
    if (res.json.judge_model || res.json.judge_usage) judges.push({ grader: name, model: res.json.judge_model, usage: res.json.judge_usage });
  }
  return { grade, explanation, judges };
}

// ---------- commands ----------

const commands = {};

commands.init = (args) => {
  const name = args.name;
  if (!name || name === true) die('usage: init --name <flow> [--dir <path>]');
  const dir = path.resolve(args.dir && args.dir !== true ? String(args.dir) : path.join('evals', safeId(name)));
  if (fs.existsSync(path.join(dir, 'eval.json'))) die(`BLOCKED: ${dir}/eval.json already exists`);
  fs.mkdirSync(path.join(dir, 'graders'), { recursive: true });
  const t = (f) => path.join(SKILL_DIR, 'templates', f);
  fs.copyFileSync(t('adapter-stub.mjs'), path.join(dir, 'adapter.mjs'));
  fs.copyFileSync(t('grader-check.mjs'), path.join(dir, 'graders', 'check.mjs'));
  writeJson(path.join(dir, 'eval.json'), {
    name,
    description: '<fill: the one flow this measures and what good looks like>',
    cases: 'cases.jsonl',
    expected: 'expected.jsonl',
    run: { command: 'node adapter.mjs', timeout_s: 300, concurrency: 4, retries: 2 },
    graders: [{ name: 'check', command: 'node graders/check.mjs' }],
    primary: 'pass',
    models: [],
    reps: 2,
    prices: {},
    harness_paths: ['adapter.mjs', 'graders/check.mjs'],
  });
  fs.writeFileSync(path.join(dir, 'cases.jsonl'), [
    { id: 'example-1', input: 'What is 2 + 2?', tags: ['arithmetic'] },
    { id: 'example-2', input: 'Name the capital of France.', tags: ['facts'] },
  ].map((c) => JSON.stringify(c)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'expected.jsonl'), [
    { id: 'example-1', reference: '4', wrong: '5' },
    { id: 'example-2', reference: 'Paris', wrong: 'Lyon' },
  ].map((c) => JSON.stringify(c)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'runs/\n');
  console.log(`CREATED: ${dir}`);
  console.log('do: write the real cases and answers, wire adapter.mjs to the app and graders/check.mjs to the output, fill eval.json (reference/build.md)');
  console.log(`then: node ${SELF} status --eval ${path.relative(process.cwd(), dir) || '.'}`);
};

commands.check = (args) => {
  const ev = load(args);
  const p = problems(ev);
  if (!p.length) console.log(`GREEN: ${ev.cases.length} cases, ${ev.config.graders.length} grader(s), models: ${(ev.config.models || []).join(', ') || 'default'}`);
  for (const x of p) console.log(`BLOCKED: ${x}`);
  if (ev.cases.length && ev.cases.length < 15) console.log(`WARN: ${ev.cases.length} cases; under 15, one flaky case swings the score`);
  const tags = new Map();
  for (const c of ev.cases) { const t = c.tags?.[0] ?? '(untagged)'; tags.set(t, (tags.get(t) || 0) + 1); }
  console.log(`tags[0]: ${[...tags].map(([k, v]) => `${k}=${v}`).join(' ')}`);
  process.exit(p.length ? 1 : 0);
};

commands.smoke = async (args) => {
  const ev = load(args);
  const p = problems(ev);
  if (p.length) die(p.map((x) => `BLOCKED: ${x}`).join('\n'));
  const probes = { oracle: (e) => e?.reference ?? e?.output ?? e?.label, wrong: (e) => e?.wrong, null: () => '' };
  const results = {};
  for (const [probe, pick] of Object.entries(probes)) {
    const scores = {};
    let n = 0;
    for (const kase of ev.cases) {
      const output = pick(ev.expected.get(String(kase.id)));
      if (output === undefined) continue;
      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'evals-smoke-'));
      const g = await gradeTrial(ev, { kase, model: probe, output, transcript: [], artifacts: [], workdir });
      fs.rmSync(workdir, { recursive: true, force: true });
      if (g.error) die(`BLOCKED: grader ${g.error.grader} failed on ${probe} output for case ${kase.id}: ${g.error.message}\n${g.error.stderr}`);
      for (const [k, v] of Object.entries(g.grade)) if (typeof v === 'number' || typeof v === 'boolean') (scores[k] ||= []).push(Number(v));
      n++;
    }
    results[probe] = { n, means: Object.fromEntries(Object.entries(scores).map(([k, xs]) => [k, mean(xs)])) };
  }
  const primary = ev.config.primary;
  const pm = (probe) => results[probe].means[primary];
  const verdicts = [];
  if (results.oracle.n === 0) verdicts.push('NO_REFERENCE: no expected.reference (or label) rows; give at least 3 cases a known-good output so the grader is tested on a pass');
  else if (pm('oracle') !== undefined && pm('oracle') < 0.9 && pm('oracle') <= 1) verdicts.push(`BLOCKED: known-good outputs score ${fmt(pm('oracle'))} on ${primary}; the grader or the references are wrong`);
  if (pm('null') !== undefined && pm('oracle') !== undefined && pm('null') >= pm('oracle')) verdicts.push(`BLOCKED: empty output scores ${fmt(pm('null'))}, no lower than known-good; the grader cannot tell an answer from none`);
  else if (pm('null') !== undefined && pm('null') > 0.1 && pm('null') <= 1) verdicts.push(`WARN: empty output scores ${fmt(pm('null'))} on ${primary}; check the grader is not lenient`);
  if (results.wrong.n && pm('wrong') !== undefined && pm('oracle') !== undefined && pm('wrong') >= pm('oracle')) verdicts.push(`BLOCKED: wrong-but-plausible outputs score ${fmt(pm('wrong'))}, no lower than known-good`);
  if (results.wrong.n < 3) verdicts.push(`WARN: ${results.wrong.n} expected.wrong rows; give at least 3 cases a wrong-but-plausible answer, the cheapest leniency test`);
  for (const [probe, r] of Object.entries(results)) {
    console.log(`${probe.padEnd(6)} n=${r.n} ${Object.entries(r.means).map(([k, v]) => `${k}=${fmt(v)}`).join(' ')}`);
  }
  const blocked = verdicts.some((v) => v.startsWith('BLOCKED'));
  verdicts.forEach((v) => console.log(v));
  console.log(blocked ? 'smoke: BLOCKED' : 'smoke: GREEN');
  ev.state.smoke = { at: now(), green: !blocked, harness_sha: harnessDrift(ev).sha, results };
  saveState(ev);
  process.exit(blocked ? 1 : 0);
};

commands.signoff = (args) => {
  const ev = load(args);
  const what = args._[1];
  if (!['inputs', 'grading', 'plan'].includes(what) || typeof args.note !== 'string') {
    die('usage: signoff inputs|grading|plan --note "<the user\'s words, quoted>"');
  }
  ev.state.signoffs ||= {};
  ev.state.signoffs[what] = { at: now(), note: args.note, harness_sha: harnessDrift(ev).sha };
  saveState(ev);
  console.log(`RECORDED: signoff ${what}`);
};

commands.approve = (args) => {
  const ev = load(args);
  if (typeof args.note !== 'string' || typeof args.audit !== 'string') die('usage: approve --audit <findings file> --note "<the user\'s words approving the harness, quoted>"');
  if (!fs.existsSync(path.resolve(ev.dir, args.audit))) die(`BLOCKED: ${args.audit} does not exist; write the audit findings (reference/audit.md) there first`);
  const drift = harnessDrift(ev);
  const first = !ev.state.approved;
  if (first && !ev.state.signoffs?.inputs) die('BLOCKED: the inputs gate is open (signoff inputs)');
  if (first && !ev.state.signoffs?.grading) die('BLOCKED: the grading gate is open (signoff grading)');
  if (!ev.state.smoke?.green || ev.state.smoke.harness_sha !== drift.sha) die('BLOCKED: smoke is missing, failed or older than the harness; run smoke first');
  if (drift.changed.length) console.log(`changed since last approval: ${drift.changed.join(', ')}`);
  ev.state.approved = { at: now(), note: args.note, audit: args.audit, sha: drift.sha, files: harnessFiles(ev) };
  saveState(ev);
  console.log(`APPROVED: harness ${drift.sha.slice(0, 12)}`);
};

commands.goal = (args) => {
  const ev = load(args);
  if (!args.target || args.target === true || !['higher', 'lower'].includes(args.direction)) {
    die('usage: goal --target <metric|perf field> --direction higher|lower [--hold a,b] [--margin 0.02] [--models a,b] [--note "<user words>"]');
  }
  ev.state.goal = {
    target: args.target, direction: args.direction, hold: list(args.hold),
    margin: args.margin !== undefined ? Number(args.margin) : 0,
    models: list(args.models), note: typeof args.note === 'string' ? args.note : undefined, at: now(),
  };
  saveState(ev);
  console.log(`RECORDED: goal ${args.direction} ${args.target}; hold ${ev.state.goal.hold.join(', ') || '(none)'} within ${ev.state.goal.margin}`);
};

commands.split = (args) => {
  const ev = load(args);
  if (ev.state.split && !args.force) die(`BLOCKED: a split exists (train ${ev.state.split.train?.length ?? 0} / test ${ev.state.split.test?.length ?? 0}). Re-splitting makes every earlier round incomparable; ask the user, then pass --force.`);
  if (args.none) {
    ev.state.split = { none: true, at: now() };
    saveState(ev);
    return console.log('RECORDED: no split; every score is directional (no held-out number)');
  }
  if (ev.cases.length < 20 && !args.force) die(`SMALL_SET: ${ev.cases.length} cases is too few to split; score the whole set and raise reps (split --none), or add cases. --force splits anyway.`);
  const frac = args['test-frac'] !== undefined ? Number(args['test-frac']) : 0.5;
  const seed = args.seed !== undefined ? Number(args.seed) : 1;
  const rand = mulberry32(seed);
  const groups = new Map();
  for (const c of [...ev.cases].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const t = c.tags?.[0] ?? '(untagged)';
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(String(c.id));
  }
  const train = [];
  const test = [];
  for (const ids of groups.values()) {
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const k = Math.round(ids.length * frac);
    test.push(...ids.slice(0, k));
    train.push(...ids.slice(k));
  }
  ev.state.split = { train, test, seed, test_frac: frac, stratified_by: 'tags[0]', at: now() };
  saveState(ev);
  console.log(`RECORDED: split train ${train.length} / test ${test.length} (seed ${seed}, stratified by tags[0])`);
  console.log(`next: node ${SELF} score --eval ${path.relative(process.cwd(), ev.dir) || '.'}  # check train and test baseline means agree within noise`);
};

commands.run = async (args) => {
  const ev = load(args);
  const p = problems(ev);
  if (p.length) die(p.map((x) => `BLOCKED: ${x}`).join('\n'));
  const variant = args.variant;
  if (!variant || variant === true) die('usage: run --variant <name> [--model m|--models all] [--reps R] [--cases all|train|test|id,..] [--limit N] [--dry-run]');
  const drift = harnessDrift(ev);
  if (drift.status === 'CHANGED') {
    die(`BLOCKED: harness changed since the user approved it: ${drift.changed.join(', ')}\ndo: show the user the diff of those files; after their yes, record it with approve --note "<their words>"`, 2);
  }
  const models = modelsFor(ev, args);
  const reps = Number(args.reps ?? ev.config.reps ?? 1);
  let cases = selectCases(ev, args.cases);
  if (args.limit) cases = spread(cases, Number(args.limit));
  const concurrency = Number(args.concurrency ?? ev.config.run.concurrency ?? 4);
  const timeoutS = Number(args['timeout-s'] ?? ev.config.run.timeout_s ?? 300);
  const retries = Number(ev.config.run.retries ?? 2);

  const fingerprint = appFingerprint(ev);
  const tasks = [];
  const perModel = {};
  for (const model of models) {
    const dir = runDir(ev, variant, model);
    const metaPath = path.join(dir, 'meta.json');
    const meta = readJson(metaPath, null);
    if (meta && meta.harness_sha !== drift.sha && !args.fresh) {
      die(`BLOCKED: ${variant}/${model} was started under a different harness (${meta.harness_sha.slice(0, 12)}); its rows are not comparable to new ones. Use a new --variant name, or --fresh to discard it.`, 2);
    }
    if (meta && meta.fingerprint && fingerprint && meta.fingerprint !== fingerprint && !args.fresh && !args['allow-drift']) {
      die(`BLOCKED: the app changed since ${variant}/${model} started (fingerprint ${meta.fingerprint} -> ${fingerprint}: git HEAD or uncommitted changes outside the eval dir). Its rows would mix two versions of the app.\ndo: restore the app to the state this variant measures, or put the new state in a new variant (a no-change control when you want more reps of an old state).`, 2);
    }
    const siblings = listRuns(ev).filter((r) => r.variant === safeId(variant) && r.model !== safeId(model) && r.meta.fingerprint);
    if ((!meta || args.fresh) && fingerprint && siblings.length && siblings.some((r) => r.meta.fingerprint !== fingerprint) && !args['allow-drift']) {
      die(`BLOCKED: variant ${variant} already measured another app state (${siblings[0].meta.fingerprint}) for ${siblings.map((r) => r.model).join(', ')}; adding ${model} now would measure ${fingerprint} under the same name.\ndo: check out the state ${variant} measured (commit each kept round so you can), or run ${model} under a new variant name.`, 2);
    }
    if (args.fresh && fs.existsSync(dir) && !args['dry-run']) fs.rmSync(dir, { recursive: true, force: true });
    const done = new Set(readJsonl(path.join(dir, 'results.jsonl')).map((r) => `${r.case_id}#${r.rep}`));
    let todo = 0;
    for (const kase of cases) for (let rep = 0; rep < reps; rep++) {
      if (done.has(`${safeId(kase.id)}#${rep}`)) continue;
      tasks.push({ kase, rep, model, dir });
      todo++;
    }
    perModel[model] = { dir, todo, total: cases.length * reps };
  }

  // Estimate from earlier rows of the same model, any variant.
  const priced = estimateTrialCost(ev);
  const estimate = models.reduce((acc, m) => (acc === null || priced[m] === undefined ? null : acc + priced[m] * perModel[m].todo), 0);
  console.log(`scope: variant=${variant} models=${models.join(',')} cases=${cases.length}${args.cases ? ` (${args.cases})` : ''} reps=${reps} trials=${models.length * cases.length * reps} todo=${tasks.length} concurrency=${concurrency} timeout=${timeoutS}s est_cost=${estimate === null ? '?' : `$${estimate < 1 ? estimate.toFixed(4) : estimate.toFixed(2)}`}`);
  console.log(`app: ${fingerprint ?? 'not a git checkout (no drift check)'}`);
  console.log(`harness: ${drift.status} ${drift.sha.slice(0, 12)}${drift.status === 'UNAPPROVED' ? ' (pilot: fine for trying the flow; approve before the baseline)' : ''}`);
  if (args['dry-run']) { console.log('DRY_RUN: nothing ran'); return; }
  if (!tasks.length) { console.log('DONE: nothing to run (every trial has a row)'); return; }

  for (const [model, pm] of Object.entries(perModel)) {
    fs.mkdirSync(path.join(pm.dir, 'traces'), { recursive: true });
    const metaPath = path.join(pm.dir, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      writeJson(metaPath, { variant, model, harness_sha: drift.sha, fingerprint, approved: drift.status === 'APPROVED', reps, cases: cases.map((c) => String(c.id)), started: now() });
    } else {
      const m = readJson(metaPath);
      const ids = new Set([...(m.cases || []), ...cases.map((c) => String(c.id))]);
      writeJson(metaPath, { ...m, reps: Math.max(m.reps || 0, reps), cases: [...ids] });
    }
  }

  let finished = 0;
  let failed = 0;
  const started = Date.now();
  const progress = () => {
    const elapsed = (Date.now() - started) / 1000;
    const left = finished ? Math.round((elapsed / finished) * (tasks.length - finished)) : '?';
    const line = `${finished}/${tasks.length} done, ${failed} failed, ~${left}s left`;
    console.log(line);
    for (const pm of Object.values(perModel)) fs.writeFileSync(path.join(pm.dir, 'progress.txt'), line + '\n');
  };
  const ticker = setInterval(progress, 30000);

  const runTask = async ({ kase, rep, model, dir }) => {
    const id = safeId(kase.id);
    const appCase = { id: kase.id, input: kase.input, tags: kase.tags || [], meta: kase.meta };
    for (let attempt = 0; attempt <= retries; attempt++) {
      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'evals-'));
      const cleanup = () => { if (!args['keep-workdirs']) fs.rmSync(workdir, { recursive: true, force: true }); };
      const res = await runCommand(ev.config.run.command, {
        input: { ...appCase, model, variant, rep, workdir },
        cwd: ev.dir,
        env: { ...process.env, ...(ev.config.run.env || {}), EVAL_MODEL: model === 'default' ? '' : model, EVAL_VARIANT: variant, EVAL_CASE_ID: String(kase.id), EVAL_REP: String(rep), EVAL_WORKDIR: workdir },
        timeoutS,
      });
      const r = res.json;
      const fail = (cls, message, retryable) => ({ cls, message, retryable });
      let f = null;
      if (res.timedOut) f = fail('timeout', `no result within ${timeoutS}s`, false);
      else if (r?.error) f = fail(r.class || 'harness', String(r.error), Boolean(r.retryable));
      else if (res.code !== 0) f = fail('harness', `adapter exit ${res.code}`, res.code === 75);
      else if (!r) f = fail('harness', 'adapter printed no JSON object on its last stdout line', false);
      else if (!servedMatches(ev, model, r.model)) f = fail('served_model_mismatch', `asked for ${model}, served ${r.model ?? '(not reported)'}`, false);
      if (f) {
        appendJsonl(path.join(dir, 'errors.jsonl'), { case_id: id, rep, attempt, class: f.cls, message: f.message, stderr: res.stderr.slice(-2000), model: r?.model, usage: r?.usage, at: now() });
        cleanup();
        if (f.retryable && attempt < retries) { await sleep((2 ** attempt) * 1000 * (0.5 + Math.random())); continue; }
        failed++;
        return;
      }
      const trace = {
        case_id: id, original_id: kase.id, rep, model, served_model: r.model, output: r.output ?? '',
        transcript: r.transcript || [{ role: 'user', content: typeof kase.input === 'string' ? kase.input : JSON.stringify(kase.input) }, { role: 'assistant', content: typeof r.output === 'string' ? r.output : JSON.stringify(r.output) }],
        artifacts: r.artifacts || [], workdir: args['keep-workdirs'] ? workdir : undefined, status: r.status || 'ok', stop_reason: r.stop_reason, usage: r.usage, perf: r.perf, latency_s: r.latency_s ?? res.seconds,
      };
      writeJson(path.join(dir, 'traces', `${id}_rep${rep}.json`), trace);
      const g = await gradeTrial(ev, { kase: appCase, model, output: trace.output, transcript: trace.transcript, artifacts: trace.artifacts, workdir });
      cleanup();
      if (g.error) {
        appendJsonl(path.join(dir, 'errors.jsonl'), { case_id: id, rep, attempt, ...g.error, class: 'grader', model: r.model, usage: r.usage, at: now() });
        failed++;
        return;
      }
      appendJsonl(path.join(dir, 'results.jsonl'), rowFrom(trace, kase, g, attempt, r.latency_s === undefined ? 'wall' : 'adapter'));
      finished++;
      return;
    }
  };

  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) { const t = tasks[next++]; await runTask(t); }
  });
  await Promise.all(workers);
  clearInterval(ticker);
  progress();
  for (const [model, pm] of Object.entries(perModel)) {
    const rows = readJsonl(path.join(pm.dir, 'results.jsonl')).length;
    console.log(`${variant}/${model}: ${rows}/${pm.total} rows${rows < pm.total ? ' PARTIAL (see errors.jsonl; rerun the same command to retry the missing trials)' : ''}`);
  }
  console.log(`next: node ${SELF} score --eval ${path.relative(process.cwd(), ev.dir) || '.'} --variant ${variant}`);
};

function rowFrom(trace, kase, g, attempt, latencySource) {
  return {
    case_id: trace.case_id, rep: trace.rep, model: trace.model, served_model: trace.served_model, tags: kase.tags || [],
    status: trace.status, stop_reason: trace.stop_reason, grade: g.grade, explanation: Object.keys(g.explanation).length ? g.explanation : undefined,
    usage: trace.usage, perf: trace.perf, judges: g.judges.length ? g.judges : undefined,
    latency_s: trace.latency_s, latency_source: latencySource, attempts: attempt + 1, at: now(),
  };
}

commands.regrade = async (args) => {
  const ev = load(args);
  const variant = args.variant;
  if (!variant || variant === true) die('usage: regrade --variant <name> [--model m]');
  const runs = listRuns(ev).filter((r) => r.variant === safeId(variant) && (!args.model || r.model === safeId(args.model)));
  if (!runs.length) die(`BLOCKED: no runs for variant ${variant}`);
  const byId = new Map(ev.cases.map((c) => [safeId(c.id), c]));
  for (const run of runs) {
    const tracesDir = path.join(run.dir, 'traces');
    const old = readJsonl(path.join(run.dir, 'results.jsonl'));
    const oldBy = new Map(old.map((r) => [`${r.case_id}#${r.rep}`, r]));
    const rows = [];
    let errors = 0;
    for (const f of fs.readdirSync(tracesDir).filter((x) => x.endsWith('.json')).sort()) {
      const trace = readJson(path.join(tracesDir, f));
      const kase = byId.get(trace.case_id);
      if (!kase) continue;
      const appCase = { id: kase.id, input: kase.input, tags: kase.tags || [], meta: kase.meta };
      const workdir = trace.workdir && fs.existsSync(trace.workdir) ? trace.workdir : null;
      const g = await gradeTrial(ev, { kase: appCase, model: trace.model, output: trace.output, transcript: trace.transcript, artifacts: trace.artifacts, workdir });
      if (g.error) { errors++; console.log(`grader failed on ${trace.case_id} rep ${trace.rep}: ${g.error.message}`); continue; }
      const prev = oldBy.get(`${trace.case_id}#${trace.rep}`);
      rows.push(rowFrom(trace, kase, g, (prev?.attempts ?? 1) - 1, prev?.latency_source ?? 'adapter'));
    }
    const moved = rows.filter((r) => JSON.stringify(r.grade) !== JSON.stringify(oldBy.get(`${r.case_id}#${r.rep}`)?.grade)).length;
    if (fs.existsSync(path.join(run.dir, 'results.jsonl'))) fs.renameSync(path.join(run.dir, 'results.jsonl'), path.join(run.dir, `results.${Date.now()}.bak.jsonl`));
    fs.writeFileSync(path.join(run.dir, 'results.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
    const meta = readJson(path.join(run.dir, 'meta.json'));
    writeJson(path.join(run.dir, 'meta.json'), { ...meta, regraded: now(), graded_sha: harnessDrift(ev).sha });
    console.log(`${run.variant}/${run.model}: regraded ${rows.length} trials, ${moved} grades changed, ${errors} grader failures (old rows kept as a .bak.jsonl)`);
  }
  console.log('do: if grades changed, regrade every variant you compare, then rerun score and check whether the ranking moved');
};

// ---------- scoring ----------

function priceOf(ev, modelFull) {
  const p = ev.config.prices || {};
  const model = baseModel(modelFull);
  if (p[model]) return p[model];
  const hit = Object.entries(p).find(([k]) => model && (model.startsWith(k) || model.endsWith(`/${k}`)));
  return hit ? hit[1] : null;
}
// Price a row by the served id, falling back to the requested one (a
// "default" route may report a model name nobody priced).
function rowCost(ev, row) { return costOf(ev, row.served_model, row.usage) ?? costOf(ev, row.model, row.usage); }

function costOf(ev, model, usage) {
  if (!usage || !model) return null;
  const price = priceOf(ev, model);
  if (!price) return null;
  const inTok = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const outTok = usage.output_tokens ?? usage.completion_tokens ?? 0;
  const cr = usage.cache_read_input_tokens ?? 0;
  const cw = usage.cache_creation_input_tokens ?? 0;
  const rate = (k, fallback) => (price[k] ?? fallback) / 1e6;
  return inTok * rate('in', 0) + outTok * rate('out', 0) + cr * rate('cache_read', (price.in ?? 0) * 0.1) + cw * rate('cache_write', (price.in ?? 0) * 1.25);
}

// Per trial: every grade metric plus the perf fields, as numbers.
function trialValues(ev, row) {
  const v = {};
  for (const [k, x] of Object.entries(row.grade || {})) if (typeof x === 'number' || typeof x === 'boolean') v[k] = Number(x);
  const u = row.usage || {};
  const inTok = u.input_tokens ?? u.prompt_tokens;
  const outTok = u.output_tokens ?? u.completion_tokens;
  if (inTok !== undefined) v.input_tokens = inTok + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  if (outTok !== undefined) v.output_tokens = outTok;
  const cost = rowCost(ev, row);
  if (cost !== null) v.cost_usd = cost;
  const judge = (row.judges || []).reduce((a, j) => { const c = costOf(ev, j.model, j.usage); return c === null ? a : (a ?? 0) + c; }, null);
  if (judge !== null) v.judge_usd = judge;
  if (typeof row.latency_s === 'number') v.latency_s = row.latency_s;
  for (const [k, x] of Object.entries(row.perf || {})) if (typeof x === 'number') v[k] = x;
  return v;
}
const PERF = new Set(['input_tokens', 'output_tokens', 'cost_usd', 'judge_usd', 'latency_s']);
function better(ev, field, rowsPerf) {
  const b = ev.config.better?.[field];
  if (b) return b;
  return PERF.has(field) || rowsPerf.has(field) ? 'lower' : 'higher';
}

function loadRun(ev, run) {
  const rows = readJsonl(path.join(run.dir, 'results.jsonl'));
  const errors = readJsonl(path.join(run.dir, 'errors.jsonl'));
  return { ...run, rows, errors };
}

// Case-level means: the unit of every interval below is the case, so reps
// sharpen each case's mean and cases supply the spread.
function caseTable(ev, run, ids) {
  const want = ids ? new Set(ids.map(safeId)) : null;
  const byCase = new Map();
  let truncated = 0;
  let refusals = 0;
  const perfKeys = new Set();
  for (const row of run.rows) {
    if (want && !want.has(row.case_id)) continue;
    if (row.status === 'truncated') { truncated++; continue; }
    if (row.status === 'refusal') refusals++;
    for (const k of Object.keys(row.perf || {})) perfKeys.add(k);
    if (!byCase.has(row.case_id)) byCase.set(row.case_id, []);
    byCase.get(row.case_id).push(trialValues(ev, row));
  }
  const cases = new Map();
  for (const [id, trials] of byCase) {
    const fields = new Set(trials.flatMap((t) => Object.keys(t)));
    const c = {};
    for (const f of fields) {
      const xs = trials.map((t) => t[f]).filter((x) => x !== undefined);
      c[f] = { mean: mean(xs), var: xs.length > 1 ? sd(xs) ** 2 : null, n: xs.length };
    }
    cases.set(id, c);
  }
  return { cases, truncated, refusals, perfKeys };
}

function summarize(table) {
  const fields = new Set([...table.cases.values()].flatMap((c) => Object.keys(c)));
  const out = {};
  for (const f of fields) {
    const xs = [...table.cases.values()].map((c) => c[f]?.mean).filter((x) => x !== undefined && x !== null);
    out[f] = { mean: mean(xs), hw: halfWidth(xs), n: xs.length };
  }
  return out;
}

// Noise floor: the 95% half-width of a paired difference between two runs
// of the same config. Pairing cancels case difficulty, so only within-case
// (rep-to-rep) variance remains: Var(diff_i) = 2 s_i^2 / R.
function noiseFloor(table, field) {
  const cs = [...table.cases.values()].map((c) => c[field]).filter(Boolean);
  if (!cs.length) return null;
  const withVar = cs.filter((c) => c.var !== null);
  if (withVar.length < cs.length / 2) {
    const xs = cs.map((c) => c.mean);
    const hw = halfWidth(xs);
    return hw === null ? null : { hw: hw * Math.SQRT2, basis: 'upper bound (R=1: no rep variance; run reps >= 2)' };
  }
  const v = mean(withVar.map((c) => (2 * c.var) / c.n));
  return { hw: (1.96 * Math.sqrt(v)) / Math.sqrt(withVar.length), basis: `within-case variance, R~${fmt(mean(withVar.map((c) => c.n)), 1)}` };
}

function paired(a, b, field) {
  const diffs = [];
  for (const [id, cb] of b.cases) {
    const ca = a.cases.get(id);
    if (ca?.[field] && cb[field]) diffs.push(cb[field].mean - ca[field].mean);
  }
  return { delta: mean(diffs), hw: halfWidth(diffs), n: diffs.length };
}

function splits(ev, args) {
  if (args.split && args.split !== true) {
    if (args.split === 'all') return [['all', null]];
    return [[args.split, ev.state.split?.[args.split] || die(`BLOCKED: no ${args.split} split`)]];
  }
  if (ev.state.split?.test) return [['test', ev.state.split.test], ['train', ev.state.split.train]];
  return [['all', null]];
}

commands.score = (args) => {
  const ev = load(args);
  let runs = listRuns(ev).filter((r) => !isPilot(r.variant) || list(args.variant).includes(r.variant));
  if (args.variant && args.variant !== true) runs = runs.filter((r) => list(args.variant).map(safeId).includes(r.variant) || (args.vs && r.variant === safeId(args.vs)));
  if (args.model && args.model !== true) runs = runs.filter((r) => list(args.model).map(safeId).includes(r.model));
  if (!runs.length) die('NO_RUNS: nothing to score yet');
  const loaded = runs.map((r) => loadRun(ev, r));
  const primary = ev.config.primary;
  const ref = args.vs && args.vs !== true ? safeId(args.vs) : null;
  const json = { splits: {} };
  for (const [splitName, ids] of splits(ev, args)) {
    const fieldsSeen = new Set();
    const tables = loaded.map((run) => {
      const t = caseTable(ev, run, ids);
      const s = summarize(t);
      Object.keys(s).forEach((k) => fieldsSeen.add(k));
      return { run, t, s };
    });
    const metricFields = [...fieldsSeen].filter((f) => !PERF.has(f) && !tables.some((x) => x.t.perfKeys.has(f))).sort((a, b) => (a === primary ? -1 : b === primary ? 1 : a.localeCompare(b)));
    const perfFields = [...fieldsSeen].filter((f) => !metricFields.includes(f)).sort();
    const header = ['variant/model', 'n', ...metricFields, ...(ref ? [`Δ${primary} vs ${ref}`] : []), ...perfFields, 'err', 'trunc', 'refusal'];
    console.log(`\n### ${splitName}${ids ? ` (${ids.length} cases)` : ''}\n`);
    console.log(`| ${header.join(' | ')} |`);
    console.log(`|${header.map(() => '---').join('|')}|`);
    const expectedTrials = (run) => (ids ? ids.filter((id) => (run.meta.cases || []).includes(id)).length : (run.meta.cases || []).length) * (run.meta.reps || 1);
    for (const { run, t, s } of tables) {
      const want = ids ? new Set(ids.map(safeId)) : null;
      const rowsHere = run.rows.filter((r) => !want || want.has(r.case_id)).length;
      const exp = expectedTrials(run);
      const resolved = new Set(run.rows.map((r) => `${r.case_id}#${r.rep}`));
      const openErrors = run.errors.filter((e) => !resolved.has(`${e.case_id}#${e.rep}`) && (!want || want.has(e.case_id)));
      const errClasses = {};
      for (const e of openErrors) errClasses[e.class] = (errClasses[e.class] || 0) + 1;
      const refRun = ref && tables.find((x) => x.run.variant === ref && x.run.model === run.model);
      let deltaCell = '';
      if (ref) {
        if (!refRun || run.variant === ref) deltaCell = '-';
        else { const d = paired(refRun.t, t, primary); deltaCell = d.delta === null ? '-' : `${signed(d.delta)} ±${fmt(d.hw)}${d.hw !== null && Math.abs(d.delta) > d.hw ? ' *' : ''}`; }
      }
      const cells = [
        `${run.variant}/${run.model}${rowsHere < exp ? ` PARTIAL ${rowsHere}/${exp}` : ''}`,
        String(s[primary]?.n ?? t.cases.size),
        ...metricFields.map((f) => (s[f] ? `${fmt(s[f].mean)} ±${fmt(s[f].hw)}` : '-')),
        ...(ref ? [deltaCell] : []),
        ...perfFields.map((f) => (s[f] ? fmt(s[f].mean, f.endsWith('usd') ? 4 : f.endsWith('tokens') ? 0 : 2) : '-')),
        Object.keys(errClasses).length ? Object.entries(errClasses).map(([k, v]) => `${k}:${v}`).join(' ') : '0',
        String(t.truncated), String(t.refusals),
      ];
      console.log(`| ${cells.join(' | ')} |`);
      json.splits[splitName] ||= [];
      json.splits[splitName].push({ variant: run.variant, model: run.model, rows: rowsHere, expected: exp, summary: s, errors: errClasses, truncated: t.truncated, refusals: t.refusals });
    }
    const floorRun = tables.find((x) => x.run.variant === (ref || 'baseline'));
    if (floorRun && primary) {
      for (const x of tables.filter((y) => y.run.variant === floorRun.run.variant)) {
        const nf = noiseFloor(x.t, primary);
        if (nf) console.log(`\nnoise floor ${x.run.variant}/${x.run.model} on ${primary}: ±${fmt(nf.hw)} (${nf.basis})${nf.hw === 0 ? '; reps agree exactly, so the case interval is the only uncertainty and a change must clear that' : ''}`);
      }
    }
    if (ref && ev.state.goal && (splitName === 'test' || splitName === 'all')) printVerdicts(ev, tables, ref, list(args.variant).map(safeId));
    const unpricedTables = tables.filter((x) => x.t.cases.size && x.s.cost_usd === undefined && x.run.rows.some((r) => r.usage));
    if (unpricedTables.length) {
      const unpriced = [...new Set(unpricedTables.map((x) => x.run.model))];
      console.log(`\nWARN: no price for ${unpriced.join(', ')}; add $/million-token rates to eval.json prices to get cost_usd`);
    }
  }
  const shas = new Set(loaded.map((r) => r.meta.graded_sha || r.meta.harness_sha));
  if (shas.size > 1) console.log(`\nWARN: these runs were graded under ${shas.size} harness versions; regrade them all (regrade --variant <v>) or rerun before comparing`);
  const spend = totalSpend(ev);
  console.log(`\nspend recorded: ${spend.priced ? `$${spend.usd.toFixed(2)}` : '?'} across ${spend.trials} trials${spend.unpriced ? ` (${spend.unpriced} unpriced)` : ''}`);
  if (args.json) writeJson(path.join(ev.runsDir, 'score.json'), json);
};

// A variant is kept only when the target moved beyond its interval in the
// goal's direction and no held field got worse by more than the margin at
// the far end of its interval.
function printVerdicts(ev, tables, ref, named) {
  const goal = ev.state.goal;
  // Verdicts are for open rounds; recorded ones and the baseline only when named.
  const recorded = new Set((ev.state.rounds || []).map((r) => safeId(r.variant)));
  const judged = (v) => named.includes(v) || (v !== 'baseline' && !recorded.has(v));
  const perfKeys = new Set(tables.flatMap((x) => [...x.t.perfKeys]));
  console.log(`\nverdicts vs ${ref} (goal: ${goal.direction} ${goal.target}; hold ${goal.hold.join(', ') || '-'} within ${goal.margin}):`);
  const byVariant = new Map();
  for (const x of tables) {
    if (x.run.variant === ref || !judged(x.run.variant)) continue;
    const r = tables.find((y) => y.run.variant === ref && y.run.model === x.run.model);
    if (!r) continue;
    if (goal.models.length && !goal.models.map(safeId).includes(x.run.model)) continue;
    const sign = (f) => (better(ev, f, perfKeys) === 'higher' ? 1 : -1);
    const t = paired(r.t, x.t, goal.target);
    const dirSign = goal.direction === 'higher' ? 1 : -1;
    const gain = t.delta === null ? null : t.delta * dirSign;
    let verdict = 'INCONCLUSIVE';
    const notes = [`${goal.target} ${signed(t.delta)} ±${fmt(t.hw)}`];
    if (gain !== null && t.hw !== null) {
      if (gain > t.hw) verdict = 'KEEP';
      else if (gain < -t.hw) verdict = 'REVERT';
    }
    for (const h of goal.hold) {
      const d = paired(r.t, x.t, h);
      if (d.delta === null) { notes.push(`${h} missing`); if (verdict === 'KEEP') verdict = 'INCONCLUSIVE'; continue; }
      // Margins are absolute for grade metrics and a fraction of the reference mean for perf fields.
      const isPerf = PERF.has(h) || perfKeys.has(h);
      const margin = isPerf ? goal.margin * Math.abs(r.s[h]?.mean ?? 0) : goal.margin;
      const goodness = d.delta * sign(h);
      const worst = goodness - (d.hw ?? 0);
      const state = worst >= -margin ? 'held' : goodness < -margin ? 'BREACH' : 'unclear';
      notes.push(`${h} ${signed(d.delta)} ±${fmt(d.hw)} ${state}`);
      if (state === 'BREACH') verdict = 'REVERT';
      else if (state === 'unclear' && verdict === 'KEEP') verdict = 'INCONCLUSIVE';
    }
    const flips = [...r.t.cases].filter(([id, c]) => c[ev.config.primary]?.mean >= 0.999 && x.t.cases.get(id)?.[ev.config.primary]?.mean <= 0.001).map(([id]) => id);
    const perfTarget = PERF.has(goal.target) || perfKeys.has(goal.target);
    if (flips.length && perfTarget) verdict = 'REVERT';
    if (flips.length) notes.push(`${flips.length} case(s) went from always passing to always failing on ${ev.config.primary}: ${flips.slice(0, 8).join(', ')}${flips.length > 8 ? ', ...' : ''}`);
    if (!byVariant.has(x.run.variant)) byVariant.set(x.run.variant, []);
    byVariant.get(x.run.variant).push(verdict);
    console.log(`  ${x.run.variant}/${x.run.model}: ${verdict} (${notes.join('; ')})`);
  }
  if (!byVariant.size) console.log('  (no open rounds; name one with --variant to judge it)');
  for (const [v, vs] of byVariant) {
    const overall = vs.every((x) => x === 'KEEP') ? 'KEEP' : vs.some((x) => x === 'REVERT') ? 'REVERT' : 'INCONCLUSIVE';
    console.log(`verdict ${v}: ${overall}${overall === 'KEEP' ? '' : ' (KEEP needs every goal model to clear its interval)'}`);
  }
}

function totalSpend(ev) {
  let usd = 0;
  let trials = 0;
  let unpriced = 0;
  for (const run of listRuns(ev)) {
    const { rows, errors } = loadRun(ev, run);
    for (const r of [...rows, ...errors]) {
      trials += rows.includes(r) ? 1 : 0;
      const c = rowCost(ev, { ...r, model: r.model || run.meta.model });
      if (r.usage && c === null) unpriced++;
      usd += c ?? 0;
      for (const j of r.judges || []) usd += costOf(ev, j.model, j.usage) ?? 0;
    }
  }
  return { usd, trials, unpriced, priced: trials > 0 && unpriced < trials };
}

function estimateTrialCost(ev) {
  const per = {};
  for (const run of listRuns(ev)) {
    const costs = loadRun(ev, run).rows.map((r) => rowCost(ev, r)).filter((c) => c !== null);
    if (costs.length) per[run.meta.model] = mean(costs);
  }
  return per;
}

commands.record = (args) => {
  const ev = load(args);
  const variant = args.variant;
  if (!variant || variant === true || !['keep', 'revert', 'control', 'stall'].includes(args.decision) || typeof args.change !== 'string') {
    die('usage: record --variant <name> --decision keep|revert|control|stall --change "<one line: what changed and why>"');
  }
  ev.state.rounds ||= [];
  ev.state.rounds.push({ variant, decision: args.decision, change: args.change, note: typeof args.note === 'string' ? args.note : undefined, at: now() });
  if (args.decision === 'keep') ev.state.best = variant;
  saveState(ev);
  console.log(`RECORDED: ${variant} ${args.decision}; best is ${ev.state.best || 'baseline'}`);
  if (args.decision === 'revert') console.log('do: undo the change in the codebase now (git checkout or reverse-apply its patch) so the next round starts from the best variant');
};

// ---------- reading cases and trials ----------

const asText = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const oneLine = (v, n) => { const t = asText(v ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|'); return t.length > n ? `${t.slice(0, n)}...` : t; };
// A fence longer than any backtick run in the text, so case text cannot close it.
const fenced = (v) => { const t = asText(v ?? ''); const run = Math.max(2, ...(t.match(/`+/g) || []).map((m) => m.length)); const f = '`'.repeat(run + 1); return `${f}\n${t}\n${f}`; };

commands.cases = (args) => {
  const ev = load(args);
  const out = [`# ${ev.config.name}: ${ev.cases.length} cases`, '', '| id | tags | input | expected |', '|---|---|---|---|'];
  for (const c of ev.cases) out.push(`| ${c.id} | ${(c.tags || []).join(', ')} | ${oneLine(c.input, 80)} | ${oneLine(ev.expected.get(String(c.id)) ? Object.fromEntries(Object.entries(ev.expected.get(String(c.id))).filter(([k]) => k !== 'id')) : '', 60)} |`);
  for (const c of ev.cases) {
    out.push('', `## ${c.id}`, '', `tags: ${(c.tags || []).join(', ') || '-'}`, '', fenced(c.input));
    const e = ev.expected.get(String(c.id));
    if (e) out.push('', 'expected:', '', fenced(Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'id'))));
  }
  fs.mkdirSync(ev.runsDir, { recursive: true });
  const file = path.join(ev.runsDir, 'cases.md');
  fs.writeFileSync(file, out.join('\n') + '\n');
  console.log(`WROTE: ${file}`);
};

commands.show = (args) => {
  const ev = load(args);
  if (!args.variant || args.variant === true) die('usage: show --variant <name> [--model m] [--failures] [--limit N]');
  const runs = listRuns(ev).filter((r) => r.variant === safeId(args.variant) && (!args.model || r.model === safeId(args.model)));
  if (!runs.length) die(`NO_RUNS: no runs for variant ${args.variant}`);
  const byId = new Map(ev.cases.map((c) => [safeId(c.id), c]));
  const primary = ev.config.primary;
  let shown = 0;
  for (const run of runs) {
    for (const row of loadRun(ev, run).rows.sort((a, b) => a.case_id.localeCompare(b.case_id) || a.rep - b.rep)) {
      const v = row.grade?.[primary];
      if (args.failures && !(v === false || (typeof v === 'number' && v < 1))) continue;
      if (args.limit && shown >= Number(args.limit)) break;
      const trace = readJson(path.join(run.dir, 'traces', `${row.case_id}_rep${row.rep}.json`), {});
      const kase = byId.get(row.case_id);
      console.log(`\n## ${row.case_id} rep ${row.rep} (${run.model})${row.status !== 'ok' ? ` [${row.status}]` : ''}\n`);
      console.log(`input:\n${fenced(kase?.input)}\n\noutput:\n${fenced(trace.output)}\n`);
      console.log(`grade: ${JSON.stringify(row.grade)}`);
      for (const [k, why] of Object.entries(row.explanation || {})) console.log(`why (${k}): ${why}`);
      shown++;
    }
  }
  if (!shown) console.log(args.failures ? 'no failing trials' : 'no trials');
};

// ---------- report ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

commands.report = (args) => {
  const ev = load(args);
  const all = listRuns(ev);
  const named = list(args.variant).map(safeId);
  const picked = named.length ? all.filter((r) => named.includes(r.variant)) : all.filter((r) => !isPilot(r.variant));
  const runs = (picked.length ? picked : all).map((r) => loadRun(ev, r));
  if (!runs.length) die('NO_RUNS: nothing to report yet');
  const primary = ev.config.primary;
  const splitOf = new Map();
  for (const id of ev.state.split?.train || []) splitOf.set(safeId(id), 'train');
  for (const id of ev.state.split?.test || []) splitOf.set(safeId(id), 'test');
  const tables = runs.map((run) => ({ run, t: caseTable(ev, run, null) }));
  const summaryRows = [];
  for (const [splitName, ids] of splits(ev, {})) {
    for (const run of runs) {
      const s = summarize(caseTable(ev, run, ids));
      summaryRows.push(`<tr><td>${esc(splitName)}</td><td>${esc(run.variant)}</td><td>${esc(run.model)}</td><td>${fmt(s[primary]?.mean)} ±${fmt(s[primary]?.hw)}</td><td>${s[primary]?.n ?? 0}</td><td>${fmt(s.cost_usd?.mean, 4)}</td><td>${fmt(s.input_tokens?.mean, 0)}</td><td>${fmt(s.output_tokens?.mean, 0)}</td><td>${fmt(s.latency_s?.mean, 2)}</td></tr>`);
    }
  }
  const caseIds = [...new Set(ev.cases.map((c) => safeId(c.id)))].sort();
  const head = tables.map(({ run }) => `<th>${esc(run.variant)}<br><small>${esc(run.model)}</small></th>`).join('');
  const body = caseIds.map((id) => {
    const cells = tables.map(({ run, t }) => {
      const v = t.cases.get(id)?.[primary]?.mean;
      const trace = path.join(path.relative(ev.runsDir, run.dir), 'traces', `${id}_rep0.json`);
      const tone = v === undefined ? '' : v >= 0.999 ? 'pass' : v <= 0.001 ? 'fail' : 'mid';
      return `<td class="${tone}">${v === undefined ? '-' : `<a href="${esc(trace)}">${fmt(v, 2)}</a>`}</td>`;
    }).join('');
    return `<tr><td>${esc(id)}</td><td>${esc(splitOf.get(id) || '')}</td>${cells}</tr>`;
  }).join('\n');
  const rounds = (ev.state.rounds || []).map((r) => `<tr><td>${esc(r.variant)}</td><td>${esc(r.decision)}</td><td>${esc(r.change)}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ev.config.name)} eval</title>
<style>:root{--bg:#fff;--fg:#1b1b1b;--muted:#666;--line:#e3e3e3;--pass:#e5f4e8;--fail:#fbe6e4;--mid:#fdf4dc}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#e8e8e8;--muted:#9a9a9a;--line:#2c2c2c;--pass:#1d3324;--fail:#3a1f1d;--mid:#3a321b}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:24px 16px;max-width:1200px}
table{border-collapse:collapse;margin:12px 0 28px;display:block;overflow-x:auto}td,th{border-bottom:1px solid var(--line);padding:4px 10px;text-align:left;white-space:nowrap}
th{font-weight:600}small{color:var(--muted)}.pass{background:var(--pass)}.fail{background:var(--fail)}.mid{background:var(--mid)}a{color:inherit}</style></head><body>
<h1>${esc(ev.config.name)}</h1><p>${esc(ev.config.description || '')}</p>
<h2>Summary (${esc(primary)}, 95% interval over cases)</h2><table><tr><th>split</th><th>variant</th><th>model</th><th>${esc(primary)}</th><th>cases</th><th>$/trial</th><th>in tok</th><th>out tok</th><th>latency s</th></tr>${summaryRows.join('')}</table>
${rounds ? `<h2>Rounds (best: ${esc(ev.state.best || 'baseline')})</h2><table><tr><th>variant</th><th>decision</th><th>change</th></tr>${rounds}</table>` : ''}
<h2>Per case (${esc(primary)}, mean over reps; links open rep 0's trace)</h2><table><tr><th>case</th><th>split</th>${head}</tr>${body}</table>
</body></html>`;
  fs.mkdirSync(ev.runsDir, { recursive: true });
  const out = path.join(ev.runsDir, 'report.html');
  fs.writeFileSync(out, html);
  console.log(`WROTE: ${out}`);
};

// ---------- status: the next step, computed ----------

commands.status = (args) => {
  const dir = findEvalDir(args);
  if (!dir || !fs.existsSync(path.join(dir, 'eval.json'))) {
    console.log('NO_EVAL: no eval here');
    console.log('do: read reference/build.md, then scaffold one');
    console.log(`next: node ${SELF} init --name <flow>`);
    return;
  }
  const ev = load({ ...args, eval: dir });
  const rel = path.relative(process.cwd(), ev.dir) || '.';
  const cmd = (c) => `node ${SELF} ${c} --eval ${rel}`;
  const drift = harnessDrift(ev);
  const s = ev.state;
  const models = ev.config.models?.length ? ev.config.models : ['default'];
  const runs = listRuns(ev).map((r) => loadRun(ev, r));
  console.log(`eval: ${ev.config.name} (${rel})`);
  console.log(`cases: ${ev.cases.length}  models: ${models.join(', ')}  reps: ${ev.config.reps ?? 1}  primary: ${ev.config.primary ?? '(unset)'}`);
  console.log(`harness: ${drift.status}${drift.changed.length ? ` (${drift.changed.join(', ')})` : ''}`);
  console.log(`signoffs: ${['inputs', 'grading'].map((k) => `${k} ${s.signoffs?.[k] ? 'yes' : 'no'}`).join(', ')}  smoke: ${s.smoke ? (s.smoke.green ? 'GREEN' : 'BLOCKED') : 'not run'}`);
  for (const r of runs) {
    const exp = (r.meta.cases || []).length * (r.meta.reps || 1);
    const resolved = new Set(r.rows.map((x) => `${x.case_id}#${x.rep}`));
    const open = r.errors.filter((e) => !resolved.has(`${e.case_id}#${e.rep}`)).length;
    console.log(`run: ${r.variant}/${r.model} ${r.rows.length}/${exp}${r.rows.length < exp ? ' PARTIAL' : ''}${open ? ` errors:${open}` : ''}${r.meta.approved ? '' : ' (pilot harness)'}`);
  }
  if (s.split) console.log(`split: ${s.split.none ? 'none (directional)' : `train ${s.split.train.length} / test ${s.split.test.length}`}`);
  if (s.goal) console.log(`goal: ${s.goal.direction} ${s.goal.target}; hold ${s.goal.hold.join(', ') || '-'} within ${s.goal.margin}${s.goal.models.length ? `; models ${s.goal.models.join(', ')}` : ''}`);
  if (s.rounds?.length) console.log(`rounds: ${s.rounds.length} (best: ${s.best || 'baseline'})`);

  const phase = (name, lines) => { console.log(`phase: ${name}`); lines.forEach((l) => console.log(l)); };
  const p = problems(ev);
  if (p.length) return phase('build', [...p.map((x) => `BLOCKED: ${x}`), 'load: reference/build.md']);
  if (ev.cases.length < 15) console.log(`WARN: ${ev.cases.length} cases; aim for 15-100 before trusting a number`);
  if (!s.signoffs?.inputs) return phase('inputs', ['load: reference/build.md (section "Inputs")', `do: write the review file with ${cmd('cases')} and give the user its path`, 'ASK_USER: are these the cases you care about, with the right answers? What is missing? Fix what they name, rewrite the file, ask again', `next: ${cmd('signoff inputs --note "<their words>"')}`]);
  if (!s.smoke || s.smoke.harness_sha !== drift.sha) return phase('smoke', ['do: test the graders on known-good, wrong and empty outputs (free: no model calls)', `next: ${cmd('smoke')}`]);
  if (!s.smoke.green) return phase('smoke', ['BLOCKED: the last smoke run failed; fix the grader or the references, then rerun', `next: ${cmd('smoke')}`]);
  if (!s.signoffs?.grading) {
    const pilot = runs.find((r) => isPilot(r.variant) && r.rows.length);
    if (!pilot) return phase('grading', ['load: reference/build.md (section "Grading")', 'do: run a pilot on a few cases of every tag (no approval needed)', `next: ${cmd('run --variant pilot --limit 6')}`]);
    return phase('grading', ['load: reference/build.md (section "Grading")', `do: show the user each pilot output beside its grade: ${cmd(`show --variant ${pilot.variant}`)}`, 'ASK_USER: "Would you have scored any of these differently?" On a yes, fix the grader, regrade the pilot, show again', `next: ${cmd('signoff grading --note "<their words>"')}`]);
  }
  if (drift.status !== 'APPROVED') return phase('approve', ['load: reference/audit.md', `do: run the audit, write its findings to audit-findings.md in the eval directory, and show the user the findings and the harness files${drift.changed.length ? ` (changed: ${drift.changed.join(', ')}; show their diff)` : ''}`, 'ASK_USER: approve this harness?', `next: ${cmd('approve --audit audit-findings.md --note "<their words>"')}`]);
  const stale = runs.filter((x) => x.variant === 'baseline' && x.meta.harness_sha !== drift.sha);
  if (stale.length) return phase('baseline', [`STALE: baseline for ${stale.map((x) => x.model).join(', ')} ran under another harness version; nothing compares to it`, `next: ${cmd(`run --variant baseline --fresh --model ${stale.map((x) => x.meta.model).join(',')}`)}`]);
  const baselineMissing = models.filter((m) => {
    const r = runs.find((x) => x.variant === 'baseline' && x.model === safeId(m));
    return !r || r.rows.length < ev.cases.length * (r.meta.reps || ev.config.reps || 1);
  });
  if (baselineMissing.length) return phase('baseline', [`do: run the unmodified app on the full set for ${baselineMissing.join(', ')}; rerun the same command after a crash (it resumes)`, `next: ${cmd(`run --variant baseline ${baselineMissing.length === models.length && models.length > 1 ? '--models all' : `--model ${baselineMissing.join(',')}`}`)}`]);
  if (!s.goal) return phase('ready', ['The eval is built and has a baseline. Pick the mode the user asked for:', '  only the eval              -> hand it over (reference/build.md section "Hand over")', '  measure or compare models  -> load reference/bench.md', '  improve against the eval   -> load reference/hillclimb.md (it records a goal and a split)', '  cut context, cost, latency -> load reference/trim.md', `next: ${cmd('score')}`]);
  if (!s.split) return phase('split', ['do: hold out a test set the analyzer never reads', `next: ${cmd('split')}   # or split --none for a small set`]);
  if (!s.signoffs?.plan) return phase('plan', ['load: reference/hillclimb.md (section "Setup")', 'ASK_USER: show the plan (will change / won\'t touch, goal, who applies changes, stopping rule, budget) and ask for a yes', `next: ${cmd('signoff plan --note "<their words>"')}`]);
  const recorded = new Set((s.rounds || []).map((r) => safeId(r.variant)));
  const open = runs.filter((r) => r.variant !== 'baseline' && !isPilot(r.variant) && !recorded.has(r.variant));
  if (open.length) {
    const v = open[0].variant;
    const partial = open.filter((r) => r.variant === v && r.rows.length < (r.meta.cases || []).length * (r.meta.reps || 1));
    if (partial.length) return phase('loop', [`do: round ${v} is incomplete; finish it before reading any number`, `next: ${cmd(`run --variant ${v} --model ${partial.map((r) => r.model).join(',')}`)}`]);
    return phase('loop', [`do: score round ${v} against the best variant, then record the verdict and undo the change if it is not KEEP`, `next: ${cmd(`score --vs ${s.best || 'baseline'}`)}`, `then: ${cmd(`record --variant ${v} --decision keep|revert --change "<one line>"`)}`]);
  }
  const rounds = s.rounds || [];
  const sinceStall = rounds.slice(rounds.map((r) => r.decision).lastIndexOf('stall') + 1);
  const tail = sinceStall.filter((r) => r.decision !== 'control').slice(-3);
  if (tail.length === 3 && tail.every((r) => r.decision !== 'keep')) {
    return phase('stalled', ['STALL: three rounds without a KEEP', 'load: reference/hillclimb.md (section "Stalls")', 'do: categorize the remaining train failures before another content round, or report best-so-far']);
  }
  const n = (s.rounds || []).filter((r) => /^v\d+$/.test(r.variant)).length + 1;
  return phase('loop', ['load: reference/hillclimb.md (section "Round")', `do: round v${n}: analyzer reads train traces of ${s.best || 'baseline'}, proposes one change; apply it; write runs/v${n}/change.md and change.patch`, `next: ${cmd(`run --variant v${n} ${models.length > 1 ? '--models all' : ''}`.trim())}`]);
};

// ---------- main ----------

const args = parseArgs(process.argv.slice(2));
const name = args._[0] || 'status';
if (!commands[name]) die(`unknown command ${name}; commands: ${Object.keys(commands).join(' ')}`);
await commands[name](args);
