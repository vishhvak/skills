#!/usr/bin/env node
// blueprint hygiene — stdout IS the instruction. Run from repo root.
// Prints numbered directives with exact fix commands, or CLEAN.
// --audit adds a root-level inventory for the RESTRUCTURE procedure.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, lstatSync } from "node:fs";

const sh = (cmd) => {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
};
const directives = [];
const say = (d) => directives.push(d);

// ── 0. git repo?
if (sh("git rev-parse --is-inside-work-tree") !== "true") {
  console.log("NOT_A_REPO — run `git init` first; blueprint classifies via git.");
  process.exit(0);
}
const root = sh("git rev-parse --show-toplevel");
process.chdir(root);
const tracked = new Set((sh("git ls-files") ?? "").split("\n").filter(Boolean));
const ignored = (p) => sh(`git check-ignore -q ${JSON.stringify(p)} && echo yes`) === "yes";
const hasCode = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "src", "packages"].some((p) => existsSync(p));

// ── 1. blueprint.json
let policy = null, workDir = ".agents/work", bindingDocs = [];
const bpPath = ".agents/blueprint.json";
if (!existsSync(bpPath)) {
  console.log(`NO_BLUEPRINT — nextCommand: ${hasCode ? "RESTRUCTURE (existing code detected)" : "INIT"}. Advisory checks follow.\n`);
} else {
  try {
    const bp = JSON.parse(readFileSync(bpPath, "utf8"));
    policy = bp.artifacts?.policy ?? null;
    workDir = bp.artifacts?.dir ?? workDir;
    bindingDocs = bp.bindingDocs ?? [];
    const known = new Set(["$schema", "language", "kind", "packageManager", "artifacts", "bindingDocs"]);
    for (const k of Object.keys(bp)) if (!known.has(k)) say(`UNKNOWN_KEY — ${bpPath} has "${k}"; blueprint.json is a strict contract, remove or fix the typo.`);
    if (policy && !["private", "tracked"].includes(policy)) say(`BAD_POLICY — artifacts.policy is "${policy}"; must be "private" or "tracked".`);
  } catch { say(`UNPARSEABLE — ${bpPath} is not valid JSON; fix it before anything else.`); }
}

// ── 2. session state must be ignored (class: session)
const SESSION = [".claude", ".codex", ".opencode", ".hermes", ".worktrees", "opensrc", "memory", "CLAUDE.local.md", ".scratch"];
for (const p of SESSION) {
  if (!existsSync(p)) continue;
  const entry = p.endsWith(".md") ? p : p + "/";
  // tracked shared content inside a tool dir is legitimate (next.js: .claude/skills) — flag only unignored/tracked state
  const trackedInside = [...tracked].filter((f) => f === p || f.startsWith(p + "/"));
  const sharedOk = trackedInside.every((f) => /(^|\/)skills(\/|$)|(^|\/)commands(\/|$)|(^|\/)agents?(\/|$)/.test(f.slice(p.length)));
  if (trackedInside.length && !sharedOk) say(`SESSION_TRACKED — ${p} has ${trackedInside.length} tracked session file${trackedInside.length > 1 ? "s" : ""}; keep skills/commands, then: git rm -r --cached ${p} && echo "${entry}" >> .gitignore`);
  else if (!trackedInside.length && !ignored(p)) say(`UNPROTECTED — ${p} exists but is not gitignored; append "${entry}" to .gitignore before it leaks.`);
}

// ── 3. private policy: working docs must not be tracked
if (policy === "private") {
  const WORK = [workDir, ".lavish", "docs/plans", "docs/brainstorms", "docs/solutions", ...bindingDocs];
  for (const p of WORK) {
    const hits = [...tracked].filter((f) => f === p || f.startsWith(p + "/"));
    if (hits.length) say(`PRIVATE_LEAK — ${p} is tracked (${hits.length} file${hits.length > 1 ? "s" : ""}) but policy=private; git rm -r --cached ${p} && add to .gitignore. If it must stay in history-scrub territory, tell the user.`);
    else if (existsSync(p) && !ignored(p)) say(`UNPROTECTED — ${p} exists, policy=private, not ignored; append to .gitignore now.`);
  }
}

// ── 4. doctrine files
const agents = existsSync("AGENTS.md"), claude = existsSync("CLAUDE.md");
if (claude) {
  const isLink = lstatSync("CLAUDE.md").isSymbolicLink();
  if (!agents) say(`DOCTRINE_NAME — only CLAUDE.md exists; canonical is AGENTS.md: git mv CLAUDE.md AGENTS.md && ln -s AGENTS.md CLAUDE.md`);
  else if (!isLink) say(`DOCTRINE_FORK — CLAUDE.md is a real file next to AGENTS.md (drift guaranteed); merge into AGENTS.md, then: rm CLAUDE.md && ln -s AGENTS.md CLAUDE.md`);
}
if (tracked.has("AGENTS.override.md")) say(`OVERRIDE_TRACKED — AGENTS.override.md is a personal layer; git rm --cached AGENTS.override.md && add to .gitignore.`);

// ── 5. audit mode: root inventory for RESTRUCTURE
if (process.argv.includes("--audit")) {
  console.log("── AUDIT: root inventory (classify every row: doctrine | working | session | code) ──");
  for (const e of readdirSync(".").sort()) {
    if (e === ".git") continue;
    const t = tracked.has(e) || [...tracked].some((f) => f.startsWith(e + "/")) ? "tracked" : ignored(e) ? "ignored" : "UNTRACKED";
    console.log(`  ${(lstatSync(e).isDirectory() ? e + "/" : e).padEnd(32)} ${t}`);
  }
  console.log("");
}

// ── verdict
if (!directives.length) console.log(`CLEAN — ${tracked.size} tracked files, policy=${policy ?? "undeclared"}${policy ? "" : " (declare via INIT gate 3 when ready)"}.`);
else { directives.forEach((d, i) => console.log(`${i + 1}. ${d}`)); console.log(`\n${directives.length} directive${directives.length > 1 ? "s" : ""} — execute, then re-run until CLEAN.`); }
