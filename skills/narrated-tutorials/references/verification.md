# Verify a generated lesson

Record observations in the project's verification notes, separate from authoring source. Run Python/compiler tests from the skill when modifying the compiler; execute `node --check` on modified player JavaScript. A compiler PASS validates data, not what the learner sees.

Use the active harness's installed browser skill. Reuse its browser connection and respect user-owned tabs. The player follows the original desktop layout; verify at a desktop viewport. Inspect the smaller-screen notice as a distinct state.

1. Open the generated home page and a chapter deep link. Confirm the authored title/brand, local font, full chapter list, and every expected section. Check browser errors and missing requests.
2. Start narration with an ordinary user gesture. Observe several aligned word highlights and actual audio progress. Inspect a beginning, middle, and final visual state: code text/edits, diagram nodes/arrows, highlight, cursor target, image, or emoji as authored.
3. Pause, change speed, seek backward by clicking a word or using the keyboard, restart, and navigate rapidly. Pause once while the cursor is between targets: its pose must freeze. Seek backward through that movement and confirm the earlier path and orientation return. Earlier visuals must return; obsolete particles and timers must disappear. Controls and narration must agree.
4. In manual mode let a section finish and confirm it waits. Enable Continuous play once, then observe a complete section transition and chapter transition with speech continuing. Pause during playback, resume, turn Continuous play off before another boundary, and confirm that boundary waits. Finish the last chapter and confirm it stops once without looping.
5. Exercise loading/failure behavior and a backward seek across a visual change. Confirm an audio range request returns HTTP 206, and downloaded/generated audio is playable. Note exactly which external voice/alignment engines were actually run.

Do not equate a successful data compile, a static screenshot, or a synthetic audio `ended` event with natural continuous playback. Use deterministic tests for races and errors, plus an actual recorded clip for browser behavior.

For authored diagrams, use [visual-design.md](visual-design.md) to judge the representation inside the actual narrated stage. Inspect at least one transition for each visual family against the intended example. Verify that a moving or changing teaching claim is expressed by the object itself, not only a changing outline. Record renderer type and any intentional basic-schematic sections. Compiler success and non-overlapping boxes do not establish this bar.
