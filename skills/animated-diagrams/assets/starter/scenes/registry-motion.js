import {distortionState} from './registry-distortion.js';
const clamp = (n, low = 0, high = 1) => Math.min(high, Math.max(low, n));
const mix = (a, b, t) => a + (b - a) * t;
export const smooth = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
export const settle = (seconds, speed = 12) => { const t = Math.max(0, seconds) * speed; return 1 - (1 + t) * Math.exp(-t); };
export const ROW_Y = [167, 201, 274, 308, 379, 413];

// Frame-sampled source transitions; a pulse makes one journey, then hands off to the next stage.
export const REFRESHES = [
  {start: .4, input: .57, move: 1, inputEnd: 1.17, ready: 2.47, checkEnd: 2.57, send: 2.78, arrive: 3.54, reveal: 3.72, empty: true},
  {start: 9.8, input: 10.15, move: 10.53, inputEnd: 10.68, ready: 11.58, checkEnd: 11.73, send: 11.85, arrive: 12.52, reveal: 12.58, empty: false},
  {start: 16.95, input: 17.27, move: 17.7, inputEnd: 17.87, ready: 19.13, checkEnd: 19.32, send: 19.5, arrive: 20.23, reveal: 20.33, empty: true},
  {start: 26.5, input: 26.92, move: 26.97, inputEnd: 27.07, ready: 28.38, checkEnd: 28.48, send: 28.63, arrive: 29.35, reveal: 29.47, empty: false},
];
export const POLICIES = [
  {start: 4.45, send: 5.33, arrive: 6.17, ready: 6.38, checkEnd: 6.62},
  {start: 21.2, send: 21.9, arrive: 22.78, ready: 23.22, checkEnd: 23.38},
];
const CLEARS = [15.88, 32.63];
const FILTERS = [6.13, 15.56, 22.88, 32.31];

function travel(time, start, end) {
  if (time < start || time > end) return null;
  return clamp((time - start) / (end - start));
}
function status(time, start, ready, checkEnd, end) {
  return {busy: time >= start && time < ready, check: time >= ready && time < end,
    progress: smooth((time - ready) / (checkEnd - ready)), spin: (time - start) * 400};
}

export function timerValue(time) {
  const resets = [3.7, 12.62, 20.38, 29.7];
  const drains = [{start: 8.25, end: 9.75, value: 3596}, {start: 24.95, end: 26.45, value: 3596}, {start: 31.35, end: 32.85, value: 3599}];
  const reset = resets.filter(at => time >= at).at(-1);
  if (reset === undefined) return null;
  const drain = drains.filter(event => time >= event.start && event.start > reset).at(-1);
  if (drain) return time > drain.end + .05 ? null : Math.max(0, drain.value * (1 - (time - drain.start) / (drain.end - drain.start)));
  return 3600 - Math.min(Math.max(0, time - reset), reset === 3.7 || reset === 20.38 ? 4 : 1);
}

export function rowEntrance(time, enteredAt, index) {
  if (enteredAt === null) return {opacity: 0, y: ROW_Y[index] - 24, blur: 0};
  const distance = (ROW_Y[index] - 121) / 317;
  const age = time - enteredAt - (.65 * distance ** .625 - .15);
  const progress = settle(age);
  return {opacity: smooth(age / .18), y: ROW_Y[index] - 24 * (1 - progress), blur: 2.8 * (1 - settle(age, 16))};
}

export function replayState(time) {
  let enteredAt = null, present = false;
  for (const at of [REFRESHES[0].reveal, REFRESHES[2].reveal]) if (time >= at) { enteredAt = at; present = true; }
  for (const clear of CLEARS) if (time >= clear && (enteredAt === null || clear > enteredAt)) present = false;
  const latest = REFRESHES.filter(event => time >= event.start).at(-1);
  const policy = POLICIES.filter(event => time >= event.start).at(-1);
  const targets = Array(6).fill(1), weights = Array(6).fill(1);
  let lastChange = null;
  for (let index = 0; index < 4; index++) {
    const changes = [...FILTERS.map(at => ({at: at + index * (at === 15.56 || at === 32.31 ? .028 : .13), target: 0})),
      ...REFRESHES.map(event => ({at: event.reveal + (event.empty ? 0 : index * .065), target: 1, instant: event.empty}))]
      .filter(event => time >= event.at).sort((a, b) => a.at - b.at);
    const change = changes.at(-1);
    if (change) {
      targets[index] = change.target;
      weights[index] = change.instant ? 1 : mix(1 - change.target, change.target, settle(time - change.at, 18));
      if (!lastChange || change.at > lastChange.at) lastChange = change;
    }
  }
  const age = enteredAt === null ? -1 : time - enteredAt;
  const clearAge = CLEARS.filter(at => time >= at).at(-1);
  const exit = clearAge !== undefined && clearAge > (enteredAt ?? 0) ? settle(time - clearAge, 26) : 0;
  const distortion = distortionState(time);
  const countTo = present ? targets.reduce((a,b) => a+b, 0) : 0;
  const countAt = !present && clearAge !== undefined ? clearAge : lastChange?.at ?? enteredAt ?? 0;
  const countFrom = !present ? enteredAt === null ? 0 : 2 : lastChange?.instant ? 0 : countTo + (lastChange?.target ? -1 : 1);
  const input = latest && time >= latest.input && time <= latest.inputEnd ? 1 - clamp((time - latest.move) / (latest.inputEnd - latest.move)) : null;
  const inputArrival = latest && time >= latest.inputEnd ? (time - latest.inputEnd) / .46 : null;
  const dev = latest ? travel(time, latest.send, latest.arrive) : null;
  const policyPulse = policy ? travel(time, policy.send, policy.arrive) : null;
  const arrivals = [...REFRESHES.map(event => event.arrive), ...POLICIES.map(event => event.arrive)];
  const arrivalAt = arrivals.filter(at => time >= at).sort((a,b) => a-b).at(-1);
  return {time, enteredAt, present, targets, weights, exit, countTo, countFrom, countProgress: enteredAt === null ? 1 : smooth((time - countAt) / .14),
    reveal: enteredAt === null ? 0 : clamp(age / .65),
    front: 121 + 350 * clamp(age / .65) ** 1.6,
    empty: present ? 1 - smooth(age / .35) : smooth((time - (clearAge ?? -1)) / .24),
    input, inputArrival, dev, policyPulse,
    devStatus: latest ? status(time, latest.start, latest.ready, latest.checkEnd, latest.arrive + .14) : {busy: false, check: false, progress: 0, spin: 0},
    policyStatus: policy ? status(time, policy.start, policy.ready, policy.checkEnd, policy.arrive + 1.1) : {busy: false, check: false, progress: 0, spin: 0},
    timer: timerValue(time), timerRate: timerRate(time), warp: distortion.amount, waveY: distortion.offsetY, header: distortion.header,
    arrival: arrivalAt === undefined ? null : (time - arrivalAt) / .5,
  };
}

export function blendWeights(from, to, age, stagger = 0) {
  return to.map((value, index) => mix(from[index], value, settle(age - index * stagger, 18)));
}

export function timerReels(seconds, speed = 1) {
  const units = [600, 60, null, 10, 1], bases = [10, 10, null, 6, 10];
  return units.map((unit, index) => {
    if (unit === null) return {from: ':', to: ':', offset: 0};
    const value = (Math.max(0, seconds) + 1) / unit;
    const whole = Math.floor(value), fraction = value - whole;
    const from = whole % bases[index], to = Math.max(0, whole - 1) % bases[index];
    const span = Math.min(1, Math.max(1, speed) * .1 / unit);
    return {from: String(from), to: String(to), offset: from === to ? 0 : 15 * smooth((span - fraction) / span)};
  });
}

export function timerRate(time) {
  if (time >= 8.25 && time <= 9.75 || time >= 24.95 && time <= 26.45) return 3596 / 1.5;
  if (time >= 31.35 && time <= 32.85) return 3599 / 1.5;
  return 1;
}
