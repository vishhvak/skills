# Budgets and the measurement protocol

The budget rows and the four configurations (A to D) live in `.storyworld/acceptance.md`, copied there from
`templates/acceptance.md`. These targets took the dark.netflix.io rebuild from 100 to 430 ms transition stalls
to zero tasks over 50 ms. Change a row only with a reason recorded in done.md.

## The control

| Situation | Control |
|---|---|
| Recreating an existing site | That site, served locally (an offline mirror), measured with the same script and steps |
| A later release | The previous release's build |
| A first release | `n/a`. Each row is judged against its target alone. If a reference build exists (`STORYWORLD_REFERENCE`), measure it as context |

The build and its control run one after the other, as a pair. They never run at the same time.

## How to measure each row

Drive Chromium over the DevTools protocol, with identical scripted steps for build and control. Use the real
GPU (`--use-angle=vulkan` or the platform default). Throttle the CPU with `Emulation.setCPUThrottlingRate` for
configs C and D.

| Row | Source |
|---|---|
| Frame time, frames over 20 ms | rAF timestamps in an init script that writes into a preallocated buffer |
| rAF JS per frame | Time inside the single ticker callback, measured by the ticker itself in a debug build |
| Long tasks | Two passes: a trace without the JS sampler (`devtools.timeline`; each `RunTask` gives its duration and thread CPU time), and `PerformanceObserver('longtask')` |
| Draw and GL calls | A separate, untimed run that wraps the WebGL context and counts calls per frame |
| Texture upload per frame | The engine's upload budget logs bytes and ms per frame in a debug build |
| Repeat visit | Decode and upload counters from the engine, compared before and after re-entering a view |
| GPU memory | The engine's texture-byte estimate. Cross-check against the browser's GPU process memory |
| Idle allocation | A harness-free script: sample `performance.memory` on a 16 ms timer into a preallocated `Float64Array`, with no rAF wrapper and no observers. Sum the positive deltas per second; a drop over 100 KB counts as a GC |
| Forced layouts | Long-animation-frame entries (`forcedStyleAndLayoutDuration`), or `Layout` events in the trace inside the transition window |
| Non-composited CSS animations | DevTools `Animation` domain, or a trace scan for `Paint` from CSS animations at rest |
| Time to interactive | Navigation start until the first control accepts input, with a warm cache |
| Reduced motion, no-WebGL | A flow run with `prefers-reduced-motion: reduce` emulated, and one with WebGL disabled; both must reach every step |

## Protocol

1. **One timing at a time, on a quiet host.** Wrap every timing command in
   `storyworld.mjs measure --max-load <N> -- <command>`.
   - It holds a host-wide lock and waits until the 1-minute load average is below N (default: half the cores).
   - It prints `DISCARD` if the load rose above N during the run.
   - Record no numbers from a `DISCARD`, `NOT_QUIET` or `BUSY` result.
   - Cross-browser flows, builds and other agents' jobs all count as load.
2. **Check validity before reading numbers.**
   - The run reached every step.
   - The heap is the size of the real page: a heap near 1 MB means the page never loaded.
   - The control looks like its previous runs. An anomalous control invalidates the pair.
3. **Compare across builds with medians of at least three runs.** For a pass/fail check against a budget with a
   wide margin, one clean run is enough.
4. **Record each row** in acceptance.md: control, measured value, verdict, and the run file as evidence. After
   each full pass over the table, run `storyworld.mjs gate accept --round`. It counts only if `measure` logged
   a new OK run since the previous round.

## Noise that looked like bugs

- **2 to 13 ms GPU upload stalls at 4x CPU on a loaded host.** A plain `memcpy` stalled the same way. Test any
  suspected stall against a trivial control before changing code.
- **WebKit under Playwright on Linux (WPE) renders through software GL**, even when its renderer string names
  a hardware GPU. Its frame times can compare builds, but say nothing absolute about Safari.
- **Load above about half the cores inflates task lengths 2 to 5x.** At load 33 to 59, one build appeared to
  have 54 ms tasks. On a quiet host, the same build's worst task was 33 ms at 4x CPU and 9 ms at 1x.
- **In-page instrumentation allocates.** One frame-sampling harness reported 0.14 to 0.21 MB/s of idle
  allocation for a build that the harness-free script measured at 0.04 to 0.06 MB/s.

## Round cap

Two measured rounds. After round 2, `status` prints `ROUND_CAP`.

1. Write `.storyworld/residuals.md`. For each row not at PASS: its measured value, its evidence, and the next
   experiment that would move it.
2. Record the accept gate.

A third round needs the user's explicit request.
