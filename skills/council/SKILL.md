---
name: council
description: Convene other frontier models for second opinions or multi-round debate on a decision, design, diagnosis, or review. Seats: GPT-5.6 Sol (codex CLI), Claude Opus 5 (cursor-agent CLI), Claude Fable 5 (claude CLI), Grok 4.6 (grok CLI), all at high reasoning effort with full tool access. Use when asked to "consult the council", "roundtable this", "ask the other models", "get a second opinion", "debate this across models", or before committing to a contested technical choice.
---

# council

A model consulting itself anchors on its first guess and grades its own homework. The council breaks that in two modes. Consult: one brief, blind answers, you weigh them. Roundtable: the blind round, then rounds of debate where each seat sees the others' positions and attacks, concedes, or holds. The council advises; you decide. Its value is independent disagreement, so protect it: round 1 is always blind, and nothing you write may telegraph your own leaning.

## Seats

Convene every seat except the model you are. Three is the normal panel, two is quorum. Run seats from the repo root, or from the seat's own worktree when isolated, and hold each seat's cwd constant across rounds: cursor-agent resume is scoped to the cwd it started in, and codex refuses directories it doesn't trust. Give codex absolute output paths; it resets its own cwd.

| Seat | Round 1 |
|---|---|
| GPT-5.6 Sol | `codex exec -m gpt-5.6-sol -c model_reasoning_effort=high -s danger-full-access -o "$d/sol_r1.md" - < "$d/brief.md" > "$d/sol_r1.log" 2>&1` |
| Claude Opus 5 | `cursor-agent -p --output-format json --trust --force --model claude-opus-5-thinking-high "$(cat "$d/brief.md")" > "$d/opus_r1.json"` |
| Claude Fable 5 | `claude -p --model claude-fable-5 --effort high --dangerously-skip-permissions --session-id "$FAB_ID" < "$d/brief.md" > "$d/fable_r1.md"` |
| Grok 4.6 | `grok --prompt-file "$d/brief.md" -m grok-4.6 --reasoning-effort high --permission-mode bypassPermissions --session-id "$GROK_ID" > "$d/grok_r1.md"` |

Session IDs make later rounds possible; capture them in round 1 even if you expect a single round:

- Fable and Grok take a pre-minted ID: `FAB_ID=$(uuidgen | tr A-Z a-z)`, same for `GROK_ID`.
- Sol prints its ID into the log: `SOL_ID=$(grep -m1 -oE 'session id: [a-f0-9-]+' "$d/sol_r1.log" | awk '{print $3}')`.
- Opus returns it in JSON along with the answer: `OPUS_ID=$(jq -r .session_id "$d/opus_r1.json")`, answer in `.result`.

The permission flags (`-s danger-full-access`, `--force`, `--dangerously-skip-permissions`, `--permission-mode bypassPermissions`) let seats write and run code to test their claims; the effort flags pin high reasoning. Drop none. If a CLI is missing (`which` fails) or a seat dies, name the empty seat; below quorum, stop and tell the user which seats you can field.

## Isolation

For a judgment brief (read, reason, answer) all seats share the repo root. When the brief asks seats to build or run experiments, four agents with write access in one tree will trample each other: give each seat its own worktree before round 1 and pin all its rounds there:

```sh
git worktree add "$d/wt-$seat" HEAD          # per seat
( cd "$d/wt-$seat" && <seat command> ) &      # codex seat: add --skip-git-repo-check, the worktree is not in its trust list
```

After synthesis, harvest then destroy: `git -C "$d/wt-$seat" diff > "$d/$seat.patch"`, then `git worktree remove --force "$d/wt-$seat"`. A council session ends with zero worktrees left; the patches in `$d` are the record.

## Brief

Seats share your filesystem, not your conversation. Write `$d/brief.md` so a stranger in your cwd can act on it:

- The question as a decision between named options, not an essay prompt.
- Context they need: repo-relative paths to read, the exact error output, the constraints. They can open files and run commands, so point instead of pasting, and name the verification command when you want claims tested.
- What evidence would change the answer.
- The ask, verbatim: "Take a position. Name the option you would commit to, the strongest argument against it, and what you would check before shipping."

Keep your own leaning out. A brief that telegraphs the desired answer collects three echoes, and your own opinion is already free.

## Round 1

```sh
d=$(mktemp -d "${TMPDIR:-/tmp}/council.XXXXXX")   # or your harness's scratch dir
# write $d/brief.md, mint FAB_ID/GROK_ID, then one line per seat:
<seat command> 2> "$d/<seat>.err" &
wait
```

Always parallel, never in series. If your harness tracks background tasks, prefer that over bare `&` so completion is signaled. Kill a stalled seat and proceed at quorum, naming the absentee: ~5 minutes for judgment briefs, longer when seats are building. Tell the user the council is out before you dispatch.

In consult mode, go straight to Synthesize.

## Roundtable

Debate rounds resume each seat with the others' positions. Between rounds, write one circulation file per seat containing the other seats' latest positions verbatim, labeled Panelist A/B/C, same label per seat every round, never model names: models defer to brands and so will you. If the user injects an argument between rounds, it enters circulation as one more unnamed panelist. End each circulation with: "Attack or concede each position, then restate your own: changed or held, and what would settle what remains."

| Seat | Rounds >= 2 |
|---|---|
| GPT-5.6 Sol | `codex exec resume "$SOL_ID" -o "$d/sol_r$n.md" - < "$d/circ_sol.md" > "$d/sol_r$n.log" 2>&1` |
| Claude Opus 5 | `cursor-agent -p --resume "$OPUS_ID" --output-format text --trust --force --model claude-opus-5-thinking-high "$(cat "$d/circ_opus.md")" > "$d/opus_r$n.md"` |
| Claude Fable 5 | `claude -p --resume "$FAB_ID" --model claude-fable-5 --effort high --dangerously-skip-permissions < "$d/circ_fable.md" > "$d/fable_r$n.md"` |
| Grok 4.6 | `grok -p "$(cat "$d/circ_grok.md")" --resume "$GROK_ID" -m grok-4.6 --reasoning-effort high --permission-mode bypassPermissions > "$d/grok_r$n.md"` |

Codex resume takes no `-m`/`-s`/effort flags; the session inherits them. Rounds run parallel like round 1.

Stop after any round where no seat moved, or the decision-relevant crux is settled, or at round 3. Show the user the split and crux between rounds when they are present. Convergence is not the goal; a debate that ends 2-1 with sharp reasons beats one massaged to unanimity, and forced consensus just rediscovers anchoring.

## In Orca

If `ORCA_TERMINAL_HANDLE` is set, you are in an Orca-managed terminal: run seats as Orca terminal panes instead of bare `&`, so each seat is visible, durable, and collectable. Load the version-matched command guide first (`orca skills get orca-cli`, plus `orca skills get orchestration` for blocking waits and collection); never guess Orca flags from memory. Teardown then includes closing every seat's pane; account for each one before ending the session.

## Synthesize

Read every transcript in full, then weave. Concatenating the seat answers is not synthesis:

1. **Unanimous.** One line per point all seats agree on.
2. **Split.** Who holds what, and the crux, quoting each side's strongest sentence.
3. **Solo.** Findings exactly one seat produced. These are why the council exists; do not drop them for being unconfirmed.
4. **Moved.** Roundtable only: who changed position, and the argument that moved them. This is the debate's yield; a round that moved nobody is evidence every position survives attack.
5. **Verdict.** Your decision, naming where a seat changed your mind and where you overrule the panel and why.

A split on the decision itself goes to the user with the crux visible. Never settle it by majority vote; model count is not evidence.

Transcripts and patches stay in `$d`. When the user asks why, cite the seat file, not your memory of it.
