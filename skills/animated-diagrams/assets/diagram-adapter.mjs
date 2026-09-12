export function createDiagramAdapter(scene, controls, toSceneTime = time => time) {
  let instance;
  return {
    mount(host) {
      instance?.destroy();
      instance = scene.mount(host, controls);
    },
    paint(audioTime, {playing = false, seeking = false} = {}) {
      const mapped = toSceneTime(audioTime);
      if (!Number.isFinite(mapped)) throw new TypeError('Diagram time mapping must return finite seconds');
      const time = Math.max(0, Math.min(scene.meta.duration, mapped));
      instance?.render(time, {playing: playing && !seeking});
    },
    reset() { instance?.reset?.(); },
    stop() { instance?.stop?.(); },
    destroy() { instance?.destroy(); instance = undefined; },
  };
}
