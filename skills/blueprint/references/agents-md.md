# AGENTS.md authoring

How the strongest agent-era repos write theirs (opencode ×15 files, openclaw ×15+23 symlinks, codex, hermes 1433-liner, next.js 513-liner). Codex's discovery algorithm (verified in `agents_md.rs`): walk up from cwd to the project root (`.git`), then concatenate every AGENTS.md **root-first down to cwd**; per directory `AGENTS.override.md` wins over `AGENTS.md`. Claude Code reads CLAUDE.md the same layered way. Design for concatenation.

## Hard rules

1. **One file, one edit point.** `AGENTS.md` is canonical; `CLAUDE.md` is a sibling symlink (`ln -s AGENTS.md CLAUDE.md`). Every new nested AGENTS.md gets the same symlink. Never fork the content.
2. **Telegraph style.** Openclaw's own opener: "Telegraph style. Root rules only." One hard-won fact per bullet. This file is re-read every session — token density is the budget.
3. **Root = hard policy + map.** The root file holds: what the project is (2 lines), the directory map, validation commands, git/PR rules, hard prohibitions. Everything scoped goes in a nested file.
4. **Nested = one concern, near the code, <50 lines.** `packages/db/AGENTS.md` explains the DB idiom; `src/auth/AGENTS.md` the auth invariants. A nested file only adds what upstream files don't already say — discovery concatenates them.
5. **Validation as a decision table**, not prose (Effect pattern):

   | Change type | Run |
   |---|---|
   | code | lint + targeted test + typecheck |
   | docs only | lint |

6. **Personal layer stays personal.** `AGENTS.override.md` and `CLAUDE.local.md` are gitignored; that's where one developer's quirks live, not in review-visible diffs.
7. **An AGENTS.md is not mandatory.** Tailwindcss ships none, deliberately. No tribal knowledge worth writing down yet → don't generate boilerplate; revisit when the same correction is made twice.
8. **Prohibitions are a last resort.** Before writing a rule, ask: would a competent engineer reading this repo do the wrong thing without it? If not, the rule is noise the model must reconcile against every request — Anthropic deleted most of theirs from Claude Code's system prompt with no eval loss. Describe the local idiom instead of forbidding the alternative: their own before/after is `"default to writing no comments; never write multi-paragraph docstrings"` → `"write code that reads like the surrounding code: match its comment density, naming, and idiom."` Reserve absolutes for what actually burned you — those belong in Gotchas with the exact error text.
9. **Don't document what the repo already says.** If a name, a script entry, or a type signature carries the fact, the AGENTS.md line restating it is dead weight loaded every session. Fix the name rather than describe it (SKILL.md Gate 3.6).

## Skeleton (root)

```markdown
# <project>

<2 lines: what this is, what it is not.>

## Map
<ONLY dirs whose purpose the name doesn't already carry, plus pointers to nested
AGENTS.md. A well-named tree needs no map. A long Map section is a renaming
backlog, not a documentation gap — rename instead.>

## Commands
| Change | Validate with |
|---|---|
<non-guessable invocations only — not what the manifest's scripts already list>

## Rules
- <hard policy bullets: git identity, commit format, forbidden actions, artifact policy pointer to .agents/blueprint.json>

## Gotchas
- <one bullet per burned lesson — exact flags, exact error text>
- <deliberate absences: what a reader will search for that this repo does NOT
  do, and why. Agents cannot grep for missing code — a well-organized repo keeps
  offering plausible next places to look, so proving a negative burns a whole
  budget. This bullet is cheapest where structure is best.>
```

## Growth protocol

When a session surfaces a non-obvious, durable lesson: append one bullet to the *nearest relevant* AGENTS.md (root only if project-wide) — opencode ships a `learn` command doing exactly this. A lesson written to the wrong scope is noise; the same correction made twice means the bullet is missing or misplaced.
