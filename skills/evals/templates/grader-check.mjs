// Grader: scores ONE trial. A programmatic check, free and deterministic.
//
// stdin:  { case, expected, model, output, transcript, artifacts, workdir }
//         `expected` is this case's row from expected.jsonl (null when none).
//         `workdir` is the trial's scratch directory, still holding whatever
//         the app left there: grade an agent's end state from it.
// stdout: one JSON object on the last line:
//         { grade: { <metric>: number|boolean, ... }, explanation?: { <metric>: "why" } }
//         or { error } when the grader itself failed (never a zero).

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const { output, expected } = JSON.parse(Buffer.concat(chunks).toString('utf8'));

// The answer is expected.reference (a known-good output) or expected.label
// (a class). Compare answers, not formatting: case, whitespace, code fences, trailing
// punctuation and a sentence wrapped around a short answer all normalize away.
const norm = (s) => String(s ?? '')
  .replace(/```[a-z]*\n?|```/gi, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .replace(/[.!?]+$/, '')
  .trim();

const text = typeof output === 'string' ? output : JSON.stringify(output);
const want = norm(expected?.reference ?? expected?.label);
const got = norm(text);
const pass = want !== '' && (got === want || (want.length <= 40 && new RegExp(`(^|\\W)${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`).test(got)));

console.log(JSON.stringify({
  grade: { pass },
  explanation: { pass: pass ? 'matches the reference' : `expected "${expected?.reference ?? expected?.label ?? ''}"` },
}));
