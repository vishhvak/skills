---
name: blueprint
description: Structure a repo the way strong OSS projects do. Use when initializing a project after brainstorming or a spec, restructuring or reorganizing an existing repo, deciding where agent artifacts (handoffs, plans, reports, specs, PRDs) live and what stays out of git, writing or improving AGENTS.md / CLAUDE.md, or answering TypeScript / Python / Rust project-layout questions.
---

# Blueprint

A repo has three kinds of content. Every structure decision falls out of classifying correctly:

| Class | What | Git status |
|---|---|---|
| **Doctrine** | AGENTS.md (+ nested), `.agents/skills/`, configs, code, public docs | Tracked |
| **Working docs** | specs, PRDs, plans, handoffs, reports, audits, retros, binding design docs | Per-project **policy** — decided once at init, recorded in `.agents/blueprint.json` |
| **Session state** | `.claude/`, `.codex/`, tool caches, memory, todos, worktrees, scratch clones | Ignored, always |

The recurring failure this skill exists to prevent: working docs leak to origin because no policy was ever declared (the ecosystem's doc-producing skills write plain in-repo markdown and only 3 of ~25 protect themselves). Declare the policy once; enforce it with the script.

## First action — always

Run `node {baseDir}/scripts/hygiene.mjs` from the repo root. **Follow whatever it prints.** Its output is the current-state instruction; this file is only the doctrine behind it.

## Route (first match wins)

| Situation | Do |
|---|---|
| Script printed directives | Execute them, re-run script until `CLEAN` |
| No/empty repo, or "set up / initialize the project" | INIT procedure below |
| Existing code + "restructure / reorganize / clean this up / ideal structure" | RESTRUCTURE procedure below |
| "Where should X go / gitignore / what's tracked" | Read `{baseDir}/references/artifacts.md`, apply, verify with script |
| "Write / improve AGENTS.md or CLAUDE.md" | Read `{baseDir}/references/agents-md.md` |
| Language layout question | Read ONE of `{baseDir}/references/{typescript,python,rust}.md` — never all |

Load one expert reference per task, not several.

## INIT — new project

You must stop at every gate. Completing a gate is NOT a green light to skip the next; compressing gates is the dominant failure mode.

**Gate 1 — Requirements exist.** A brainstorm, spec, or PRD must exist before structure. None found → stop and say so; offer to capture a 10-line mini-brief with the user instead of scaffolding on vibes. Done when: you can name the document (or brief) you are structuring FOR.

**Gate 2 — Decisions confirmed.** Fill this table and confirm it with the user (one question round — AskUserQuestion on Claude Code, request_user_input on Codex; plain text question elsewhere):

| Decision | Options (default first) |
|---|---|
| language | typescript / python / rust / mixed |
| kind | app / library / cli / research |
| package manager | pnpm / uv / cargo |
| artifact policy | private (working docs never reach origin) / tracked (docs compound in git) |
| binding root docs | e.g. DESIGN.md, PRODUCT.md — named per project, or none |

Done when: the user has confirmed the table, not merely been shown it.

**Gate 3 — Write the record + skeleton.**
1. `.agents/blueprint.json` — the confirmed table, verbatim keys: `{ "language", "kind", "packageManager", "artifacts": { "policy", "dir": ".agents/work" }, "bindingDocs": [] }`. Tracked. This file is the machine-readable memory every later run reads — the components.json move.
2. `AGENTS.md` per `references/agents-md.md` + `CLAUDE.md` as a **symlink** to it (`ln -s AGENTS.md CLAUDE.md`). Never a copy.
3. `.gitignore` — the two blocks from `references/artifacts.md` (session-state block always; private-artifacts block when policy=private), each line commented with WHY.
4. `.agents/work/` skeleton: `handoffs/ reports/ plans/ audits/` (+ `.gitkeep`s only if tracked policy).
5. Language scaffold per the ONE matching expert reference.

**Gate 4 — Verify.** Script prints `CLEAN`, and `git status` shows no working-doc paths staged under private policy. Both, or the gate is not passed.

## RESTRUCTURE — existing repo

Same gate discipline as INIT.

**Gate 1 — Snapshot.** Run the script with `--audit`. Read its inventory. Classify every root-level entry into the three classes; write the classification to `<artifacts.dir>/audits/<date>-structure.md` (frontmatter: `status: proposed`). Done when: zero unclassified entries — "misc" is not a class.

**Gate 2 — Target + diff.** In the same file: target structure (per language expert + artifacts.md), then a move-by-move migration table (current → target → command). Anything already correct is listed as KEEP — the goal is a faithful map, never a longer list of violations. Do not optimize for finding problems; do not optimize for zero findings.

**Gate 3 — User gate before mass edits.** Present the migration table; get explicit approval. Rule decisions and file moves are separate approvals — never collapse "should this rule exist" and "apply it everywhere" into one turn.

**Gate 4 — Execute in phases.** Git-history-preserving moves (`git mv`), one phase per commit, imports/configs fixed per phase, tests green after each phase before the next. A failing phase stops the migration, not the conversation.

**Gate 5 — Verify + record.** Script `CLEAN`; update the audit file `status: done`. Next restructure run reads this file first — it is the fix backlog and the trend line.

## Cross-harness conduct

- Sub-agents available → parallelize audits/moves; unavailable → do it sequentially and say `independence: degraded (no sub-agents)`.
- Name real harness tools when instructing (Read/Bash on Claude Code; shell on Codex) — the script and references are harness-neutral on purpose.
- History rewrites, force pushes, mass deletions: confirm with the user regardless of harness or mode.
