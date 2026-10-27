# Adapters and graders

The runner talks to the app and the graders through one contract: spawn a command, write a JSON object to its stdin, read a JSON object from the last line of its stdout. Anything else the command prints goes to stderr or earlier stdout lines and is ignored. Commands run from the eval directory with a shell, so `node adapter.mjs`, `python3 run_case.py` and `./bin/app --json` all work.

## The adapter

eval.json:

```json
"run": { "command": "node adapter.mjs", "timeout_s": 300, "concurrency": 4, "retries": 2, "env": { "EVAL_BASE_URL": "http://localhost:8317/v1" } }
```

stdin, one trial:

```json
{ "id": "c07", "input": "...", "tags": ["tools"], "meta": {}, "model": "gpt-6-sol@high", "variant": "v3", "rep": 1, "workdir": "/tmp/evals-abc" }
```

The same values arrive as environment variables: `EVAL_MODEL` (empty when the model is `default`, meaning the app's own configuration; stdin still says `"default"`, and the served-model check is skipped for it), `EVAL_VARIANT`, `EVAL_CASE_ID`, `EVAL_REP`, `EVAL_WORKDIR`. The case's answers are never in either.

stdout, last line, on success:

| Field | Required | Meaning |
|---|---|---|
| `output` | yes | What the user would see: text, or JSON such as `{ "text", "tool_calls": [{ "name", "arguments" }] }` |
| `model` | yes, unless `served_model_check` is `off` | The model id the response reports, not the one requested |
| `usage` | for cost | `{ input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }`, with `input_tokens` uncached. Sum across every model call in the trial |
| `transcript` | recommended | `[{ role, content, ... }]`: every message, tool call and tool result. Graders and the analyzer read it |
| `status` | no | `ok` (default), `truncated` (hit the token limit; left out of the means), `refusal` (counted separately) |
| `latency_s` | no | Model time; without it the runner uses the adapter's wall time |
| `perf` | no | Any other numbers to track per trial: `{ "tool_calls": 3, "turns": 5, "searches": 1 }`. Lower is better unless eval.json `better` says otherwise |
| `artifacts` | no | Paths of files the trial produced, for graders and the report |
| `stop_reason` | no | The provider's stop reason, kept on the row |

stdout, last line, when the trial could not run: `{ "error": "...", "class": "rate_limit", "retryable": true }`. Retryable errors (also exit code 75) are retried with jittered backoff up to `run.retries`. Every failure lands in `errors.jsonl` with its class and leaves the trial open, so rerunning the same `run` command retries it. Never report an infrastructure failure as an empty `output`: that scores plumbing as a model failure.

Served-model check (`served_model_check`): `prefix` (default) accepts a served id that starts with the requested one or ends in `/<requested>` (`gpt-6-sol-2026-09`, `openrouter/gpt-6-sol`); `strict` needs an exact match or an entry in `model_aliases`; `off` skips it. A mismatch is the `served_model_mismatch` error class, not a score.

## Patterns

Reach the app the way it ships. The adapter is a thin translation, usually 20 to 60 lines.

| The app is | Adapter |
|---|---|
| A prompt or tool schema sent to a chat endpoint | `templates/adapter-openai-compatible.mjs`: any OpenAI-compatible URL (a model gateway, a local proxy such as vibeproxy or LiteLLM, OpenRouter, vLLM, Ollama). The system prompt and tools come from files, which are what a hillclimb edits. Tool calls come back unexecuted, so a grader checks which tool and which arguments the model chose |
| A function or class in the codebase | A script that imports it, calls it on `input` with the model from `EVAL_MODEL`, and prints the result with usage |
| A service with an HTTP API | A script that POSTs the case to the running service (test instance, never production) and maps the response |
| An agent behind a CLI | Run it headless in `EVAL_WORKDIR` with its JSON output mode and the model flag, then map its final message, usage and transcript. Check the CLI's `--help` for both flags; for example `claude -p "<input>" --output-format json --model <id>` |
| An agent harness with plugins, skills or tools | Drive one session through the harness's own server or SDK with the plugin installed as it ships, send the case, wait for the session to finish, and return the final answer, the tool calls, usage summed across turns, and the transcript. Measure the plugin through its host: a direct call to the plugin's function skips the model's tool choice, which is usually what fails |
| A UI or browser agent | Run the task against a fixture site or app state, save screenshots as `artifacts`, and grade the end state |

For an agent that writes files, set up the case's starting state inside `EVAL_WORKDIR` (copy the fixture named in `input` or `meta`) and have the grader inspect it afterwards. The runner deletes the workdir after grading unless `run` gets `--keep-workdirs`; keep them when an end-state grader may need a regrade.

Stub a tool only when calling it is unsafe (sends mail, writes production data, spends money) or unrepeatable (live data that changes). Replay a recorded result for the stub, and grade the call's arguments.

## Graders

eval.json:

```json
"graders": [
  { "name": "check", "command": "node graders/check.mjs" },
  { "name": "judge", "command": "node graders/judge.mjs", "timeout_s": 120, "env": { "JUDGE_MODEL": "deepseek-v4" } }
]
```

stdin: `{ case, expected, model, output, transcript, artifacts, workdir }`, where `expected` is the case's row from expected.jsonl.

stdout, last line: `{ "grade": { "<metric>": number | boolean }, "explanation": { "<metric>": "why" }, "judge_model": "...", "judge_usage": { ... } }`. A bare number or boolean as `grade` becomes a metric named after the grader. Several graders merge their metrics into one row. A grader that fails prints `{ "error": "..." }`: the trial goes to `errors.jsonl` as class `grader`, and `regrade` picks it up from the stored trace once the grader is fixed, with no model call.

Templates:

- `templates/grader-check.mjs`: normalized match against `expected.reference`. Edit the comparison for labels, JSON fields, tool names or file contents.
- `templates/judge-openai-compatible.mjs`: a rubric judge over any OpenAI-compatible endpoint. One verdict per criterion from `expected.rubric` (per case) or `JUDGE_RUBRIC_FILE` (shared); the grade is the fraction met, and each verdict's reason is the explanation.

Copy what you need into the eval directory and list every copied file in `harness_paths`, so the approval gate covers it.

## Credentials

Adapters and judges read keys from the environment or the user's existing config, by variable name (`EVAL_API_KEY_VAR`, `JUDGE_API_KEY_VAR`). eval.json names the variable; it never holds the value.
