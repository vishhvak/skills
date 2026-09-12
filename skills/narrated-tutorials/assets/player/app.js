// effect.institute — local clone player engine.
//
// Faithfully reproduces the lesson mechanism from the real site's public
// content model:
//   - left column : narration words from `wordTimings`, highlighted karaoke-style
//                   against the audio's currentTime (bold / code-chip / link from
//                   per-word style flags).
//   - right column: a code "slideshow" driven by `slideshowData.frames`, one frame
//                   per `stepTimes` entry. Each frame declares which lines are
//                   visible (`lineOrder`) and a character-range `spotlight` that
//                   keeps the focused code bright while everything else dims.
//   - audio       : the recorded `.webm` narration; HTML5 <audio> + rAF drives both
//                   columns. (The real site uses Tone.js for sample-accuracy.)
//
// All data is served from ./content (mirrored by mirror.py). No build step.

const CONTENT = "/content";
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const LS_RATE = "effect-clone:rate";
const LS_CONTINUOUS = "effect-clone:continuous-play";
const COURSE_STORAGE = window.NARRATED_TUTORIAL_CONFIG?.courseId
  ? `narrated-tutorial:${window.NARRATED_TUTORIAL_CONFIG.courseId}`
  : "effect-clone";
const LS_LAST_CHAPTER = `${COURSE_STORAGE}:lastChapter`;
const lsProgress = (ch) => `${COURSE_STORAGE}:progress:${ch}`;
const lsLast = (ch) => `${COURSE_STORAGE}:last:${ch}`;

const $ = (id) => document.getElementById(id);

function readStoredBoolean(key, fallback = false) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function storeBoolean(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

const state = {
  course: null,
  chapter: null, // chapter manifest
  chapterId: null,
  sections: [], // [{id, file}]
  sectionData: [], // loaded section JSON per index (whole chapter, stacked)
  sectionEls: [], // [{ el, wordEls:[{el,start,end}], bar }] per section
  index: 0,
  section: null, // active section JSON
  audio: null, // HTMLAudioElement
  raf: 0,
  wordEls: [], // active section's [{el, start, end}]
  loadEpoch: 0,
  pendingSeek: null,
  audioGeneration: 0,
  continuousPlay: readStoredBoolean(LS_CONTINUOUS),
  autoAdvanceToken: 0,
  autoAdvanceTimer: null,
  volume: Math.max(
    0,
    Math.min(1, Number(localStorage.getItem("effect-clone:volume") ?? 1)),
  ),
  rate: clampRate(parseFloat(localStorage.getItem(LS_RATE)) || 1),
};

function clampRate(r) {
  return RATES.includes(r) ? r : 1;
}

/* ------------------------------------------------------------------ data */
const cache = new Map();
async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const j = await r.json();
  cache.set(url, j);
  return j;
}

function getProgress(ch) {
  try {
    return new Set(JSON.parse(localStorage.getItem(lsProgress(ch)) || "[]"));
  } catch {
    return new Set();
  }
}
function markDone(ch, sectionId) {
  const s = getProgress(ch);
  s.add(sectionId);
  localStorage.setItem(lsProgress(ch), JSON.stringify([...s]));
}

function invalidateAutoAdvance() {
  state.autoAdvanceToken += 1;
  if (state.autoAdvanceTimer !== null) {
    clearTimeout(state.autoAdvanceTimer);
    state.autoAdvanceTimer = null;
  }
}

function nextChapterId(chapterId = state.chapterId) {
  const chapters = state.course?.chapters || [];
  const current = chapters.findIndex((chapter) => chapter.id === chapterId);
  if (current < 0) return null;
  for (let index = current + 1; index < chapters.length; index++) {
    const chapter = chapters[index];
    if (
      !chapter.draft &&
      !chapter.comingSoon &&
      (chapter.sectionsCount || 0) > 0
    )
      return chapter.id;
  }
  return null;
}

function nextPlaybackTarget() {
  if (state.index < state.sections.length - 1)
    return { kind: "section", index: state.index + 1 };
  const chapterId = nextChapterId();
  return chapterId ? { kind: "chapter", chapterId } : null;
}

function renderContinuousToggle() {
  const button = $("btn-continuous");
  if (!button) return;
  button.setAttribute("aria-pressed", String(state.continuousPlay));
  button.setAttribute(
    "aria-label",
    `Continuous play: ${state.continuousPlay ? "on" : "off"}`,
  );
  button.title = `Continuous play (${state.continuousPlay ? "on" : "off"})`;
  button.classList.toggle("active", state.continuousPlay);
}

/* ------------------------------------------------------------------ home */
async function renderHome() {
  state.course = await getJSON(`${CONTENT}/manifest.json`);

  // Prefetch chapter manifests for playable chapters so each progress dot maps
  // to a real section id (filled by done.has(id)) — same semantics as the
  // in-player section menu — rather than a misleading left-anchored count.
  const manifests = {};
  await Promise.all(
    state.course.chapters
      .filter((c) => (c.sectionsCount || 0) > 0)
      .map((c) =>
        getJSON(`${CONTENT}/${c.id}/manifest.json`)
          .then((m) => {
            manifests[c.id] = m;
          })
          .catch(() => {}),
      ),
  );

  const list = $("chapter-list");
  list.innerHTML = "";

  for (const ch of state.course.chapters.filter((ch) => !ch.draft)) {
    const btn = document.createElement("button");
    btn.className = "chapter";
    const playable = (ch.sectionsCount || 0) > 0;
    btn.disabled = !playable;

    let right;
    if (playable) {
      const ids =
        manifests[ch.id]?.groups?.flatMap((group) => group.sectionIds) || [];
      const done = getProgress(ch.id);
      const total = ids.length || ch.sectionsCount || 1;
      const ndone = ids.length
        ? ids.filter((id) => done.has(id)).length
        : Math.min(done.size, total);
      right =
        (ch.draft ? `<span class="chapter-meta">DRAFT</span>` : "") +
        progressRing(ndone / total);
    } else {
      right = ch.comingSoon
        ? `<span class="chapter-meta later">LATER ${CLOCK_SVG}</span>`
        : `<span class="chapter-meta">${ch.draft ? "DRAFT" : "—"}</span>`;
    }

    btn.innerHTML = `
      <div class="chapter-body">
        <div class="chapter-name">${esc(ch.title)}</div>
        <div class="chapter-desc">${esc(ch.description || "")}</div>
      </div>
      <div class="chapter-right">${right}</div>`;

    if (playable) btn.onclick = () => openChapter(ch.id);
    list.appendChild(btn);
  }

  // CONTINUE → resume the most recently opened chapter (which restores its section)
  const lastCh = localStorage.getItem(LS_LAST_CHAPTER);
  const cont = $("btn-continue");
  const resumable =
    lastCh &&
    state.course.chapters.some(
      (c) => c.id === lastCh && (c.sectionsCount || 0) > 0,
    );
  cont.classList.toggle("hidden", !resumable);
  if (resumable) cont.onclick = () => openChapter(lastCh);
}

const CLOCK_SVG = `<svg class="clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>`;

// Circular progress ring (green arc = fraction complete), like the real home.
function progressRing(frac) {
  const r = 8,
    circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(1, frac)));
  return `<svg class="ring" viewBox="0 0 22 22" width="20" height="20">
    <circle cx="11" cy="11" r="${r}" fill="none" stroke="var(--faint)" stroke-width="1.5"/>
    <circle cx="11" cy="11" r="${r}" fill="none" stroke="var(--green)" stroke-width="1.5"
      stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
      stroke-linecap="round" transform="rotate(-90 11 11)"/>
  </svg>`;
}

/* ---------------------------------------------------------------- chapter */
async function openChapter(
  chapterId,
  startIndex,
  { historyMode = "push", autoPlay = false } = {},
) {
  invalidateAutoAdvance();
  stopAudio();
  state.demoEngine?.destroy?.();
  window.EffectDemos?.destroy();
  window.EffectBasicsDemos?.destroy();
  window.NarratedTutorialScenes?.destroy();
  window.EffectCodeStage?.destroy();
  state.section = null;
  state.sections = [];
  state.sectionData = [];
  state.sectionEls = [];
  state.wordEls = [];
  state.demoEngine = null;
  state.chapter = null;
  $("btn-play").disabled = true;
  $("btn-prev").disabled = true;
  $("btn-next").disabled = true;
  $("counter").textContent = "– / –";
  $("codepane").replaceChildren();
  const loadEpoch = ++state.loadEpoch;
  closeOverlays();
  $("home").classList.add("hidden");
  $("player").classList.remove("hidden");
  $("narration").innerHTML =
    '<div class="load-error" role="status">Loading lesson…</div>';
  try {
    const chapter = await getJSON(`${CONTENT}/${chapterId}/manifest.json`);
    const loaded = await Promise.all(
      chapter.sections.map(async (meta) => ({
        meta,
        data: await getJSON(`${CONTENT}/${chapterId}/${meta.file}`),
      })),
    );
    if (loadEpoch !== state.loadEpoch) return;
    // The public player excludes draft groups and ungrouped draft experiments.
    const liveIds = new Set(
      (chapter.groups || []).flatMap((group) => group.sectionIds),
    );
    const live = loaded.filter(
      ({ meta, data }) => liveIds.has(meta.id) && !data.groupDraft,
    );
    if (live.length === 0) {
      backHome(null, "none");
      history.replaceState({}, "", "/");
      notify("This chapter is coming soon.");
      return;
    }
    state.chapterId = chapterId;
    state.chapter = chapter;
    state.sections = live.map((x) => x.meta);
    state.sectionData = live.map((x) => x.data);
    $("chapter-title").textContent = chapter.title;
    document.title = `${chapter.title} · effect.institute`;
    localStorage.setItem(LS_LAST_CHAPTER, chapterId);
    let idx =
      typeof startIndex === "string"
        ? state.sections.findIndex((x) => x.id === startIndex)
        : startIndex;
    if (idx == null)
      idx = state.sections.findIndex(
        (x) => x.id === localStorage.getItem(lsLast(chapterId)),
      );
    idx = Math.max(0, Math.min(idx, state.sections.length - 1));
    renderChapterNarration();
    setActive(idx, {
      instant: true,
      play: autoPlay && state.continuousPlay,
    });
    const url = `/chapters/${chapterId}?section=${encodeURIComponent(state.sections[idx].id)}`;
    if (historyMode === "push") history.pushState({}, "", url);
    else if (historyMode === "replace") history.replaceState({}, "", url);
  } catch (error) {
    if (loadEpoch !== state.loadEpoch) return;
    $("narration").innerHTML =
      '<div class="load-error" role="alert">This lesson could not load.<button id="retry-lesson">Try again</button></div>';
    $("retry-lesson").onclick = () =>
      openChapter(chapterId, startIndex, {
        historyMode,
        autoPlay: state.continuousPlay,
      });
    $("codepane").innerHTML = "";
    notify("Check that the local server is running, then try again.");
    console.error(error);
  }
}

function backHome(event, historyMode = "push") {
  event?.preventDefault();
  ++state.loadEpoch;
  invalidateAutoAdvance();
  stopAudio();
  state.demoEngine?.destroy?.();
  window.EffectDemos?.destroy();
  window.EffectBasicsDemos?.destroy();
  window.NarratedTutorialScenes?.destroy();
  window.EffectCodeStage?.destroy();
  closeOverlays();
  $("player").classList.add("hidden");
  $("home").classList.remove("hidden");
  document.title = "effect.institute";
  if (historyMode === "push") history.pushState({}, "", "/");
  renderHome().catch(() =>
    notify("The chapters could not load. Refresh to try again."),
  );
}

/* ---- narration (left): one continuous scroll of all sections ---- */
function renderChapterNarration() {
  const root = $("narration");
  root.innerHTML =
    '<div class="narration-spacer"><canvas class="dotgrid" aria-hidden="true"></canvas></div>';
  state.sectionEls = [];
  const groups = state.chapter.groups || [];
  let lastGroupId = null;

  state.sections.forEach((_meta, idx) => {
    const data = state.sectionData[idx];
    if (!data) {
      state.sectionEls.push(null);
      return;
    }

    // group header when entering a new group
    const group = groups.find(
      (g) => g.sectionIds.includes(data.id) || g.id === data.groupId,
    );
    const gid = group?.id ?? data.groupId ?? null;
    if (group && gid !== lastGroupId) {
      const head = document.createElement("div");
      head.className = "section-head";
      const dots = `<span class="dots">${group.sectionIds
        .map((sid) => `<span class="gdot" data-sid="${sid}"></span>`)
        .join("")}</span>`;
      head.innerHTML = `<span class="sh-title">${esc(data.groupTitle || group.title || "")}</span>${dots}`;
      root.appendChild(head);
      lastGroupId = gid;
    }

    const secEl = document.createElement("div");
    secEl.className = "nsection";
    secEl.dataset.idx = idx;
    const wordEls = buildSectionWords(data, secEl, idx);
    secEl.tabIndex = 0;
    secEl.setAttribute(
      "aria-label",
      `Section ${idx + 1}: ${data.text.slice(0, 75)}`,
    );
    secEl.addEventListener("click", () => {
      if (idx !== state.index) setActive(idx, { play: true });
      else togglePlay();
    });
    secEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (idx !== state.index) setActive(idx, { play: true });
        else togglePlay();
      }
    });
    secEl.addEventListener("mouseenter", () => showJumpPill(idx));
    secEl.addEventListener("mouseleave", hideJumpPill);
    secEl.addEventListener("mousemove", (e) => moveJumpPill(e));
    root.appendChild(secEl);

    // "Press SPACE to continue" bar (revealed when this section's audio ends)
    const bar = document.createElement("button");
    bar.className = "continue-bar hidden";
    bar.onclick = () => {
      if (idx < state.sections.length - 1) setActive(idx + 1, { play: true });
      else backHome();
    };
    bar.innerHTML = `Press <span class="key">SPACE</span> to continue`;
    root.appendChild(bar);

    state.sectionEls.push({ el: secEl, wordEls, bar });
  });
  root.insertAdjacentHTML(
    "beforeend",
    '<div class="narration-end" aria-hidden="true"></div>',
  );
  startDotGrids();
  refreshAllDots();
}

function buildSectionWords(data, secEl, sectionIndex) {
  const wordEls = [];
  const hasAudio = !!data.audioFile;
  let para = document.createElement("p");
  para.className = "para";

  const wt = data.wordTimings || [];
  wt.forEach((w, i) => {
    if (w.paragraphBreak && i > 0) {
      secEl.appendChild(para);
      para = document.createElement("p");
      para.className = "para";
    }
    const span = document.createElement("span");
    span.className = "w";
    if (w.style?.bold) span.classList.add("bold");
    if (w.style?.italic) span.classList.add("italic");
    if (w.style?.code) {
      const [, text, punctuation = ""] = w.word.match(/^(.+?)([.,!?;:]+)?$/);
      const chip = document.createElement("span");
      chip.className = "word-chip";
      chip.textContent = text;
      span.append(chip, punctuation);
    } else span.textContent = w.word;

    if (w.link) {
      span.classList.add("link", "clickable");
      span.title = w.link;
      span.onclick = (e) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey) jumpToWord(sectionIndex, w.start);
        else window.open(w.link, "_blank", "noopener,noreferrer");
      };
    } else {
      if (w.definition) {
        span.classList.add("defn");
        span.title = w.definition;
      }
      if (hasAudio && typeof w.start === "number") {
        span.classList.add("clickable");
        span.onclick = (e) => {
          if (e.metaKey || e.ctrlKey) {
            e.stopPropagation();
            jumpToWord(sectionIndex, w.start);
          }
        };
      }
    }
    para.appendChild(span);
    para.appendChild(document.createTextNode(w.suffix ?? " "));
    wordEls.push({ el: span, start: w.start ?? null, end: w.end ?? null });
  });
  secEl.appendChild(para);
  if (wt.length === 0 && data.text) para.textContent = data.text;
  return wordEls;
}

/* Activate a section: highlight it, dim the rest, load its code + audio. */
function setActive(index, opts = {}) {
  if (index < 0 || index >= state.sections.length) return;
  const entry = state.sectionEls[index];
  if (!entry) return;
  invalidateAutoAdvance();
  stopAudio();
  state.index = index;
  state.section = state.sectionData[index];
  state.wordEls = entry.wordEls;
  localStorage.setItem(lsLast(state.chapterId), state.section.id);

  // active / dim styling + reset word state on the active section
  state.sectionEls.forEach((s, i) => {
    if (!s) return;
    s.el.classList.toggle("active", i === index);
    if (s.bar) s.bar.classList.add("hidden");
    if (i === index)
      s.wordEls.forEach(({ el }) => el.classList.remove("spoken", "active"));
  });
  setEdgePulse(false);

  $("btn-play").disabled = false;
  renderCodePane(state.section);
  setupAudio(state.section);

  $("counter").textContent = `${index + 1} / ${state.sections.length}`;
  updateNavButtons();
  refreshAllDots();
  hideJumpPill();

  // bring the section into view
  scrollToSection(index, opts.instant);
  paint(0, true);
  if (location.pathname.startsWith("/chapters/"))
    history.replaceState(
      {},
      "",
      `/chapters/${state.chapterId}?section=${encodeURIComponent(state.section.id)}`,
    );
  if (opts.play) playAudio();
}

/* ---- synchronized demonstration and code stage ---- */
function renderCodePane(data) {
  state.demoEngine?.destroy?.();
  window.EffectDemos?.destroy();
  window.EffectBasicsDemos?.destroy();
  window.NarratedTutorialScenes?.destroy();
  window.EffectCodeStage?.destroy();
  const root = $("codepane");
  root.replaceChildren();
  root.classList.toggle(
    "has-combined",
    !!(data.componentFlow || data.sceneData || data.diagramData) && !!data.slideshowData,
  );
  if (data.diagramData) {
    const demo = document.createElement("div");
    demo.className = "demo-host authored-diagram-host";
    demo.style.cssText = "width:100%;height:100%;min-height:0;background:#000";
    root.append(demo);
    const engine = window.NarratedDiagramHost.create({report: message => notify(message)});
    state.demoEngine = engine;
    engine.mount(demo, data, {
      pause: () => { state.audio?.pause(); engine.stop(); },
      play: () => playAudio(),
      seek: time => seekTo(time),
      getTime: () => state.audio?.currentTime || 0,
      announce: message => notify(message),
    });
  } else if (data.componentFlow || data.sceneData) {
    const demo = document.createElement("div");
    demo.className = "demo-host";
    root.append(demo);
    state.demoEngine = data.sceneData ? window.NarratedTutorialScenes : [
      "KeyboardDiagram",
      "WelcomeControls",
      "WelcomeFeedback",
      "EffectTypeDisplay",
    ].includes(data.componentFlow.name)
      ? window.EffectDemos
      : window.EffectBasicsDemos;
    state.demoEngine?.mount(demo, data);
  } else state.demoEngine = null;
  if (data.slideshowData?.frames?.length) {
    const code = document.createElement("div");
    code.className = "code-host";
    root.append(code);
    window.EffectCodeStage?.mount(code, data);
  }
}

/* ----------------------------------------------------------------- audio */
function showSectionCompletion(data) {
  if (state.section !== data) return;
  const entry = state.sectionEls[state.index];
  if (!entry) return;
  entry.bar.innerHTML =
    state.index < state.sections.length - 1
      ? 'Press <span class="key">SPACE</span> to continue'
      : "Chapter complete <span>✓</span> Back to chapters";
  entry.bar.classList.remove("hidden");
  setEdgePulse(true);
}

let sharedAudio = null;
let audioListeners = null;

function ensureAudioElement() {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
  }
  return sharedAudio;
}

function detachAudioListeners() {
  if (!audioListeners) return;
  for (const [type, listener] of Object.entries(audioListeners.listeners))
    audioListeners.audio.removeEventListener(type, listener);
  audioListeners = null;
}

function isCurrentAudio(audio, generation) {
  return state.audio === audio && state.audioGeneration === generation;
}

function queueAutoAdvance(audio, data) {
  if (state.autoAdvanceTimer !== null)
    clearTimeout(state.autoAdvanceTimer);
  const token = ++state.autoAdvanceToken;
  const generation = state.audioGeneration;
  state.autoAdvanceTimer = setTimeout(() => {
    state.autoAdvanceTimer = null;
    if (
      token !== state.autoAdvanceToken ||
      !state.continuousPlay ||
      state.audio !== audio ||
      state.audioGeneration !== generation ||
      state.section !== data ||
      !audio.ended
    )
      return;

    const target = nextPlaybackTarget();
    if (!target) {
      showSectionCompletion(data);
      playSound("complete");
      return;
    }
    if (target.kind === "section")
      setActive(target.index, { play: true });
    else
      openChapter(target.chapterId, 0, {
        historyMode: "push",
        autoPlay: true,
      });
  }, 0);
}

function setupAudio(data) {
  const audio = ensureAudioElement();
  const generation = ++state.audioGeneration;
  state.audio = null;
  state.pendingSeek = null;
  detachAudioListeners();
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  if (!data.audioFile) {
    setPlayButton(false);
    paint(Infinity, true);
    return;
  }
  audio.src = `${CONTENT}/${state.chapterId}/${data.audioFile}`;
  audio.playbackRate = state.rate;
  audio.volume = state.volume;
  state.audio = audio;
  setPlayButton(false);
  const current = () => isCurrentAudio(audio, generation);
  const listeners = {
    loadedmetadata: () => {
      if (
        !current() ||
        state.pendingSeek?.audio !== audio ||
        state.pendingSeek?.generation !== generation
      )
        return;
      const time = state.pendingSeek.time;
      state.pendingSeek = null;
      audio.currentTime = Math.min(
        time,
        Number.isFinite(audio.duration) ? audio.duration : time,
      );
      paint(audio.currentTime, true);
    },
    play: () => {
      if (current()) {
        setPlayButton(true);
        setEdgePulse(false);
        tick();
      }
    },
    pause: () => {
      if (current()) {
        if (audio.ended) invalidateAutoAdvance();
        setPlayButton(false);
        cancelAnimationFrame(state.raf);
        state.demoEngine?.stop?.();
        paint(audio.currentTime);
      }
    },
    seeked: () => {
      if (current()) paint(audio.currentTime, true);
    },
    error: () => {
      if (current() && audio.getAttribute("src")) {
        invalidateAutoAdvance();
        setPlayButton(false);
        notify("The narration could not load. Press play to retry.");
      }
    },
    ended: () => {
      if (!current()) return;
      setPlayButton(false);
      cancelAnimationFrame(state.raf);
      markDone(state.chapterId, data.id);
      refreshAllDots();
      paint(audio.duration || Infinity);
      if (state.continuousPlay && nextPlaybackTarget()) {
        setEdgePulse(false);
        queueAutoAdvance(audio, data);
      } else {
        showSectionCompletion(data);
        playSound("complete");
      }
    },
  };
  audioListeners = { audio, generation, listeners };
  for (const [type, listener] of Object.entries(listeners))
    audio.addEventListener(type, listener);
  audio.load();
}

function setPlayButton(playing) {
  $("btn-play").innerHTML = icon(playing ? "pause" : "play");
  $("btn-play").setAttribute("aria-label", playing ? "Pause" : "Play");
  $("btn-play").title = `${playing ? "Pause" : "Play"} (Space)`;
  $("player").classList.toggle("playing", playing);
}
function stopAudio() {
  state.demoEngine?.stop?.();
  invalidateAutoAdvance();
  cancelAnimationFrame(state.raf);
  const audio = state.audio || sharedAudio;
  state.audio = null;
  state.audioGeneration += 1;
  state.pendingSeek = null;
  detachAudioListeners();
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  setPlayButton(false);
}

function setContinuousPlay(enabled, { userGesture = false } = {}) {
  const next = Boolean(enabled);
  const changed = state.continuousPlay !== next;
  state.continuousPlay = next;
  storeBoolean(LS_CONTINUOUS, next);
  renderContinuousToggle();
  invalidateAutoAdvance();

  if (!next) {
    if (state.audio?.ended && state.section) showSectionCompletion(state.section);
    return;
  }
  if (!userGesture || !changed) return;

  const audio = state.audio;
  if (!audio) return;
  if (audio.ended) {
    const target = nextPlaybackTarget();
    if (target) {
      setEdgePulse(false);
      queueAutoAdvance(audio, state.section);
    } else showSectionCompletion(state.section);
  } else if (audio.paused) {
    playAudio();
  }
}

function toggleContinuousPlay() {
  setContinuousPlay(!state.continuousPlay, { userGesture: true });
  playSound("tick");
}

async function playAudio() {
  const audio = state.audio;
  if (!audio) return;
  const generation = state.audioGeneration;
  try {
    if (isCurrentAudio(audio, generation) && audio.error) audio.load();
    await audio.play();
  } catch (error) {
    if (isCurrentAudio(audio, generation) && error.name !== "AbortError")
      notify("Playback could not start. Press play to retry.");
  }
}
function togglePlay() {
  const audio = state.audio;
  if (!audio) {
    if (state.index < state.sections.length - 1)
      setActive(state.index + 1, { play: true });
    return;
  }
  if (audio.ended) {
    if (state.index < state.sections.length - 1) {
      setActive(state.index + 1, { play: true });
      return;
    }
    seekTo(0);
  }
  if (audio.paused) playAudio();
  else audio.pause();
}
function seekTo(time) {
  if (!state.audio) return;
  state.demoEngine?.stop?.();
  invalidateAutoAdvance();
  const end = Number.isFinite(state.audio.duration)
    ? state.audio.duration
    : Infinity;
  const target = Math.max(0, Math.min(time, end));
  if (state.audio.readyState === 0)
    state.pendingSeek = {
      audio: state.audio,
      generation: state.audioGeneration,
      time: target,
    };
  else state.audio.currentTime = target;
  state.sectionEls[state.index]?.bar.classList.add("hidden");
  setEdgePulse(false);
  paint(target, true);
}
function jumpToWord(index, time) {
  if (index !== state.index) setActive(index);
  seekTo(Math.max(0, time - 0.05));
  playAudio();
}
function seekBy(delta) {
  if (state.audio) {
    seekTo(state.audio.currentTime + delta);
    playSound("tick");
  }
}
function restart() {
  if (state.audio) {
    state.demoEngine?.reset?.();
    seekTo(0);
    playAudio();
    playSound("tick");
  }
}
function tick() {
  cancelAnimationFrame(state.raf);
  const loop = () => {
    if (!state.audio || state.audio.paused) return;
    paint(state.audio.currentTime);
    state.raf = requestAnimationFrame(loop);
  };
  state.raf = requestAnimationFrame(loop);
}
function paint(time, seeking = false) {
  if (!state.section) return;
  const playing = !!state.audio && !state.audio.paused;
  for (const [index, word] of state.wordEls.entries()) {
    if (word.start == null) continue;
    const active =
      time >= word.start - 0.18 &&
      time <= word.end &&
      !(index === 0 && time < 0.1);
    word.el.classList.toggle("spoken", time > word.end);
    word.el.classList.toggle("active", active);
  }
  state.demoEngine?.paint(time, {
    playing,
    seeking,
    rate: state.rate,
    onDemoRate: (rate) => {
      if (state.audio) state.audio.playbackRate = rate ?? state.rate;
    },
  });
  if (state.section.slideshowData)
    window.EffectCodeStage?.paint(time, { playing, seeking });
}
function scrollToSection(index, instant = false) {
  const root = $("narration"),
    entry = state.sectionEls[index];
  if (!entry) return;
  const target =
    entry.el.offsetTop +
    entry.el.offsetHeight / 2 -
    (root.clientHeight / 2 + 32);
  root.scrollTo({
    top: Math.max(0, target),
    behavior:
      instant || matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
  });
}

/* ------------------------------------------------------------- navigation */
function next() {
  if (state.index < state.sections.length - 1) {
    setActive(state.index + 1, { play: !!state.audio && !state.audio.paused });
    playSound("tick");
  }
}
function prev() {
  if (state.index > 0) {
    setActive(state.index - 1, { play: !!state.audio && !state.audio.paused });
    playSound("tick");
  }
}

function updateNavButtons() {
  $("btn-prev").disabled = state.index === 0;
  $("btn-next").disabled = state.index === state.sections.length - 1;
}

// update every group's progress dots from saved progress + the active section
function refreshAllDots() {
  const done = getProgress(state.chapterId);
  document.querySelectorAll(".section-head .gdot").forEach((d) => {
    const sid = d.dataset.sid;
    d.classList.toggle("done", done.has(sid));
    d.classList.toggle("cur", sid === state.section?.id);
  });
}

function setEdgePulse(on) {
  $("edge-dots")?.classList.toggle("on", on);
}

/* The cursor label describes the action at the hovered section. */
function showJumpPill(idx) {
  const pill = $("jump-pill");
  pill.dataset.section = String(idx);
  pill.textContent =
    idx === state.index
      ? state.audio?.paused
        ? "▶ Play"
        : "Ⅱ Pause"
      : "↗ Jump";
  pill.classList.remove("hidden");
}
function moveJumpPill(e) {
  const pill = $("jump-pill");
  if (pill.classList.contains("hidden")) return;
  pill.textContent =
    e.metaKey || e.ctrlKey || Number(pill.dataset.section) !== state.index
      ? "↗ Jump"
      : state.audio?.paused
        ? "▶ Play"
        : "Ⅱ Pause";
  pill.style.left = `${e.clientX + 14}px`;
  pill.style.top = `${e.clientY - 8}px`;
}
function hideJumpPill() {
  $("jump-pill").classList.add("hidden");
}

/* -------------------------------------------------------------- navigation menus */
function closeOverlays() {
  const restore = document.activeElement?.closest("#section-menu")
    ? $("chapter-title")
    : document.activeElement?.closest("#rate-popover")
      ? $("btn-settings")
      : null;
  $("section-menu").classList.add("hidden");
  $("rate-popover").classList.add("hidden");
  $("chapter-title").setAttribute("aria-expanded", "false");
  $("btn-settings").setAttribute("aria-expanded", "false");
  restore?.focus();
}
function toggleSectionMenu() {
  const opening = $("section-menu").classList.contains("hidden");
  closeOverlays();
  if (!opening || !state.chapter) return;
  const done = getProgress(state.chapterId);
  $("section-menu").innerHTML = state.chapter.groups
    .map(
      (group) =>
        `<button class="smenu-group ${group.sectionIds.includes(state.section.id) ? "current" : ""}" data-section="${esc(group.sectionIds[0])}"><span>${esc(group.title)}</span><span class="dots">${group.sectionIds.map((id) => `<span class="gdot${done.has(id) ? " done" : ""}"></span>`).join("")}</span></button>`,
    )
    .join("");
  $("section-menu")
    .querySelectorAll("button")
    .forEach(
      (button) =>
        (button.onclick = () => {
          const index = state.sections.findIndex(
            (section) => section.id === button.dataset.section,
          );
          closeOverlays();
          if (index >= 0)
            setActive(index, { play: !!state.audio && !state.audio.paused });
        }),
    );
  $("section-menu").classList.remove("hidden");
  $("chapter-title").setAttribute("aria-expanded", "true");
}
function toggleRatePopover() {
  const opening = $("rate-popover").classList.contains("hidden");
  closeOverlays();
  if (!opening) return;
  const pop = $("rate-popover");
  pop.innerHTML = `<button class="setting-item" id="speed-toggle" aria-expanded="false">${icon("speed")} Speed <span class="setting-value">${state.rate}× ›</span></button><div id="speed-options" class="speed-options hidden">${RATES.map((rate) => `<button class="rate-opt${rate === state.rate ? " active" : ""}" data-rate="${rate}" aria-pressed="${rate === state.rate}">${rate}×</button>`).join("")}</div><hr><label class="volume-row">Volume<input id="volume" type="range" aria-label="Volume" min="0" max="1" step="0.01" value="${state.volume}"></label><hr><button class="setting-item" id="open-feedback">${icon("feedback")} Feedback</button><a class="setting-item" href="https://discord.com/channels/795981131316985866/1449050466464956416" target="_blank" rel="noopener noreferrer">${icon("chat")} Discord</a>`;
  $("speed-toggle").onclick = () => {
    const shown = $("speed-options").classList.toggle("hidden");
    $("speed-toggle").setAttribute("aria-expanded", String(!shown));
  };
  pop.querySelectorAll("[data-rate]").forEach(
    (button) =>
      (button.onclick = () => {
        state.rate = Number(button.dataset.rate);
        localStorage.setItem(LS_RATE, String(state.rate));
        if (state.audio) state.audio.playbackRate = state.rate;
        closeOverlays();
        playSound("tick");
      }),
  );
  $("volume").oninput = (event) => {
    state.volume = Number(event.target.value);
    localStorage.setItem("effect-clone:volume", String(state.volume));
    if (state.audio) state.audio.volume = state.volume;
  };
  $("open-feedback").onclick = () => {
    closeOverlays();
    state.audio?.pause();
    $("feedback-dialog").showModal();
    $("feedback-text").focus();
  };
  pop.classList.remove("hidden");
  $("btn-settings").setAttribute("aria-expanded", "true");
}

/* -------------------------------------------------------------- visual vocabulary */
const ICON_PATHS = {
  home: '<path d="M3 10 12 3l9 7v11h-6v-7H9v7H3Z" fill="currentColor" stroke="none"/>',
  play: '<path d="m7 4 13 8L7 20Z" fill="currentColor" stroke="none"/>',
  pause:
    '<path d="M6 4h4v16H6zm8 0h4v16h-4z" fill="currentColor" stroke="none"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 9M4 4v6h6"/>',
  up: '<path d="m5 11 7-7 7 7M12 4v16"/>',
  down: '<path d="m5 13 7 7 7-7M12 4v16"/>',
  settings:
    '<path d="M5 3v18M12 3v18M19 3v18"/><path d="M3 8h4M10 16h4M17 10h4" stroke-width="4"/>',
  speed: '<path d="M3 18v-3a9 9 0 0 1 18 0v3ZM12 15l5-7"/>',
  feedback:
    '<path d="M3 4h18v13h-6l-3 4-3-4H3Z"/><path d="M7 10h.01M12 10h.01M17 10h.01" stroke-width="3"/>',
  chat: '<path d="M4 6 2 18l5-2 5 2 5-2 5 2-2-12-5-2-3 2-3-2Z"/><path d="M8 11v2m8-2v2"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.play}</svg>`;
}
function esc(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
window.effectBadgeMarkup = (activeWord = -1, flowingGlow = false) => {
  const chars = Array.from("EFFECT INSTITUTE → EFFECT INSTITUTE → ");
  return `<div class="effect-badge" aria-hidden="true"><div class="badge-letter-ring">${chars
    .map((char, index) => {
      const wordIndex = index % 19 < 6 ? 3 : index % 19 < 16 ? 4 : -1;
      return `<span class="badge-letter${activeWord >= 0 && activeWord === wordIndex ? " lit" : ""}${flowingGlow ? " flow" : ""}" data-word="${wordIndex}" style="transform:translate(-50%,-50%) rotate(${(index / chars.length) * 360}deg) translateY(-92px);animation-delay:${(index / chars.length - 1) * 8}s">${char === " " ? "&nbsp;" : char}</span>`;
    })
    .join(
      "",
    )}</div><svg class="badge-ripples" viewBox="0 0 200 200">${[0, 1, 2, 3].map((i) => `<circle class="ripple" cx="100" cy="100" r="4" style="animation-delay:${i * 0.75 - 3}s"/>`).join("")}<circle cx="100" cy="100" r="4" fill="#ffffffcc"/></svg></div>`;
};
let gridFrame = 0;
function startDotGrids() {
  cancelAnimationFrame(gridFrame);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastDraw = -Infinity;
  const draw = (time) => {
    if (!reduced && (document.hidden || time - lastDraw < 50)) {
      gridFrame = requestAnimationFrame(draw);
      return;
    }
    lastDraw = time;
    document.querySelectorAll("canvas.dotgrid").forEach((canvas) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = devicePixelRatio || 1;
      if (
        canvas.width !== Math.round(rect.width * dpr) ||
        canvas.height !== Math.round(rect.height * dpr)
      ) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (let y = 9; y < rect.height; y += 18)
        for (let x = 9; x < rect.width; x += 18) {
          const wave =
            (Math.sin(x * 0.018 + y * 0.021 - time * 0.00065) + 1) / 2;
          const fade = Math.min(
            1,
            Math.hypot(x - rect.width / 2, y - rect.height / 2) / 140,
          );
          ctx.fillStyle = `rgba(135,135,135,${(0.07 + wave * 0.09) * fade})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
    });
    if (!reduced) gridFrame = requestAnimationFrame(draw);
  };
  draw(0);
}
let soundContext;
function playSound(name = "tick") {
  if (state.volume === 0) return;
  try {
    soundContext ||= new AudioContext();
    if (soundContext.state === "suspended") soundContext.resume();
    const oscillator = soundContext.createOscillator(),
      gain = soundContext.createGain(),
      now = soundContext.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(name === "complete" ? 880 : 480, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      name === "complete" ? 1320 : 240,
      now + 0.06,
    );
    gain.gain.setValueAtTime(0.035 * state.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    oscillator.connect(gain);
    gain.connect(soundContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  } catch {}
}
let noticeTimer;
function notify(text) {
  $("notice").textContent = text;
  $("notice").classList.remove("hidden");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $("notice").classList.add("hidden"), 4000);
}

/* -------------------------------------------------------------- application */
function bind() {
  for (const [id, name] of Object.entries({
    "btn-home": "home",
    "btn-settings": "settings",
    "btn-restart": "restart",
    "btn-play": "play",
    "btn-prev": "up",
    "btn-next": "down",
  }))
    $(id).innerHTML = icon(name);
  $("btn-home").onclick = backHome;
  $("btn-play").onclick = togglePlay;
  $("btn-continuous").onclick = toggleContinuousPlay;
  renderContinuousToggle();
  $("btn-restart").onclick = restart;
  $("btn-next").onclick = next;
  $("btn-prev").onclick = prev;
  $("chapter-title").onclick = toggleSectionMenu;
  $("btn-settings").onclick = toggleRatePopover;
  $("home-badge").innerHTML = window.effectBadgeMarkup(-1, true);
  $("mobile-badge").innerHTML = window.effectBadgeMarkup(-1, true);
  $("mobile-home").onclick = backHome;
  const feedback = [
    [52, "Love the UI overall!"],
    [13, "Attention to detail is off the chart 🤌"],
    [30, "Mesmerizing way of running a tutorial."],
    [32, "I really like the narration and autoplay features."],
    [62, "Magical"],
    [11, "This kind of teaching is awesome ! Kept me engaged throughout !"],
    [15, "Amazing UX. I want a course on this."],
    [25, "Great work Kit!"],
  ];
  const ticker = feedback
    .map(
      ([id, text]) =>
        `<span class="ticker-item"><b>Feedback No. ${id}</b>${esc(text)}</span><span class="ticker-separator">■</span>`,
    )
    .join("");
  $("ticker-track").innerHTML = ticker + ticker;
  document
    .querySelectorAll(".footer-links")
    .forEach(
      (el) =>
        (el.innerHTML =
          '<a href="https://www.effect.institute/changelog" target="_blank" rel="noopener noreferrer"><span class="footer-icon">⑂</span>CHANGELOG</a><a href="https://discord.com/channels/795981131316985866/1449050466464956416" target="_blank" rel="noopener noreferrer"><span class="footer-icon">♟</span>DISCORD</a><a href="https://x.com/kitlangton" target="_blank" rel="noopener noreferrer"><span class="footer-icon">♥</span>KIT</a>'),
    );
  document
    .querySelectorAll(".user-button")
    .forEach(
      (button) =>
        (button.onclick = () =>
          notify("Your lesson progress is saved on this device.")),
    );
  $("feedback-close").onclick = () => $("feedback-dialog").close();
  $("feedback-dialog").addEventListener("close", () =>
    $("btn-settings").focus(),
  );
  $("feedback-form").onsubmit = (event) => {
    event.preventDefault();
    const text = $("feedback-text").value.trim();
    if (!text) {
      $("feedback-status").textContent = "Write your feedback before saving.";
      $("feedback-text").focus();
      return;
    }
    try {
      const saved = JSON.parse(
        localStorage.getItem("effect-clone:feedback") || "[]",
      );
      saved.push({
        chapter: state.chapterId,
        section: state.section?.id,
        text,
        date: new Date().toISOString(),
      });
      localStorage.setItem("effect-clone:feedback", JSON.stringify(saved));
      $("feedback-dialog").close();
      $("feedback-text").value = "";
      notify("Feedback saved on this device.");
    } catch {
      $("feedback-status").textContent =
        "Feedback could not be saved. Please copy your message.";
    }
  };
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey) document.body.classList.add("cmd-held");
    if (
      innerWidth < 768 ||
      $("player").classList.contains("hidden") ||
      $("feedback-dialog").open ||
      event.target.closest('input,textarea,select,[contenteditable="true"]')
    )
      return;
    if (event.key === "Escape") {
      closeOverlays();
      return;
    }
    if (
      event.target.closest("#rate-popover,#section-menu") ||
      event.altKey ||
      event.metaKey ||
      event.ctrlKey
    )
      return;
    if (event.key === " " && event.target.closest("button,a")) return;
    switch (event.key) {
      case " ":
        event.preventDefault();
        togglePlay();
        break;
      case "ArrowDown":
        event.preventDefault();
        next();
        break;
      case "ArrowUp":
        event.preventDefault();
        prev();
        break;
      case "ArrowLeft":
        event.preventDefault();
        seekBy(-2);
        break;
      case "ArrowRight":
        event.preventDefault();
        seekBy(2);
        break;
      case "r":
      case "R":
        event.preventDefault();
        restart();
        break;
    }
  });
  document.addEventListener("keyup", (event) => {
    if (!event.metaKey && !event.ctrlKey)
      document.body.classList.remove("cmd-held");
  });
  window.addEventListener("blur", () =>
    document.body.classList.remove("cmd-held"),
  );
  document.addEventListener("click", (event) => {
    if (
      !event.target.closest(
        "#section-menu,#chapter-title,#rate-popover,#btn-settings",
      )
    )
      closeOverlays();
  });
  document.addEventListener("effect-demo-action", (event) => {
    const action = event.detail?.action || event.detail;
    ({
      play: togglePlay,
      prev: prev,
      next: next,
      restart: restart,
      "seek-left": () => seekBy(-2),
      "seek-right": () => seekBy(2),
    })[action]?.();
  });
  document.addEventListener("effect-sound", (event) => {
    if (state.audio && !state.audio.paused) playSound(event.detail?.name);
  });
  window.addEventListener("popstate", route);
  window.addEventListener("resize", () => {
    if (innerWidth < 768) state.audio?.pause();
    startDotGrids();
    if (state.section && !$("player").classList.contains("hidden"))
      scrollToSection(state.index, true);
  });
  startDotGrids();
}
function route() {
  const match = location.pathname.match(/^\/chapters\/([^/]+)\/?$/);
  if (match)
    openChapter(
      decodeURIComponent(match[1]),
      new URLSearchParams(location.search).get("section") || undefined,
      { historyMode: "replace" },
    );
  else backHome(null, "none");
}

const testAPI = {
  state,
  backHome,
  bind,
  next,
  nextChapterId,
  nextPlaybackTarget,
  openChapter,
  paint,
  playAudio,
  prev,
  queueAutoAdvance,
  renderContinuousToggle,
  restart,
  setActive,
  setContinuousPlay,
  seekTo,
  setupAudio,
  stopAudio,
  toggleContinuousPlay,
  togglePlay,
};

if (typeof window !== "undefined" && window.__EFFECT_PLAYER_TEST__) {
  window.__effectPlayerTest = testAPI;
} else {
  bind();
  renderHome()
    .then(() => {
      if (location.pathname.startsWith("/chapters/")) route();
    })
    .catch(() => {
      $("chapter-list").innerHTML =
        '<div class="load-error" role="alert">The chapters could not load. Check the local server and refresh.</div>';
    });
}
