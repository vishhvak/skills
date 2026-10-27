// Adapter: runs the app under test on ONE case. Replace the body with a call
// into the app's real entry point (a function, an HTTP endpoint, an agent CLI).
//
// stdin:  { id, input, tags, meta, model, variant, rep, workdir }
//         `model` is the id the runner was asked for ("default" means the
//         app's own configuration). The case's answer is never in here.
// stdout: one JSON object on the LAST line (log anything else to stderr):
//         { output, model, usage, transcript?, status?, stop_reason?, latency_s?, perf?, artifacts? }
//         or { error, retryable?, class? } when the trial could not run.
// Contract details: reference/adapters.md in the evals skill.

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const trial = JSON.parse(Buffer.concat(chunks).toString('utf8'));

console.log(JSON.stringify({
  error: `adapter.mjs is still the stub: wire it to the app before running case ${trial.id}`,
  class: 'harness',
}));
