const TAU = Math.PI * 2;

const dbToGain = decibels => 10 ** (decibels / 20);
const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

function seededNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x80000000 - 1;
  };
}

function normalize(samples, peakDbfs) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const scale = peak ? dbToGain(peakDbfs) / peak : 0;
  for (let index = 0; index < samples.length; index += 1) samples[index] *= scale;
  return samples;
}

function voice(duration, peakDbfs, synthesize) {
  return Object.freeze({
    duration,
    render(sampleRate) {
      if (!Number.isFinite(sampleRate) || sampleRate < 8000) throw new RangeError('sampleRate must be at least 8000 Hz');
      const samples = new Float32Array(Math.round(duration * sampleRate));
      synthesize(samples, sampleRate);
      return normalize(samples, peakDbfs);
    },
  });
}

function softPulse(samples, sampleRate) {
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const attack = clamp(time / .012);
    const decay = Math.exp(-time / .034);
    const carrier = Math.sin(TAU * 470 * time) + .12 * Math.sin(TAU * 940 * time + .4);
    samples[index] = carrier * attack * decay;
  }
}

function crispTick(samples, sampleRate) {
  const noise = seededNoise(0xc715f17);
  let previousNoise = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.sin(Math.PI * clamp(time / .08));
    const rawNoise = noise();
    const highNoise = rawNoise - previousNoise * .82;
    previousNoise = rawNoise;
    const tone = Math.sin(TAU * (3135 * time + 520 * time * time));
    const midTone = Math.sin(TAU * 1500 * time + .2);
    samples[index] = (tone * .82 + midTone * .28 + highNoise * .16) * envelope;
  }
}

function dataBurst(samples, sampleRate) {
  const noise = seededNoise(0xda7ab175);
  let previousNoise = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const attack = clamp(time / .018);
    const release = clamp((.11 - time) / .018);
    const envelope = attack * release * (.72 + .28 * Math.sin(Math.PI * clamp(time / .11)));
    const rawNoise = noise();
    const highNoise = rawNoise - previousNoise * .76;
    previousNoise = rawNoise;
    const phase = TAU * (2320 * time + 1000 * time * time);
    const midTone = Math.sin(TAU * (1460 * time + 450 * time * time) + .3);
    const lowTone = Math.sin(TAU * 320 * time + .7);
    samples[index] = (Math.sin(phase) * .75 + midTone * .48 + lowTone * .25 + highNoise * .14) * envelope;
  }
}

function settleTone(samples, sampleRate) {
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const envelope = time < .13
      ? Math.sin(Math.PI * .5 * clamp(time / .13)) ** 1.1
      : Math.cos(Math.PI * .5 * clamp((time - .13) / .165)) ** 1.1;
    const fundamental = Math.sin(TAU * 1312.5 * time);
    const lowerPartial = Math.sin(TAU * 984.375 * time + .45);
    const body = Math.sin(TAU * 656.25 * time + .2);
    samples[index] = (fundamental + lowerPartial * .65 + body * .15) * envelope;
  }
}

export const SYNTH_VOICES = Object.freeze({
  softPulse: voice(.15, -38.5, softPulse),
  crispTick: voice(.08, -29.5, crispTick),
  dataBurst: voice(.11, -32, dataBurst),
  settleTone: voice(.295, -26, settleTone),
});
