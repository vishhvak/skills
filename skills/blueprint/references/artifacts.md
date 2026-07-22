# Artifact discipline — what lives where, and its git status

Evidence base: next.js, Effect, openclaw, hermes-agent, codex, nanochat, ai-python, shadcn/ui (2026 survey). Convergent, independently-invented conventions only.

## The canonical map

```
AGENTS.md                    tracked    root doctrine (telegraph style; see agents-md.md)
CLAUDE.md -> AGENTS.md       tracked    SYMLINK, never a copy (next.js, openclaw ×23, konsistent, ai-python)
AGENTS.override.md           ignored    personal layer; Codex reads it before AGENTS.md per-directory
.agents/
  blueprint.json             tracked    machine-readable init decisions (this skill's memory)
  skills/<name>/SKILL.md     tracked    curated repo skills — the de-facto cross-tool path
                                        (Codex loader.rs, opencode, openclaw all discover it)
  work/                      POLICY     working docs: handoffs/ reports/ plans/ audits/
docs/                        tracked    public/team docs only — never a dumping ground
src/, packages/, tests…      tracked    per language expert
```

Session state — **ignored in every repo, no exceptions**:

```gitignore
# agent session state — one agent's scratch memory, never team knowledge
.claude/            # local Claude Code state (Effect gitignores it entirely)
CLAUDE.local.md     # personal instructions (next.js convention)
AGENTS.override.md  # personal doctrine layer (codex convention)
.codex/             # local Codex state (hermes: "machine-specific; keep in global config")
.opencode/plans     # opencode scratch (their own nested .gitignore does this)
.hermes/            # "plans, audit logs, per-session caches are never artifacts of the codebase"
.worktrees/         # agent worktrees (ce-worktree self-gitignores this)
opensrc/            # dependency source cache (vercel-labs convention, 4 repos verbatim)
memory/             # agent memory + credentials (openclaw: "NEVER COMMIT")
```

Nuance from next.js — split INSIDE a tool dir when part is shared: `.claude/skills` tracked, `.claude/plans/`+`.claude/todos.json` ignored. Never ignore a whole tool dir that contains curated team content.

## The policy decision (working docs)

Two legitimate regimes — the split the ecosystem hasn't standardized, so each repo must declare one in `.agents/blueprint.json`:

- **private** — working docs never reach origin. For solo/agent-heavy repos where DESIGN.md-class docs are binding but internal. Add the block below. (llmfit regime.)
- **tracked** — docs compound in git (`docs/plans/`, `docs/solutions/`, ADRs). Compound-engineering regime; right for teams that review docs like code.

`private` policy gitignore block — every line carries its WHY (shadcn lesson: an unexplained ignore exception gets "fixed" by a future cleanup):

```gitignore
# internal working docs — binding locally, never in origin (policy: private, see .agents/blueprint.json)
.agents/work/
DESIGN.md          # binding design doctrine, internal
PRODUCT.md         # binding product doctrine, internal
CONTEXT.md
.lavish/           # lavish HTML reports
.scratch/          # to-spec / to-tickets / wayfinder local tracker output
docs/plans/        # only under private policy; tracked policy keeps these
docs/brainstorms/
docs/solutions/
```

## Routing table — where known skills' outputs land

When any of these skills runs in a blueprint repo, redirect its output to the declared location instead of its default:

| Skill(s) | Default (leaks) | Blueprint destination |
|---|---|---|
| handoff (in-repo wanted) | OS tmp | `.agents/work/handoffs/<date>-<slug>.md` |
| lavish | `.lavish/` cwd | keep `.lavish/` but ensure ignored under private policy |
| improve, request-refactor plans | `plans/` root | `.agents/work/plans/` |
| ce-brainstorm / ce-plan / ce-compound | `docs/{brainstorms,plans,solutions}/` | keep paths; policy decides tracked vs ignored |
| to-spec / to-tickets / wayfinder (local tracker) | `.scratch/` | keep `.scratch/`, ignored always (it is a tracker cache, not a doc) |
| domain-modeling | `CONTEXT.md`, `docs/adr/` | CONTEXT.md per policy; ADRs are doctrine → tracked, `docs/adr/NNNN-*.md` |
| retro/audits (any) | varies | `.agents/work/audits/` |

Working-doc filenames: `YYYY-MM-DD-<slug>.md`, frontmatter `title, status (proposed|active|done), date, type` (hermes pattern) — `status` makes staleness greppable without reading bodies.

## Config hygiene (applies under both policies)

- Real config ignored, example tracked: `.env` ignored, `.env.example` tracked; `tool.config.yaml` ignored, `tool.config.example.yaml` tracked.
- Generated output ignored; a generated file kept as a frozen contract gets an inline comment saying so and why.
- Local-only personal excludes go in `.git/info/exclude`, not the shared `.gitignore` (openclaw rule).
