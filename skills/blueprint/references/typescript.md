# TypeScript project structure

Evidence: next.js, Effect, tailwindcss, shadcn/ui, portless, json-render, emulate, agent-browser, konsistent (2026 survey).

## Single package (the default start)

```
src/index.ts          entry; exports map points at dist
src/<topic>.ts        flat modules until a folder earns itself
test co-located       src/foo.test.ts (library-shaped code — tailwind pattern)
tsconfig.json         standalone: ES2022, module ESNext/NodeNext, strict, isolatedModules
tsup.config.ts        tsup is the observed default bundler (5/5 vercel-labs repos); ESM-first
package.json          "type": "module"; exports map with types condition first
vitest                default runner; node --test only for no-build thin wrappers
```

Exports map, minimum viable: `{".": {"types": "./dist/index.d.ts", "import": "./dist/index.js"}}`. Add `./cli` subpath when a bin exists (emulate pattern). Dual CJS only when a consumer demands it.

## Escalation ladder (add machinery only at the trigger)

| Trigger | Add |
|---|---|
| 2nd package | `pnpm-workspace.yaml` + root scripts; packages stay flat `packages/<name>` |
| ≥3 packages hand-copying tsconfig | shared base: root tsconfig extended by leaves (emulate) — a `typescript-config` package only at json-render scale (27 pkgs) |
| ≥3 packages + build graph pain | turbo.json |
| multiple publishable pkgs, different audiences | changesets; below that, manual version bump + changelog markers (portless) |
| cross-package structural rules | **delegate to konsistent** (`npx skills add vercel-labs/konsistent`) — sibling-file co-existence, barrel purity, import-direction layering, acronym-aware naming are its predicates; do not hand-roll checkers for these |
| internal/fixture package | name it `internal-*` AND `"private": true` — visible in `ls`, not just in JSON |

## Monorepo invariants (from the giants)

- Tests: co-located `*.test.ts` for unit-only packages; a separate `test/` tree once e2e/fixtures exist (next.js, Effect). Never both styles in one package.
- Supply chain: `pnpm-workspace.yaml` `minimumReleaseAge` (next.js: 48h) — cheap, works for solo repos too.
- Generated docs are gitignored; authored docs tracked — name the trees differently (Effect: `docs/` generated+ignored, `ai-docs/` authored+tracked).
- Machine-actionable project config: one strict-schema JSON at root capturing init-time decisions; derived paths recomputed, never cached (shadcn components.json — blueprint.json follows it).
- publint/attw: not observed in any surveyed repo; add only on a real consumer bug report.
