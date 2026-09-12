(function (global) {
  'use strict';
  function createHost({loadModule = url => import(url), report = message => console.error(message)} = {}) {
    let generation = 0, active = null;
    function destroy() {
      generation++;
      const previous = active; active = null;
      previous?.instance?.destroy?.();
      previous?.surface?.remove();
    }
    function fail(record, error) {
      if (active !== record) return;
      record.failed = true;
      record.instance?.destroy?.(); record.instance = null;
      record.surface.textContent = `Diagram unavailable: ${error.message}`;
      record.surface.setAttribute('role', 'alert');
      report(record.surface.textContent);
    }
    function sample(record, passive = false) {
      if (!record.instance || record.failed) return;
      try {
        const time = Number.isFinite(record.time) ? Math.max(0, record.time) : record.duration;
        record.instance.render(time, {...record.options, playing: !passive && record.options.playing === true && !record.options.seeking});
      } catch (error) { fail(record, error); }
    }
    async function mount(host, data, controls = {}) {
      destroy();
      const token = generation;
      const surface = host.ownerDocument.createElement('div');
      surface.className = 'authored-diagram-surface';
      surface.style.cssText = 'width:100%;height:100%;min-height:0;position:relative;overflow:hidden';
      host.replaceChildren(surface);
      const record = {surface, instance: null, time: 0, options: {}, duration: 0, failed: false};
      active = record;
      surface.textContent = 'Loading diagram…';
      const context = {cues: data.diagramData.cues || []};
      for (const name of ['pause','play','seek','getTime','announce','prepareSound','sound']) {
        if (typeof controls[name] === 'function') context[name] = (...args) => active === record ? controls[name](...args) : undefined;
      }
      try {
        const module = await loadModule(data.diagramData.module);
        if (active !== record || token !== generation) return;
        if (typeof module.mount !== 'function' || !module.meta || !Number.isFinite(module.meta.duration) || module.meta.duration <= 0) throw new Error('Expected a scene with meta.duration and mount()');
        record.duration = module.meta.duration;
        surface.replaceChildren();
        record.instance = module.mount(surface, context);
        if (!record.instance || typeof record.instance.render !== 'function' || typeof record.instance.destroy !== 'function') throw new Error('Scene mount() must return render() and destroy()');
        sample(record, true);
      } catch (error) { fail(record, error); }
    }
    function paint(time, options = {}) {
      if (!active) return;
      active.time = time; active.options = options;
      sample(active);
    }
    function stop() { active?.instance?.stop?.(); }
    function reset() { active?.instance?.reset?.(); if (active) {active.time = 0;sample(active,true);} }
    return {mount, paint, stop, reset, destroy};
  }
  global.NarratedDiagramHost = {create: createHost};
  if (typeof module !== 'undefined' && module.exports) module.exports = {createHost};
})(typeof window === 'undefined' ? globalThis : window);
