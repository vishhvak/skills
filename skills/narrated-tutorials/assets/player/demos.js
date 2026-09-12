// The small, hand-built visual companions used by the lesson player.
//
// The real site loads these as React components.  Keeping them behind one
// deliberately tiny API lets the player keep its content and playback engine
// framework-free while still honoring each section's componentFlow timeline.
(function () {
  "use strict";

  const SUPPORTED = new Set([
    "KeyboardDiagram",
    "WelcomeControls",
    "WelcomeFeedback",
    "EffectTypeDisplay",
  ]);

  let active = null;

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function makeSvg(paths, className, label) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    if (className) svg.setAttribute("class", className);
    if (label) svg.setAttribute("aria-label", label);
    else svg.setAttribute("aria-hidden", "true");
    paths.forEach(({ d, fill, strokeWidth }) => {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", d);
      if (fill) path.setAttribute("fill", fill);
      if (strokeWidth) path.setAttribute("stroke-width", strokeWidth);
      svg.appendChild(path);
    });
    return svg;
  }

  function emitAction(action) {
    document.dispatchEvent(
      new CustomEvent("effect-demo-action", {
        detail: { action },
      }),
    );
  }

  function makeKey(label, action, width) {
    const key = make("button", "ei-demo-key");
    key.type = "button";
    key.style.setProperty("--key-width", `${width || 52}px`);
    const accessibleLabel =
      {
        "SPACE BAR": "Play or pause",
        "↑": "Previous section",
        "↓": "Next section",
        "←": action === "seek-left" ? "Seek backward" : "Previous section",
        "→": action === "seek-right" ? "Seek forward" : "Next section",
      }[label] || label;
    key.setAttribute("aria-label", accessibleLabel);
    const side = make("span", "ei-demo-key-side");
    const face = make("span", "ei-demo-key-face");
    face.appendChild(make("span", "ei-demo-key-label", label));
    key.append(side, face);
    key.addEventListener("click", () => emitAction(action));
    return key;
  }

  function frameAt(item, time) {
    const snapshots = item.snapshots;
    if (!snapshots.length) return -1;
    const times = item.times;
    if (!times.length) return snapshots.length - 1;
    const numericTime = time === Infinity ? Infinity : Number(time);
    const t =
      Number.isFinite(numericTime) || numericTime === Infinity
        ? numericTime
        : 0;
    let index = 0;
    for (let i = 0; i < times.length; i += 1) {
      if (t >= Number(times[i])) index = i;
      else break;
    }
    return Math.max(0, Math.min(index, snapshots.length - 1));
  }

  function callDemoRate(item, value) {
    if (typeof item.onDemoRate === "function") item.onDemoRate(value);
  }

  function updateFeedbackRate(item, previous, next) {
    const wasPlayback = previous?.stage === "playback";
    const isPlayback = next?.stage === "playback";

    if (
      isPlayback &&
      typeof next.actualSpeed === "number" &&
      next.actualSpeed !== item.notifiedRate
    ) {
      item.notifiedRate = next.actualSpeed;
      item.rateOverridden = true;
      callDemoRate(item, next.actualSpeed);
    }

    // The tutorial temporarily drives the real audio element.  Releasing it
    // when the illustrated settings panel closes restores the user's choice.
    if (wasPlayback && !isPlayback && item.rateOverridden) {
      item.notifiedRate = null;
      item.rateOverridden = false;
      callDemoRate(item, null);
    }
  }

  function badgeMarkup(host, activeWord) {
    const render = window.effectBadgeMarkup;
    host.replaceChildren();
    if (typeof render !== "function") {
      host.appendChild(make("div", "ei-demo-badge-fallback"));
      return;
    }
    const markup = render(activeWord, false);
    if (markup instanceof Node) {
      host.appendChild(markup);
    } else if (typeof markup === "string" && markup) {
      // effectBadgeMarkup is a local, application-owned renderer.  Keeping
      // its result as markup allows the home/player badge to be shared.
      const template = document.createElement("template");
      template.innerHTML = markup;
      host.appendChild(template.content.cloneNode(true));
    } else {
      host.appendChild(make("div", "ei-demo-badge-fallback"));
    }
  }

  function buildKeyboard(item) {
    const root = item.root;
    const keyboard = make("div", "ei-demo-keyboard");
    const main = make("div", "ei-demo-keyboard-main");
    const badge = make("div", "ei-demo-badge-host");
    const completion = make("div", "ei-demo-completion");
    completion.appendChild(make("span", "ei-demo-completion-dot"));
    const space = makeKey("SPACE BAR", "play", 240);
    const spaceGroup = make("div", "ei-demo-space-group");
    spaceGroup.append(completion, space);
    main.append(badge, spaceGroup);

    const arrows = make("div", "ei-demo-arrow-group");
    const up = makeKey("↑", "prev");
    const arrowRow = make("div", "ei-demo-arrow-row");
    const left = makeKey("←", "seek-left");
    const down = makeKey("↓", "next");
    const right = makeKey("→", "seek-right");
    arrowRow.append(left, down, right);
    arrows.append(make("div", "ei-demo-arrow-up", undefined), arrowRow);
    arrows.firstChild.appendChild(up);
    keyboard.append(main, arrows);
    root.appendChild(keyboard);
    item.refs = {
      keyboard,
      main,
      badge,
      completion,
      space,
      arrows,
      up,
      left,
      down,
      right,
    };
    badgeMarkup(badge, -1);
  }

  function renderKeyboard(item, state) {
    const refs = item.refs;
    refs.main.classList.toggle("is-space-visible", !!state.showSpace);
    refs.badge.classList.toggle("is-hidden", !!state.showSpace);
    refs.space.classList.toggle("is-pressed", state.pressed === "space");
    refs.arrows.classList.toggle("is-visible", !!state.showArrows);
    refs.up.classList.toggle("is-pressed", state.pressed === "up");
    refs.left.classList.toggle("is-pressed", state.pressed === "left");
    refs.down.classList.toggle("is-pressed", state.pressed === "down");
    refs.right.classList.toggle("is-pressed", state.pressed === "right");
    refs.completion.classList.toggle("is-visible", !!state.showCompletion);

    const activeWord = state.activeWord == null ? -1 : state.activeWord;
    if (activeWord !== item.badgeWord || !refs.badge.firstChild) {
      item.badgeWord = activeWord;
      badgeMarkup(refs.badge, activeWord);
    }
  }

  function buildControls(item) {
    const controls = make("div", "ei-demo-controls");
    const restartColumn = make("div", "ei-demo-control-column");
    const restartIcon = make("button", "ei-demo-symbol ei-demo-restart");
    restartIcon.type = "button";
    restartIcon.setAttribute("aria-label", "Restart section");
    restartIcon.appendChild(
      makeSvg([{ d: "M4 10a8 8 0 1 1 1 9M4 4v6h6" }], "ei-demo-symbol-icon"),
    );
    restartIcon.addEventListener("click", () => emitAction("restart"));
    const restartKey = makeKey("R", "restart");
    const restartLabel = make("span", "ei-demo-control-label", "restart");
    restartColumn.append(restartIcon, restartKey, restartLabel);

    const seekColumn = make("div", "ei-demo-control-column");
    const seekIcons = make("div", "ei-demo-seek-icons");
    const seekLeftIcon = make("button", "ei-demo-symbol ei-demo-seek-left");
    const seekRightIcon = make("button", "ei-demo-symbol ei-demo-seek-right");
    seekLeftIcon.type = seekRightIcon.type = "button";
    seekLeftIcon.setAttribute("aria-label", "Seek backward");
    seekRightIcon.setAttribute("aria-label", "Seek forward");
    seekLeftIcon.appendChild(
      makeSvg(
        [
          {
            d: "M18 5 8 12l10 7V5ZM10 5 0 12l10 7V5Z",
            fill: "currentColor",
            strokeWidth: "0",
          },
        ],
        "ei-demo-symbol-icon",
      ),
    );
    seekRightIcon.appendChild(
      makeSvg(
        [
          {
            d: "M6 5 16 12 6 19V5ZM14 5l10 7-10 7V5Z",
            fill: "currentColor",
            strokeWidth: "0",
          },
        ],
        "ei-demo-symbol-icon",
      ),
    );
    seekLeftIcon.addEventListener("click", () => emitAction("seek-left"));
    seekRightIcon.addEventListener("click", () => emitAction("seek-right"));
    seekIcons.append(seekLeftIcon, seekRightIcon);
    const seekKeys = make("div", "ei-demo-seek-keys");
    const leftKey = makeKey("←", "seek-left");
    const rightKey = makeKey("→", "seek-right");
    seekKeys.append(leftKey, rightKey);
    const seekLabel = make("span", "ei-demo-control-label", "seek");
    seekColumn.append(seekIcons, seekKeys, seekLabel);

    controls.append(restartColumn, seekColumn);
    item.root.appendChild(controls);
    item.refs = {
      controls,
      restartIcon,
      restartKey,
      leftKey,
      rightKey,
      seekLeftIcon,
      seekRightIcon,
      restartLabel,
      seekLabel,
    };
  }

  function renderControls(item, state) {
    const refs = item.refs;
    const highlighted = state.highlightedKey || "none";
    refs.restartIcon.classList.toggle(
      "is-highlighted",
      highlighted === "restart",
    );
    refs.restartIcon.classList.toggle("is-rotated", !!state.hasRotated);
    refs.restartKey.classList.toggle("is-pressed", highlighted === "restart");
    refs.leftKey.classList.toggle("is-pressed", highlighted === "seek_left");
    refs.rightKey.classList.toggle("is-pressed", highlighted === "seek_right");
    refs.seekLeftIcon.classList.toggle(
      "is-highlighted",
      highlighted === "seek_left",
    );
    refs.seekRightIcon.classList.toggle(
      "is-highlighted",
      highlighted === "seek_right",
    );
    refs.restartLabel.classList.toggle(
      "is-highlighted",
      highlighted === "restart",
    );
    refs.seekLabel.classList.toggle(
      "is-highlighted",
      highlighted === "seek_left" || highlighted === "seek_right",
    );
  }

  function buildFeedback(item) {
    const feedback = make("div", "ei-demo-feedback");
    const settings = make(
      "div",
      "ei-demo-feedback-stage ei-demo-settings-stage",
    );
    const settingsButton = make("div", "ei-demo-settings-button");
    settingsButton.setAttribute("aria-hidden", "true");
    settingsButton.appendChild(
      makeSvg(
        [
          { d: "M5 3v18M12 3v18M19 3v18" },
          { d: "M3 8h4M10 16h4M17 10h4", strokeWidth: "4" },
        ],
        "ei-demo-settings-icon",
      ),
    );
    const cursor = make("span", "ei-demo-cursor");
    const cursorIcon = makeSvg(
      [
        {
          d: "M168,132.69,214.08,115l.33-.13A16,16,0,0,0,213,85.07L52.92,32.8A15.95,15.95,0,0,0,32.8,52.92L85.07,213a15.82,15.82,0,0,0,14.41,11l.78,0a15.84,15.84,0,0,0,14.61-9.59l.13-.33L132.69,168,184,219.31a16,16,0,0,0,22.63,0l12.68-12.68a16,16,0,0,0,0-22.63ZM195.31,208,144,156.69a16,16,0,0,0-26,4.93c0,.11-.09.22-.13.32l-17.65,46L48,48l159.85,52.2-45.95,17.64-.32.13a16,16,0,0,0-4.93,26h0L208,195.31Z",
          fill: "currentColor",
          strokeWidth: "0",
        },
      ],
      "ei-demo-cursor-icon",
    );
    cursorIcon.setAttribute("viewBox", "0 0 256 256");
    cursor.appendChild(cursorIcon);
    const clickRipple = make("span", "ei-demo-click-ripple");
    settings.append(settingsButton, clickRipple, cursor);

    const playback = make(
      "div",
      "ei-demo-feedback-stage ei-demo-playback-stage",
    );
    const speedIcon = makeSvg(
      [{ d: "M3 18v-3a9 9 0 0 1 18 0v3ZM12 15l5-7" }],
      "ei-demo-speed-icon",
    );
    const speedList = make("div", "ei-demo-speed-list");
    const speeds = ["0.5×", "0.75×", "1×", "1.25×", "1.5×", "2×"];
    const speedButtons = new Map();
    speeds.forEach((label) => {
      const button = make("button", "ei-demo-speed", label);
      button.type = "button";
      button.dataset.rate = label.slice(0, -1);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const value = Number(button.dataset.rate);
        item.manualSpeed = label;
        renderFeedbackPlayback(item, label);
        item.notifiedRate = value;
        item.rateOverridden = true;
        callDemoRate(item, value);
      });
      speedButtons.set(label, button);
      speedList.appendChild(button);
    });
    playback.append(speedIcon, speedList);

    const feedbackStage = make(
      "div",
      "ei-demo-feedback-stage ei-demo-feedback-form",
    );
    const feedbackIcon = makeSvg(
      [
        { d: "M3 4h18v13h-6l-3 4-3-4H3Z" },
        { d: "M7 10h.01M12 10h.01M17 10h.01", strokeWidth: "3" },
      ],
      "ei-demo-feedback-icon",
    );
    const message = make(
      "div",
      "ei-demo-feedback-message",
      "This website sucks",
    );
    const send = make("button", "ei-demo-send", "Send");
    send.type = "button";
    send.addEventListener("click", () => {
      item.manualSent = !item.manualSent;
      renderFeedbackForm(item, item.snapshot || {});
    });
    const sendStatus = make("span", "ei-demo-send-status");
    feedbackStage.append(feedbackIcon, message, send, sendStatus);

    const badgeStage = make(
      "div",
      "ei-demo-feedback-stage ei-demo-feedback-badge",
    );
    const badge = make("div", "ei-demo-badge-host");
    badgeStage.appendChild(badge);
    feedback.append(settings, playback, feedbackStage, badgeStage);
    item.root.appendChild(feedback);
    item.refs = {
      feedback,
      settings,
      settingsButton,
      cursor,
      clickRipple,
      playback,
      speedButtons,
      feedbackStage,
      message,
      send,
      sendStatus,
      badgeStage,
      badge,
    };
    badgeMarkup(badge, 999);
  }

  function positionCursor(cursor, cursorState) {
    const positions = {
      hidden: [220, 220, 0, 1],
      approaching: [115, 115, 1, 1],
      hovering: [80, 80, 1, 1],
      clicking: [80, 82, 1, 0.92],
    };
    const [x, y, opacity, scale] = positions[cursorState] || positions.hidden;
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    cursor.style.opacity = String(opacity);
    cursor.style.setProperty("--cursor-scale", String(scale));
  }

  function renderFeedbackPlayback(item, selectedSpeed) {
    item.refs.speedButtons.forEach((button, label) => {
      const selected = label === selectedSpeed;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function renderFeedbackForm(item, state) {
    const sent = !!state.feedbackSent || item.manualSent;
    item.refs.send.classList.toggle(
      "is-pressed",
      !!state.sendButtonPressed && !sent,
    );
    item.refs.send.classList.toggle("is-sent", sent);
    item.refs.send.textContent = sent ? "✓ sent" : "Send";
    item.refs.sendStatus.textContent = sent ? "sent" : "";
  }

  function renderFeedback(item, state) {
    const stage = state.stage || "settings";
    [
      item.refs.settings,
      item.refs.playback,
      item.refs.feedbackStage,
      item.refs.badgeStage,
    ].forEach((element) => element.classList.remove("is-active"));
    const stageElement =
      {
        settings: item.refs.settings,
        playback: item.refs.playback,
        feedback: item.refs.feedbackStage,
        badge: item.refs.badgeStage,
      }[stage] || item.refs.settings;
    stageElement.classList.add("is-active");

    if (stage === "settings") {
      positionCursor(item.refs.cursor, state.cursorState || "hidden");
      item.refs.clickRipple.classList.toggle(
        "is-visible",
        state.cursorState === "clicking",
      );
    } else {
      positionCursor(item.refs.cursor, "hidden");
      item.refs.clickRipple.classList.remove("is-visible");
    }

    const selected =
      item.manualSpeed || state.selectedSpeed || formatRate(item.rate);
    renderFeedbackPlayback(item, selected);
    renderFeedbackForm(item, state);
    if (
      stage === "badge" &&
      (!item.refs.badge.firstChild || item.badgeWord !== 999)
    ) {
      item.badgeWord = 999;
      badgeMarkup(item.refs.badge, 999);
    }
  }

  function formatRate(rate) {
    const value = Number(rate);
    return Number.isFinite(value) ? `${value}×` : "1×";
  }

  function buildTypeDisplay(item) {
    const type = make("div", "ei-demo-type");
    const card = make("div", "ei-demo-type-card");
    const code = make("div", "ei-demo-type-code");
    const labels = make("div", "ei-demo-type-labels");
    card.appendChild(code);
    type.append(card, labels);
    item.root.appendChild(type);
    item.refs = { type, card, code, labels };
  }

  function renderTypeDisplay(item, state) {
    const refs = item.refs;
    refs.code.replaceChildren();
    refs.code.append(
      make("span", "ei-demo-type-token bracket", "Effect"),
      make("span", "ei-demo-type-token bracket", "<"),
      make(
        "span",
        `ei-demo-type-token ${state.showSuccess ? "success" : "label"}`,
        state.showSuccess ? "User" : "?",
      ),
    );
    if (state.showError) {
      refs.code.append(
        make("span", "ei-demo-type-token comma", ", "),
        make("span", "ei-demo-type-token error", "NotFound"),
      );
    }
    if (state.showRequirements) {
      refs.code.append(
        make("span", "ei-demo-type-token comma", ", "),
        make("span", "ei-demo-type-token requirements", "Database"),
      );
    }
    refs.code.append(make("span", "ei-demo-type-token bracket", ">"));
    refs.labels.replaceChildren();
    [
      ["showSuccess", "success", "success"],
      ["showError", "error", "error"],
      ["showRequirements", "requirements", "requirements"],
    ].forEach(([flag, className, text]) => {
      if (!state[flag]) return;
      const label = make("span", `ei-demo-type-label ${className}`);
      label.append(
        make("i", "ei-demo-type-dot"),
        make("span", undefined, text),
      );
      refs.labels.appendChild(label);
    });
  }

  function renderSnapshot(item, next, index) {
    const previous = item.snapshot;
    if (item.name === "WelcomeFeedback")
      updateFeedbackRate(item, previous, next);
    item.snapshot = next;
    item.frameIndex = index;
    if (item.name === "KeyboardDiagram") renderKeyboard(item, next);
    else if (item.name === "WelcomeControls") renderControls(item, next);
    else if (item.name === "WelcomeFeedback") {
      if (previous?.stage !== next.stage) item.manualSpeed = null;
      renderFeedback(item, next);
    } else if (item.name === "EffectTypeDisplay") renderTypeDisplay(item, next);
  }

  function mount(root, data) {
    destroy();
    const name = data?.componentFlow?.name;
    if (!root || !SUPPORTED.has(name)) return false;
    const flow = data.componentFlow;
    const snapshots = Array.isArray(flow.snapshots) ? flow.snapshots : [];
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
      onDemoRate: null,
      notifiedRate: null,
      rateOverridden: false,
      manualSpeed: null,
      manualSent: false,
      badgeWord: null,
      refs: null,
    };
    active = item;
    root.replaceChildren();
    root.classList.add("effect-demo-root");
    root.dataset.demo = name;

    if (name === "KeyboardDiagram") buildKeyboard(item);
    else if (name === "WelcomeControls") buildControls(item);
    else if (name === "WelcomeFeedback") buildFeedback(item);
    else if (name === "EffectTypeDisplay") buildTypeDisplay(item);

    if (snapshots.length) renderSnapshot(item, snapshots[0], 0);
    return true;
  }

  function paint(time, options) {
    if (!active || !active.snapshots.length) return;
    const item = active;
    const opts = options || {};
    item.onDemoRate = opts.onDemoRate;
    item.rate = opts.rate;
    const index = frameAt(item, time);
    if (index < 0 || index === item.frameIndex) return;
    renderSnapshot(item, item.snapshots[index], index);
  }

  function destroy() {
    if (!active) return;
    active.root.classList.remove("effect-demo-root");
    active.root.removeAttribute("data-demo");
    active.root.replaceChildren();
    active = null;
  }

  window.EffectDemos = { mount, paint, destroy };
})();
