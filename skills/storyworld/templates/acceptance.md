# Acceptance: {{domain}}

The budgets. `Control` is the same measurement on the control named in done.md, taken in the same run pair
(`n/a` on a first release). Verdict is PASS or FAIL. A row counts as PASS only with Control, Measured and
Evidence filled. Measure only through `storyworld.mjs measure`; Evidence is the run file.

| Config | Viewport | DPR | CPU |
|---|---|---|---|
| A | 1440x900 | 1 | 1x |
| B | 2560x1440 | 2 | 1x |
| C | 1440x900 | 1 | 4x throttle (a mid-range laptop) |
| D | 2560x1440 | 2 | 4x throttle |

| Budget | Target | Control | Measured | Verdict | Evidence |
|---|---|---|---|---|---|
| Frame time p95 / p99 | <= 17.5 ms / <= 20 ms in C and D | | | | |
| Frames over 20 ms | < 1% in C and D | | | | |
| rAF JS per frame p95 | <= 2 ms in C/D, <= 0.5 ms in A/B | | | | |
| Long tasks in any transition | 0 > 50 ms in A/B; <= 1 > 50 ms and none > 100 ms in C/D | | | | |
| Draw calls per frame | graph view at rest <= 10; any frame <= 15 | | | | |
| GL calls per frame p95 | <= 150 | | | | |
| Texture upload per frame | <= 4 ms in C/D (a transition waiting on its image may use 6 ms) | | | | |
| Repeat visit | 0 re-decodes, 0 re-uploads on re-entering a view | | | | |
| GPU memory | <= 256 MB in B/D | | | | |
| Idle JS allocation | <= 0.1 MB/s, no GC in a 10 s idle window | | | | |
| Infinite non-composited CSS animations | 0 | | | | |
| Forced layouts per transition setup | <= 2 | | | | |
| Time to interactive | <= 2.5 s in C, warm cache | | | | |
| Reduced motion | prefers-reduced-motion replaces transitions with cuts and stops the background | | | | |
| No-WebGL fallback | without WebGL every page renders and every event is readable | | | | |
| Scale | the `fixture` content (10,000 events, 600 entities) meets the rows above in C | | | | |
