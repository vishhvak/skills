# skills

Agent skills by [@vishhvak](https://github.com/vishhvak). Install with the [skills](https://skills.sh) CLI:

```bash
npx skills add vishhvak/skills
```

Or a single skill:

```bash
npx skills add vishhvak/skills/skill-engineering
```

## Skills

| Skill | What it does |
| --- | --- |
| [animated-diagrams](skills/animated-diagrams) | Build interactive SVG/HTML diagrams for any subject or recreate motion from video. Bundles five editable examples, a single-scene scaffolder, event-driven sound, validation, and narrated-tutorial integration guidance. |
| [narrated-tutorials](skills/narrated-tutorials) | Build standalone narrated lessons for any subject with word highlighting, animated diagrams/code, guiding cursors, emoji, and continuous play. Bundles the player, compiler, portable Breeze voice design/cloning and optional VoxCPM adapters, alignment tools, and Claude/Codex plugin packaging. |
| [blueprint](skills/blueprint) | Structure repos like strong OSS projects: init after brainstorming, restructure existing repos, artifact hygiene (what stays out of git), AGENTS.md authoring, TS/Python/Rust layout doctrine. Ships a hygiene script whose output is the instruction. |
| [council](skills/council) | Convene the other frontier models, GPT-5.6 Sol (codex), Claude Opus 5 (cursor-agent), Claude Fable 5.1 (claude), Grok 4.6 (grok), at high reasoning with full tool access, plus GPT-6 Astra (codex) for expert reviews at medium effort. Consult mode: one blind brief, woven verdict. Roundtable mode: session-resumed debate rounds with positions circulated anonymously until nobody moves. Verified CLI invocations, per-seat worktree isolation with teardown, Orca pane dispatch when inside Orca. |
| [skill-engineering](skills/skill-engineering) | Write, upgrade, or audit agent skills so they beat the median — harness machinery (sub-agents, hooks, scripts, routing, memory) plus the prose discipline inside SKILL.md. |
| [medulla](skills/medulla) | Density editing, named for the marrow — the innermost core: revise prose until a max-retention compression of it must drop ideas. Freezes an idea inventory, uses a blind summarizer as an adversary to convict padded passages, guards against inventing facts to look dense. |
| [imagegen](skills/imagegen) | One image CLI for any harness: generate or edit images with gpt-image-2 on your ChatGPT subscription (chatgpt-oauth device login, no per-image cost), falling back to `OPENAI_API_KEY` only when the subscription is unavailable. Machine-readable stdout (`WROTE`/`NEEDS_LOGIN`/`BACKEND`) so agents can follow it blind. |
| [axon-illustrations](skills/axon-illustrations) | Hand-drawn 16:9 editorial illustrations for articles, starring Axon, a deadpan neuron-creature (black body, dendrite antlers, synapse tail that plugs into the diagram). Digest the piece, shot-list the turning points, generate via imagegen, QA against an 8-point checklist, deliver numbered PNGs. |
| [x](skills/x) | Operate your own X (Twitter) account end to end — search real posts, read timelines, get/search bookmarks, post, reply, like, repost, bookmark. No paid API or developer app. Two engines: browser-free signed reads (~1s, generates X's `x-client-transaction-id` itself) with automatic fallback to driving the logged-in web app for writes and whenever the fast path breaks. Learns rotating GraphQL queryIds instead of hardcoding them, so it heals itself. |
| [minto](skills/minto) | Bottom line up front: restructure any update, summary, or recommendation so the conclusion lands in sentence one, then key arguments, then evidence. Four gates including two conclusion impostors (the topic sentence, the agenda) and a truncation test that proves a reader can stop early. |
| [storyworld](skills/storyworld) | Build cinematic interactive story sites about any subject in the dark.netflix.io format: an as-of time scrubber, an entity graph, one-event-per-screen storylines with WebGL transitions, a data-driven mood background. Eight gates enforced by a script whose output is the instruction: content validation with quote checks against archived sources, licence checks on every image, serialized quiet-host measurement against a control, owned servers, a two-round acceptance cap. Ships an AI-buildout domain pack. |
| [story-so-far](skills/story-so-far) | Catch a returning reader up as a paginated briefing: a dense foreword (where things stand, what moved, a chapter list), then exactly one chapter per turn on request. Silent recon, prose over bullets, an expert reader assumed, and medulla's density bar so no page survives compression. |
| [evals](skills/evals) | Build, audit and hillclimb evals for any LLM-powered task (a prompt, a tool schema, a skill, an agent, a plugin, a pipeline) on any model or gateway, aligned to the user: an interview fills a brief in their words (failures seen, dealbreakers, edge cases, how they judge by eye), every case cites the brief item it tests, every criterion is graded, and answers the agent is unsure of go back to the user. A provider-neutral runner (`evals.mjs`) calls the app and graders as commands, resumes trials, keeps infrastructure failures out of the scores, recomputes every number from raw rows with paired intervals and a noise floor, and prints the next step. Gates for inputs, grading and harness approval; a held-out split; KEEP/REVERT verdicts with guardrails; benching and climbing several models in turn; trimming context without regressions. |

| [tailscale](skills/tailscale) | Reach and operate your machines over Tailscale: check reachability first, tell Tailscale SSH from the OS's sshd by probing port 22, set up SSH to a Mac that runs the standalone app (Remote Login plus an authorized key), forward ports instead of opening them, and keep remote processes alive past the session. Device names, IPs and per-host notes stay in a private file under `~/.config/tailscale-skill/`, never in the skill. |
## Build animated diagrams and narrated lessons

Use either skill in Claude Code or Codex after installation:

```text
Use animated-diagrams to explain how a request moves through a cache and database.
Build an interactive SVG diagram with playback, seeking, and a manual request control.
```

```text
Use narrated-tutorials to teach a beginner how bread rises.
Include authored animated diagrams, synchronized narration, and continuous playback.
```

**animated-diagrams** includes five editable SVG/HTML studies, a single-scene scaffolder, motion and sound helpers, and validation scripts. Diagrams are real web elements rather than recordings. [Read the skill](skills/animated-diagrams/SKILL.md).

**narrated-tutorials** includes the player, lesson compiler, aligned word highlighting, guiding cursors, and continuous playback. Its `diagram` field packages custom SVG/HTML modules and resolves their cues against narration, so richer diagrams survive rebuilding. [Read the skill](skills/narrated-tutorials/SKILL.md).

Voice generation defaults to the upstream Breeze TTS API at a configurable endpoint. Describe a narrator or provide your own reference recording and exact transcript. No particular GPU host, personal voice preset, or separate Voice Lab checkout is required. VoxCPM and existing Voice Lab services remain explicit alternatives. See [voice setup and model terms](skills/narrated-tutorials/references/voices.md).

The skills bundle code, fonts, templates, and checks. Model weights, credentials, private voice recordings, and generated narration are not included. Authoring requirements and setup are documented in each skill; a compiled tutorial plays without the inference service or authoring repository.

[![skills.sh](https://skills.sh/b/vishhvak/skills)](https://skills.sh/vishhvak/skills)
