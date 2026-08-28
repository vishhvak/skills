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
| [blueprint](skills/blueprint) | Structure repos like strong OSS projects: init after brainstorming, restructure existing repos, artifact hygiene (what stays out of git), AGENTS.md authoring, TS/Python/Rust layout doctrine. Ships a hygiene script whose output is the instruction. |
| [council](skills/council) | Convene the other frontier models, GPT-5.6 Sol (codex), Claude Opus 5 (cursor-agent), Claude Fable 5 (claude), Grok 4.6 (grok), at high reasoning with full tool access. Consult mode: one blind brief, woven verdict. Roundtable mode: session-resumed debate rounds with positions circulated anonymously until nobody moves. Verified CLI invocations, per-seat worktree isolation with teardown, Orca pane dispatch when inside Orca. |
| [skill-engineering](skills/skill-engineering) | Write, upgrade, or audit agent skills so they beat the median — harness machinery (sub-agents, hooks, scripts, routing, memory) plus the prose discipline inside SKILL.md. |
| [medulla](skills/medulla) | Density editing, named for the marrow — the innermost core: revise prose until a max-retention compression of it must drop ideas. Freezes an idea inventory, uses a blind summarizer as an adversary to convict padded passages, guards against inventing facts to look dense. |
| [imagegen](skills/imagegen) | One image CLI for any harness: generate or edit images with gpt-image-2 on your ChatGPT subscription (chatgpt-oauth device login, no per-image cost), falling back to `OPENAI_API_KEY` only when the subscription is unavailable. Machine-readable stdout (`WROTE`/`NEEDS_LOGIN`/`BACKEND`) so agents can follow it blind. |
| [axon-illustrations](skills/axon-illustrations) | Hand-drawn 16:9 editorial illustrations for articles, starring Axon, a deadpan neuron-creature (black body, dendrite antlers, synapse tail that plugs into the diagram). Digest the piece, shot-list the turning points, generate via imagegen, QA against an 8-point checklist, deliver numbered PNGs. |
| [x](skills/x) | Operate your own X (Twitter) account end to end — search real posts, read timelines, get/search bookmarks, post, reply, like, repost, bookmark. No paid API or developer app. Two engines: browser-free signed reads (~1s, generates X's `x-client-transaction-id` itself) with automatic fallback to driving the logged-in web app for writes and whenever the fast path breaks. Learns rotating GraphQL queryIds instead of hardcoding them, so it heals itself. |
| [minto](skills/minto) | Bottom line up front: restructure any update, summary, or recommendation so the conclusion lands in sentence one, then key arguments, then evidence. Four gates including two conclusion impostors (the topic sentence, the agenda) and a truncation test that proves a reader can stop early. |
| [story-so-far](skills/story-so-far) | Catch a returning reader up as a paginated briefing: a dense foreword (where things stand, what moved, a chapter list), then exactly one chapter per turn on request. Silent recon, prose over bullets, an expert reader assumed, and medulla's density bar so no page survives compression. |

[![skills.sh](https://skills.sh/b/vishhvak/skills)](https://skills.sh/vishhvak/skills)
