// Sample the same state that draws the scene. Seeking primes the next transition silently.
export function createSoundEvents(emit = () => {}) {
  let previous = new Set(), lastTime = null;
  function sample(time, events, playing = false) {
    const next = new Set(events.map(event => event.key));
    const continuous = lastTime !== null && time > lastTime && time - lastTime <= .5;
    if (playing && continuous) {
      for (const {key, event} of events) if (!previous.has(key)) emit(event);
    }
    previous = next;
    lastTime = time;
  }
  function reset() { previous.clear(); lastTime = null; }
  return {sample, reset};
}
