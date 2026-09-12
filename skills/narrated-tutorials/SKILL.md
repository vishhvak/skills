---
name: narrated-tutorials
description: Build narrated tutorial websites for any subject, with synchronized text, animated diagrams or code, guiding cursors, emoji, and optional continuous playback. Use when creating an interactive lesson, turning material into a spoken walkthrough, or extending a generated tutorial.
---

# Narrated tutorials

Create a complete teaching website from authored content and real narration. The skill bundles its own player, compiler, font, scene renderer, and voice/alignment clients. Generated sites run independently of this skill and the original Effect project.

Works in Claude Code and Codex. Treat `{baseDir}` as the directory containing this file; commands run from the learner's project workspace. The procedure is written for a fast, inexpensive model. Keep each gate's evidence before moving to the next; a scaffold alone does not prove a lesson works.

## Start or resume

Read an existing `lesson.json` and the project's verification notes before creating replacements. Establish the topic, intended audience, source material, teaching outcome, voice, and output directory from the request and available material. Infer routine choices; ask only about consequential missing inputs. Keep all generated text, audio, alignment, plans, and sites in that workspace.

```sh
python3 {baseDir}/scripts/doctor.py --workspace /path/to/project
```

Follow its actionable diagnostics. Use Breeze TTS through a user-selected upstream API by default; add `--breeze-server URL` to check it. Choose a described narrator when no reference voice is supplied, or clone the supplied sample with its transcript. No particular host or preset is required; read [voices.md](references/voices.md) for compute setup and optional providers. Confirm the active harness has browser control; use its installed browser skill. Delegation is optional: when available and allowed, an independent agent can inspect a finished lesson; otherwise verify sequentially and record that limitation. This skill never grants extra permissions.

## Build gates

1. **Teach one idea at a time.** Read [authoring.md](references/authoring.md), [visual-design.md](references/visual-design.md), and [player-data.md](references/player-data.md). Write the course as `lesson.json`: chapters, short sections, authored narration, and visual changes tied to specific words. Choose the representation before its renderer. Use an authored `diagram` module for custom SVG/HTML composition, continuous motion or interactions, basic `scenes` for deliberately simple schematics, and `frames` for code/annotated text. For reference-quality diagrams, inspect the animated-diagrams examples and follow [diagram-modules.md](references/diagram-modules.md). Gate: every section serves the stated outcome and has concrete beginning, middle, and final visuals where explanation needs them.
2. **Speak and align.** Select a voice path in [voices.md](references/voices.md), then follow [runtime.md](references/runtime.md) for exact commands. Generate each section into a WAV, align its actual speech, and compare every word with the authored script. Gate: every section has playable audio and matching real `wordTimings`; a mismatch requires correcting or regenerating the recording, not silently rewriting the lesson to fit it.
3. **Compile.** Run `python3 {baseDir}/scripts/scaffold_tutorial.py --lesson lesson.json --check`. Resolve every reported section, cue, range, and asset failure. Then run the same command with `--output site` instead of `--check`. Gate: a new standalone site exists with all course content, diagram modules and local media. For a new visual family, compile and visually verify one representative narrated section before extending it across the course. Existing output directories are preserved; choose a fresh output directory for another build.
4. **Exercise both modes.** Serve with `python3 site/serve.py 8125`. Follow [verification.md](references/verification.md) in the browser. Manual mode pauses for the learner; Continuous play carries narration across sections and chapters after a user gesture. Gate: demonstrate automatic section advance, chapter advance, pause/resume, turning the toggle off, and stopping at the final section; also inspect word cues, visual transitions, backward seeks, and audio errors.
5. **Deliver evidence.** Write results in the project's verification notes: sections checked, actual voice provider, playable output, checks passed, and any unavailable capability. Link the live site and source lesson. Keep provider setup, model provenance, and licensing details in those notes where relevant. Gate: the user can open and use the finished site without the authoring skill or another repo.

## Load only what the next action needs

| Action | Reference |
| --- | --- |
| Turn source material into a course | [authoring.md](references/authoring.md) |
| Choose a visual representation and quality target | [visual-design.md](references/visual-design.md) |
| Embed authored SVG/HTML motion | [diagram-modules.md](references/diagram-modules.md) |
| Write section data, diagrams, or code cues | [player-data.md](references/player-data.md) |
| Build interactive routing graphs, live tables, pipelines, or document demos | [animated-diagrams](../animated-diagrams/SKILL.md), including its narration-clock integration reference |
| Select or clone a voice | [voices.md](references/voices.md) |
| Generate audio, align, or start a site | [runtime.md](references/runtime.md) |
| Verify motion and continuous playback | [verification.md](references/verification.md) |
| Install or distribute the skill/plugin | [installation.md](references/installation.md) |

Use `examples/` for a runnable course recipe, not as content to rename. Original Effect lessons and speaker recordings are not in the bundle. Authorized reference audio stays in the project's voice workflow; use the supplied source or selected provider without inventing additional permission gates.
