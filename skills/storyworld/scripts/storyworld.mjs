#!/usr/bin/env node
// storyworld: project state, gates, content validation, serialized measurement and owned servers for a
// storyworld site. Its stdout is the instruction: follow what it prints.
// usage: storyworld.mjs <init|status|gate|validate|fixture|clear-example|measure|serve|stop|cleanup> [args]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const SKILL = path.resolve(path.dirname(SELF), '..');
const CMD = `node ${SELF}`;
const findRoot = (d) => { for (let p = d; ; p = path.dirname(p)) { if (fs.existsSync(path.join(p, '.storyworld'))) return p; if (path.dirname(p) === p) return d; } };
const ROOT = findRoot(process.cwd());
const SW = path.join(ROOT, '.storyworld');
const STATE = path.join(SW, 'state.json');
const ARCHIVE = path.join(SW, 'archive');
const DOMAIN = path.join(SW, 'domain.md');
const MEASURE_LOG = path.join(SW, 'measure', 'log.tsv');
const REGISTRY = path.join(os.tmpdir(), 'storyworld-servers.json');
const LOCK = path.join(os.tmpdir(), 'storyworld-measure.lock');
const PLACEHOLDER = /<fill>/;
const [cmd, ...argv] = process.argv.slice(2);

// A reader that closes the pipe early (`| head`) ends the output, not the command's work.
process.stdout.on('error', (e) => { if (e.code !== 'EPIPE') throw e; });
const out = (s = '') => process.stdout.write(s + '\n');
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? def : argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1];
};
const flagAll = (name) => argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith('--') ? [argv[i + 1]] : []));
const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const state = () => readJson(STATE, { version: 2, gates: {}, acceptRounds: 0, roundLogLines: 0 });
const saveState = (s) => writeJson(STATE, s);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const logLines = () => read(MEASURE_LOG).split('\n').filter((l) => l && l.endsWith('OK')).length;

// Gates in order. Each names the references to load while working toward it.
const GATES = [
  { id: 'brief', refs: ['reference/format.md'], domain: true,
    does: 'Fill .storyworld/brief.md and .storyworld/domain.md with the user: story, audience, as-of axis, tracks, cast, sources, decisions.' },
  { id: 'done', refs: ['reference/budgets.md'],
    does: 'Fill .storyworld/done.md, show it to the user, and record their approval quoted in --note.' },
  { id: 'look', refs: ['reference/format.md'], section: 'Look',
    does: 'Write three look directions in .storyworld/look.md and present them; the user picks one for the "Chosen:" line.' },
  { id: 'content', refs: ['reference/data.md'], domain: true,
    does: `Collect, extract and review content into content/ until \`${CMD} validate\` prints GREEN with the done.md minimum event count.` },
  { id: 'build', refs: ['reference/architecture.md', 'reference/process.md'],
    does: 'Write ARCHITECTURE.md and CONTRACTS.md and freeze the engine API, then fan out the build by area until the site builds and typechecks.' },
  { id: 'preview', refs: ['reference/process.md'],
    does: 'Integrate the areas, serve the build, and give the user its URL.' },
  { id: 'flow', refs: ['reference/process.md'], section: 'Browsers',
    does: `Run the full journey (${path.join(SKILL, 'templates/flow.mjs')}) in chromium, firefox and webkit; record the three logs.` },
  { id: 'accept', refs: ['reference/budgets.md'],
    does: `Measure every row of .storyworld/acceptance.md against the control through \`${CMD} measure\`; after each pass over the table run \`${CMD} gate accept --round\`.` },
  { id: 'ship', refs: ['reference/process.md'], section: 'Ship',
    does: `Run \`${CMD} cleanup --keep-lead\`, write the final report, record it.` },
];

// ---------------------------------------------------------------- init

const packs = () => { try { return fs.readdirSync(path.join(SKILL, 'reference', 'domains')).map((f) => f.replace(/\.md$/, '')); } catch { return []; } };

function init() {
  const domain = flag('domain');
  if (typeof domain !== 'string') { out(`usage: ${CMD} init --domain "<subject>" [--pack <name>]   (packs: ${packs().join(', ') || 'none'})`); process.exit(2); }
  fs.mkdirSync(SW, { recursive: true });
  for (const t of ['brief.md', 'done.md', 'look.md', 'acceptance.md']) {
    const dst = path.join(SW, t);
    if (!fs.existsSync(dst)) fs.writeFileSync(dst, read(path.join(SKILL, 'templates', t)).replaceAll('{{domain}}', domain));
  }
  const pack = flag('pack');
  if (!fs.existsSync(DOMAIN)) {
    if (typeof pack === 'string') {
      const src = path.join(SKILL, 'reference', 'domains', `${pack}.md`);
      if (!fs.existsSync(src)) { out(`UNKNOWN_PACK: ${pack}. Packs: ${packs().join(', ')}`); process.exit(2); }
      fs.copyFileSync(src, DOMAIN);
    } else fs.writeFileSync(DOMAIN, read(path.join(SKILL, 'templates', 'domain.md')).replaceAll('{{domain}}', domain));
  }
  const content = path.join(ROOT, 'content');
  if (!fs.existsSync(content)) {
    fs.cpSync(path.join(SKILL, 'templates', 'example-content', 'content'), content, { recursive: true });
    fs.cpSync(path.join(SKILL, 'templates', 'example-content', 'archive'), ARCHIVE, { recursive: true });
  }
  fs.writeFileSync(path.join(SW, '.gitignore'), 'state.json\nmeasure/\narchive/\nservers.log\ncleanup.done\n');
  const s = state(); s.domain = domain; saveState(s);
  out('INIT ok: .storyworld/ (brief, domain, done, look, acceptance; archive/ is private) and content/ (a fictional example that validates).');
  out(`next: ${CMD} status`);
}

// ---------------------------------------------------------------- gate preconditions (each returns the unmet conditions)

const isExample = () => /fictional example/i.test(readJson(path.join(ROOT, 'content', 'site.json'), {}).name || '');
const placeholders = (f) => (fs.existsSync(f) ? read(f).split('\n').filter((l) => PLACEHOLDER.test(l)).length : -1);
const openBoxes = (f) => read(f).split('\n').filter((l) => /^\s*- \[ \]/.test(l)).map((l) => l.trim());
const minEvents = () => +(/Minimum reviewed events at launch:\s*(\d+)/.exec(read(path.join(SW, 'done.md')))?.[1] || 0);
const minThreads = () => +(/Threads readable end to end at launch:\s*(\d+)/.exec(read(path.join(SW, 'done.md')))?.[1] || 0);
const chosen = () => /^Chosen:[ \t]*\S/m.test(read(path.join(SW, 'look.md')));
const fileNote = (f, what) => { const n = placeholders(f); return n < 0 ? [`${path.relative(ROOT, f)} is missing`] : n ? [`${path.relative(ROOT, f)} has ${n} line(s) with <fill> left (${what})`] : []; };

function acceptanceRows() {
  return read(path.join(SW, 'acceptance.md')).split('\n')
    .filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l) && !/^\|\s*(Budget|Config)\b/i.test(l) && l.split('|').length >= 8)
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .map(([budget, target, control, measured, verdict, evidence]) => ({ budget, target, control, measured, evidence, verdict: (verdict || '').toUpperCase() }));
}
const rowPasses = (r) => r.verdict === 'PASS' && r.control && r.measured && r.evidence;

const PRE = {
  brief: () => [...fileNote(path.join(SW, 'brief.md'), 'brief'), ...fileNote(DOMAIN, 'domain pack'), ...openBoxes(path.join(SW, 'brief.md')).map((b) => `undecided: ${b}`)],
  done: () => [...fileNote(path.join(SW, 'done.md'), 'definition of done'), ...(minEvents() ? [] : ['done.md needs "Minimum reviewed events at launch: <number>"'])],
  look: () => [...fileNote(path.join(SW, 'look.md'), 'three directions'), ...(chosen() ? [] : ['look.md has no "Chosen: <label>" line'])],
  content: () => {
    const v = validateContent(path.join(ROOT, 'content'), { quiet: true });
    return [...(isExample() ? [`content/ still holds the fictional example: run ${CMD} clear-example, then add the real subject`] : []),
      ...(v.errors.length ? [`validate: ${v.errors.length} BLOCKED rows (run ${CMD} validate)`] : []),
      ...(v.events < minEvents() ? [`${v.events} events; done.md requires ${minEvents()}`] : []),
      ...(v.threads < minThreads() ? [`${v.threads} threads; done.md requires ${minThreads()}`] : []),
      ...(v.noHero ? [`${v.noHero} hand-written events have no hero image (mediaIds); each needs one before this gate`] : [])];
  },
  build: () => ['ARCHITECTURE.md', 'CONTRACTS.md'].filter((f) => !fs.existsSync(path.join(ROOT, f))).map((f) => `${f} missing at the project root`),
  flow: (ev = []) => ['chromium', 'firefox', 'webkit'].flatMap((b) => {
    const f = ev.find((e) => path.basename(e).toLowerCase().includes(b));
    if (!f) return [`no --evidence log named for ${b}`];
    const t = read(path.resolve(ROOT, f));
    return /^FLOW PASS\b/m.test(t) && !/^FLOW FAIL\b/m.test(t) ? [] : [`${f} has no FLOW PASS line, or has FLOW FAIL`];
  }),
  accept: () => {
    const rows = acceptanceRows(), s = state();
    if (!rows.length) return ['acceptance.md has no budget rows'];
    const bad = rows.filter((r) => !rowPasses(r));
    if (!bad.length) return [];
    if (s.acceptRounds >= 2) return placeholders(path.join(SW, 'residuals.md')) === 0 ? [] : ['round cap: write .storyworld/residuals.md (each non-PASS row, its measured value, evidence, next experiment)'];
    return bad.map((r) => `${r.budget}: ${r.verdict === 'PASS' ? 'PASS but Control, Measured or Evidence is empty' : r.verdict || 'unmeasured'}`);
  },
  ship: () => (fs.existsSync(path.join(SW, 'cleanup.done')) ? [] : [`run ${CMD} cleanup --keep-lead first`]),
};

// ---------------------------------------------------------------- status

function status() {
  if (!fs.existsSync(SW)) {
    out('NO_PROJECT: no .storyworld/ here or in any parent directory.');
    out(`next: ${CMD} init --domain "<subject>" [--pack ${packs().join('|') || '<name>'}]   (run in the project root)`);
    return;
  }
  const s = state();
  out(`storyworld: ${s.domain || '?'}  (${ROOT})`);
  let phase = GATES.find((g) => !s.gates[g.id]?.pass);
  const regressed = !!s.gates.content?.pass && validateContent(path.join(ROOT, 'content'), { quiet: true }).errors.length > 0;
  if (regressed) phase = GATES.find((g) => g.id === 'content');
  if (!phase) { out(`phase: DONE. Every gate has evidence. Give the final report (${path.join(SKILL, 'reference/process.md')}, section "Ship").`); return; }
  out(`phase: ${phase.id}   (${GATES.indexOf(phase) + 1}/${GATES.length})`);
  phase.refs.forEach((r, k) => out(`load: ${path.join(SKILL, r)}${phase.section && k === 0 ? `   (section "${phase.section}")` : ''}`));
  if (phase.domain) out(`load: ${DOMAIN}${fs.existsSync(DOMAIN) ? '' : `   (missing: write it with the headings of ${path.join(SKILL, 'templates/domain.md')})`}`);
  out(`do: ${phase.does}`);
  if (regressed) out('BLOCKED: content regressed after its gate passed. Fix validate before any other phase.');
  const unmet = phase.id === 'flow' ? [] : PRE[phase.id]();
  for (const u of unmet) if (!u.startsWith('undecided: ') && !u.startsWith('round cap')) out(`BLOCKED: ${u}`);
  const boxes = phase.id === 'brief' ? openBoxes(path.join(SW, 'brief.md')) : [];
  if (boxes.length) out(`ASK_USER: send these ${boxes.length} questions in one message, then stop until the user answers:\n` + boxes.map((b) => '  ' + b).join('\n'));
  if (phase.id === 'done' && !unmet.length) out('ASK_USER: show the user done.md and ask for approval; stop until they answer; record their words with --note.');
  if (phase.id === 'look' && !chosen() && placeholders(path.join(SW, 'look.md')) === 0) out('ASK_USER: present the three directions; stop until the user picks one, then write "Chosen: <label>".');
  if (phase.id === 'accept') {
    out(`accept rounds used: ${s.acceptRounds} of 2`);
    if (s.acceptRounds >= 2 && unmet.length) out(`ROUND_CAP: two rounds are spent. Write .storyworld/residuals.md, then ${CMD} gate accept --evidence .storyworld/acceptance.md. A third round needs the user's explicit request.`);
  }
  if (!unmet.length && !regressed) out(`next: ${CMD} gate ${phase.id} --evidence <file>${phase.id === 'done' ? ' --note "<user approval, quoted>"' : ''}${phase.id === 'flow' ? ' --evidence <firefox log> --evidence <webkit log>   (one log per browser, file names contain the browser)' : ''}`);
  const live = registry().filter((x) => x.root === ROOT);
  if (live.length) out('servers: ' + live.map((x) => `${x.port} (${x.owner}, pid ${x.pid})`).join(', '));
}

// ---------------------------------------------------------------- gate

function gate() {
  const id = argv[0];
  const g = GATES.find((x) => x.id === id);
  if (!g) { out(`UNKNOWN_GATE: ${id}. Gates in order: ${GATES.map((x) => x.id).join(', ')}`); process.exit(2); }
  const s = state();
  if (flag('reset')) { delete s.gates[id]; saveState(s); return out(`RESET ${id}`); }
  const earlier = GATES.slice(0, GATES.indexOf(g)).find((x) => !s.gates[x.id]?.pass);
  if (earlier) { out(`OUT_OF_ORDER: gate ${earlier.id} has no evidence yet. Gates pass in order; run ${CMD} status.`); process.exit(2); }
  if (id === 'accept' && flag('round')) {
    const n = logLines();
    if (n <= (s.roundLogLines || 0)) { out(`REFUSED: no new OK measurement since the last round (.storyworld/measure/log.tsv). A round is a measured pass over acceptance.md through ${CMD} measure.`); process.exit(2); }
    s.acceptRounds += 1; s.roundLogLines = n; saveState(s);
    return out(`ROUND ${s.acceptRounds} recorded (cap 2). next: ${CMD} status`);
  }
  const ev = flagAll('evidence');
  const missing = ev.filter((e) => !fs.existsSync(path.resolve(ROOT, e)));
  if (!ev.length || missing.length) { out(`NEEDS_EVIDENCE: pass --evidence <existing file> for gate ${id}${missing.length ? ` (not found: ${missing.join(', ')})` : ''}.`); process.exit(2); }
  const unmet = PRE[id] ? PRE[id](ev).map((u) => u.replace(/^undecided: /, 'decision still open: ')) : [];
  if (id === 'done' && typeof flag('note') !== 'string') unmet.push('--note "<the user\'s approval, quoted>" is required');
  if (unmet.length) { out(`REFUSED: gate ${id}:`); unmet.forEach((u) => out(`  - ${u}`)); process.exit(2); }
  s.gates[id] = { pass: true, evidence: ev, note: typeof flag('note') === 'string' ? flag('note') : undefined, at: new Date().toISOString() };
  saveState(s);
  out(`GATE ${id} PASS (evidence ${ev.join(', ')}). next: ${CMD} status`);
}

// ---------------------------------------------------------------- content validation

const DEFAULTS = {
  entityKinds: ['company', 'person', 'agency', 'place', 'project', 'fund', 'product', 'nation', 'organization'],
  relationTypes: ['employs', 'founded', 'invests_in', 'acquired', 'supplies', 'partners', 'regulates', 'sues', 'operates', 'powers', 'located_in', 'competes', 'leads', 'member_of'],
  eventKinds: null,
  confidence: ['confirmed', 'reported', 'disputed', 'estimate'],
  sourceKinds: ['news', 'filing', 'gov', 'press', 'social', 'dataset', 'paper', 'reference', 'book', 'archive'],
  mediaKinds: ['photo', 'logo', 'portrait', 'satellite', 'chart', 'map', 'generated'],
  generatedKinds: ['chart', 'map', 'typographic', 'abstract'],
};
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const PRECISION = { 4: 'year', 7: 'month', 10: 'day' };
const LINK = /\{([^{}:]+):([^{}]+)\}/g;
const norm = (t) => t.replace(/\s+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim().toLowerCase();
const words = (t) => String(t ?? '').replace(LINK, '$1').split(/\s+/).filter(Boolean).length;
const vocab = (dir) => ({ ...DEFAULTS, ...(readJson(path.join(dir, 'site.json'), {}).vocab || {}) });

function validateContent(dir, { quiet } = {}) {
  const errors = [], warns = [];
  const E = (where, msg, fix) => errors.push(`${where}: ${msg}${fix ? ` -> ${fix}` : ''}`);
  const W = (where, msg) => warns.push(`${where}: ${msg}`);
  if (!fs.existsSync(path.join(dir, 'site.json'))) {
    if (!quiet) out(`NOT_CONTENT: ${dir} has no site.json. Run validate inside the project (it finds content/ itself) or pass the content directory.`);
    return { errors: ['no site.json'], warns, events: 0, threads: 0, noHero: 0 };
  }
  const load = (name, required = true) => {
    const f = path.join(dir, name);
    if (!fs.existsSync(f)) { if (required) E(name, 'missing', `create ${name} (shape: ${path.join(SKILL, 'templates/example-content/content', name)})`); return []; }
    const v = readJson(f, null);
    if (name === 'site.json') return v && typeof v === 'object' ? v : (E(name, 'not valid JSON'), {});
    if (!Array.isArray(v)) { E(name, 'not a valid JSON array'); return []; }
    return v;
  };
  const site = load('site.json');
  const cfg = vocab(dir);
  const tracks = new Set((site.tracks || []).map((t) => t.id));
  if (!tracks.size) E('site.json', 'no tracks', 'add tracks: [{id, name, color}]');
  const entities = load('entities.json'), events = load('events.json'), sources = load('sources.json');
  const media = load('media.json', false), relations = load('relations.json', false), threads = load('threads.json', false), eras = load('eras.json', false);
  const index = (arr, name) => {
    const m = new Map();
    arr.forEach((x, i) => {
      const where = `${name}[${i}]${x?.id ? ' ' + x.id : ''}`;
      if (!x || typeof x.id !== 'string' || !x.id) return E(where, 'missing id');
      if (m.has(x.id)) E(where, `duplicate id ${x.id}`);
      m.set(x.id, x);
    });
    return m;
  };
  const ent = index(entities, 'entities.json'), evs = index(events, 'events.json'), src = index(sources, 'sources.json'), med = index(media, 'media.json');
  index(relations, 'relations.json'); index(threads, 'threads.json'); index(eras, 'eras.json');
  const slugs = new Set();
  const checkSlug = (where, x) => {
    if (!x.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(x.slug)) E(where, `slug "${x.slug ?? ''}" missing or not kebab-case`);
    else if (slugs.has(x.slug)) E(where, `duplicate slug ${x.slug}`);
    else slugs.add(x.slug);
  };
  const okDate = (v) => typeof v === 'string' && DATE.test(v);
  const checkDate = (where, field, v, required = true) => {
    if (v === undefined && !required) return;
    if (!okDate(v)) E(where, `${field} "${v ?? ''}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
  };
  const inList = (where, list, v, key) => { if (!list.includes(v)) E(where, `"${v ?? ''}" not in vocab.${key}`, `use one of ${list.join('/')} or add it to site.json vocab.${key}`); };
  const refs = (where, field, ids, map, label, min = 0) => {
    if (!Array.isArray(ids)) { if (min) E(where, `${field} missing`, `add at least ${min} ${label} id`); return; }
    if (ids.length < min) E(where, `${field} empty`, `add at least ${min} ${label} id`);
    for (const id of ids) if (!map.has(id)) E(where, `${field} -> unknown ${label} "${id}"`);
  };
  // Earliest event date per entity, for the as-of checks.
  const firstEvent = new Map();
  for (const x of events) for (const id of x?.entityIds || []) if (okDate(x.date) && (!firstEvent.has(id) || x.date < firstEvent.get(id))) firstEvent.set(id, x.date);

  entities.forEach((x, i) => {
    const w = `entities.json[${i}] ${x?.id ?? ''}`;
    if (!x?.name) E(w, 'missing name');
    checkSlug(w, x || {});
    inList(w, cfg.entityKinds, x?.kind, 'entityKinds');
    (x?.trackIds || []).forEach((t) => { if (!tracks.has(t)) E(w, `trackIds -> unknown track "${t}"`); });
    if (x?.portraitId && !med.has(x.portraitId)) E(w, `portraitId -> unknown media "${x.portraitId}"`);
    checkDate(w, 'firstSeen', x?.firstSeen);
    const fe = firstEvent.get(x?.id);
    if (okDate(x?.firstSeen) && fe && x.firstSeen > fe) E(w, `firstSeen ${x.firstSeen} is after its first event (${fe})`, 'set firstSeen to that date or earlier');
    if (okDate(x?.firstSeen) && fe && x.firstSeen.slice(0, 4) < fe.slice(0, 4)) W(w, `firstSeen ${x.firstSeen} is years before its first event (${fe}); the graph will show a node with nothing to read`);
    if (!fe) W(w, 'appears in no event');
  });
  sources.forEach((x, i) => {
    const w = `sources.json[${i}] ${x?.id ?? ''}`;
    if (!/^https?:\/\//.test(x?.url || '')) E(w, 'url missing or not http(s)');
    if (!x?.publisher) E(w, 'missing publisher');
    if (!x?.title) E(w, 'missing title');
    checkDate(w, 'publishedAt', x?.publishedAt);
    inList(w, cfg.sourceKinds, x?.kind, 'sourceKinds');
  });
  media.forEach((x, i) => {
    const w = `media.json[${i}] ${x?.id ?? ''}`;
    for (const k of ['src', 'credit', 'license', 'sourceUrl', 'alt']) if (!x?.[k]) E(w, `missing ${k}`, k === 'license' ? 'record the licence (e.g. "CC BY 4.0", "public domain (US gov)"); unlicensed media cannot ship' : undefined);
    inList(w, cfg.mediaKinds, x?.kind, 'mediaKinds');
    if (x?.kind === 'generated' && !cfg.generatedKinds.includes(x?.generatedKind))
      E(w, `generated media needs generatedKind in ${cfg.generatedKinds.join('/')}`, 'generate data art only; source photographs of real people and events');
    if (x?.src && !/^https?:\/\//.test(x.src) && !fs.existsSync(path.join(dir, x.src))) E(w, `src file ${x.src} not found under content/`);
  });
  let quoteChecks = 0;
  events.forEach((x, i) => {
    const w = `events.json[${i}] ${x?.id ?? ''}`;
    if (!x?.title) E(w, 'missing title');
    else if (words(x.title) > 8) W(w, `title is ${words(x.title)} words (aim for 8 or fewer)`);
    const bw = words(x?.body);
    if (bw < 40 || bw > 90) W(w, `body is ${bw} words (one screen holds 40 to 90)`);
    if (!(x?.mediaIds || []).length) W(w, 'no hero image (mediaIds empty)');
    checkSlug(w, x || {});
    checkDate(w, 'date', x?.date);
    checkDate(w, 'endDate', x?.endDate, false);
    if (okDate(x?.date) && x.datePrecision && x.datePrecision !== PRECISION[x.date.length])
      E(w, `datePrecision "${x.datePrecision}" disagrees with date "${x.date}" (${PRECISION[x.date.length]})`);
    if (!tracks.has(x?.trackId)) E(w, `trackId "${x?.trackId}" not a site track`);
    if (cfg.eventKinds) inList(w, cfg.eventKinds, x?.kind, 'eventKinds');
    inList(w, cfg.confidence, x?.confidence, 'confidence');
    refs(w, 'entityIds', x?.entityIds, ent, 'entity', 1);
    refs(w, 'sourceIds', x?.sourceIds, src, 'source', 1);
    refs(w, 'mediaIds', x?.mediaIds || [], med, 'media');
    for (const m of String(x?.body ?? '').matchAll(LINK)) {
      const id = m[2].trim();
      const target = ent.get(id) || evs.get(id);
      if (!target) { E(w, `link {${m[1]}:${m[2]}} -> unknown id "${id}"`, 'link only to entity or event ids'); continue; }
      if (id === x.id) { E(w, `link {${m[1]}:${id}} points at this event`, 'link another event or an entity'); continue; }
      const when = ent.has(id) ? target.firstSeen : target.date;
      if (okDate(x?.date) && okDate(when) && when.slice(0, x.date.length) > x.date)
        E(w, `link {${m[1]}:${id}} points ${ent.has(id) ? 'at an entity first seen' : 'at an event dated'} ${when}, after this event (${x.date})`, 'as-of honesty: link only what was known by this date');
    }
    if (x?.auto) return;
    if (!(x?.claims || []).length) E(w, 'no claims', 'add at least one claim with sourceIds and a verbatim quote (rows ingested from structured data set "auto": true)');
    (x?.claims || []).forEach((c, j) => {
      const cw = `${w} claims[${j}]`;
      if (!c?.text) E(cw, 'missing text');
      refs(cw, 'sourceIds', c?.sourceIds, src, 'source', 1);
      if (!cfg.confidence.includes(c?.confidence ?? x?.confidence)) E(cw, 'confidence missing or unknown');
      if (!c?.quote) { E(cw, 'no supporting quote', 'copy the sentence from the source that supports the claim'); return; }
      for (const sid of c.sourceIds || []) {
        const f = path.join(ARCHIVE, `${sid}.txt`);
        if (!fs.existsSync(f)) { E(cw, `no archived text for ${sid}`, `save the source text to .storyworld/archive/${sid}.txt`); continue; }
        quoteChecks++;
        if (!norm(read(f)).includes(norm(c.quote))) E(cw, `quote not found verbatim in archived source ${sid}`, 'copy the exact sentence from the source, or drop the claim');
      }
    });
  });
  relations.forEach((x, i) => {
    const w = `relations.json[${i}] ${x?.id ?? ''}`;
    if (!ent.has(x?.from)) E(w, `from -> unknown entity "${x?.from}"`);
    if (!ent.has(x?.to)) E(w, `to -> unknown entity "${x?.to}"`);
    inList(w, cfg.relationTypes, x?.type, 'relationTypes');
    checkDate(w, 'start', x?.start);
    checkDate(w, 'end', x?.end, false);
    refs(w, 'sourceIds', x?.sourceIds, src, 'source', 1);
  });
  threads.forEach((x, i) => {
    const w = `threads.json[${i}] ${x?.id ?? ''}`;
    if (!x?.title) E(w, 'missing title');
    checkSlug(w, x || {});
    refs(w, 'eventIds', x?.eventIds, evs, 'event', 1);
    const dates = (x?.eventIds || []).map((id) => evs.get(id)?.date).filter(Boolean);
    if (dates.some((d, k) => k && d < dates[k - 1])) W(w, 'eventIds are not in date order (fine only if deliberate)');
  });
  const datedEras = [];
  eras.forEach((x, i) => {
    const w = `eras.json[${i}] ${x?.id ?? ''}`;
    if (!x?.label) E(w, 'missing label');
    checkDate(w, 'start', x?.start);
    checkDate(w, 'end', x?.end);
    if (okDate(x?.start) && okDate(x?.end)) datedEras.push(x);
  });
  datedEras.sort((a, b) => (a.start < b.start ? -1 : 1)).forEach((x, k, a) => { if (k && x.start <= a[k - 1].end) W(`eras.json ${x.id}`, `overlaps ${a[k - 1].id}`); });
  if (!media.length) W('media.json', 'no media yet; every event needs a hero image before launch');
  const summary = `${events.length} events, ${entities.length} entities, ${relations.length} relations, ${sources.length} sources, ${media.length} media, ${threads.length} threads; ${quoteChecks} quotes checked against .storyworld/archive`;
  if (!quiet) {
    if (errors.length) { errors.forEach((e) => out(`BLOCKED ${e}`)); out(`RED: ${errors.length} blocking rows (${summary}). Fix every row, then rerun validate.`); }
    else out(`GREEN: ${summary}.`);
    warns.slice(0, 40).forEach((w) => out(`WARN ${w}`));
    if (warns.length > 40) out(`WARN ... ${warns.length - 40} more`);
  }
  return { errors, warns, summary, events: events.length, threads: threads.length, noHero: events.filter((x) => !x?.auto && !(x?.mediaIds || []).length).length };
}

// ---------------------------------------------------------------- synthetic fixture and example removal

function fixture() {
  const N = +flag('events', 10000), M = +flag('entities', 600), dir = path.resolve(typeof flag('out') === 'string' ? flag('out') : 'fixture');
  const tracks = ['t1', 't2', 't3', 't4'];
  const day = (k) => new Date(Date.UTC(2015, 0, 1) + k * 86400000).toISOString().slice(0, 10);
  const ents = Array.from({ length: M }, (_, i) => ({ id: `e${i}`, slug: `entity-${i}`, kind: 'company', name: `Entity ${i}`, trackIds: [tracks[i % 4]], firstSeen: '2015-01-01' }));
  const srcs = Array.from({ length: Math.ceil(N / 10) }, (_, i) => ({ id: `s${i}`, kind: 'dataset', url: `https://example.org/s/${i}`, publisher: 'Fixture', title: `Source ${i}`, publishedAt: '2015-01-01' }));
  const evs = Array.from({ length: N }, (_, i) => ({ id: `v${i}`, slug: `event-${i}`, date: day(Math.floor((i * 3650) / N)), datePrecision: 'day', trackId: tracks[i % 4], kind: 'fixture', title: `Event ${i}`,
    body: `{Entity ${i % M}:e${i % M}} ` + 'and the fixture body continues with filler words for layout testing '.repeat(5), entityIds: [`e${i % M}`, `e${(i * 7) % M}`], sourceIds: [`s${Math.floor(i / 10)}`], confidence: 'confirmed', auto: true }));
  const rels = Array.from({ length: M * 2 }, (_, i) => ({ id: `r${i}`, from: `e${i % M}`, to: `e${(i * 13 + 1) % M}`, type: 'partners', start: day(i % 3650), sourceIds: ['s0'] }));
  writeJson(path.join(dir, 'site.json'), { name: `Fixture ${N}x${M}`, tracks: tracks.map((id, k) => ({ id, name: id, color: ['#d9a441', '#5b8fd9', '#6fbf73', '#c96f6f'][k] })) });
  writeJson(path.join(dir, 'entities.json'), ents); writeJson(path.join(dir, 'sources.json'), srcs); writeJson(path.join(dir, 'events.json'), evs);
  writeJson(path.join(dir, 'relations.json'), rels); writeJson(path.join(dir, 'media.json'), []);
  out(`FIXTURE ${dir}: ${N} events, ${M} entities, ${rels.length} relations ("auto" rows). Build the site against it for the scale acceptance.`);
}

function clearExample() {
  if (!isExample()) { out('NOT_EXAMPLE: content/site.json is not the fictional example; nothing removed.'); return; }
  const remove = (from, into) => {
    for (const f of fs.readdirSync(from, { recursive: true })) {
      const p = path.join(into, f);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) fs.rmSync(p);
    }
  };
  remove(path.join(SKILL, 'templates', 'example-content', 'content'), path.join(ROOT, 'content'));
  remove(path.join(SKILL, 'templates', 'example-content', 'archive'), ARCHIVE);
  out('CLEARED the example from content/ and .storyworld/archive/. Write content/site.json first: tracks and vocab from the brief and the domain pack.');
}

// ---------------------------------------------------------------- measurement: one at a time, on a quiet host

async function measure() {
  const dd = argv.indexOf('--');
  const run = dd < 0 ? [] : argv.slice(dd + 1);
  if (!run.length) { out(`usage: ${CMD} measure [--max-load N] [--wait-min M] [--label L] -- <command...>`); process.exit(2); }
  const maxLoad = +flag('max-load', Math.max(1, Math.round(os.cpus().length * 0.5)));
  const waitMs = +flag('wait-min', 20) * 60000;
  const label = flag('label', run.join(' ').slice(0, 60));
  const t0 = Date.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (;;) {
    try { fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, label, root: ROOT }), { flag: 'wx' }); break; } catch {
      const holder = readJson(LOCK, {});
      if (!holder.pid || !alive(holder.pid)) { fs.rmSync(LOCK, { force: true }); continue; }
      if (Date.now() - t0 > waitMs) { out(`BUSY: another measurement holds the lock (pid ${holder.pid}, "${holder.label}"). Retry later; timings never overlap.`); process.exit(3); }
      await sleep(2000);
    }
  }
  process.on('exit', () => fs.rmSync(LOCK, { force: true }));
  while (os.loadavg()[0] > maxLoad) {
    if (Date.now() - t0 > waitMs) { out(`NOT_QUIET: 1-min load ${os.loadavg()[0].toFixed(1)} stayed above ${maxLoad} for ${waitMs / 60000} min. Record no numbers now; report the wait.`); process.exit(3); }
    await sleep(5000);
  }
  const start = os.loadavg()[0];
  let peak = start;
  const sampler = setInterval(() => { peak = Math.max(peak, os.loadavg()[0]); }, 1000);
  const code = await new Promise((r) => spawn(run[0], run.slice(1), { stdio: 'inherit' }).on('exit', (c) => r(c ?? 1)));
  clearInterval(sampler);
  const discard = peak > maxLoad;
  if (fs.existsSync(SW)) {
    fs.mkdirSync(path.dirname(MEASURE_LOG), { recursive: true });
    fs.appendFileSync(MEASURE_LOG, `${new Date().toISOString()}\t${label}\texit ${code}\tload ${start.toFixed(1)}-${peak.toFixed(1)}/${maxLoad}\t${discard || code ? 'DISCARD' : 'OK'}\n`);
  }
  if (discard) { out(`DISCARD: load peaked at ${peak.toFixed(1)} (limit ${maxLoad}) during the run. Rerun; record no numbers from it.`); process.exit(4); }
  out(`MEASURED exit ${code}: load ${start.toFixed(1)} to ${peak.toFixed(1)} (limit ${maxLoad}).`);
  if (code !== 0) out('CHECK: the command failed; read its output above before using any file it wrote.');
  process.exit(code);
}

// ---------------------------------------------------------------- owned static servers (host-wide registry, so worktrees see each other)

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.txt': 'text/plain' };
const registry = () => readJson(REGISTRY, []).filter((x) => alive(x.pid));
const saveRegistry = (r) => writeJson(REGISTRY, r);

function serveChild(dir, port, host) {
  http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(dir, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(dir)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { if (path.extname(u)) { res.writeHead(404); return res.end(); } f = path.join(dir, 'index.html'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, host);
}

async function serve() {
  if (flag('child')) return serveChild(path.resolve(argv[0]), +flag('port'), flag('host', '127.0.0.1'));
  const dir = argv[0] && !argv[0].startsWith('--') ? path.resolve(argv[0]) : null;
  const port = +flag('port', 0), owner = flag('owner'), host = flag('host', '127.0.0.1');
  if (!dir || !fs.existsSync(dir) || !port || typeof owner !== 'string') { out(`usage: ${CMD} serve <dir> --port N --owner <lead|agent-name> [--host 127.0.0.1]`); process.exit(2); }
  const holder = registry().find((x) => x.port === port);
  if (holder && holder.owner !== owner) { out(`PORT_TAKEN: ${port} belongs to ${holder.owner} (pid ${holder.pid}). Pick another port; leave theirs running.`); process.exit(3); }
  if (holder) return out(`SERVING http://${host}:${port}/ (already up, pid ${holder.pid}, owner ${owner})`);
  // Outside a storyworld project the log goes to the temp dir, so serving never creates .storyworld/.
  const logFile = fs.existsSync(SW) ? path.join(SW, 'servers.log') : path.join(os.tmpdir(), 'storyworld-servers.log');
  const log = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [SELF, 'serve', dir, '--child', '--port', String(port), '--host', host], { detached: true, stdio: ['ignore', log, log] });
  child.unref();
  for (let i = 0; i < 40; i++) {
    const ok = await new Promise((r) => http.get(`http://${host}:${port}/`, (res) => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)));
    if (ok) {
      saveRegistry(registry().filter((x) => x.port !== port).concat({ port, pid: child.pid, owner, dir, host, root: ROOT }));
      return out(`SERVING http://${host}:${port}/ pid ${child.pid} owner ${owner}. Stop: ${CMD} stop --owner ${owner} --port ${port}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  try { process.kill(child.pid); } catch {}
  out(`FAILED: nothing answered on ${host}:${port} (see ${logFile}). A process outside storyworld may hold the port.`);
  process.exit(3);
}

function stopWhere(pred) {
  const keep = [];
  let n = 0;
  for (const x of registry()) {
    if (pred(x)) { try { process.kill(x.pid); n++; out(`STOPPED ${x.port} (${x.owner}, pid ${x.pid})`); } catch { keep.push(x); } } else keep.push(x);
  }
  saveRegistry(keep);
  return n;
}

function stop() {
  const owner = flag('owner'), port = +flag('port', 0);
  if (typeof owner !== 'string') { out(`usage: ${CMD} stop --owner <name> [--port N]   (stops only that owner's servers)`); process.exit(2); }
  if (!stopWhere((x) => x.owner === owner && (!port || x.port === port))) out(`NOTHING_TO_STOP: no live server registered to ${owner}${port ? ' on ' + port : ''}. Other owners' servers stay up.`);
}

function cleanup() {
  const owner = flag('owner'), keepLead = flag('keep-lead');
  if (typeof owner !== 'string' && !keepLead) {
    out(`usage: ${CMD} cleanup --owner <name>   (an agent: its own servers)`);
    out(`       ${CMD} cleanup --keep-lead      (the lead at ship: every non-lead server of this project; lead servers stay for the user)`);
    process.exit(2);
  }
  stopWhere((x) => x.root === ROOT && (typeof owner === 'string' ? x.owner === owner : x.owner !== 'lead'));
  const left = registry().filter((x) => x.root === ROOT);
  if (left.length) out('STILL_RUNNING (list these URLs in the report): ' + left.map((x) => `http://${x.host}:${x.port}/ (${x.owner})`).join(', '));
  try {
    const wt = execFileSync('git', ['-C', ROOT, 'worktree', 'list', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n\n').filter(Boolean).slice(1);
    for (const w of wt) {
      const p = /worktree (.*)/.exec(w)?.[1], b = /branch refs\/heads\/(.*)/.exec(w)?.[1] ?? '(detached)';
      let dirty = '';
      try { dirty = execFileSync('git', ['-C', p, 'status', '--porcelain'], { encoding: 'utf8' }).trim(); } catch {}
      out(`REVIEW_WORKTREE ${p} [${b}] ${dirty ? 'has uncommitted changes: keep it and tell the user' : 'clean: remove with `git worktree remove` once its branch is merged'}`);
    }
  } catch { out('worktrees: not a git repository'); }
  if (fs.existsSync(LOCK) && !alive(readJson(LOCK, {}).pid)) { fs.rmSync(LOCK, { force: true }); out('REMOVED stale measurement lock'); }
  out('CHECK: close the browser sessions and background jobs you started (agent-browser, Playwright, dev servers outside storyworld). Only your own.');
  if (keepLead && fs.existsSync(SW)) fs.writeFileSync(path.join(SW, 'cleanup.done'), new Date().toISOString() + '\n');
}

const cmds = { init, status, gate, measure, serve, stop, cleanup, fixture, 'clear-example': clearExample,
  validate: () => {
    if (flag('vocab')) { for (const [k, l] of Object.entries(vocab(path.join(ROOT, 'content')))) out(`${k}: ${l ? l.join(', ') : `(any; set site.json vocab.${k} to restrict)`}`); return; }
    const dir = argv[0] && !argv[0].startsWith('--') ? path.resolve(argv[0]) : path.join(ROOT, 'content');
    if (validateContent(dir).errors.length) process.exit(1);
  } };
if (!cmds[cmd]) { out(`usage: ${CMD} <init|status|gate|validate|fixture|clear-example|measure|serve|stop|cleanup> [args]`); process.exit(2); }
await cmds[cmd]();
