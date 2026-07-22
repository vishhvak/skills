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

## Skeleton (root)

```markdown
# <project>

<2 lines: what this is, what it is not.>

## Map
<dir → one-line purpose. Point at nested AGENTS.md rather than duplicating them.>

## Commands
| Change | Validate with |
|---|---|

## Rules
- <hard policy bullets: git identity, commit format, forbidden actions, artifact policy pointer to .agents/blueprint.json>

## Gotchas
- <one bullet per burned lesson — exact flags, exact error text>
```

## Growth protocol

When a session surfaces a non-obvious, durable lesson: append one bullet to the *nearest relevant* AGENTS.md (root only if project-wide) — opencode ships a `learn` command doing exactly this. A lesson written to the wrong scope is noise; the same correction made twice means the bullet is missing or misplaced.
