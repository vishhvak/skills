# Rust project structure

Evidence thinner than TS/Python — drawn from codex (112-crate workspace), tailwindcss oxide, agent-browser. Marked accordingly; prefer upstream Rust API guidelines for code-level style.

## Layout

```
Cargo.toml            workspace root; members = ["crates/*"]
rust-toolchain.toml   pin the toolchain in-repo (tailwind) — not just Cargo.lock
crates/<name>/        one concern per crate; resist the god-crate
                      (codex AGENTS.md: actively refuse to grow codex-core)
justfile              day-to-day command runner fronting cargo (codex)
```

- Module size ceiling: ~500 LOC target, ~800 hard limit per file (codex's own rule) — split before the file becomes a landmark.
- Clippy pinned in CI; warnings are errors.
- Mixed-language repos: the Rust tree is self-contained (own configs, own nested AGENTS.md); a thin npm/py wrapper package fronts the binary (agent-browser: `cli/` Rust + `bin/*.js` launcher; binaries gitignored, built artifacts never tracked).
- Dual build systems (Cargo + Bazel): one drives the other via a documented bridge command, and CI checks lockfile drift (codex: `just bazel-lock-update`). Never maintain two dependency graphs by hand.
- E2E tests needing real external processes: `#[ignore]` them out of the default run, invoke explicitly (agent-browser: `cargo test e2e -- --ignored --test-threads=1`).
