import {SYNTH_VOICES} from './sfx-voices.js';

export const SOUND_KINDS = ['silent', 'reference-effects'];
export const SOUND_VOICES = Object.keys(SYNTH_VOICES);
const clamp = (n, low, high) => Math.min(high, Math.max(low, Number(n) || 0));

export function createSceneSound({createContext = () => new AudioContext(), notify = () => {}} = {}) {
  let context = null, output = null, events = {};
  let enabled = true, volume = .7, disposed = false, generation = 0;
  const buffers = new Map(), active = new Set();

  function pause() {
    generation++;
    for (const source of active) { source.onended = null; source.stop(); source.disconnect(); }
    active.clear();
  }

  function configure(config = {kind: 'silent'}) {
    pause();
    events = {};
    if (disposed || config.kind !== 'reference-effects' || !config.events || typeof config.events !== 'object' || Array.isArray(config.events)) return;
    if (Object.keys(config).some(key => !['kind', 'events'].includes(key))) return;
    if (!Object.values(config.events).every(name => Object.hasOwn(SYNTH_VOICES, name))) return;
    events = {...config.events};
  }

  async function unlock() {
    if (disposed || !enabled || volume === 0 || !Object.keys(events).length) return false;
    if (!context) {
      context = createContext();
      output = context.createGain();
      output.gain.value = volume;
      output.connect(context.destination);
    }
    if (context.state !== 'running') {
      let timeout;
      try { await Promise.race([context.resume(), new Promise(resolve => { timeout = setTimeout(resolve, 100); })]); }
      finally { clearTimeout(timeout); }
    }
    return context.state === 'running';
  }

  function report(error, token) {
    if (token === generation && !disposed && enabled) notify(`Sound could not start: ${error.message}. Try the interaction again.`);
  }

  function play() {
    const token = generation;
    return unlock().catch(error => { report(error, token); return false; });
  }

  function effect(event) {
    if (!Object.hasOwn(events, event) || disposed || !enabled || volume === 0) return;
    // A late unlock must never replay a visual event that has already happened.
    if (context?.state !== 'running') return;
    const token = generation, name = events[event];
    try {
      if (!buffers.has(name)) {
        const samples = SYNTH_VOICES[name].render(context.sampleRate);
        const buffer = context.createBuffer(1, samples.length, context.sampleRate);
        buffer.copyToChannel(samples, 0);
        buffers.set(name, buffer);
      }
      const source = context.createBufferSource();
      source.buffer = buffers.get(name);
      source.connect(output);
      source.onended = () => { active.delete(source); source.disconnect(); };
      active.add(source);
      source.start();
    } catch (error) { report(error, token); }
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) pause();
    if (output) output.gain.value = enabled ? volume : 0;
  }

  function setVolume(value) {
    volume = clamp(value, 0, 1);
    if (volume === 0) pause();
    if (output) output.gain.value = enabled ? volume : 0;
  }

  function destroy() {
    pause(); disposed = true; events = {}; buffers.clear();
    output?.disconnect();
    context?.close()?.catch(() => {});
  }

  return {configure, play, prepare: play, pause, seek: pause, effect, setEnabled, setVolume, destroy};
}
