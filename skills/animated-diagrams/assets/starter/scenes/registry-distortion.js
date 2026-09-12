const BASE_HEADER = 17;
const PEAK_HEADER = 46;
const FIRST_START = 15.2;
const REPEAT_AFTER = 16.75;
const ACTIVE_DURATION = 1.17;
const RISE_DURATION = .33;
const FALL_START = .9;
const WAVE_PERIOD = 230;
const WAVE_SPEED = 670;

const clamp01 = value => Math.max(0, Math.min(1, value));
const smoothstep = value => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};

const mapSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -1000 1104 2500" preserveAspectRatio="none"><defs><linearGradient id="crest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(128 128 0)"/><stop offset=".14" stop-color="rgb(128 128 0)"/><stop offset=".34" stop-color="rgb(238 128 0)"/><stop offset=".46" stop-color="rgb(255 128 0)"/><stop offset=".58" stop-color="rgb(128 128 0)"/><stop offset=".72" stop-color="rgb(0 128 0)"/><stop offset=".84" stop-color="rgb(18 128 0)"/><stop offset="1" stop-color="rgb(128 128 0)"/></linearGradient><pattern id="waves" x="-40" y="-1000" width="1104" height="230" patternUnits="userSpaceOnUse"><rect x="-40" width="1104" height="230" fill="rgb(128 128 0)"/><rect x="-40" y="68" width="1104" height="82" fill="url(#crest)"/></pattern></defs><rect x="-40" y="-1000" width="1104" height="2500" fill="url(#waves)"/></svg>`;
const mapUri = `data:image/svg+xml,${encodeURIComponent(mapSvg)}`;

function localTime(time) {
  for (const start of [FIRST_START, FIRST_START + REPEAT_AFTER]) {
    const elapsed = time - start;
    if (elapsed >= 0 && elapsed <= ACTIVE_DURATION) return elapsed;
  }
  return null;
}

export function distortionState(time) {
  const elapsed = localTime(Number(time));
  if (elapsed === null) return {amount: 0, offsetY: 0, header: BASE_HEADER};

  const attack = smoothstep(elapsed / RISE_DURATION);
  const release = 1 - smoothstep((elapsed - FALL_START) / (ACTIVE_DURATION - FALL_START));
  const amount = attack * release;
  const offsetY = -((elapsed * WAVE_SPEED) % WAVE_PERIOD);
  const header = Math.round(BASE_HEADER + (PEAK_HEADER - BASE_HEADER) * amount);
  return {amount, offsetY, header};
}

export function displacementMap() {
  return mapUri;
}
