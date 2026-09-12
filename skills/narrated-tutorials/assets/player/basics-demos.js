// Small, framework-free companions for the visual Effect Basics lessons.
//
// The public lesson data already contains the authoritative component flow:
// componentStepTimes selects a snapshot, and the snapshot describes every
// visible state.  This module only turns that data into DOM so the player can
// keep using its existing audio and requestAnimationFrame loop.
(function () {
  "use strict";

  const SUPPORTED = new Set([
    "EffectIsDescriptionDemo",
    "EffectRunDemo",
    "EffectFailDemo",
    "EffectSyncDemo",
    "SyncVsSucceedDemo",
    "EffectPromiseDemo",
    "GeneratorsDemo",
    "GetUserDemo",
    "WhyComposeDemo",
    "ErrorShortCircuitDemo",
    "StructuredConcurrencyDemo",
  ]);

  const COLORS = {
    idle: "#475569",
    running: "#3b82f6",
    completed: "#15803d",
    failed: "#ef4444",
    interrupted: "#f97316",
    death: "#0b0b0b",
  };

  const ICON_PATHS = {
    sparkle:
      "M240,128a15.79,15.79,0,0,1-10.5,15l-63.44,23.07L143,229.5a16,16,0,0,1-30,0L89.94,166.06,26.5,143a16,16,0,0,1,0-30L89.94,89.94,113,26.5a16,16,0,0,1,30,0l23.07,63.44L229.5,113A15.79,15.79,0,0,1,240,128Z",
    warning:
      "M236.8,188.09,149.35,36.22a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z",
  };

  let active = null;

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function svgIcon(kind) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "basic-demo-icon");
    svg.setAttribute("viewBox", kind === "check" ? "0 0 24 24" : "0 0 256 256");
    svg.setAttribute("aria-hidden", "true");
    if (kind === "check") {
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "3");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", "M4 13l5 5L20 7");
      svg.appendChild(path);
      return svg;
    }
    svg.setAttribute("viewBox", "0 0 256 256");
    svg.setAttribute("fill", "currentColor");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICON_PATHS[kind] || ICON_PATHS.warning);
    svg.appendChild(path);
    return svg;
  }

  function frameAt(item, time) {
    const snapshots = item.snapshots;
    if (!snapshots.length) return -1;
    const times = item.times;
    if (!times.length) return snapshots.length - 1;
    const numericTime = time === Infinity ? Infinity : Number(time);
    const current =
      Number.isFinite(numericTime) || numericTime === Infinity
        ? numericTime
        : 0;
    let index = 0;
    for (let i = 0; i < times.length; i += 1) {
      if (current >= Number(times[i])) index = i;
      else break;
    }
    return Math.max(0, Math.min(index, snapshots.length - 1));
  }

  function formatNow() {
    return new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  }

  function valueFor(item, key, state, create) {
    if (state === "completed") {
      if (item.values[key] == null) item.values[key] = create();
      return item.values[key];
    }
    if (
      state === "idle" ||
      state === "running" ||
      state === "failed" ||
      state === "interrupted"
    ) {
      item.values[key] = "";
    }
    return "";
  }

  function clearValues(item) {
    item.values = Object.create(null);
    item.succeedDate = null;
  }

  function baseStage(item, visible) {
    const stage = make("div", "basic-demo-stage");
    stage.dataset.visible = visible ? "true" : "false";
    if (!visible) stage.classList.add("is-stage-hidden");
    item.refs.stage = stage;
    return stage;
  }

  function stateIcon(state, result) {
    if (state === "idle") return "sparkle";
    if (state === "failed" || state === "death") return "warning";
    if (state === "interrupted") return "warning";
    if (state === "completed" && String(result || "") === "✓") return "check";
    return null;
  }

  function resultWidth(result) {
    const text = String(result || "");
    if (!text) return 64;
    return Math.max(
      64,
      Math.ceil(text.length * 16 * 0.56 * (text === "✓" ? 1.4 : 1.15) + 36),
    );
  }

  function node(item, spec) {
    const state = spec.visualState || "idle";
    const result = spec.result == null ? "" : String(spec.result);
    const iconKind = stateIcon(state, result);
    const width = iconKind
      ? 64
      : resultWidth(state === "completed" ? result : "");
    const labelWidth = Math.ceil(
      String(spec.name || "").length * 13 * 0.56 + 4,
    );
    const wrap = make("div", `basic-demo-node-wrap state-${state}`);
    wrap.dataset.node = spec.id || spec.name || "effect";
    wrap.dataset.state = state;
    wrap.style.width = `${Math.max(width, labelWidth)}px`;
    if (spec.hidden) wrap.classList.add("is-node-hidden");

    const bubble =
      spec.error && (state === "failed" || state === "death")
        ? make("div", "basic-demo-bubble basic-demo-error-bubble", spec.error)
        : spec.showLog && spec.logMessage
          ? make(
              "div",
              "basic-demo-bubble basic-demo-log-bubble",
              spec.logMessage,
            )
          : null;
    if (bubble) wrap.appendChild(bubble);

    const slot = make("div", "basic-demo-node-slot");
    const box = make("div", "basic-demo-node-box");
    box.style.setProperty("--basic-node-width", `${width}px`);
    box.style.backgroundColor = COLORS[state] || COLORS.idle;
    if (state === "running") box.classList.add("is-running");
    if (state === "completed") box.classList.add("is-completed");
    if (state === "failed" || state === "death") box.classList.add("is-failed");
    if (state === "interrupted") box.classList.add("is-interrupted");
    if (iconKind) box.appendChild(svgIcon(iconKind));
    else if (state === "completed" && result)
      box.appendChild(make("span", "basic-demo-node-result", result));
    slot.appendChild(box);
    wrap.appendChild(slot);
    wrap.appendChild(
      make("div", "basic-demo-node-label", spec.name || "effect"),
    );
    return wrap;
  }

  function nodeRow(nodes, gap, arrowAfterIndex = -1) {
    const row = make("div", "basic-demo-node-row");
    if (gap != null) row.style.gap = `${gap}px`;
    nodes
      .filter((spec) => !spec.hidden)
      .forEach((spec, index, shown) => {
        row.appendChild(node(null, spec));
        if (index === arrowAfterIndex && index < shown.length - 1)
          row.appendChild(make("span", "basic-demo-arrow", "→"));
      });
    return row;
  }

  function nodeLayer(stage, nodes, gap, hidden, arrowAfterIndex = -1) {
    const layer = make("div", "basic-demo-node-layer");
    if (hidden) layer.classList.add("is-node-layer-hidden");
    layer.appendChild(nodeRow(nodes, gap, arrowAfterIndex));
    stage.appendChild(layer);
    return layer;
  }

  function effectDescription(item, state) {
    const stage = baseStage(item, state.show !== false);
    nodeLayer(
      stage,
      [
        {
          id: "getTime",
          name: "getTime",
          visualState: state.visualState,
          result: state.result,
        },
      ],
      24,
      state.show === false,
    );
    item.refs.stage = stage;
  }

  function effectRun(item, state) {
    const stage = baseStage(item, true);
    const name = state.mode === "sync" ? "magicWord" : "asyncWord";
    nodeLayer(
      stage,
      [
        {
          id: "effect",
          name,
          visualState:
            state.mode === "sync" ? state.syncState : state.asyncState,
          result: "pismire",
        },
      ],
      24,
      false,
    );
  }

  function effectFail(item, state) {
    const stage = baseStage(item, state.show === true);
    const visualState =
      state.mode === "sync" ? state.syncState : state.asyncState;
    nodeLayer(
      stage,
      [
        {
          id: "effect",
          name: state.mode === "sync" ? "boom" : "slowBoom",
          visualState,
          error: "too chonky",
        },
      ],
      24,
      state.show !== true,
    );
  }

  function effectPromise(item, state) {
    const stage = baseStage(item, state.show === true);
    const result = valueFor(
      item,
      "sensorData",
      state.state,
      () => "{ mSv: 900 }",
    );
    nodeLayer(
      stage,
      [
        {
          id: "sensorData",
          name: "sensorData",
          visualState: state.state,
          result,
        },
      ],
      24,
      state.show !== true,
    );
  }

  function effectSync(item, state) {
    const first = valueFor(item, "now", state.state1, formatNow);
    const second = valueFor(item, "later", state.state2, formatNow);
    const visible = state.show1 === true || state.show2 === true;
    const stage = baseStage(item, visible);
    nodeLayer(
      stage,
      [
        {
          id: "now",
          name: "now",
          visualState: state.state1,
          result: first,
          error: "",
          showLog: state.showLog1,
          logMessage: "I'M TRAPPED IN A THUNK!",
          hidden: state.show1 !== true,
        },
        {
          id: "later",
          name: "later",
          visualState: state.state2,
          result: second,
          error: "",
          showLog: state.showLog2,
          logMessage: "I'M TRAPPED IN A THUNK!",
          hidden: state.show2 !== true,
        },
      ],
      32,
      !visible,
    );
  }

  function syncVsSucceed(item, state, previous) {
    if (previous && previous.mode !== state.mode) clearValues(item);
    const createDate = () => {
      if (state.mode === "succeed") {
        item.succeedDate ||= formatNow();
        return item.succeedDate;
      }
      return formatNow();
    };
    const first = valueFor(item, "now", state.run1State, createDate);
    const second = valueFor(item, "later", state.run2State, createDate);
    const third = valueFor(item, "tomorrow", state.run3State, createDate);
    const visible =
      state.run1State !== "idle" ||
      state.run2State !== "idle" ||
      state.run3State !== "idle";
    const stage = baseStage(item, visible);
    nodeLayer(
      stage,
      [
        {
          id: "now",
          name: "now",
          visualState: state.run1State,
          result: first,
          hidden: state.run1State === "idle",
        },
        {
          id: "later",
          name: "later",
          visualState: state.run2State,
          result: second,
          hidden: state.run2State === "idle",
        },
        {
          id: "tomorrow",
          name: "tomorrow",
          visualState: state.run3State,
          result: third,
          hidden: state.run3State === "idle",
        },
      ],
      24,
      !visible,
    );
  }

  function generators(item, state) {
    const visible =
      state.visible === true ||
      state.sensor !== "idle" ||
      state.bio !== "idle" ||
      state.analyze !== "idle";
    const sensor = valueFor(item, "sensor", state.sensor, () => "{ mSv: 0.3 }");
    const bio = valueFor(item, "bio", state.bio, () => "{ pulse: 72 }");
    const analyze = valueFor(item, "analyze", state.analyze, () => "✓");
    const stage = baseStage(item, visible);
    nodeLayer(
      stage,
      [
        {
          id: "sensorData",
          name: "sensorData",
          visualState: state.sensor,
          result: sensor,
        },
        {
          id: "biometrics",
          name: "biometrics",
          visualState: state.bio,
          result: bio,
        },
        {
          id: "analyze",
          name: "analyze",
          visualState: state.analyze,
          result: analyze,
        },
      ],
      24,
      !visible,
    );
  }

  function getUser(item, state) {
    const visible = state.visible === true;
    const name = valueFor(item, "askName", state.askName, () => '"Olive"');
    const age = valueFor(item, "askAge", state.askAge, () => "37");
    const user = valueFor(
      item,
      "getUser",
      state.getUser,
      () => '{ name: "Olive", age: 37 }',
    );
    const stage = baseStage(item, visible);
    nodeLayer(
      stage,
      [
        {
          id: "askName",
          name: "askName",
          visualState: state.askName,
          result: name,
        },
        {
          id: "askAge",
          name: "askAge",
          visualState: state.askAge,
          result: age,
        },
        {
          id: "getUser",
          name: "getUser",
          visualState: state.getUser,
          result: user,
        },
      ],
      24,
      !visible,
      1,
    );
  }

  function whyCompose(item, state) {
    const visible = state.show === true;
    const stage = baseStage(item, visible);
    const sensor = valueFor(
      item,
      "sensorData",
      state.state1,
      () => "{ mSv: 0.3 }",
    );
    const shoutResult = valueFor(item, "shout", state.state2, () => "✓");
    const children = [
      {
        id: "sensorData",
        name: "sensorData",
        visualState: state.state1,
        result: sensor,
      },
      {
        id: "shout",
        name: "shout",
        visualState: state.state2,
        result: shoutResult,
        showLog: state.showLog2,
        logMessage: "ALL CLEAR!",
      },
    ];

    const showProgramNode =
      state.combined === true || state.showProgramNode === true;
    if (showProgramNode) {
      nodeLayer(
        stage,
        [
          {
            id: "program",
            name: "program",
            visualState: state.programState || "idle",
            result: "✓",
            showLog: state.showProgramLog,
            logMessage: "ALL CLEAR!",
          },
        ],
        24,
        !visible,
      );
      return;
    }

    if (state.showContainer === true) {
      const boundary = make("div", "basic-demo-boundary");
      boundary.appendChild(nodeRow(children, 32));
      const layer = make("div", "basic-demo-node-layer");
      if (!visible) layer.classList.add("is-node-layer-hidden");
      layer.appendChild(boundary);
      stage.appendChild(layer);
    } else {
      nodeLayer(stage, children, 32, !visible);
    }
  }

  function errorShortCircuit(item, state) {
    const stage = baseStage(item, true);
    const inputHeight = state.inputVisible ? 94 : 0;
    stage.style.height = `${inputHeight + (state.visible ? 170 : 0)}px`;
    const nodeLayerElement = make("div", "basic-demo-node-layer");
    if (state.visible !== true)
      nodeLayerElement.classList.add("is-node-layer-hidden");
    const nameError =
      state.mode === "fail-name" && state.askName === "failed" ? "NoSams" : "";
    const ageError =
      state.mode === "fail-age" && state.askAge === "failed" ? "BadNumber" : "";
    const userError =
      state.getUser === "failed"
        ? state.mode === "fail-name"
          ? "NoSams"
          : "BadNumber"
        : "";
    nodeLayerElement.appendChild(
      nodeRow(
        [
          {
            id: "askName",
            name: "askName",
            visualState: state.askName,
            result: state.askName === "completed" ? '"Olive"' : "",
            error: nameError,
          },
          {
            id: "askAge",
            name: "askAge",
            visualState: state.askAge,
            result: state.askAge === "completed" ? "37" : "",
            error: ageError,
          },
          {
            id: "getUser",
            name: "getUser",
            visualState: state.getUser,
            result:
              state.getUser === "completed" ? '{ name: "Olive", age: 37 }' : "",
            error: userError,
          },
        ],
        24,
        1,
      ),
    );
    nodeLayerElement.style.top = `${inputHeight}px`;
    stage.appendChild(nodeLayerElement);
    if (state.inputVisible === true) stage.appendChild(ageInput(state));
  }

  function ageInput(state) {
    const input = make("div", "basic-demo-age-input");
    if (state.inputShake === true) input.classList.add("is-shaken");
    if (state.inputError === true) input.classList.add("has-error");
    if (state.inputError === true)
      input.appendChild(
        make("div", "basic-demo-input-error", "What are you doing?"),
      );
    const row = make("div", "basic-demo-age-row");
    row.appendChild(make("span", "basic-demo-age-label", "Age:"));
    const field = make("div", "basic-demo-age-field");
    field.appendChild(
      make("span", "basic-demo-age-value", state.typedText || ""),
    );
    field.appendChild(make("span", "basic-demo-caret"));
    row.appendChild(field);
    const enter = make("div", "basic-demo-enter", "Enter");
    enter.setAttribute("aria-label", "Enter key");
    if (state.enterPressed === true) enter.classList.add("is-pressed");
    row.appendChild(enter);
    input.appendChild(row);
    return input;
  }

  function structuredConcurrency(item, state) {
    const visible = state.visible === true;
    const stage = baseStage(item, visible);
    nodeLayer(
      stage,
      [
        { id: "tree", name: "tree", visualState: state.tree },
        { id: "star", name: "star", visualState: state.star },
        { id: "beetle", name: "beetle", visualState: state.beetle },
      ],
      24,
      !visible,
    );
  }

  // Preserve diagram nodes so width, color and position can transition between snapshots.
  function reconcile(current, next) {
    if (current.nodeType === Node.TEXT_NODE) {
      current.nodeValue = next.nodeValue;
      return;
    }
    for (const attribute of [...current.attributes])
      if (!next.hasAttribute(attribute.name))
        current.removeAttribute(attribute.name);
    for (const attribute of [...next.attributes])
      if (current.getAttribute(attribute.name) !== attribute.value)
        current.setAttribute(attribute.name, attribute.value);
    const oldChildren = [...current.childNodes],
      used = new Set();
    [...next.childNodes].forEach((child, index) => {
      const identity = (node) =>
        node.nodeType === Node.TEXT_NODE
          ? "#text"
          : `${node.nodeName}:${node.dataset?.node || node.classList?.[0] || ""}`;
      const existing = oldChildren.find(
        (node) => !used.has(node) && identity(node) === identity(child),
      );
      if (existing) {
        used.add(existing);
        reconcile(existing, child);
      }
      const target = existing || child;
      if (current.childNodes[index] !== target)
        current.insertBefore(target, current.childNodes[index] || null);
    });
    for (const child of oldChildren) if (!used.has(child)) child.remove();
  }

  function renderSnapshot(item, snapshot, index) {
    const previousStage = item.refs.stage;
    const previous = item.snapshot;
    item.snapshot = snapshot;
    item.frameIndex = index;
    if (item.name === "EffectIsDescriptionDemo")
      effectDescription(item, snapshot);
    else if (item.name === "EffectRunDemo") effectRun(item, snapshot);
    else if (item.name === "EffectFailDemo") effectFail(item, snapshot);
    else if (item.name === "EffectSyncDemo") effectSync(item, snapshot);
    else if (item.name === "SyncVsSucceedDemo")
      syncVsSucceed(item, snapshot, previous);
    else if (item.name === "EffectPromiseDemo") effectPromise(item, snapshot);
    else if (item.name === "GeneratorsDemo") generators(item, snapshot);
    else if (item.name === "GetUserDemo") getUser(item, snapshot);
    else if (item.name === "WhyComposeDemo") whyCompose(item, snapshot);
    else if (item.name === "ErrorShortCircuitDemo")
      errorShortCircuit(item, snapshot);
    else if (item.name === "StructuredConcurrencyDemo")
      structuredConcurrency(item, snapshot);
    if (previousStage) {
      reconcile(previousStage, item.refs.stage);
      item.refs.stage = previousStage;
    } else item.refs.viewport.replaceChildren(item.refs.stage);
  }

  function mount(root, data) {
    destroy();
    const name = data?.componentFlow?.name;
    if (!root || !SUPPORTED.has(name)) return false;
    const snapshots = Array.isArray(data.componentFlow.snapshots)
      ? data.componentFlow.snapshots
      : [];
    const item = {
      root,
      data,
      name,
      snapshots,
      times: Array.isArray(data.componentStepTimes)
        ? data.componentStepTimes
        : [],
      frameIndex: -1,
      snapshot: null,
      refs: {},
      values: Object.create(null),
      succeedDate: null,
    };
    active = item;
    root.replaceChildren();
    root.classList.add("basic-demo-root");
    root.dataset.demo = name;
    item.refs.viewport = make("div", "basic-demo-viewport");
    root.appendChild(item.refs.viewport);
    if (snapshots.length) renderSnapshot(item, snapshots[0], 0);
    return true;
  }

  function paint(time, _options) {
    if (!active || !active.snapshots.length) return;
    const index = frameAt(active, time);
    if (index < 0 || index === active.frameIndex) return;
    renderSnapshot(active, active.snapshots[index], index);
  }

  function destroy() {
    if (!active) return;
    active.root.classList.remove("basic-demo-root");
    active.root.removeAttribute("data-demo");
    active.root.replaceChildren();
    active = null;
  }

  window.EffectBasicsDemos = { mount, paint, destroy };
})();
