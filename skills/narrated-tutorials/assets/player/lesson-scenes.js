// Framework-free renderer for the portable `sceneData` contract.
//
// A scene is a deterministic snapshot selected by the audio clock. The
// renderer keeps item roots keyed by their authored ids, so CSS transitions can
// interpolate between snapshots while a seek simply paints the requested
// snapshot. It owns no playback timers and does not infer time from wall time.
(function (global) {
  "use strict";

  const SUPPORTED = new Set(["LessonScene", "GenericScene", "NarratedScene"]);
  let active = null;

  const list = (value) => (Array.isArray(value) ? value : []);
  const finite = (value, fallback = 0) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;
  const own = (object, key) =>
    Object.prototype.hasOwnProperty.call(object, key);

  function shape(section) {
    const source = section?.sceneData || section?.sceneFlow || {};
    const frames = list(source.frames).length
      ? list(source.frames)
      : list(section?.scenes).length
        ? list(section.scenes)
        : list(source.snapshots);
    const times = list(source.stepTimes).length
      ? source.stepTimes
      : list(section?.sceneStepTimes).length
        ? section.sceneStepTimes
        : list(source.times);
    return { frames, times };
  }

  function frameAt(times, frames, time) {
    if (!frames.length) return -1;
    if (!times.length) return frames.length - 1;
    const point = time === Infinity ? Infinity : finite(time);
    let result = 0;
    for (let index = 0; index < times.length; index += 1) {
      if (point >= finite(times[index])) result = index;
      else break;
    }
    return Math.max(0, Math.min(frames.length - 1, result));
  }

  function textOf(item, fields) {
    for (const field of fields) {
      if (typeof item?.[field] === "string" && item[field]) return item[field];
    }
    return "";
  }

  function safeUrl(value) {
    if (typeof value !== "string" || !value) return null;
    if (value.startsWith("//")) return null;
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
      return /^https?:\/\//.test(value) ? value : null;
    }
    return value.startsWith("/") || value.startsWith("#") || !value.includes("\\")
      ? value
      : null;
  }

  function imageSource(image) {
    const value = typeof image === "string" ? image : image?.src;
    const src = safeUrl(value);
    if (!src || (!src.startsWith("/content/") && !src.startsWith("./") && !src.startsWith("../")))
      return null;
    return src;
  }

  function imageAlt(image) {
    return typeof image === "object" && typeof image.alt === "string"
      ? image.alt
      : "";
  }

  function position(spec, index, kind) {
    const fallback = {
      x: 10 + (index % 4) * 23,
      y: kind === "label" ? 12 + Math.floor(index / 4) * 18 : 28 + Math.floor(index / 4) * 27,
    };
    return {
      x: Math.max(0, Math.min(100, finite(spec?.x, fallback.x))),
      y: Math.max(0, Math.min(100, finite(spec?.y, fallback.y))),
      width: Math.max(1, Math.min(100, finite(spec?.width, kind === "card" ? 26 : 18))),
      height: Math.max(1, Math.min(100, finite(spec?.height, kind === "label" ? 8 : 16))),
    };
  }

  function applyPosition(element, spec, index, kind) {
    const point = position(spec, index, kind);
    element.style.left = `${point.x}%`;
    element.style.top = `${point.y}%`;
    element.style.width = `${point.width}%`;
    element.style.minHeight = `${point.height}%`;
    if (own(spec || {}, "rotation"))
      element.style.setProperty("--scene-rotation", `${finite(spec.rotation)}deg`);
    else element.style.removeProperty("--scene-rotation");
    if (own(spec || {}, "opacity")) element.style.opacity = String(finite(spec.opacity, 1));
    else element.style.removeProperty("opacity");
    if (typeof spec?.color === "string") element.style.setProperty("--scene-color", spec.color);
    else element.style.removeProperty("--scene-color");
    if (typeof spec?.background === "string")
      element.style.setProperty("--scene-background", spec.background);
    else element.style.removeProperty("--scene-background");
    element.classList.toggle("is-hidden", spec?.hidden === true);
    element.classList.toggle("is-selected", spec?.selected === true);
    element.classList.toggle("is-muted", spec?.muted === true);
  }

  function appendImage(document, parent, image) {
    const src = imageSource(image);
    if (!src) return;
    const element = document.createElement("img");
    element.src = src;
    element.alt = imageAlt(image);
    element.loading = "lazy";
    element.decoding = "async";
    element.className = "lesson-scene-image";
    parent.appendChild(element);
  }

  function appendLinkedText(document, parent, item, text, className) {
    const url = safeUrl(item?.url);
    if (!url) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    const link = document.createElement("a");
    link.className = className;
    link.href = url;
    if (/^https?:\/\//.test(url)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    link.textContent = text;
    parent.appendChild(link);
  }

  function renderItem(element, spec, index, kind, highlights) {
    const document = element.ownerDocument;
    const target = String(spec.id);
    const highlight = highlights.get(target);
    element.dataset.id = target;
    element.dataset.kind = kind;
    element.dataset.tone = typeof spec.tone === "string" ? spec.tone : "";
    element.classList.toggle("is-highlighted", !!highlight);
    if (highlight?.color) element.style.setProperty("--scene-highlight", highlight.color);
    else element.style.removeProperty("--scene-highlight");
    applyPosition(element, spec, index, kind);
    element.replaceChildren();

    if (kind === "label") {
      const label = document.createElement("span");
      label.className = "lesson-scene-label-text";
      appendLinkedText(document, label, spec, textOf(spec, ["text", "label", "title"]), "lesson-scene-link");
      element.appendChild(label);
      return;
    }

    appendImage(document, element, spec.image);
    const copy = document.createElement("div");
    copy.className = "lesson-scene-copy";
    if (kind === "card") {
      const title = textOf(spec, ["title", "label", "text"]);
      if (title) {
        const heading = document.createElement("strong");
        heading.className = "lesson-scene-card-title";
        appendLinkedText(document, heading, spec, title, "lesson-scene-link");
        copy.appendChild(heading);
      }
      const body = textOf(spec, ["body", "description"]);
      if (body) {
        const paragraph = document.createElement("span");
        paragraph.className = "lesson-scene-card-body";
        paragraph.textContent = body;
        copy.appendChild(paragraph);
      }
    } else {
      const label = textOf(spec, ["label", "text", "title", "name", "description"]);
      if (label) {
        const nodeLabel = document.createElement("span");
        nodeLabel.className = "lesson-scene-node-label";
        appendLinkedText(document, nodeLabel, spec, label, "lesson-scene-link");
        copy.appendChild(nodeLabel);
      }
      const description = spec.description && spec.description !== label ? spec.description : "";
      if (description) {
        const detail = document.createElement("span");
        detail.className = "lesson-scene-node-detail";
        detail.textContent = description;
        copy.appendChild(detail);
      }
    }
    element.appendChild(copy);
  }

  function reconcileLayer(layer, specs, kind, highlights, records) {
    const used = new Set();
    list(specs).forEach((spec, index) => {
      if (!spec || spec.id == null) return;
      const id = String(spec.id);
      let element = records.get(id);
      if (!element) {
        element = layer.ownerDocument.createElement(kind === "card" ? "article" : "div");
        element.className = `lesson-scene-item lesson-scene-${kind}`;
        records.set(id, element);
      }
      renderItem(element, spec, index, kind, highlights);
      used.add(id);
      if (layer.childNodes[index] !== element)
        layer.insertBefore(element, layer.childNodes[index] || null);
    });
    for (const [id, element] of records) {
      if (!used.has(id)) {
        element.remove();
        records.delete(id);
      }
    }
  }

  function pointFor(spec, index, kind) {
    const point = position(spec, index, kind);
    return { x: point.x + point.width / 2, y: point.y + point.height / 2 };
  }

  function sceneBox(spec, index, kind, stageWidth, stageHeight) {
    const point = position(spec, index, kind);
    const width = (point.width / 100) * stageWidth;
    const height = (point.height / 100) * stageHeight;
    const left = (point.x / 100) * stageWidth;
    const top = (point.y / 100) * stageHeight;
    return {
      left,
      top,
      width,
      height,
      center: { x: left + width / 2, y: top + height / 2 },
    };
  }

  function rectangleBoundary(box, destination) {
    const dx = destination.x - box.center.x;
    const dy = destination.y - box.center.y;
    if (dx === 0 && dy === 0) return { ...box.center };
    const horizontal = dx === 0 ? Infinity : (box.width / 2) / Math.abs(dx);
    const vertical = dy === 0 ? Infinity : (box.height / 2) / Math.abs(dy);
    const scale = Math.min(horizontal, vertical);
    return {
      x: box.center.x + dx * scale,
      y: box.center.y + dy * scale,
    };
  }

  function edgeGeometry(
    sourceSpec,
    sourceIndex,
    sourceKind,
    targetSpec,
    targetIndex,
    targetKind,
    stageWidth,
    stageHeight,
  ) {
    const width = Math.max(1, finite(stageWidth, 1));
    const height = Math.max(1, finite(stageHeight, 1));
    const source = sceneBox(sourceSpec, sourceIndex, sourceKind, width, height);
    const target = sceneBox(targetSpec, targetIndex, targetKind, width, height);
    const from = rectangleBoundary(source, target.center);
    const to = rectangleBoundary(target, source.center);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return {
      from,
      to,
      length: Math.sqrt(dx * dx + dy * dy),
      angle: Math.atan2(dy, dx),
    };
  }

  function stageDimensions(stage) {
    const rect = stage?.getBoundingClientRect?.() || {};
    const clientWidth = finite(stage?.clientWidth, 0);
    const clientHeight = finite(stage?.clientHeight, 0);
    return {
      width: Math.max(1, clientWidth || finite(rect.width, 1)),
      height: Math.max(1, clientHeight || finite(rect.height, 1)),
    };
  }

  function reconcileEdges(layer, specs, lookup, records) {
    const used = new Set();
    const dimensions = stageDimensions(layer.parentElement);
    list(specs).forEach((spec, index) => {
      if (!spec || spec.from == null || spec.to == null) return;
      const id = String(spec.id || `${spec.from}->${spec.to}:${index}`);
      const from = lookup.get(String(spec.from));
      const to = lookup.get(String(spec.to));
      if (!from || !to) return;
      let element = records.get(id);
      if (!element) {
        element = layer.ownerDocument.createElement("div");
        element.className = "lesson-scene-edge";
        records.set(id, element);
      }
      const geometry = edgeGeometry(
        from.spec,
        from.index,
        from.kind,
        to.spec,
        to.index,
        to.kind,
        dimensions.width,
        dimensions.height,
      );
      element.style.left = `${geometry.from.x}px`;
      element.style.top = `${geometry.from.y}px`;
      element.style.width = `${Math.max(0, geometry.length)}px`;
      element.style.transform = `rotate(${geometry.angle}rad)`;
      element.style.setProperty("--scene-angle", `${geometry.angle}rad`);
      element.dataset.directed = spec.directed === false ? "false" : "true";
      element.dataset.dashed = spec.dashed === true ? "true" : "false";
      element.replaceChildren();
      const label = textOf(spec, ["label", "text"]);
      if (label) {
        const caption = layer.ownerDocument.createElement("span");
        caption.className = "lesson-scene-edge-label";
        caption.textContent = label;
        element.appendChild(caption);
      }
      used.add(id);
      if (layer.childNodes[index] !== element)
        layer.insertBefore(element, layer.childNodes[index] || null);
    });
    for (const [id, element] of records) {
      if (!used.has(id)) {
        element.remove();
        records.delete(id);
      }
    }
  }

  function renderEmojis(layer, specs, lookup, records) {
    const used = new Set();
    list(specs).forEach((spec, index) => {
      const value = textOf(spec, ["value", "emoji", "text"]);
      if (!value) return;
      const id = `${spec.target == null ? "center" : spec.target}:${index}`;
      let element = records.get(id);
      if (!element) {
        element = layer.ownerDocument.createElement("span");
        element.className = "lesson-scene-emoji";
        records.set(id, element);
      }
      const target = spec.target == null ? null : lookup.get(String(spec.target));
      const point = target
        ? pointFor(target.spec, target.index, target.kind)
        : { x: 50, y: 16 + index * 10 };
      element.style.left = `${point.x}%`;
      element.style.top = `${point.y}%`;
      element.textContent = value;
      element.classList.add("is-visible");
      element.style.transitionDuration = "0ms";
      used.add(id);
      if (layer.childNodes[index] !== element)
        layer.insertBefore(element, layer.childNodes[index] || null);
    });
    for (const [id, element] of records) {
      if (!used.has(id)) {
        element.remove();
        records.delete(id);
      }
    }
  }

  // Emoji motion is derived from the audio clock on every paint. This keeps a
  // paused or rate-shifted player in sync and makes a backward seek reproduce
  // the exact same position and opacity without a timer or an animation clock.
  function updateEmojiMotion(item, frame, time, options) {
    const cue = finite(item.times[item.frameIndex], 0);
    const elapsed = time === Infinity ? Infinity : Math.max(0, finite(time) - cue);
    const reduced = item.reducedMotion;
    const progress = reduced ? 0 : Math.max(0, Math.min(1, elapsed / 1.4));
    const opacity = reduced ? 1 : Math.max(0, 1 - progress);
    const offset = reduced ? 0 : -34 * progress;
    const scale = reduced ? 1 : 0.78 + progress * 0.28;
    for (const element of item.records.emojis.values()) {
      element.style.transitionDuration = "0ms";
      element.style.opacity = String(opacity);
      element.style.transform = `translate(-50%, calc(-50% + ${offset}px)) scale(${scale})`;
    }
  }

  function cursorPlacement(box, width, height) {
    const gap = 12;
    const room = { bottom: height - box.top - box.height, top: box.top, right: width - box.left - box.width, left: box.left };
    const side = ["bottom", "top", "right", "left"].find((key) => room[key] >= 48)
      || Object.keys(room).reduce((best, key) => room[key] > room[best] ? key : best);
    const x = Math.max(22, Math.min(width - 22, box.left + box.width / 2));
    const y = Math.max(22, Math.min(height - 22, box.top + box.height / 2));
    if (side === "bottom") return { x, y: box.top + box.height + gap, angle: 0 };
    if (side === "top") return { x, y: box.top - gap, angle: 180 };
    if (side === "right") return { x: box.left + box.width + gap, y, angle: -90 };
    return { x: box.left - gap, y, angle: 90 };
  }

  function cursorCues(frames, times, dimensions) {
    return frames.map((frame, index) => {
      const spec = frame.cursor;
      const cue = { time: finite(times[index], 0), visible: !!spec };
      if (!spec) return cue;
      let tip = { x: finite(spec.x, 50) * dimensions.width / 100, y: finite(spec.y, 50) * dimensions.height / 100, angle: 0 };
      for (const [kind, values] of [["node", frame.nodes], ["card", frame.cards], ["label", frame.labels]]) {
        const targetIndex = list(values).findIndex((item) => String(item.id) === String(spec.target));
        if (targetIndex < 0) continue;
        const target = values[targetIndex];
        if (target.hidden) return { ...cue, visible: false };
        tip = cursorPlacement(sceneBox(target, targetIndex, kind, dimensions.width, dimensions.height), dimensions.width, dimensions.height);
        break;
      }
      // The path follows the cursor body; its tip stays ahead of that center.
      const type = spec.type || "pointer";
      const facing = tip.angle + (type === "pointer" ? -44 : 0);
      const angle = facing * Math.PI / 180;
      return { ...cue, x: tip.x - Math.sin(angle) * 12, y: tip.y + Math.cos(angle) * 12, angle: facing, type };
    });
  }

  function paintCursor(item, time) {
    const dimensions = item.cursorDimensions || (item.cursorDimensions = stageDimensions(item.stage));
    const key = `${dimensions.width}:${dimensions.height}`;
    if (!item.cursorTimeline || item.cursorLayout !== key) {
      item.cursorTimeline = global.TutorialCursorMotion.createTimeline(cursorCues(item.frames, item.times, dimensions), dimensions);
      item.cursorLayout = key;
    }
    const reducedMotion = !!global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const pose = item.cursorTimeline.sample(time, { reducedMotion });
    const type = item.frames[item.frameIndex]?.cursor?.type || item.cursor.dataset.type || "pointer";
    global.TutorialCursorVisual.draw(item.cursor, pose, type);
  }

  function render(item, index, options, time) {
    const frame = item.frames[index] || {};
    item.frameIndex = index;
    const highlights = new Map(
      list(frame.highlights || frame.highlight).map((value) => [
        String(value?.target ?? value),
        value && typeof value === "object" ? value : {},
      ]),
    );
    const lookup = new Map();
    const remember = (specs, kind) =>
      list(specs).forEach((spec, itemIndex) => {
        if (spec?.id != null)
          lookup.set(String(spec.id), { spec, index: itemIndex, kind });
      });
    remember(frame.nodes, "node");
    remember(frame.cards, "card");
    remember(frame.labels, "label");
    reconcileLayer(item.layers.nodes, frame.nodes, "node", highlights, item.records.nodes);
    reconcileLayer(item.layers.cards, frame.cards, "card", highlights, item.records.cards);
    reconcileLayer(item.layers.labels, frame.labels, "label", highlights, item.records.labels);
    reconcileEdges(item.layers.edges, frame.edges, lookup, item.records.edges);
    renderEmojis(
      item.layers.emojis,
      frame.emojis || frame.emoji || frame.bursts,
      lookup,
      item.records.emojis,
    );
    paintCursor(item, time);
    updateEmojiMotion(item, frame, time, options);
    item.stage.dataset.scene = String(index);
    if (typeof frame.background === "string") item.stage.style.setProperty("--scene-stage-background", frame.background);
    else item.stage.style.removeProperty("--scene-stage-background");
    item.stage.classList.toggle("is-seeking", options?.seeking === true);
  }

  function reflow(item) {
    if (!item || item.frameIndex < 0) return;
    item.cursorDimensions = null;
    render(item, item.frameIndex, { seeking: true }, item.audioTime);
  }

  function mount(root, section) {
    destroy();
    const data = shape(section);
    if (!root?.ownerDocument || !data.frames.length) return false;
    const document = root.ownerDocument;
    const stage = document.createElement("div");
    stage.className = "lesson-scenes-stage";
    const edges = document.createElement("div");
    edges.className = "lesson-scenes-layer lesson-scenes-edges";
    const nodes = document.createElement("div");
    nodes.className = "lesson-scenes-layer lesson-scenes-nodes";
    const cards = document.createElement("div");
    cards.className = "lesson-scenes-layer lesson-scenes-cards";
    const labels = document.createElement("div");
    labels.className = "lesson-scenes-layer lesson-scenes-labels";
    const emojis = document.createElement("div");
    emojis.className = "lesson-scenes-layer lesson-scenes-emojis";
    const cursor = document.createElement("div");
    cursor.className = "lesson-scene-cursor";
    cursor.setAttribute("aria-hidden", "true");
    stage.append(edges, nodes, cards, labels, emojis, cursor);
    root.replaceChildren(stage);
    root.classList.add("lesson-scenes-root");
    active = {
      root,
      stage,
      cursor,
      frames: data.frames,
      times: data.times,
      frameIndex: -1,
      layers: { edges, nodes, cards, labels, emojis },
      records: {
        edges: new Map(),
        nodes: new Map(),
        cards: new Map(),
        labels: new Map(),
        emojis: new Map(),
      },
      reducedMotion: !!global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
      audioTime: 0,
    };
    active.resize = () => reflow(active);
    global.addEventListener?.("resize", active.resize, { passive: true });
    if (typeof global.ResizeObserver === "function") {
      active.resizeObserver = new global.ResizeObserver(() => reflow(active));
      active.resizeObserver.observe(stage);
    }
    render(active, 0, { seeking: true }, 0);
    return true;
  }

  function paint(time, options) {
    if (!active) return;
    active.audioTime = time;
    const index = frameAt(active.times, active.frames, time);
    if (index < 0 || index === active.frameIndex) {
      active.stage.classList.toggle("is-seeking", options?.seeking === true);
      updateEmojiMotion(active, active.frames[index] || {}, time, options);
      paintCursor(active, time);
      return;
    }
    render(active, index, options || {}, time);
  }

  function destroy() {
    if (!active) return;
    global.removeEventListener?.("resize", active.resize);
    active.resizeObserver?.disconnect();
    active.root.classList.remove("lesson-scenes-root");
    active.root.replaceChildren();
    active = null;
  }

  global.NarratedTutorialScenes = {
    mount,
    paint,
    destroy,
    SUPPORTED,
    __test: { edgeGeometry, cursorPlacement, cursorCues, frameAt, emojiProgress: (times, index, time, reduced) => {
      const cue = finite(times?.[index], 0);
      const elapsed = time === Infinity ? Infinity : Math.max(0, finite(time) - cue);
      return reduced ? 0 : Math.max(0, Math.min(1, elapsed / 1.4));
    } },
  };
})(window);
