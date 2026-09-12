// Dependency-free renderer for slideshowData from effect.institute.
// A line ID and its part IDs stay mounted while frames change. That is what
// makes the code move and crossfade like the source player instead of flashing
// a newly-built code block on every audio step.
(function (global) {
  "use strict";

  const DIM = 0.4;
  const SIZE = 24;
  const CURSOR_GAP = 0;
  const CURSOR_TYPES = new Set(["hand", "pointer", "thumbsDown"]);
  const ENTER = 400;
  const FLOAT = 2500;
  const own = (object, key) =>
    Object.prototype.hasOwnProperty.call(object, key);
  const list = (value) => (Array.isArray(value) ? value : []);
  const number = (value, fallback = 0) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;
  const colors = {
    yellow: [251, 191, 36],
    green: [34, 197, 94],
    blue: [59, 130, 246],
    red: [239, 68, 68],
    purple: [168, 85, 247],
    pink: [236, 72, 153],
    orange: [249, 115, 22],
    gray: [107, 114, 128],
  };
  const paths = {
    pointer:
      "M220.49,207.8,207.8,220.49a12,12,0,0,1-17,0l-56.57-56.57L115,214.08l-.13.33A15.84,15.84,0,0,1,100.26,224l-.78,0a15.82,15.82,0,0,1-14.41-11L32.8,52.92A15.95,15.95,0,0,1,52.92,32.8L213,85.07a16,16,0,0,1,1.41,29.8l-.33.13-50.16,19.27,56.57,56.56A12,12,0,0,1,220.49,207.8Z",
    hand: "M224,104v50.93c0,46.2-36.85,84.55-83,85.06A83.71,83.71,0,0,1,80.6,215.4C58.79,192.33,34.15,136,34.15,136a16,16,0,0,1,6.53-22.23c7.66-4,17.1-.84,21.4,6.62l21,36.44a6.09,6.09,0,0,0,6,3.09l.12,0A8.19,8.19,0,0,0,96,151.74V32a16,16,0,0,1,16.77-16c8.61.4,15.23,7.82,15.23,16.43V104a8,8,0,0,0,8.53,8,8.17,8.17,0,0,0,7.47-8.25V88a16,16,0,0,1,16.77-16c8.61.4,15.23,7.82,15.23,16.43V112a8,8,0,0,0,8.53,8,8.17,8.17,0,0,0,7.47-8.25v-7.28c0-8.61,6.62-16,15.23-16.43A16,16,0,0,1,224,104Z",
    thumbsDown:
      "M239.82,157l-12-96A24,24,0,0,0,204,40H32A16,16,0,0,0,16,56v88a16,16,0,0,0,16,16H75.06l37.78,75.58A8,8,0,0,0,120,240a40,40,0,0,0,40-40V184h56a24,24,0,0,0,23.82-27ZM72,144H32V56H72Zm150,21.29a7.88,7.88,0,0,1-6,2.71H152a8,8,0,0,0-8,8v24a24,24,0,0,1-19.29,23.54L88,150.11V56H204a8,8,0,0,1,7.94,7l12,96A7.87,7.87,0,0,1,222,165.29Z",
  };

  function schedule(fn) {
    return typeof global.requestAnimationFrame === "function"
      ? global.requestAnimationFrame(fn)
      : global.setTimeout(() => fn(Date.now()), 16);
  }
  function cancel(id) {
    if (id == null) return;
    if (typeof global.cancelAnimationFrame === "function")
      global.cancelAnimationFrame(id);
    else global.clearTimeout(id);
  }
  function clock() {
    return global.performance?.now?.() ?? Date.now();
  }
  function rgba(value, alpha, fallback) {
    const key = String(value || "")
      .toLowerCase()
      .replace("grey", "gray");
    const match = key.match(/^#([0-9a-f]{6})$/i);
    const rgb =
      colors[key] ||
      (match
        ? [0, 1, 2].map((i) => parseInt(match[1].slice(i * 2, i * 2 + 2), 16))
        : colors[fallback] || colors.yellow);
    return `rgba(${rgb.join(", ")}, ${alpha})`;
  }
  function ranges(value) {
    return list(value)
      .filter(
        (item) =>
          item &&
          Number.isFinite(Number(item.start)) &&
          Number.isFinite(Number(item.end)),
      )
      .map((item) => ({
        ...item,
        start: number(item.start),
        end: number(item.end),
      }));
  }
  function inRange(position, values) {
    return values.some((item) => position >= item.start && position < item.end);
  }
  function colorAt(position, values) {
    return (
      values.find((item) => position >= item.start && position < item.end)
        ?.color || null
    );
  }
  function textOf(tokens) {
    return list(tokens)
      .map((token) => String(token?.text ?? ""))
      .join("");
  }
  function hash(value) {
    let result = 2166136261;
    for (let i = 0; i < value.length; i++)
      result = Math.imul(result ^ value.charCodeAt(i), 16777619);
    return result >>> 0;
  }
  function cursorIcon(document, type) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 256 256");
    svg.setAttribute("width", SIZE);
    svg.setAttribute("height", SIZE);
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("effect-code-cursor-icon");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", paths[type] || paths.pointer);
    path.setAttribute("fill", "white");
    svg.appendChild(path);
    return svg;
  }

  function cursorType(value, fallback = "hand") {
    return CURSOR_TYPES.has(value) ? value : fallback;
  }

  function cursorAngle(type) {
    return type === "pointer" ? -44 : 0;
  }

  function bodyCenter(tipX, tipY, angle) {
    const radians = (angle * Math.PI) / 180;
    return {
      x: tipX - Math.sin(radians) * (SIZE / 2),
      y: tipY + Math.cos(radians) * (SIZE / 2),
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function shape(data) {
    const source = data || {},
      slideshow = source.slideshowData || source,
      template = slideshow.template || {};
    return {
      source,
      slideshow,
      lines: template.lines || {},
      frames: list(slideshow.frames),
      times: list(source.stepTimes).length
        ? source.stepTimes
        : list(slideshow.stepTimes),
    };
  }

  class Renderer {
    constructor(root, data) {
      if (!root?.ownerDocument)
        throw new TypeError("EffectCodeStage.mount requires a DOM element");
      this.root = root;
      this.data = shape(data);
      this.records = new Map();
      this.removals = new Map();
      this.particles = new Map();
      this.burstKeys = new Set();
      this.index = -1;
      this.frame = null;
      this.lastTime = null;
      this.seeking = false;
      this.particleRaf = null;
      this.measurementRaf = null;
      this.instantRaf = null;
      this.cursorTimeline = null;
      this.cursorCues = null;
      this.cursorBounds = null;
      this.cursorMetrics = null;
      this.cursorLayoutSignature = null;
      this.cursorMotionFactory = null;
      this.resize = () => this.measureLayout();
      this.mount();
    }

    mount() {
      const document = this.root.ownerDocument;
      this.root.replaceChildren();
      this.root.classList.add("effect-code-mounted");
      this.stage = document.createElement("div");
      this.stage.className = "effect-code-stage";
      this.block = document.createElement("pre");
      this.block.className = "effect-code-block";
      this.decoration = document.createElement("div");
      this.decoration.className = "effect-code-decoration-layer";
      this.lines = document.createElement("div");
      this.lines.className = "effect-code-lines";
      this.particleLayer = document.createElement("div");
      this.particleLayer.className = "effect-code-particle-layer";
      this.cursorLayer = document.createElement("div");
      this.cursorLayer.className = "effect-code-cursor-layer";
      this.block.append(
        this.decoration,
        this.lines,
        this.particleLayer,
        this.cursorLayer,
      );
      this.stage.appendChild(this.block);
      this.root.appendChild(this.stage);
      if (!this.data.frames.length) return this;
      global.addEventListener?.("resize", this.resize, { passive: true });
      const fontsReady = this.root.ownerDocument?.fonts?.ready;
      if (fontsReady && typeof fontsReady.then === "function")
        fontsReady.then(() => {
          if (!this.destroyed) this.measureLayout();
        });
      this.render(0, true);
      return this;
    }

    frameAt(time) {
      if (!this.data.frames.length || !this.data.times.length)
        return this.data.frames.length ? 0 : -1;
      let index = 0;
      const point = time === Infinity ? Infinity : number(time);
      for (let i = this.data.times.length - 1; i >= 0; i--)
        if (point >= number(this.data.times[i])) {
          index = i;
          break;
        }
      return Math.max(0, Math.min(this.data.frames.length - 1, index));
    }

    order(frame) {
      return list(frame?.lineOrder).length
        ? frame.lineOrder.slice()
        : frame?.state
          ? Object.keys(frame.state)
          : Object.keys(this.data.lines);
    }

    parts(line) {
      if (!line || typeof line !== "object") return { values: {}, order: [] };
      if (line.parts && !Array.isArray(line.parts))
        return {
          values: line.parts,
          order: list(line.partOrder).length
            ? line.partOrder
            : Object.keys(line.parts),
        };
      if (Array.isArray(line.parts)) {
        const values = {};
        line.parts.forEach((part, i) => {
          values[`p${i}`] = part || {};
        });
        return { values, order: line.parts.map((_, i) => `p${i}`) };
      }
      return Array.isArray(line.tokens)
        ? { values: { p0: line }, order: ["p0"] }
        : { values: {}, order: [] };
    }

    model(id, frame, index) {
      const source = this.data.lines[id],
        parts = this.parts(source),
        state = frame?.state?.[id],
        values =
          state?.parts && typeof state.parts === "object" ? state.parts : null;
      let offset = 0;
      const result = parts.order.map((partId) => {
        const part = parts.values[partId] || {},
          value = values ? values[partId] : true,
          visible = values ? !!value : true;
        const tokens =
          typeof value === "string" &&
          part.versions &&
          own(part.versions, value)
            ? list(part.versions[value])
            : list(part.tokens);
        const text = textOf(tokens),
          start = offset;
        if (visible) offset += text.length;
        return {
          id: partId,
          part,
          value,
          visible,
          tokens,
          text,
          start,
          end: offset,
          inline: part.inline,
          motion:
            part.crossfade && typeof value === "string"
              ? `${partId}-${value}`
              : partId,
        };
      });
      return {
        id,
        index,
        parts: result,
        text: result
          .filter((part) => part.visible)
          .map((part) => part.text)
          .join(""),
        entering: !!state?.entering,
        dimmed: !!state?.dimmed,
        background: state?.background,
      };
    }

    focus(frame, index) {
      const values = frame?.spotlight?.ranges;
      return ranges(values?.[String(index)] || values?.[index]);
    }
    field(frame, name, index, id) {
      return ranges(
        list(frame?.[name]).filter(
          (item) => Number(item?.lineIndex) === index || item?.lineId === id,
        ),
      );
    }
    status(frame, index, id) {
      const values = frame?.status?.ranges;
      return ranges(values?.[String(index)] || values?.[index] || values?.[id]);
    }

    cells(part, model, frame) {
      const focus = this.focus(frame, model.index),
        hasFocus =
          !!frame?.spotlight?.ranges &&
          Object.keys(frame.spotlight.ranges).length > 0;
      const bright = this.field(frame, "brightRanges", model.index, model.id),
        glows = this.field(frame, "glows", model.index, model.id);
      const squiggles = this.field(frame, "squiggles", model.index, model.id),
        statuses = this.status(frame, model.index, model.id);
      const cells = [];
      let position = part.start;
      for (const token of part.tokens)
        for (const character of String(token?.text ?? "")) {
          cells.push({
            character,
            color: token?.color || "",
            type: token?.type || "default",
            opacity: hasFocus
              ? focus.length && inRange(position, focus)
                ? 1
                : DIM
              : 1,
            bright: inRange(position, bright),
            glow: colorAt(position, glows),
            squiggle: colorAt(position, squiggles),
            status: statuses.find((item) => item.end === position + 1),
          });
          position++;
        }
      const result = [];
      for (const cell of cells) {
        const previous = result[result.length - 1],
          same =
            previous &&
            previous.color === cell.color &&
            previous.type === cell.type &&
            previous.opacity === cell.opacity &&
            previous.bright === cell.bright &&
            previous.glow === cell.glow &&
            previous.squiggle === cell.squiggle &&
            !previous.status;
        if (same) {
          previous.text += cell.character;
          previous.end++;
        } else
          result.push({
            ...cell,
            text: cell.character,
            start:
              part.start +
              result.reduce((sum, run) => sum + run.text.length, 0),
            end:
              part.start +
              result.reduce((sum, run) => sum + run.text.length, 0) +
              1,
          });
      }
      let offset = part.start;
      for (const run of result) {
        run.start = offset;
        offset += run.text.length;
        run.end = offset;
      }
      return result;
    }

    updatePart(element, part, model, frame, instant) {
      const changed =
        element.dataset.motion != null &&
        element.dataset.motion !== part.motion;
      element.dataset.motion = part.motion;
      element.dataset.visible = part.visible ? "1" : "0";
      element.classList.toggle("is-hidden", !part.visible);
      element.classList.toggle("is-output", part.inline === "output");
      if (changed && !instant) {
        element.classList.remove("is-crossfading");
        void element.offsetWidth;
        element.classList.add("is-crossfading");
      }
      let arrow = element.querySelector(":scope > .effect-code-output-arrow");
      if (part.inline === "output" && !arrow) {
        arrow = this.root.ownerDocument.createElement("span");
        arrow.className = "effect-code-output-arrow";
        arrow.textContent = "→";
        arrow.setAttribute("aria-hidden", "true");
        element.prepend(arrow);
      }
      if (part.inline !== "output" && arrow) arrow.remove();
      let text = element.querySelector(":scope > .effect-code-part-text");
      if (!text) {
        text = this.root.ownerDocument.createElement("span");
        text.className = "effect-code-part-text";
        element.appendChild(text);
      }
      const oldTokens = Array.from(text.children).filter((child) =>
        child.classList.contains("effect-code-token"),
      );
      const oldStatus = Array.from(text.children).filter((child) =>
        child.classList.contains("effect-code-status"),
      );
      const runs = this.cells(part, model, frame);
      let tokenIndex = 0,
        statusIndex = 0;
      for (const run of runs) {
        const token =
          oldTokens[tokenIndex++] ||
          this.root.ownerDocument.createElement("span");
        token.className = "effect-code-token";
        token.dataset.start = String(run.start);
        token.dataset.end = String(run.end);
        token.dataset.visible = part.visible ? "1" : "0";
        token.textContent = run.text;
        token.style.color = run.color || "";
        token.style.opacity = run.opacity === 1 ? "" : String(run.opacity);
        token.style.fontWeight = run.bright ? "650" : "";
        token.style.textShadow =
          run.glow ||
          (frame?.spotlight?.glow &&
            inRange(run.start, this.focus(frame, model.index)))
            ? "0 0 6px currentColor, 0 0 16px currentColor"
            : "";
        token.style.textDecoration = run.squiggle
          ? `underline wavy ${rgba(run.squiggle, 1, "red")}`
          : "";
        token.style.textUnderlineOffset = run.squiggle ? "3px" : "";
        text.appendChild(token);
        if (run.status) {
          const indicator =
              oldStatus[statusIndex++] ||
              this.root.ownerDocument.createElement("span"),
            state = run.status.status || "idle";
          indicator.className = `effect-code-status status-${state}`;
          indicator.setAttribute("aria-label", state);
          indicator.textContent =
            state === "success"
              ? "✓"
              : state === "error"
                ? "×"
                : state === "die"
                  ? "☠"
                  : state === "interrupted"
                    ? "‖"
                    : "";
          if (state === "running")
            indicator.innerHTML = '<span aria-hidden="true"></span>';
          text.appendChild(indicator);
        }
      }
      while (tokenIndex < oldTokens.length) oldTokens[tokenIndex++].remove();
      while (statusIndex < oldStatus.length) oldStatus[statusIndex++].remove();
    }

    record(id) {
      let record = this.records.get(id);
      if (record) return record;
      const element = this.root.ownerDocument.createElement("div"),
        content = this.root.ownerDocument.createElement("div");
      element.className = "effect-code-line";
      element.dataset.lineId = id;
      content.className = "effect-code-line-content";
      element.appendChild(content);
      this.lines.appendChild(element);
      record = { id, element, content, parts: new Map(), text: "" };
      this.records.set(id, record);
      return record;
    }

    updateLine(record, model, frame, instant) {
      const next = new Map();
      for (const part of model.parts) {
        const element =
          record.parts.get(part.id) ||
          this.root.ownerDocument.createElement("span");
        if (!element.className) element.className = "effect-code-part";
        this.updatePart(element, part, model, frame, instant);
        record.content.appendChild(element);
        next.set(part.id, element);
      }
      for (const [id, element] of record.parts)
        if (!next.has(id)) {
          element.classList.add("is-hidden");
          record.content.appendChild(element);
          next.set(id, element);
        }
      record.parts = next;
      record.text = model.text;
      record.model = model;
    }

    render(index, instant) {
      this.frame =
        this.data.frames[
          Math.max(0, Math.min(this.data.frames.length - 1, index))
        ] || {};
      this.index = index;
      this.leading = this.lineHeight();
      const order = this.order(this.frame),
        live = new Set(order);
      this.block.style.height = `${Math.max(1, order.length) * this.leading}px`;
      this.stage.classList.toggle("is-seeking", !!instant);
      order.forEach((id, lineIndex) => {
        const record = this.record(id),
          model = this.model(id, this.frame, lineIndex),
          timer = this.removals.get(id);
        if (timer) {
          global.clearTimeout(timer);
          this.removals.delete(id);
        }
        record.element.classList.remove("is-leaving");
        this.updateLine(record, model, this.frame, instant);
        record.element.style.transform = `translate3d(0, ${lineIndex * this.leading}px, 0)`;
        record.element.style.opacity = model.dimmed ? String(DIM) : "1";
        this.background(record.element, model.background);
        const fresh = !record.element.dataset.seen;
        record.element.dataset.seen = "1";
        if (!instant && (fresh || model.entering)) {
          record.element.classList.add("is-entering");
          schedule(() => record.element.classList.remove("is-entering"));
        }
      });
      for (const [id, record] of this.records)
        if (!live.has(id) && !this.removals.has(id)) {
          record.element.classList.add("is-leaving");
          record.element.style.opacity = "0";
          const timer = global.setTimeout(
            () => {
              if (!this.destroyed && !this.order(this.frame).includes(id)) {
                record.element.remove();
                this.records.delete(id);
              }
              this.removals.delete(id);
            },
            instant ? 0 : 450,
          );
          this.removals.set(id, timer);
        }
      this.decorations(this.frame, instant);
      this.particleSync(this.frame, order, instant);
      this.cursor(this.frame, instant);
      if (instant) {
        cancel(this.instantRaf);
        this.instantRaf = schedule(() =>
          this.stage.classList.remove("is-seeking"),
        );
      }
      if (this.frame.sound && !instant) this.sound(this.frame.sound);
    }

    background(element, value) {
      element.classList.remove(
        "background-success",
        "background-error",
        "background-warning",
        "background-info",
      );
      if (value) element.classList.add(`background-${value}`);
    }
    lineHeight() {
      const style = global.getComputedStyle?.(this.block),
        size = number(parseFloat(style?.fontSize), 17),
        value = style?.lineHeight;
      return value && value !== "normal" && Number.isFinite(parseFloat(value))
        ? parseFloat(value)
        : size * 1.55;
    }

    point(record, position) {
      const spans = Array.from(
        record.content.querySelectorAll(
          '.effect-code-token[data-start][data-visible="1"]',
        ),
      );
      if (!spans.length) return null;
      const target = Math.max(0, Math.min(record.text.length, position));
      let span = spans.find(
        (item) =>
          target >= Number(item.dataset.start) &&
          target <= Number(item.dataset.end),
      );
      if (!span) span = target ? spans[spans.length - 1] : spans[0];
      const node = span.firstChild;
      if (!node) return null;
      const offset = Math.max(
        0,
        Math.min(node.textContent.length, target - Number(span.dataset.start)),
      );
      const range = this.root.ownerDocument.createRange();
      try {
        range.setStart(node, offset);
        range.collapse(true);
        return range.getBoundingClientRect();
      } catch (_) {
        return null;
      }
    }
    measureRange(record, start, end) {
      if (!record) return null;
      const block = this.block.getBoundingClientRect(),
        line = record.content.getBoundingClientRect(),
        a = this.point(record, start),
        b = this.point(record, end),
        blockLeft = number(block?.left),
        blockTop = number(block?.top),
        lineLeft = number(line?.left),
        lineTop = number(line?.top),
        lineHeight = number(line?.height, this.leading);
      if (a && b)
        return {
          left: number(a.left) - blockLeft,
          top: lineTop - blockTop,
          width: Math.max(0, number(b.left) - number(a.left)),
          height: lineHeight,
        };
      const size = number(
          parseFloat(global.getComputedStyle?.(this.block)?.fontSize),
          17,
        ),
        char = size * 0.6;
      return {
        left: lineLeft - blockLeft + char * start,
        top: lineTop - blockTop,
        width: char * Math.max(0, end - start),
        height: lineHeight,
      };
    }

    decorations(frame, instant) {
      this.decoration.replaceChildren();
      const order = this.order(frame);
      for (const field of ["marks", "glows"])
        for (const item of list(frame?.[field])) {
          const id = order[Number(item.lineIndex)];
          if (!id) continue;
          const element = this.root.ownerDocument.createElement("div");
          element.className = `effect-code-decoration effect-code-${field === "marks" ? "mark" : "glow"}`;
          element.dataset.lineId = id;
          element.dataset.start = String(number(item.start));
          element.dataset.end = String(number(item.end));
          element.style.setProperty(
            "--effect-decoration-color",
            rgba(item.color, 1, field === "marks" ? "yellow" : "green"),
          );
          if (instant) element.style.transition = "none";
          this.decoration.appendChild(element);
        }
      this.positionDecorations(frame);
      cancel(this.measurementRaf);
      this.measurementRaf = schedule(() => {
        if (!this.destroyed) {
          this.positionDecorations(frame);
          this.cursor(frame, false);
        }
      });
    }
    positionDecorations(frame) {
      const order = this.order(frame);
      this.decoration
        .querySelectorAll(".effect-code-decoration")
        .forEach((element) => {
          const record = this.records.get(
            element.dataset.lineId || order[Number(element.dataset.lineIndex)],
          );
          if (!record) return;
          const box = this.measureRange(
            record,
            Number(element.dataset.start),
            Number(element.dataset.end),
          );
          if (!box) return;
          const glow = element.classList.contains("effect-code-glow");
          element.style.left = `${box.left}px`;
          element.style.top = `${box.top - (glow ? 2 : 1)}px`;
          element.style.width = `${Math.max(1, box.width)}px`;
          element.style.height = `${box.height + (glow ? 4 : 2)}px`;
        });
    }

    cursorTime(index = this.index) {
      if (index < 0) return 0;
      const value = this.data.times[index];
      if (Number.isFinite(Number(value))) return Number(value);
      return index > 0 ? this.cursorTime(index - 1) : 0;
    }

    cursorLayoutMetrics() {
      const style = global.getComputedStyle?.(this.block),
        fontSize = number(parseFloat(style?.fontSize), 17),
        leading = this.lineHeight(),
        fontSignature = [
          style?.fontFamily || "",
          style?.fontSize || fontSize,
          style?.lineHeight || leading,
          style?.letterSpacing || "",
          style?.fontWeight || "",
        ].join("|"),
        charWidth =
          this.cursorMetrics?.fontSignature === fontSignature
            ? this.cursorMetrics.charWidth
            : this.cursorCharacterWidth(fontSize),
        rect = this.block.getBoundingClientRect?.() || {},
        width =
          number(rect.width) ||
          number(this.block.clientWidth) ||
          number(this.block.offsetWidth) ||
          charWidth * 72,
        lineCount = this.data.frames.reduce(
          (maximum, frame) => Math.max(maximum, this.order(frame).length),
          0,
        ),
        contentHeight =
          number(rect.height) ||
          number(this.block.clientHeight) ||
          number(this.block.offsetHeight) ||
          Math.max(1, lineCount) * leading,
        height = Math.max(
          contentHeight,
          Math.max(1, lineCount) * leading + SIZE + CURSOR_GAP,
        );
      return {
        width: Math.max(1, width),
        height: Math.max(1, height),
        leading,
        charWidth,
        fontSignature,
        bounds: { width: Math.max(1, width), height: Math.max(1, height) },
        signature: `${width}|${height}|${leading}|${charWidth}|${fontSignature}`,
      };
    }

    cursorCharacterWidth(fontSize) {
      const document = this.root.ownerDocument;
      if (!document?.createElement) return fontSize * 0.6;
      const probe = document.createElement("span");
      probe.className = "effect-code-measure";
      probe.textContent = "0000000000";
      this.block.appendChild(probe);
      const rect = probe.getBoundingClientRect?.();
      probe.remove?.();
      return rect && rect.width > 0 ? rect.width / 10 : fontSize * 0.6;
    }

    frameCursorTarget(
      frame,
      frameIndex,
      metrics = this.cursorMetrics || this.cursorLayoutMetrics(),
    ) {
      const target = frame?.cursor;
      if (!target || target.visible === false) return null;
      const order = this.order(frame),
        lineIndex = Number(target.lineIndex),
        id = order[lineIndex];
      if (!id || !Number.isFinite(lineIndex)) return null;
      const model = this.model(id, frame, lineIndex),
        textLength = model.text.length;
      if (!textLength && number(target.textLength) > 0) return null;
      const start = clamp(number(target.charOffset), 0, textLength),
        end = clamp(
          start + Math.max(0, number(target.textLength)),
          start,
          textLength,
        ),
        left = metrics.charWidth * start,
        top = lineIndex * metrics.leading,
        width = metrics.charWidth * (end - start),
        height = metrics.leading,
        type = cursorType(target.type),
        angle = cursorAngle(type),
        tipX = left + width / 2,
        tipY = top + height + CURSOR_GAP,
        center = bodyCenter(tipX, tipY, angle),
        x = clamp(center.x, SIZE / 2, Math.max(SIZE / 2, metrics.width - SIZE / 2));
      return {
        x,
        y: center.y,
        angle,
        type,
        visible: true,
      };
    }

    invalidateCursorTimeline() {
      this.cursorTimeline = null;
      this.cursorCues = null;
      this.cursorBounds = null;
      this.cursorMetrics = null;
      this.cursorLayoutSignature = null;
      this.cursorMotionFactory = null;
    }

    rebuildCursorTimeline(metrics = this.cursorLayoutMetrics()) {
      const cues = this.data.frames.map((frame, index) => {
        const target = this.frameCursorTarget(frame, index, metrics);
        if (!target)
          return { time: this.cursorTime(index), visible: false };
        return {
          time: this.cursorTime(index),
          x: target.x,
          y: target.y,
          angle: target.angle,
          type: target.type,
          visible: true,
        };
      });
      const factory = global.TutorialCursorMotion?.createTimeline;
      let timeline = null;
      if (typeof factory === "function") {
        timeline = factory(cues, metrics.bounds);
        if (!timeline || typeof timeline.sample !== "function")
          throw new TypeError("TutorialCursorMotion.createTimeline must return {sample}");
      }
      this.cursorMetrics = metrics;
      this.cursorCues = cues;
      this.cursorBounds = metrics.bounds;
      this.cursorLayoutSignature = metrics.signature;
      this.cursorMotionFactory = factory || null;
      this.cursorTimeline = timeline;
      return this.cursorTimeline;
    }

    ensureCursorTimeline() {
      const factory = global.TutorialCursorMotion?.createTimeline;
      if (
        !this.cursorCues ||
        this.cursorMotionFactory !== (factory || null)
      )
        this.rebuildCursorTimeline();
      return this.cursorTimeline;
    }

    cursorTarget(frame) {
      return this.frameCursorTarget(
        frame,
        this.index,
        this.cursorMetrics || this.cursorLayoutMetrics(),
      );
    }

    ensureCursorElement() {
      if (this.cursorElement) return this.cursorElement;
      const element = this.root.ownerDocument.createElement("div");
      element.className = "effect-code-cursor";
      element.setAttribute("aria-hidden", "true");
      element.style.width = `${SIZE}px`;
      element.style.height = `${SIZE}px`;
      element.style.opacity = "0";
      this.cursorLayer.appendChild(element);
      this.cursorElement = element;
      return element;
    }

    cursorTypeAt(time) {
      const cues = this.cursorCues || [];
      const point = time === Infinity ? Infinity : number(time);
      let type = "hand";
      for (const cue of cues) {
        if (number(cue.time) > point) break;
        if (cue.visible && cue.type) type = cursorType(cue.type, type);
      }
      return type;
    }

    fallbackCursorDraw(element, pose, type, instant) {
      if (element.dataset.type !== type) {
        element.replaceChildren(
          cursorIcon(
            this.root.ownerDocument,
            type === "hand" || type === "thumbsDown" ? type : "pointer",
          ),
        );
        element.dataset.type = type;
      }
      if (instant) element.style.transition = "none";
      else element.style.removeProperty?.("transition");
      element.style.opacity = String(pose.opacity);
      element.style.filter = pose.opacity ? "blur(0)" : "blur(2px)";
      element.style.transform = `translate3d(${pose.x - SIZE / 2}px, ${pose.y - SIZE / 2}px, 0) rotate(${pose.angle}deg) scale(${pose.scaleX}, ${pose.scaleY})`;
    }

    cursorAt(time, options = {}) {
      const element = this.ensureCursorElement(),
        timeline = this.ensureCursorTimeline(),
        frame = this.data.frames[this.frameAt(time)] || {},
        fallback = this.cursorTarget(frame),
        type = this.cursorTypeAt(time) || fallback?.type || "hand";
      let pose = null;
      if (timeline)
        pose = timeline.sample(time, {
          reducedMotion:
            options.reducedMotion == null
              ? this.reducedMotion()
              : !!options.reducedMotion,
        });
      if (timeline && (!pose || typeof pose !== "object"))
        throw new TypeError("TutorialCursorMotion.sample must return a pose");
      if (!pose) {
        pose = fallback
          ? {
              x: fallback.x,
              y: fallback.y,
              angle: fallback.angle,
              scaleX: 1,
              scaleY: 1,
              opacity: 1,
              mode: "fallback",
              settled: true,
            }
          : {
              x: this.cursorBounds?.width ? this.cursorBounds.width / 2 : 0,
              y: this.cursorBounds?.height ? this.cursorBounds.height / 2 : 0,
              angle: cursorAngle(type),
              scaleX: 1,
              scaleY: 1,
              opacity: 0,
              mode: "hidden",
              settled: true,
            };
      }
      const safePose = {
        x: number(pose.x, fallback?.x || 0),
        y: number(pose.y, fallback?.y || 0),
        angle: number(pose.angle, fallback?.angle || cursorAngle(type)),
        scaleX: number(pose.scaleX, 1),
        scaleY: number(pose.scaleY, 1),
        opacity: clamp(number(pose.opacity, pose.visible === false ? 0 : 1), 0, 1),
        mode: pose.mode || "settled",
        settled: pose.settled !== false,
      };
      const visual = global.TutorialCursorVisual;
      if (typeof visual?.draw === "function")
        visual.draw(element, safePose, type);
      else this.fallbackCursorDraw(element, safePose, type, !!options.seeking);
      this.cursorX = safePose.x;
      this.cursorY = safePose.y;
      return safePose;
    }

    cursor(frame, instant, time) {
      return this.cursorAt(
        time == null ? this.cursorTime(this.index) : time,
        { seeking: !!instant },
      );
    }

    particleKey(item, id) {
      return `${id}:${item.charOffset}:${item.textLength}:${list(item.emoji).join(",")}`;
    }
    particleSync(frame, order, instant) {
      const nextKeys = new Set();
      if (this.reducedMotion()) {
        this.resetParticles(false);
        this.burstKeys = nextKeys;
        return;
      }
      for (const item of list(frame?.bursts)) {
        const id = order[Number(item.lineIndex)];
        if (!id) continue;
        const key = this.particleKey(item, id);
        nextKeys.add(key);
        // Keep the previous frame's key set separate from live particle DOM.
        // A long-lived burst must not respawn when its first particle expires.
        if (!this.burstKeys.has(key) && !this.particles.has(key))
          this.newParticle(key, item, id, instant);
      }
      this.burstKeys = nextKeys;
      if (this.particles.size) this.particleLoop();
    }
    newParticle(key, item, id, instant) {
      const element = this.root.ownerDocument.createElement("div");
      element.className = "effect-code-particle";
      element.setAttribute("aria-hidden", "true");
      element.textContent = list(item.emoji)[0] || "⭐";
      this.particleLayer.appendChild(element);
      const record = this.records.get(id),
        start = number(item.charOffset),
        box =
          record &&
          this.measureRange(record, start, start + number(item.textLength)),
        rect = this.block.getBoundingClientRect();
      const origin = box
          ? { x: box.left + box.width / 2, y: box.top - 8 }
          : { x: rect.width / 2, y: 0 },
        seed = hash(key),
        time = clock(),
        particle = {
          key,
          item,
          id,
          element,
          origin,
          x: origin.x,
          y: origin.y,
          vx: ((seed & 65535) / 65535 - 0.5) * 0.3,
          vy: -0.3 * (0.5 + ((seed >>> 16) / 65535) * 0.5),
          start: time,
          float: time + ENTER,
          last: time,
        };
      this.particles.set(key, particle);
      this.drawParticle(particle, time, instant);
    }
    drawParticle(particle, time) {
      const age = time - particle.start;
      if (age < ENTER) {
        const progress = Math.max(0, Math.min(1, age / ENTER));
        particle.x = particle.origin.x;
        particle.y = particle.origin.y + 8 * (1 - progress);
        particle.element.style.opacity = String(Math.min(1, progress * 1.25));
        particle.element.style.transform = `translate3d(${particle.x}px, ${particle.y}px, 0) translate(-50%, -50%) scale(${Math.max(0, 1 - (1 - progress) ** 3)})`;
      } else {
        const dt = Math.min(64, Math.max(0, time - particle.last)) / 16.6667;
        particle.vy -= 0.006 * dt;
        particle.vx *= Math.pow(0.992, dt);
        particle.vy *= Math.pow(0.992, dt);
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.element.style.opacity = String(
          Math.max(0, 1 - (time - particle.float) / FLOAT),
        );
        particle.element.style.transform = `translate3d(${particle.x}px, ${particle.y}px, 0) translate(-50%, -50%) scale(1)`;
      }
      particle.last = time;
    }
    particleLoop() {
      if (this.particleRaf != null || this.reducedMotion()) return;
      const tick = (time) => {
        this.particleRaf = null;
        if (this.destroyed) return;
        if (this.reducedMotion()) {
          this.resetParticles(false);
          return;
        }
        for (const [key, particle] of this.particles) {
          this.drawParticle(particle, time);
          if (time - particle.float >= FLOAT) {
            particle.element.remove();
            this.particles.delete(key);
          }
        }
        if (this.particles.size) this.particleRaf = schedule(tick);
      };
      this.particleRaf = schedule(tick);
    }
    reducedMotion() {
      return (
        global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ===
        true
      );
    }
    resetParticles(clearKeys = true) {
      cancel(this.particleRaf);
      this.particleRaf = null;
      for (const particle of this.particles.values()) particle.element.remove();
      this.particles.clear();
      if (clearKeys) this.burstKeys.clear();
    }
    measureLayout() {
      this.invalidateCursorTimeline();
      cancel(this.measurementRaf);
      this.measurementRaf = schedule(() => {
        if (!this.destroyed && this.frame) {
          const order = this.order(this.frame);
          this.leading = this.lineHeight();
          this.block.style.height = `${Math.max(1, order.length) * this.leading}px`;
          order.forEach((id, lineIndex) => {
            const record = this.records.get(id);
            if (record)
              record.element.style.transform = `translate3d(0, ${lineIndex * this.leading}px, 0)`;
          });
          this.positionDecorations(this.frame);
          this.rebuildCursorTimeline();
          this.cursorAt(
            this.lastTime == null ? this.cursorTime(this.index) : this.lastTime,
            { seeking: this.seeking },
          );
        }
      });
    }
    sound(name) {
      if (!name || !this.root.dispatchEvent) return;
      let event;
      try {
        event = new global.CustomEvent("effect-sound", {
          bubbles: true,
          detail: { name },
        });
      } catch (_) {
        event = this.root.ownerDocument.createEvent("CustomEvent");
        event.initCustomEvent("effect-sound", true, false, { name });
      }
      this.root.dispatchEvent(event);
    }
    paint(time, options = {}) {
      if (this.destroyed || !this.data.frames.length) return this;
      const current = time === Infinity ? Infinity : number(time),
        seeking = !!options.seeking,
        backwards = this.lastTime != null && current < this.lastTime - 0.05;
      const index = this.frameAt(current),
        reset = backwards || (seeking && !this.seeking);
      if (reset) this.resetParticles();
      if (index !== this.index || reset)
        this.render(index, seeking || backwards);
      this.lastTime = current;
      this.seeking = seeking;
      this.cursorAt(current, {
        seeking: seeking || backwards,
        reducedMotion: options.reducedMotion,
      });
      return this;
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      global.removeEventListener?.("resize", this.resize);
      cancel(this.particleRaf);
      cancel(this.measurementRaf);
      cancel(this.instantRaf);
      for (const timer of this.removals.values()) global.clearTimeout(timer);
      this.removals.clear();
      this.resetParticles();
      this.stage?.remove();
      this.root.classList.remove("effect-code-mounted");
      this.records.clear();
    }
  }

  let active = null;
  global.EffectCodeStage = {
    createCursorIcon: cursorIcon,
    mount(root, data) {
      if (active) active.destroy();
      active = new Renderer(
        typeof root === "string" ? global.document?.querySelector(root) : root,
        data,
      );
      return active;
    },
    paint(time, options) {
      return active?.paint(time, options);
    },
    destroy() {
      active?.destroy();
      active = null;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
