---
name: storyworld
description: "Storyworld: build a cinematic interactive story site about any subject in the dark.netflix.io format. Use when the user wants a storytelling, explainer or interactive-journalism website about a domain (an industry, a conflict, a company's history, a franchise), or wants to continue, measure or ship a storyworld project (a directory with .storyworld/)."
---

# Storyworld

A **storyworld** tells a subject as a cast of entities and a chronology of events. The reader explores it one event
at a time and filters it **as of** a point in time, through an as-of scrubber, an entity graph, one-event-per-screen
storylines with WebGL transitions, and a mood background. `reference/format.md` defines the format. This file
routes the work. The script decides the phase.

## Start every session here

```bash
node {baseDir}/scripts/storyworld.mjs status
```

Run it anywhere inside the project, and follow what it prints:

| Line | Do |
|---|---|
| `NO_PROJECT` | Run the `init` command it prints in the project root (`--pack ai-buildout` for that subject), then `status` |
| `phase:` | The current gate. Read every file on its `load:` lines (the section named, when one is), and only those |
| `do:` | The work for this phase |
| `BLOCKED:` | An open condition of this gate. Clear every one |
| `ASK_USER:` | Send the user that message, then stop until they answer. Record their answer where it says |
| `ROUND_CAP:` | Acceptance rounds are spent. Write the residuals file and record the gate as it says |
| `next:` | The exact command to run once the work is done |
| `phase: DONE` | Give the final report (reference/process.md, section "Ship") |

## Gates

Nine gates, passed in order. Only the lead records gates, and every gate takes `--evidence <file>` (for gates
1 to 3, the file itself). The script refuses a gate whose conditions fail, or whose earlier gates have no
evidence.

| # | Gate | Done when |
|---|---|---|
| 1 | `brief` | brief.md and domain.md have no `<fill>` left, and every decision box carries the user's answer |
| 2 | `done` | done.md is filled and the user approved it (their words quoted in `--note`) |
| 3 | `look` | look.md holds three directions, and the user's `Chosen:` line |
| 4 | `content` | `validate` is GREEN on the real subject; done.md's minimum events and threads are met; every hand-written event has a hero image |
| 5 | `build` | ARCHITECTURE.md and CONTRACTS.md exist, and the site builds and typechecks (evidence: the build output) |
| 6 | `preview` | An integrated build is served, and the user has its URL (evidence: a file with the URL and what works) |
| 7 | `flow` | The full journey passes in Chromium, Firefox and WebKit (evidence: the three `FLOW PASS` logs) |
| 8 | `accept` | Every acceptance.md row is PASS with control, measurement and evidence, or two measured rounds are spent and residuals.md is written |
| 9 | `ship` | `cleanup --keep-lead` has run, and the final report is written |

**Stop at every gate.**

- A passing build, a GREEN validate or a user's "looks good" is evidence for one gate. It is never permission to
  record the next one.
- Compressing gates 4 to 8 into one push is the dominant failure mode. Each gate gets its own evidence file and
  its own `status` run.
- Gates 1, 2 and 3 are the user's decisions. The script prints `ASK_USER` for each of them. Record what the user
  actually said: the decision boxes, the `--note` and the `Chosen:` line quote the user, and you never write them
  on the user's behalf.

## Commands

All commands are `node {baseDir}/scripts/storyworld.mjs <command>`.

| Command | Use |
|---|---|
| `status` | The phase, the files to load, the open conditions, the next command |
| `init --domain "<subject>" [--pack <name>]` | Creates `.storyworld/`: brief, domain, done, look, acceptance, and a private `archive/`. Also creates `content/` with a fictional example that validates |
| `clear-example` | Removes the example files before you add the real subject |
| `validate [dir]` / `validate --vocab` | Checks content: ids, links, as-of honesty, dates, sources, licences, quotes against `.storyworld/archive/`. Prints `GREEN`, or `BLOCKED` rows each with its fix. `--vocab` lists the allowed kinds and types |
| `fixture --events 10000 --entities 600 --out <dir>` | Synthetic content for the scale acceptance row |
| `measure [--max-load N] -- <cmd>` | Runs one timing command under a host-wide lock, on a quiet host. `DISCARD`, `NOT_QUIET` and `BUSY` mean: record no numbers |
| `serve <dir> --port N --owner <name>` / `stop --owner <name>` | A static server with SPA fallback, registered host-wide to its owner |
| `cleanup --owner <name>` / `cleanup --keep-lead` | Stops one agent's servers / at ship, stops every non-lead server, lists worktrees, writes the ship marker |
| `gate <id> --evidence <file> [--evidence ...] [--note "..."]` / `gate accept --round` | Records a gate / records one measured acceptance round |

## Working rules

- **Content is cited, or it is cut.** `validate` is the authority. Fix every row it reports, then rerun it.
- **Every timing goes through `measure`**, against a control, one at a time (reference/budgets.md).
- **Show the user a running build at the first integration**, and again after each round.
- **Every server goes through `serve --owner`**, on its allocated port. Stop only your own.
- **Report status with evidence.**
  - "Done" means `status` printed DONE.
  - Before calling something unfixable, run one diagnostic experiment and cite it.
  - Hardware you cannot reach is reported as untested.
- **Write the engine and shaders for this site** (reference/architecture.md, section "Provenance").

## References (read the ones `status` names)

| File | Holds |
|---|---|
| `reference/format.md` | The four primitives, the content model, editorial rules, the three-direction look process |
| `reference/data.md` | Collectors, extraction with quote checks, review, licensing, the sentiment method, corrections |
| `reference/domains/*.md` | Ready domain packs. `init --pack` copies one to `.storyworld/domain.md`. For a new subject, fill in `templates/domain.md` |
| `reference/architecture.md` | Stack, packages, performance primitives, image specs and treatment, scale, provenance |
| `reference/budgets.md` | How to measure each acceptance row, the control, known noise, the round cap |
| `reference/process.md` | Capability check, contract-first fan-out, agent briefs, ports, browsers, ship |
