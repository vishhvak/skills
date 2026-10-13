# Process: building a storyworld with agents

The first storyworld build had a working, merged site 4.5 hours after its first commit, and then spent about 19
more hours in acceptance rounds. This process keeps the first part and caps the second.

## Capability check

Before fanning out, check that sub-agents or workflows are available and allowed:

| Situation | Do |
|---|---|
| Available and allowed | Fan out as below |
| Available but gated behind the user's permission | Ask once, then stop |
| Unavailable | Run the areas in sequence, and print `independence: degraded (sub-agents unavailable)` in every report |

Phases can fan out too. In the content phase, run one agent per source collector. In the look phase, one agent
per direction.

## Build (gate `build`)

1. **Contract first.** Before any area starts, the lead writes three things:
   - **`ARCHITECTURE.md`**: one row per area. Each row gives the area's owned directories, what it may import,
     and its completion criterion.
   - **`CONTRACTS.md`**: every interface between areas, with signatures and invariants. Cover at least the
     engine API (scene types, transitions, as-of setter, graph data in, events out), the content shard formats,
     and the route table.
   - **A frozen `engine/api.ts`.**

   With the boundaries fixed up front, six parallel areas merged with no conflicts.
2. **Fan out by area in git worktrees.** Typical areas: engine, shell, content compiler, graph view, timeline
   view. Each area runs as a **builder -> reviewer -> fixer** triple. The reviewer never sees the builder's
   reasoning; it checks against the contract and the brief.
3. **Critic pass.** When several agents write specs or areas, one extra agent reads them all, looking only for
   gaps between them. In the first build, this pass caught the page-to-page choreography, which each of nine
   specialists assumed someone else owned.
4. **Merge, build and typecheck.** Record the gate with the build output as evidence.

## Agent briefs

Every agent prompt carries:

- **Objective:** one sentence.
- **Paths:** the paths it owns, and the paths it leaves alone.
- **Inputs:** the base commit and the contract files to read.
- **Completion criterion:** checkable and exhaustive, e.g. "every route in the route table mounts with zero
  console errors", not "implement pages".
- **Ports:** its allocated port range. It starts servers with `storyworld.mjs serve <dir> --port <p> --owner
  <its name>`, and at the end runs `storyworld.mjs cleanup --owner <its name>`.
- **Measurement:** only through `storyworld.mjs measure`.
- **Design rule:** reproduce the intended design, fix the original's glitches, and list every intentional
  departure.
- **Status rule:**
  - Report what was verified, with evidence.
  - Run one diagnostic experiment before calling anything unfixable.
  - Report a budget as met only when it has been measured.
- **Commit cadence:** commit inside its worktree at each working milestone, so a crashed session loses at most
  one milestone.

## Ports and shared servers

- The lead owns the control server and the user's preview server, both started with `--owner lead`.
- Each agent gets its own port range.
- The server registry is host-wide, so `PORT_TAKEN` also protects servers started from other worktrees.

## Supervision

- **Waiting on agents.** Use the harness's completion notifications for agents and workflows. A custom polling
  watcher produced five empty expiries and one false alarm.
- **Checking an agent's output.** Read the diff and rerun the check it claims passed. An agent's report is a
  claim; the command output is evidence.
- **Starting the next round.** No acceptance round starts by itself. Each starts from `status` and the round cap.

## Preview (gate `preview`)

1. Serve the integrated build with `--owner lead`, on the host the user can reach (their tailnet, or a LAN
   address).
2. Send the URL with a line on what works and what does not yet.
3. Record the gate with that message saved as a file.
4. Resend the URL after each round.

## Browsers

Copy `templates/flow.mjs` into the project and fill `STEPS` with the full journey:

- every route;
- every overlay, opened and closed;
- scrubber moves;
- graph zoom and drag;
- storyline steps in both directions;
- language switch;
- share.

Run it in Chromium, Firefox and WebKit at the first integration, not at the end. Each browser writes its own log
ending in `FLOW PASS` or `FLOW FAIL`. A page error, a console error, a GL or shader error, a crash, or a step
that did not land fails the flow.

Record the gate with all three logs, one `--evidence` each. In the first build, a WebKit crash and a Firefox
rendering bug surfaced only at hour 17, when this check first ran.

## Ship

1. Run `storyworld.mjs cleanup --keep-lead`.
   - It stops every non-lead server of this project.
   - It lists worktrees: remove the clean, merged ones; report the rest.
   - It clears a stale measurement lock.
   - It writes the marker the ship gate needs.

   Close the browser sessions you opened.
2. Deploy only if done.md puts hosting in scope. A static build deploys to any static host.
3. Write the final report for a reader who saw none of the work:
   - what ships;
   - the acceptance table with verdicts;
   - residuals.md;
   - what this host could not test;
   - the URLs still running (cleanup lists them).
4. Record the ship gate with the report.
