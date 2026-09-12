"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
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

class FakeElement {
  constructor(tagName = "div", ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
    this.open = false;
    this.clientHeight = 600;
    this.offsetTop = 0;
    this.offsetHeight = 100;
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name.startsWith("data-"))
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter)] =
        stringValue;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(listener);
    this.listeners.set(type, callbacks);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter((candidate) => candidate !== listener),
    );
  }

  dispatch(type, detail = {}) {
    const event = {
      type,
      target: this,
      detail,
      preventDefault() {},
      stopPropagation() {},
      ...detail,
    };
    for (const listener of this.listeners.get(type) || [])
      listener.call(this, event);
    this[`on${type}`]?.call(this, event);
    return event;
  }

  append(...nodes) {
    this.children.push(...nodes);
    nodes.forEach((node) => {
      if (node && typeof node === "object") node.parentNode = this;
    });
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  insertAdjacentHTML() {}

  querySelectorAll() {
    return [];
  }

  closest() {
    return null;
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  scrollTo(options) {
    this.scrollTop = options?.top ?? options;
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
    this.dispatch("close");
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.listeners = new Map();
    this.activeElement = null;
    this.body = new FakeElement("body", this);
    this.register(this.body, "body");
  }

  register(element, id) {
    element.ownerDocument = this;
    if (id) {
      element.id = id;
      this.elements.set(id, element);
    }
    return element;
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createTextNode(text) {
    const node = new FakeElement("#text", this);
    node.textContent = String(text);
    return node;
  }

  querySelectorAll() {
    return [];
  }

  addEventListener(type, listener) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(listener);
    this.listeners.set(type, callbacks);
  }

  dispatch(type, detail = {}) {
    for (const listener of this.listeners.get(type) || [])
      listener({ type, target: this, detail, preventDefault() {}, ...detail });
  }
}

class FakeAudio {
  static instances = [];
  static inUserGesture = false;

  constructor(src) {
    this._src = "";
    this.sourceChanges = 0;
    Object.defineProperty(this, "src", {
      get: () => this._src,
      set: (value) => {
        this._src = value ? String(value) : "";
        this.sourceChanges++;
        this.ended = false;
      },
    });
    this.src = src;
    this.preload = "";
    this.playbackRate = 1;
    this.volume = 1;
    this.currentTime = 0;
    this.duration = 1;
    this.readyState = 3;
    this.paused = true;
    this.ended = false;
    this.error = null;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.loadCalls = 0;
    this.listeners = new Map();
    this.removedListeners = new Map();
    this.unlocked = false;
    this.deferPlay = false;
    this.deferredPlay = null;
    FakeAudio.instances.push(this);
  }

  addEventListener(type, listener) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(listener);
    this.listeners.set(type, callbacks);
  }

  removeEventListener(type, listener) {
    const callbacks = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      callbacks.filter((candidate) => candidate !== listener),
    );
    const removed = this.removedListeners.get(type) || [];
    removed.push(listener);
    this.removedListeners.set(type, removed);
  }

  emit(type) {
    for (const listener of this.listeners.get(type) || [])
      listener({ type, target: this });
  }

  emitStale(type) {
    for (const listener of this.removedListeners.get(type) || [])
      listener({ type, target: this });
  }

  listenerCount(type) {
    return (this.listeners.get(type) || []).length;
  }

  getAttribute(name) {
    return name === "src" && this.src ? this.src : null;
  }

  removeAttribute(name) {
    if (name === "src") this.src = "";
  }

  load() {
    this.loadCalls++;
    this.error = null;
    this.ended = false;
  }

  play() {
    if (!this.unlocked) {
      if (!FakeAudio.inUserGesture) {
        const error = new Error("User gesture required");
        error.name = "NotAllowedError";
        return Promise.reject(error);
      }
      this.unlocked = true;
    }
    this.playCalls++;
    this.paused = false;
    this.ended = false;
    this.emit("play");
    if (this.deferPlay) {
      this.deferPlay = false;
      return new Promise((resolve, reject) => {
        this.deferredPlay = { resolve, reject };
      });
    }
    return Promise.resolve();
  }

  rejectPlay(error = new Error("Playback failed")) {
    this.deferredPlay?.reject(error);
    this.deferredPlay = null;
  }

  pause() {
    this.pauseCalls++;
    if (!this.paused) {
      this.paused = true;
      this.emit("pause");
    }
  }

  finish() {
    this.currentTime = this.duration;
    this.ended = true;
    this.paused = true;
    this.emit("ended");
  }

  fail() {
    this.error = { code: 4 };
    this.emit("error");
  }
}

const course = {
  chapters: [
    { id: "first", title: "First", sectionsCount: 2 },
    { id: "later", title: "Later", sectionsCount: 1, comingSoon: true },
    { id: "second", title: "Second", sectionsCount: 1 },
  ],
};

const chapterData = {
  first: {
    title: "First",
    sections: [
      { id: "first-one", file: "first-one.json" },
      { id: "first-two", file: "first-two.json" },
    ],
    groups: [{ id: "main", title: "Main", sectionIds: ["first-one", "first-two"] }],
  },
  second: {
    title: "Second",
    sections: [{ id: "second-one", file: "second-one.json" }],
    groups: [{ id: "main", title: "Main", sectionIds: ["second-one"] }],
  },
};

const sectionData = {
  "first-one": {
    id: "first-one",
    text: "First one.",
    wordTimings: [],
    audioFile: "first-one.webm",
  },
  "first-two": {
    id: "first-two",
    text: "First two.",
    wordTimings: [],
    audioFile: "first-two.webm",
  },
  "second-one": {
    id: "second-one",
    text: "Second one.",
    wordTimings: [],
    audioFile: "second-one.webm",
  },
};

function jsonResponse(value) {
  return { ok: true, json: async () => value };
}

function createHarness(storageValues = {}) {
  const document = new FakeDocument();
  for (const id of [
    "home",
    "player",
    "btn-home",
    "btn-settings",
    "btn-restart",
    "btn-play",
    "btn-continuous",
    "btn-prev",
    "btn-next",
    "chapter-title",
    "counter",
    "narration",
    "section-menu",
    "rate-popover",
    "codepane",
    "jump-pill",
    "notice",
    "edge-dots",
    "chapter-list",
    "btn-continue",
    "home-badge",
    "mobile-badge",
    "mobile-home",
    "ticker-track",
    "feedback-dialog",
    "feedback-close",
    "feedback-form",
    "feedback-text",
    "feedback-status",
  ])
    document.register(new FakeElement("div", document), id);

  const values = new Map(Object.entries(storageValues));
  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const location = { pathname: "/", search: "" };
  const history = {
    pushState(_state, _title, url) {
      const [pathname, search = ""] = String(url).split("?");
      location.pathname = pathname;
      location.search = search ? `?${search}` : "";
    },
    replaceState(_state, _title, url) {
      const [pathname, search = ""] = String(url).split("?");
      location.pathname = pathname;
      location.search = search ? `?${search}` : "";
    },
  };
  const window = {
    __EFFECT_PLAYER_TEST__: true,
    EffectDemos: { destroy() {} },
    EffectBasicsDemos: { destroy() {} },
    EffectCodeStage: { destroy() {} },
    addEventListener() {},
    removeEventListener() {},
    open() {},
  };
  const fetch = async (url) => {
    if (url === "/content/manifest.json") return jsonResponse(course);
    const match = String(url).match(/^\/content\/([^/]+)\/(.+)$/);
    if (!match) return { ok: false, status: 404, json: async () => ({}) };
    const [chapterId, file] = match.slice(1);
    if (file === "manifest.json" && chapterData[chapterId])
      return jsonResponse(chapterData[chapterId]);
    const section = Object.values(sectionData).find(
      (candidate) => candidate.id === file.replace(/\.json$/, ""),
    );
    return section
      ? jsonResponse(section)
      : { ok: false, status: 404, json: async () => ({}) };
  };

  FakeAudio.instances = [];
  const context = {
    window,
    document,
    localStorage,
    fetch,
    Audio: FakeAudio,
    URLSearchParams,
    history,
    location,
    innerWidth: 1200,
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
    console,
    performance,
    devicePixelRatio: 1,
    AudioContext: class {
      constructor() {
        this.state = "running";
        this.currentTime = 0;
        this.destination = {};
      }

      resume() {}

      createOscillator() {
        return {
          connect() {},
          start() {},
          stop() {},
          frequency: {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
        };
      }

      createGain() {
        return {
          connect() {},
          gain: {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
        };
      }
    },
  };
  vm.createContext(context);
  const source = fs.readFileSync(
    path.join(__dirname, "..", "assets", "player", "app.js"),
    "utf8",
  );
  vm.runInContext(source, context, { filename: "app.js" });
  return {
    api: window.__effectPlayerTest,
    document,
    location,
    localStorage,
    values,
  };
}

function waitForTimers() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

function asUserGesture(callback) {
  FakeAudio.inUserGesture = true;
  try {
    return callback();
  } finally {
    FakeAudio.inUserGesture = false;
  }
}

async function openFirst(harness, index = 0) {
  harness.api.state.course = course;
  await harness.api.openChapter("first", index, { historyMode: "none" });
  assert.equal(harness.api.state.chapterId, "first");
}

async function testToggleIsPersistentAndAccessible() {
  const harness = createHarness();
  const { api, document, localStorage } = harness;
  api.renderContinuousToggle();
  const button = document.getElementById("btn-continuous");
  assert.equal(api.state.continuousPlay, false, "manual mode is the default");
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.match(button.getAttribute("aria-label"), /Continuous play/);
  api.bind();
  button.dispatch("click");
  assert.equal(api.state.continuousPlay, true, "the persistent button is wired");
  button.dispatch("click");
  assert.equal(api.state.continuousPlay, false);
  api.setContinuousPlay(true);
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(localStorage.getItem("effect-clone:continuous-play"), "true");

  const restored = createHarness({
    "effect-clone:continuous-play": "true",
  });
  assert.equal(restored.api.state.continuousPlay, true);
  restored.api.renderContinuousToggle();
  assert.equal(
    restored.document.getElementById("btn-continuous").getAttribute("aria-pressed"),
    "true",
  );
}

async function testSameChapterAdvancesAndBindsNewAudio() {
  const harness = createHarness();
  await openFirst(harness);
  const { api } = harness;
  api.setContinuousPlay(true);
  const firstAudio = api.state.audio;
  asUserGesture(() => api.togglePlay());
  assert.equal(firstAudio.playCalls, 1);
  assert.equal(firstAudio.unlocked, true, "the first user gesture unlocks the media element");
  firstAudio.finish();
  await waitForTimers();
  assert.equal(api.state.index, 1);
  assert.equal(api.state.audio, firstAudio, "the media element is reused");
  assert.equal(api.state.audio.src, "/content/first/first-two.webm");
  assert.equal(api.state.audio.playCalls, 2);
  assert.equal(api.state.audio.paused, false);
  assert.equal(firstAudio.sourceChanges > 2, true, "the unlocked element changes source");
  assert.equal(FakeAudio.instances.length, 1);
  assert.equal(firstAudio.listenerCount("ended"), 1);

  firstAudio.emitStale("ended");
  await waitForTimers();
  assert.equal(
    api.state.index,
    1,
    "an old ended callback cannot move the active section",
  );
}

async function testReusedAudioGuardsStaleSourceCallbacks() {
  const harness = createHarness();
  await openFirst(harness);
  const { api, document } = harness;
  const audio = api.state.audio;
  audio.readyState = 0;
  api.seekTo(0.4);
  const previousGeneration = api.state.audioGeneration;
  assert.equal(api.state.pendingSeek.generation, previousGeneration);

  api.setupAudio(sectionData["first-two"]);
  assert.equal(api.state.audio, audio);
  assert.notEqual(api.state.audioGeneration, previousGeneration);
  assert.equal(api.state.pendingSeek, null);
  audio.readyState = 3;
  audio.currentTime = 0;
  audio.emitStale("loadedmetadata");
  assert.equal(audio.currentTime, 0, "a stale seek callback cannot seek a new source");

  audio.deferPlay = true;
  const pendingPlay = asUserGesture(() => api.playAudio());
  api.setupAudio(sectionData["second-one"]);
  audio.rejectPlay(new Error("source was replaced"));
  await pendingPlay;
  assert.equal(
    document.getElementById("notice").textContent,
    "",
    "a rejected play promise from an old source is ignored",
  );
  for (const type of ["loadedmetadata", "play", "pause", "seeked", "error", "ended"])
    assert.equal(audio.listenerCount(type), 1, `${type} listener is not duplicated`);
  audio.emitStale("ended");
  await waitForTimers();
  assert.equal(api.state.index, 0);
  assert.equal(FakeAudio.instances.length, 1, "all sections reuse one media element");
}

async function testCrossChapterAdvancesAndStopsAtCourseEnd() {
  const harness = createHarness();
  await openFirst(harness, 1);
  const { api } = harness;
  assert.equal(api.nextChapterId("first"), "second", "coming soon chapters are skipped");
  api.setContinuousPlay(true);
  const lastFirstAudio = api.state.audio;
  asUserGesture(() => lastFirstAudio.play());
  lastFirstAudio.finish();
  await waitForTimers();
  assert.equal(api.state.chapterId, "second");
  assert.equal(api.state.index, 0);
  assert.equal(api.state.audio.src, "/content/second/second-one.webm");
  assert.equal(api.state.audio.playCalls, 2);
  assert.equal(api.state.audio.paused, false);

  const finalAudio = api.state.audio;
  finalAudio.finish();
  await waitForTimers();
  assert.equal(api.state.chapterId, "second");
  assert.equal(api.state.index, 0);
  assert.equal(api.state.audio, finalAudio, "course end does not loop");
  assert.equal(finalAudio.paused, true);
  assert.equal(
    api.state.sectionEls[0].bar.classList.contains("hidden"),
    false,
  );
}

async function testDemoScrubsReceiveSeekingFlag() {
  const harness = createHarness();
  await openFirst(harness);
  const { api } = harness;
  let seenOptions;
  api.state.demoEngine = {
    paint(_time, options) {
      seenOptions = options;
    },
  };
  api.paint(0, true);
  assert.equal(seenOptions.seeking, true);
}

async function testPauseAndDisablePreventAutoAdvance() {
  const harness = createHarness();
  await openFirst(harness);
  const { api } = harness;
  api.setContinuousPlay(true);
  const audio = api.state.audio;
  asUserGesture(() => api.togglePlay());
  audio.pause();
  await waitForTimers();
  assert.equal(api.state.index, 0, "pause leaves the current section active");
  assert.equal(audio.paused, true);

  api.setContinuousPlay(false);
  audio.finish();
  await waitForTimers();
  assert.equal(api.state.index, 0, "disabling stops auto-advance");
  assert.equal(api.state.continuousPlay, false);
  assert.equal(
    api.state.sectionEls[0].bar.classList.contains("hidden"),
    false,
  );

  api.setContinuousPlay(true, { userGesture: true });
  await waitForTimers();
  assert.equal(api.state.index, 1, "enabling resumes from a completed section");
  assert.equal(api.state.audio.paused, false);
}

async function testRapidToggleAndHomeCancelPendingTransition() {
  const harness = createHarness();
  await openFirst(harness, 1);
  const { api, document } = harness;
  api.setContinuousPlay(true);
  const audio = api.state.audio;
  asUserGesture(() => audio.play());
  audio.finish();
  api.setContinuousPlay(false);
  await waitForTimers();
  assert.equal(api.state.chapterId, "first");
  assert.equal(api.state.index, 1, "disabling cancels a queued transition");

  api.setContinuousPlay(true);
  const secondAttempt = api.state.audio;
  secondAttempt.finish();
  api.backHome(null, "none");
  await waitForTimers();
  assert.equal(api.state.audio, null, "returning home clears active audio");
  assert.equal(document.getElementById("home").classList.contains("hidden"), false);
}

async function testLoadingErrorCanBeRetriedWithoutStaleAdvance() {
  const harness = createHarness();
  await openFirst(harness);
  const { api } = harness;
  api.setContinuousPlay(true);
  const audio = api.state.audio;
  const loadCallsBeforeRetry = audio.loadCalls;
  audio.fail();
  assert.equal(api.state.index, 0);
  asUserGesture(() => api.togglePlay());
  await waitForTimers();
  assert.equal(audio.loadCalls, loadCallsBeforeRetry + 1);
  assert.equal(audio.playCalls, 1, "play retries the failed narration");
  assert.equal(api.state.index, 0);
}

async function main() {
  await testToggleIsPersistentAndAccessible();
  await testSameChapterAdvancesAndBindsNewAudio();
  await testReusedAudioGuardsStaleSourceCallbacks();
  await testCrossChapterAdvancesAndStopsAtCourseEnd();
  await testDemoScrubsReceiveSeekingFlag();
  await testPauseAndDisablePreventAutoAdvance();
  await testRapidToggleAndHomeCancelPendingTransition();
  await testLoadingErrorCanBeRetriedWithoutStaleAdvance();
  console.log("continuous player tests: 8 passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
