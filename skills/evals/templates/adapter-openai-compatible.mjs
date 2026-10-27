// Adapter for any OpenAI-compatible chat endpoint: a model gateway, a local
// proxy (vibeproxy, LiteLLM, OpenRouter), vLLM or Ollama. It sends one case
// as a chat request and returns the reply, any tool calls the model chose
// (not executed), the served model and token usage.
//
// Use it when the thing under test is a prompt, a tool schema or a skill
// that rides in the system prompt. When the app has its own entry point
// (an agent, a pipeline, a plugin host), call that instead: the eval should
// measure what ships.
//
// Environment:
//   EVAL_BASE_URL       e.g. http://localhost:8317/v1 (falls back to OPENAI_BASE_URL)
//   EVAL_API_KEY_VAR    name of the variable holding the key (default OPENAI_API_KEY)
//   EVAL_SYSTEM_FILE    system prompt file: the artifact a hillclimb edits
//   EVAL_TOOLS_FILE     JSON array of OpenAI tool definitions, also tunable
//   EVAL_MAX_TOKENS     optional max_tokens
//   EVAL_REASONING      optional reasoning_effort (low|medium|high)
//   EVAL_MODEL          set by the runner per trial. A suffix after '@' is
//                       the reasoning effort for that trial: gpt-6-sol@high
//
// Case input: a string (one user turn) or { messages: [...] } for a
// conversation prefix.

import fs from 'node:fs';

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const trial = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const env = process.env;
const emit = (v) => console.log(JSON.stringify(v));

const base = (env.EVAL_BASE_URL || env.OPENAI_BASE_URL || '').replace(/\/$/, '');
const key = env[env.EVAL_API_KEY_VAR || 'OPENAI_API_KEY'];
if (!base) { emit({ error: 'EVAL_BASE_URL is not set', class: 'harness' }); process.exit(0); }
if (!env.EVAL_MODEL) { emit({ error: 'no model: pass --model to the runner or list models in eval.json', class: 'harness' }); process.exit(0); }

const messages = [];
if (env.EVAL_SYSTEM_FILE) messages.push({ role: 'system', content: fs.readFileSync(env.EVAL_SYSTEM_FILE, 'utf8') });
if (typeof trial.input === 'string') messages.push({ role: 'user', content: trial.input });
else messages.push(...trial.input.messages);

const [modelId, effort] = env.EVAL_MODEL.split('@');
const body = { model: modelId, messages };
if (env.EVAL_TOOLS_FILE) body.tools = JSON.parse(fs.readFileSync(env.EVAL_TOOLS_FILE, 'utf8'));
if (env.EVAL_MAX_TOKENS) body.max_tokens = Number(env.EVAL_MAX_TOKENS);
if (effort || env.EVAL_REASONING) body.reasoning_effort = effort || env.EVAL_REASONING;

const started = Date.now();
let res;
try {
  res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });
} catch (e) {
  emit({ error: `request failed: ${e.message}`, class: 'serving', retryable: true });
  process.exit(0);
}
const latency = (Date.now() - started) / 1000;
const text = await res.text();
if (!res.ok) {
  emit({ error: `HTTP ${res.status}: ${text.slice(0, 500)}`, class: res.status === 429 ? 'rate_limit' : 'serving', retryable: res.status === 429 || res.status >= 500 });
  process.exit(0);
}

const data = JSON.parse(text);
const choice = data.choices?.[0] ?? {};
const msg = choice.message ?? {};
const toolCalls = (msg.tool_calls ?? []).map((t) => {
  let args = t.function?.arguments;
  try { args = JSON.parse(args); } catch { /* keep the raw string: a grader can fail it */ }
  return { name: t.function?.name, arguments: args };
});
const u = data.usage ?? {};
const cached = u.prompt_tokens_details?.cached_tokens ?? 0;

emit({
  output: toolCalls.length ? { text: msg.content ?? '', tool_calls: toolCalls } : (msg.content ?? ''),
  model: data.model,
  usage: { input_tokens: (u.prompt_tokens ?? 0) - cached, cache_read_input_tokens: cached, output_tokens: u.completion_tokens ?? 0 },
  status: choice.finish_reason === 'length' ? 'truncated' : 'ok',
  stop_reason: choice.finish_reason,
  latency_s: latency,
  perf: { tool_calls: toolCalls.length },
  transcript: [...messages, { role: 'assistant', content: msg.content ?? '', ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }],
});
