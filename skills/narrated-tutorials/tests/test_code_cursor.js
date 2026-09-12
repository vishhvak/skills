const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class ClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : !!force;
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
}

class Style {
  setProperty(name, value) {
    this[name] = String(value);
  }

  removeProperty(name) {
    delete this[name];
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.classList = new ClassList();
    this.style = new Style();
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.textContent = "";
    this.className = "";
    this.rect = { left: 0, top: 0, width: 400, height: 20 };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith("data-"))
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter)] =
        String(value);
  }

  append(...children) {
    for (const child of children) {
      this.children.push(child);
      if (child) child.parentNode = this;
    }
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  prepend(child) {
    this.children.unshift(child);
    child.parentNode = this;
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
  }

  querySelector(selector) {
    if (selector.includes("effect-code-output-arrow"))
      return this.children.find((child) =>
        child.classList?.contains("effect-code-output-arrow"),
      ) || null;
    if (selector.includes("effect-code-part-text"))
      return this.children.find((child) =>
        child.classList?.contains("effect-code-part-text"),
      ) || null;
    return null;
  }

  querySelectorAll() {
    return [];
  }

  getBoundingClientRect() {
    return this.className === "effect-code-measure"
      ? { left: 0, top: 0, width: 100, height: 20 }
      : { ...this.rect };
  }
}

class FakeDocument {
  constructor() {
    this.fonts = { ready: { then() {} } };
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createElementNS(_namespace, tagName) {
    return new FakeElement(tagName, this);
  }
}

const document = new FakeDocument();
const root = document.createElement("div");
const animationFrames = [];
const cancelledFrames = new Set();
const resizeListeners = [];
const factoryCalls = [];
const draws = [];
const motion = require("../assets/player/cursor-motion.js");
const window = {
  document,
  TutorialCursorMotion: {
    createTimeline(cues, bounds) {
      factoryCalls.push({ cues: structuredClone(cues), bounds: { ...bounds } });
      return motion.createTimeline(cues, bounds);
    },
  },
  TutorialCursorVisual: {
    draw(element, pose, type) {
      draws.push({ pose: { ...pose }, type });
      element.dataset.type = type;
    },
  },
  requestAnimationFrame(callback) {
    const id = animationFrames.length + 1;
    animationFrames.push({ id, callback });
    return id;
  },
  cancelAnimationFrame(id) {
    cancelledFrames.add(id);
  },
  setTimeout() {
    return 1;
  },
  clearTimeout() {},
  addEventListener(type, listener) {
    if (type === "resize") resizeListeners.push(listener);
  },
  removeEventListener() {},
  getComputedStyle() {
    return {
      fontFamily: "Commit Mono",
      fontSize: "10px",
      lineHeight: "20px",
      letterSpacing: "0px",
      fontWeight: "400",
    };
  },
  matchMedia() {
    return { matches: false };
  },
  performance: { now: () => 0 },
};

vm.createContext(window);
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "..", "assets", "player", "code-stage.js"),
    "utf8",
  ),
  window,
  { filename: "code-stage.js" },
);

const longText = "abcdefghijklmnopqrstuvwxyz".repeat(3);
const data = {
  stepTimes: [0, 1, 2, 3],
  slideshowData: {
    template: {
      lines: {
        first: {
          parts: { code: { tokens: [{ text: "first line" }] } },
          partOrder: ["code"],
        },
        second: {
          parts: { code: { tokens: [{ text: "second line" }] } },
          partOrder: ["code"],
        },
        third: {
          parts: { code: { tokens: [{ text: longText }] } },
          partOrder: ["code"],
        },
      },
    },
    frames: [
      {
        lineOrder: ["first"],
        state: { first: { parts: { code: true } } },
        cursor: { lineIndex: 0, charOffset: 0, textLength: 4, type: "hand" },
      },
      {
        lineOrder: ["first", "second", "third"],
        state: {
          first: { parts: { code: true } },
          second: { parts: { code: true } },
          third: { parts: { code: true } },
        },
        cursor: {
          lineIndex: 2,
          charOffset: 30,
          textLength: 4,
          type: "pointer",
        },
      },
      {
        lineOrder: ["first", "second"],
        state: {
          first: { parts: { code: true } },
          second: { parts: { code: true } },
        },
        cursor: { lineIndex: 1, charOffset: 1, textLength: 2, type: "thumbsDown" },
      },
      {
        lineOrder: ["first"],
        state: { first: { parts: { code: true } } },
      },
    ],
  },
};

const renderer = window.EffectCodeStage.mount(root, data);
assert.equal(factoryCalls.length, 1, "mount builds one cached timeline");
assert.equal(factoryCalls[0].cues.length, 4, "every frame contributes a cue");
assert.equal(factoryCalls[0].cues[3].visible, false, "cursorless frame is hidden");
assert.equal(factoryCalls[0].bounds.height, 84, "bounds include the tallest frame");

const firstCueSet = JSON.stringify(factoryCalls[0].cues);
renderer.paint(0.4);
const firstSample = draws.at(-1).pose;
renderer.paint(0.4);
assert.deepEqual(draws.at(-1).pose, firstSample, "equal audio times freeze the pose");
assert.equal(factoryCalls.length, 1, "unchanged paints reuse the timeline");

renderer.paint(1.2);
assert.equal(draws.at(-1).type, "pointer", "destination cursor type is retained");
assert.equal(draws.at(-1).pose.mode, "bezier", "long code moves use curved motion");

renderer.paint(2.2);
assert.equal(draws.at(-1).type, "thumbsDown");
renderer.paint(3.2);
assert.equal(draws.at(-1).pose.opacity, 0, "hidden cue fades the code cursor");
assert.equal(draws.at(-1).type, "thumbsDown", "hidden cue retains the prior glyph type");

renderer.paint(0.4, { seeking: true });
assert.equal(draws.at(-1).type, "hand", "backward seek selects the deterministic prior type");
assert.deepEqual(draws.at(-1).pose, firstSample, "backward seek reproduces the same pose");

resizeListeners[0]();
while (animationFrames.length) {
  const frame = animationFrames.shift();
  if (!cancelledFrames.has(frame.id)) frame.callback(0);
}
assert.equal(factoryCalls.length, 2, "resize rebuilds the timeline");
assert.equal(JSON.stringify(factoryCalls[1].cues), firstCueSet, "resize keeps all cue geometry stable");

renderer.destroy();
console.log("code cursor integration tests passed");
