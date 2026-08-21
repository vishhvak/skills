---
name: imagegen
description: "Generate images from text prompts, or edit/restyle/combine reference images, using the user's ChatGPT subscription (gpt-image-2) with OpenAI API-key fallback. Use whenever a task needs an image made or modified: illustrations, article figures, mascots, mockup imagery, inpainting, style transfer, combining references, or dense typography renders. Works in any harness — no built-in image tool required."
---

# imagegen — one image CLI, subscription first

Everything runs through one script; its stdout is the instruction. Run it and act
on the directive lines it prints (`WROTE`, `BACKEND`, `NEEDS_LOGIN`, `ERROR`).
Do not hand-roll calls to OpenAI image endpoints while this skill is available.

```
node {baseDir}/scripts/imagegen.mjs <command> [flags]
```

Requires Node 20+. First run installs its one dependency automatically.

## Commands

```
status                                   # which backends are available right now
login                                    # one-time ChatGPT sign-in (device code)
logout
generate --prompt "..." [--out p.png]    # text to image
edit --ref a.png [--ref b.png ...] --prompt "..." [--out p.png]
```

Shared flags for `generate` and `edit`:

- `--prompt-file f.txt` instead of `--prompt` for long prompts (prefer it above ~2 lines; avoids shell quoting bugs)
- `--out path.png` (default `imagegen-<ts>.png` in cwd); with `--n 2+`, files get `-1`, `-2` suffixes
- `--size 1536x1024` (landscape, closest to 16:9) | `1024x1024` | `1024x1536`; treated as a hint — read the `RESULT size=` line for what actually arrived
- `--quality low|medium|high|auto`, `--background transparent|opaque|auto`
- `--backend auto|subscription|api` (default auto: subscription, then API key)

## Backends

1. **subscription** — the user's ChatGPT plan via chatgpt-oauth; covered by the plan, no per-image cost. Needs one `login` ever; credentials persist in `~/.config/chatgpt-oauth/imagegen`.
2. **api** — `OPENAI_API_KEY` (env, or `~/.config/openai/api_key`); bills per image. Only used when subscription is unavailable, and the `BACKEND api (...)` line says why.

On `NEEDS_LOGIN`: run the printed login command **in the background** (it blocks
for minutes), relay the `LOGIN_URL` and `LOGIN_CODE` lines to the user, and wait
for `SIGNED_IN` before retrying. Never paste credentials anywhere yourself.

## Expectations

- Generation runs 15–40s, edits up to ~90s. Progress dots go to stderr; a 240s abort is built in. Run requests sequentially — image jobs are slow, not parallel-friendly, and rate-limited.
- The backend may return a different size/quality than requested. If the produced image must be exact-size, resize afterwards (e.g. `sips -z`).
- A 403 on subscription means the plan (Free) — not a broken credential.
