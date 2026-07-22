# Python project structure

Evidence: click, black, ai-python, nanochat (2026 survey).

## Baseline (any Python project, 2026)

```
pyproject.toml     everything lives here: deps, [dependency-groups], tool config
uv.lock            uv is the consensus tool — all 4 surveyed repos, zero poetry/pip-tools
.python-version    pins the interpreter
tests/             flat until the package grows namespaces
```

- `[dependency-groups]` (PEP 735) for contributor tooling; `[project.optional-dependencies]` ONLY for extras real users install (`pip install pkg[openai]`). Never mix (black, ai-python both split this way).
- `py.typed` ships whenever the public API is typed.
- Workarounds carry their WHY at the point of use — an undocumented workaround gets "simplified" away by the next agent (ai-python's TaskGroup/GeneratorExit note is the model).

## Two shapes — pick by kind, don't blend

**Library / SDK (ships to PyPI):**
- `src/<pkg>/` layout — prevents importing the working tree instead of the installed package during tests.
- Tests mirror `src/` 1:1 once there are multiple subpackage namespaces (ai-python); flat below that (click: 26 flat files).
- ruff (lint+format) + **two** independent type checkers in CI (click: mypy strict + pyright; ai-python: mypy strict + ty) — each has blind spots.
- Build backend: hatchling (+ hatch-vcs or uv-dynamic-versioning for git-tag versions) or flit for pure-python simple cases.
- `CHANGES.md` at root, linked from `[project.urls]`.

**Research / app (nanochat regime):**
- Flat package at root (`<pkg>/`), `scripts/` for CLI entry points, `runs/` for reference shell scripts.
- **One executable script IS the reproducibility contract** (`speedrun.sh`) — outranks a CI matrix.
- Zero lint/typecheck/pre-commit is legitimate for a single-maintainer reference repo optimized for reading. The README's annotated file tree replaces docs machinery.
- No `[build-system]` table needed when nothing is pip-installed — `uv run` in place.

Hardware-conditional deps (CUDA/CPU torch): `[tool.uv.sources]` + indices + `tool.uv.conflicts` on extras — one lockfile, no forked requirements files (nanochat).
