import {createSoundEvents} from '../sound-events.js';

export const meta = {
  id: "models",
  title: "Live model table",
  description: "A live model catalog reorders, updates prices, and keeps provider choices in view.",
  duration: 60.416,
  viewBox: [1024, 605],
  capabilities: ["interactive", "scrubbable", "keyboard-accessible", "scrollable", "deterministic"],
};

const NS = "http://www.w3.org/2000/svg";
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const smooth = (n) => {
  const x = clamp(n);
  return x * x * (3 - 2 * x);
};
const enter = (time, at, duration = 0.65) => smooth((time - at) / duration);
const leave = (time, at, duration = 0.65) => 1 - enter(time, at, duration);

const PROVIDERS = [
  {
    name: "OPENAI",
    rows: [
      ["gpt6", "GPT-6 Astra", "1.05M", "128K", "10", "50"],
      ["gpt56", "GPT-5.6", "1.05M", "128K", "4", "20"],
      ["gpt4o", "GPT-4o", "128K", "16.38K", "2.5", "10"],
      ["gpt55", "GPT-5.5", "1.05M", "128K", "5", "30"],
    ],
  },
  {
    name: "ANTHROPIC",
    rows: [
      ["fable", "Claude Fable 5.1", "1M", "128K", "10", "50"],
      ["opus", "Claude Opus 5", "1M", "128K", "5", "25"],
      ["sonnet", "Claude Sonnet 4.6", "1M", "128K", "3", "15"],
      ["haiku", "Claude Haiku 4.5", "200K", "64K", "1", "5"],
    ],
  },
  {
    name: "DEEPSEEK",
    rows: [
      ["v4pro", "DeepSeek V4 Pro", "1M", "384K", ".35", ".7"],
      ["v4flash", "DeepSeek V4 Flash", "1M", "384K", ".14", ".28"],
    ],
  },
  {
    name: "GOOGLE",
    rows: [
      ["gempro", "Gemini 2.5 Pro", "1.05M", "65.54K", "1.25", "10"],
      ["gemflash", "Gemini 2.5 Flash", "1.05M", "65.54K", ".3", "2.5"],
      ["gemlite", "Gemini 2.5 Flash-Lite", "1.05M", "65.54K", ".1", ".4"],
    ],
  },
  {
    name: "MISTRAL",
    rows: [["mistral", "Mistral Large", "262.14K", "262.14K", ".5", "1.5"]],
  },
];
const ROW_IDS = PROVIDERS.flatMap((provider) => provider.rows.map(([id]) => id));

const AUTO_SCROLL = [
  [0, 0], [15, 0], [16.5, 170], [20, 249], [44, 249], [47, 0], [60.416, 0],
];

function interpolateScroll(time) {
  for (let i = 1; i < AUTO_SCROLL.length; i += 1) {
    const [endTime, endValue] = AUTO_SCROLL[i];
    if (time <= endTime) {
      const [startTime, startValue] = AUTO_SCROLL[i - 1];
      const p = smooth((time - startTime) / (endTime - startTime));
      return startValue + (endValue - startValue) * p;
    }
  }
  return 0;
}

function presence(id, time) {
  if (id === "gpt6") {
    if (time < 8.4) return enter(time, 1.25, 0.7);
    if (time < 54.15) return leave(time, 8.4, 0.7);
    if (time < 57.8) return enter(time, 54.15, 0.7);
    return leave(time, 57.8, 0.7);
  }
  if (id === "gpt56" || id === "gpt55") return time < 8.4 ? 1 : time < 52.1 ? leave(time, 8.4, 0.7) : enter(time, 52.1, 0.7);
  if (id === "gpt4o") return time < 3.35 ? 1 : time < 56.3 ? leave(time, 3.35, 0.7) : enter(time, 56.3, 0.7);
  if (id === "fable") return time < 14.35 ? enter(time, 11.45, 0.75) : leave(time, 14.35, 0.75);
  if (id === "mistral") return time < 44.2 ? enter(time, 18.4, 0.8) : leave(time, 44.2, 0.8);
  if (id === "gempro") return time < 43.2 ? 1 : leave(time, 43.2, 0.8);
  if (id === "gemlite") return time < 20.7 ? enter(time, 16.25, 0.75) : leave(time, 20.7, 0.8);
  return 1;
}

function prices(id, time, burst = 0) {
  if (id === "gpt56") return (time >= 4.7 && time < 52.1) || burst > 0.58 ? ["3", "15"] : ["4", "20"];
  if (id === "opus") {
    return (time >= 9 && time < 49.2) || burst > 0.7 ? ["4", "20"] : ["5", "25"];
  }
  if (id === "v4pro") return ((time >= 9.3 && time < 12) || time >= 49.2 || burst > 0.76) ? [".435", ".87"] : [".35", ".7"];
  if (id === "v4flash") return (time >= 27 && time < 30.2) || burst > 0.64 ? [".1", ".2"] : [".14", ".28"];
  if (id === "gemflash") return time >= 19.1 && time < 41 ? [".2", "2"] : [".3", "2.5"];
  if (id === "mistral") return time >= 24.2 && time < 36.2 ? [".4", "1.2"] : [".5", "1.5"];
  return null;
}

const UPDATE_WINDOWS = {
  gpt4o: [1.7, 3.5],
  gpt55: [3.55, 4.55],
  gpt56: [0.45, 1.35, 4.55, 5.55],
  gpt6: [54.45, 57.9],
  v4pro: [9.35, 10.65, 44.4, 45.5],
  v4flash: [26.1, 27.35],
  gempro: [15.45, 16.45, 30.45, 31.55, 41.45, 42.55],
  gemflash: [16.45, 17.55, 20.15, 21, 38.45, 39.55],
  gemlite: [18.4, 20.35],
  mistral: [24.4, 25.55, 33.4, 34.55, 36.45, 37.55],
  opus: [46.4, 47.55],
};

function updatePhase(id, time, burst = 0) {
  if (burst > 0 && ["gpt56", "opus", "v4flash"].includes(id)) {
    const delay = id === "gpt56" ? 0 : id === "opus" ? 0.12 : 0.24;
    return clamp((burst - delay) / 0.64);
  }

  const windows = UPDATE_WINDOWS[id] || [];
  for (let index = 0; index < windows.length; index += 2) {
    const start = windows[index];
    const end = windows[index + 1];
    if (time >= start && time <= end) return clamp((time - start) / (end - start));
  }
  return -1;
}

function effectStrength(phase) {
  if (phase < 0 || phase > 1) return 0;
  const attack = smooth(phase / 0.14);
  const release = 1 - smooth((phase - 0.7) / 0.3);
  return clamp(Math.min(attack, release));
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function mount(host, context = {}) {
  const sounds = createSoundEvents(event => context.sound?.(event));
  host.replaceChildren();
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 1024 605");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-labelledby", "models-title models-desc");
  svg.classList.add("models-scene");
  svg.innerHTML = `
    <title id="models-title">Live model table</title>
    <desc id="models-desc">A scrollable table of language models whose rows and prices update over time.</desc>
    <style>
      .models-scene { display:block; background:transparent; font-family:"Commit Mono","CommitMono",ui-monospace,monospace; }
      .table-shell { fill:#030303; stroke:#353535; stroke-width:1; }
      .header-bg { fill:#121212; }
      .rule { stroke:#202020; stroke-width:1; }
      .head { fill:#8a8a8a; font-size:14px; letter-spacing:.25px; }
      .provider { fill:#666; font-size:12px; letter-spacing:1.25px; }
      .provider-row { pointer-events:all; }
      .provider-bg { fill:#030303; }
      .model { fill:#c9c9c9; font-size:18px; }
      .datum { fill:#999; font-size:17px; }
      .row { cursor:pointer; outline:none; }
      .row[aria-hidden="true"] { pointer-events:none; }
      .row:hover .model,.row:focus-visible .model { fill:#fff; }
      .row.updating .model,.row.updating .datum { fill:url(#models-text-sheen); }
      .glitch-line-red { stroke:#f03a35; stroke-width:1; }
      .glitch-line-cyan { stroke:#20c9d2; stroke-width:1; }
      .toggle { fill:#111; stroke:#555; stroke-width:1; }
      .toggle-knob { fill:#666; }
      .row.on .toggle { stroke:#888; }
      .row.on .toggle-knob { fill:#bdbdbd; }
      .refresh { cursor:pointer; outline:none; }
      .refresh circle { fill:transparent; stroke:transparent; stroke-width:1; }
      .refresh path { fill:none; stroke:#868686; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.5; }
      .refresh:hover path,.refresh:focus-visible path { stroke:#d8d8d8; }
      .status-check { fill:none; stroke:#8f8f8f; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.7; }
      .scroll-thumb { fill:#333; }
      @media (prefers-reduced-motion: reduce) { .row-visuals { filter:none !important; } }
    </style>
    <defs>
      <clipPath id="models-clip"><rect x="63" y="122" width="898" height="423"/></clipPath>
      <linearGradient id="models-text-sheen" x1="-58%" y1="0%" x2="-14%" y2="0%">
        <stop offset="0" stop-color="#dfdfdd"/><stop offset=".43" stop-color="#e8e8e6"/>
        <stop offset=".5" stop-color="#efefed"/><stop offset=".57" stop-color="#d6d6d4"/>
        <stop offset="1" stop-color="#dfdfdd"/>
      </linearGradient>
      <filter id="models-row-distortion" x="-4%" y="-30%" width="108%" height="160%" color-interpolation-filters="sRGB">
        <feTurbulence id="models-noise" type="fractalNoise" baseFrequency=".004 .12" numOctaves="1" seed="7" result="noise"/>
        <feDisplacementMap id="models-displace" in="SourceGraphic" in2="noise" scale="2.6" xChannelSelector="R" yChannelSelector="B" result="warped"/>
        <feOffset in="warped" dx="-.8" result="red-offset"/>
        <feColorMatrix in="red-offset" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0" result="red"/>
        <feOffset in="warped" dx=".8" result="cyan-offset"/>
        <feColorMatrix in="cyan-offset" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .55 0" result="cyan"/>
        <feBlend in="red" in2="cyan" mode="screen" result="channels"/>
        <feMerge><feMergeNode in="channels"/><feMergeNode in="warped"/></feMerge>
      </filter>
      <filter id="models-row-slice" x="-3%" y="-20%" width="106%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency=".004 .2" numOctaves="1" seed="5" result="slice-noise"/>
        <feDisplacementMap in="SourceGraphic" in2="slice-noise" scale="3" xChannelSelector="R" yChannelSelector="B"/>
      </filter>
    </defs>
    <rect width="1024" height="605" fill="#030303"/>
    <rect class="table-shell" x="62" y="70" width="900" height="476" rx="4"/>
    <rect class="header-bg" x="63" y="71" width="898" height="51" rx="3"/>
    <line class="rule" x1="62" y1="122" x2="962" y2="122"/>
    <text class="head" x="92" y="102">Model</text>
    <text class="head" x="568" y="102">Context</text>
    <text class="head" x="680" y="102">Output</text>
    <text class="head" x="846" y="102">Cost</text>
    <g id="refresh" class="refresh" role="button" tabindex="0" aria-label="Refresh model prices">
      <circle cx="920" cy="96" r="12"/><path id="refresh-icon" d="M920 89a7 7 0 0 1 6.4 9.8"/>
      <path id="status-check" class="status-check" d="M915 96l3.2 3.3 6-7" visibility="hidden"/>
    </g>
    <g clip-path="url(#models-clip)"><g id="scroll-content"></g></g>
    <rect id="scroll-thumb" class="scroll-thumb" x="956" y="128" width="2" height="64" rx="1"/>
  `;
  host.appendChild(svg);

  const content = svg.querySelector("#scroll-content");
  const refresh = svg.querySelector("#refresh");
  const refreshIcon = svg.querySelector("#refresh-icon");
  const statusCheck = svg.querySelector("#status-check");
  const thumb = svg.querySelector("#scroll-thumb");
  const noise = svg.querySelector("#models-noise");
  const displace = svg.querySelector("#models-displace");
  const sheen = svg.querySelector("#models-text-sheen");
  const rowEls = new Map();
  const providerEls = new Map();
  const toggles = new Map();
  let currentTime = 0;
  let manualScroll = null;
  let contentHeight = 900;
  let burst = null;
  let raf = 0;
  let destroyed = false;
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ?? { matches: false };

  for (const provider of PROVIDERS) {
    const label = document.createElementNS(NS, "g");
    label.classList.add("provider-row");
    label.innerHTML = `<rect class="provider-bg" x="63" y="0" width="898" height="43"/><text class="provider" x="92" y="24">${provider.name}</text><line class="rule" x1="92" y1="42" x2="934" y2="42"/>`;
    content.appendChild(label);
    providerEls.set(provider.name, label);
    for (const row of provider.rows) {
      const [id, name, modelContext, output, inputCost, outputCost] = row;
      const group = document.createElementNS(NS, "g");
      group.classList.add("row", "on");
      group.setAttribute("role", "checkbox");
      group.setAttribute("tabindex", "0");
      group.setAttribute("aria-checked", "true");
      group.setAttribute("aria-label", `${name}, enabled`);
      group.innerHTML = `
        <rect x="77" y="0" width="866" height="52" fill="transparent"/>
        <g class="row-visuals">
          <text class="model" x="92" y="31">${esc(name)}</text>
          <text class="datum" x="568" y="32">${modelContext}</text>
          <text class="datum" x="680" y="32">${output}</text>
          <text class="datum cost-value" x="886" y="32" text-anchor="end">${inputCost} / ${outputCost}</text>
          <rect class="toggle" x="909" y="20" width="22" height="12" rx="1"/>
          <rect class="toggle-knob" x="920" y="23" width="6" height="6" rx=".5"/>
          <line class="rule" x1="92" y1="51" x2="934" y2="51"/>
          <line class="glitch-line-red" x1="82" y1="47" x2="938" y2="47" visibility="hidden"/>
          <line class="glitch-line-cyan" x1="82" y1="49" x2="938" y2="49" visibility="hidden"/>
        </g>
      `;
      content.appendChild(group);
      rowEls.set(id, { group, row });
    }
  }
  for (const label of providerEls.values()) content.appendChild(label);

  function toggleRow(id) {
    context.pause?.();
    const next = !(toggles.get(id) ?? true);
    toggles.set(id, next);
    draw(currentTime);
    const name = rowEls.get(id).row[1];
    context.announce?.(`${name} ${next ? "enabled" : "disabled"}.`);
  }

  for (const [id, { group }] of rowEls) {
    const activate = (event) => {
      if (group.getAttribute("aria-hidden") === "true") return;
      if (event.type === "click" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleRow(id);
      }
    };
    group._activate = activate;
    group.addEventListener("click", activate);
    group.addEventListener("keydown", activate);
  }

  function draw(time, burstProgress = burst?.progress || 0, playing = false) {
    currentTime = clamp(Number(time) || 0, 0, meta.duration);
    const motion = !reducedMotion.matches;
    const phases = new Map([...rowEls.keys()].map((id) => [id, updatePhase(id, currentTime, burstProgress)]));
    const events = [...phases].filter(([, phase]) => phase >= 0 && phase < .35)
      .map(([id]) => ({key: `update:${id}`, event: 'update'}));
    sounds.sample(burst ? burstProgress * 1.45 : currentTime, events, playing);
    const strengths = new Map([...phases].map(([id, phase]) => [id, effectStrength(phase)]));
    const strongest = Math.max(0, ...strengths.values());
    const selectedId = [...strengths].find(([, strength]) => strength === strongest)?.[0];
    const selectedIndex = ROW_IDS.indexOf(selectedId);
    const previousId = selectedIndex > 0 ? ROW_IDS[selectedIndex - 1] : null;
    const activePhase = phases.get(selectedId) ?? 0;
    const updating = strongest > 0.025;
    const slicing = [...phases.values()].some((phase) => phase >= 0 && phase < 0.18);
    const liveUpdate = updating || slicing;
    const frameStep = motion ? Math.floor((currentTime + burstProgress * 1.45) * 60) : 0;
    noise.setAttribute("seed", String(7 + (frameStep % 11)));
    displace.setAttribute("scale", motion ? String(1.1 + strongest * (1.4 + (frameStep % 3) * 0.35)) : "0");
    const sweep = motion ? -36 + clamp(activePhase) * 142 : 0;
    sheen.setAttribute("x1", `${sweep - 22}%`);
    sheen.setAttribute("x2", `${sweep + 22}%`);
    let y = 0;
    for (const provider of PROVIDERS) {
      const providerElement = providerEls.get(provider.name);
      providerElement.layoutY = y;
      providerElement.setAttribute("opacity", motion && liveUpdate ? ".85" : "1");
      providerElement.setAttribute("filter", "none");
      y += 43;
      for (const row of provider.rows) {
        const [id, name] = row;
        const item = rowEls.get(id);
        const presenceAmount = presence(id, currentTime);
        const amount = motion ? presenceAmount : Number(presenceAmount > 0);
        const strength = strengths.get(id);
        const active = id === selectedId && strength > 0.025;
        const trace = motion && active && strength > 0.1 && (phases.get(id) < 0.16 || phases.get(id) > 0.86);
        const sliceJolt = motion && active ? (((frameStep + id.length * 3) % 5) - 2) * strength * 0.55 : 0;
        const emphasis = !motion || !liveUpdate || active ? 1 : id === previousId ? 0.15 : 0.88;
        item.layoutY = y - (1 - amount) * 13;
        item.group.setAttribute("transform", `translate(${sliceJolt} ${item.layoutY})`);
        item.group.setAttribute("opacity", String(amount * emphasis));
        item.group.setAttribute("visibility", amount < 0.015 ? "hidden" : "visible");
        item.group.classList.toggle("updating", motion && active);
        item.group.querySelector(".row-visuals").setAttribute("filter", !motion ? "none" : active ? "url(#models-row-distortion)" : slicing ? "url(#models-row-slice)" : "none");
        item.group.querySelector(".glitch-line-red").setAttribute("visibility", trace ? "visible" : "hidden");
        item.group.querySelector(".glitch-line-cyan").setAttribute("visibility", trace ? "visible" : "hidden");
        const enabled = toggles.get(id) ?? true;
        item.group.classList.toggle("on", enabled);
        item.group.setAttribute("aria-checked", String(enabled));
        item.group.setAttribute("aria-label", `${name}, ${enabled ? "enabled" : "disabled"}`);
        item.group.querySelector(".toggle-knob").setAttribute("x", enabled ? "920" : "913");
        const updatedPrices = prices(id, currentTime, burstProgress);
        const input = updatedPrices?.[0] ?? row[4];
        const output = updatedPrices?.[1] ?? row[5];
        item.group.querySelector(".cost-value").textContent = `${input} / ${output}`;
        y += 52 * amount;
      }
      y += 7;
    }
    contentHeight = Math.max(424, y + 64);
    const maxScroll = Math.max(0, contentHeight - 423);
    const reducedScroll = AUTO_SCROLL.reduce((value, point) => currentTime >= point[0] ? point[1] : value, 0);
    const baseScroll = manualScroll ?? (motion ? interpolateScroll(currentTime) : reducedScroll);
    const scroll = clamp(baseScroll + (motion ? strongest * 38 : 0), 0, maxScroll);
    content.setAttribute("transform", `translate(0 ${122 - scroll})`);
    const labels = PROVIDERS.map((provider) => providerEls.get(provider.name));
    let uncoveredTop = 122;
    for (let index = 0; index < labels.length; index += 1) {
      const label = labels[index];
      const naturalTop = 122 + label.layoutY - scroll;
      const nextNaturalTop = index + 1 < labels.length ? 122 + labels[index + 1].layoutY - scroll : Infinity;
      const stickyTop = Math.min(Math.max(naturalTop, 122), nextNaturalTop - 43);
      label.setAttribute("transform", `translate(0 ${label.layoutY + stickyTop - naturalTop})`);
      if (stickyTop <= 122) uncoveredTop = Math.max(uncoveredTop, stickyTop + 43);
    }
    for (const item of rowEls.values()) {
      const presenceAmount = presence(item.row[0], currentTime);
      const amount = motion ? presenceAmount : Number(presenceAmount > 0);
      const screenTop = 122 + item.layoutY - scroll;
      const visible = amount > 0.15 && Math.min(screenTop + 52 * amount, 545) - Math.max(screenTop, uncoveredTop) >= 12;
      item.group.setAttribute("tabindex", visible ? "0" : "-1");
      item.group.setAttribute("aria-hidden", visible ? "false" : "true");
    }
    const thumbHeight = Math.max(38, (423 / contentHeight) * 410);
    const thumbTravel = 410 - thumbHeight;
    thumb.setAttribute("height", String(thumbHeight));
    thumb.setAttribute("y", String(128 + (maxScroll ? scroll / maxScroll : 0) * thumbTravel));

    const checking = liveUpdate && burstProgress < 0.88;
    const checked = !checking || burstProgress >= 0.88;
    refreshIcon.setAttribute("visibility", checked ? "hidden" : "visible");
    statusCheck.setAttribute("visibility", checked ? "visible" : "hidden");
    refreshIcon.setAttribute("transform", motion && checking ? `rotate(${(currentTime * 310 + burstProgress * 520) % 360} 920 96)` : "");
  }

  function render(timeSeconds, {playing = false} = {}) {
    if (destroyed || burst) return;
    draw(timeSeconds, 0, playing);
  }

  function runBurst() {
    context.pause?.();
    context.prepareSound?.();
    cancelAnimationFrame(raf);
    const startedAt = performance.now();
    burst = { progress: 0 };
    sounds.reset();
    sounds.sample(0, []);
    context.announce?.("Refreshing model prices.");
    const tick = (now) => {
      if (!burst || destroyed) return;
      burst.progress = clamp((now - startedAt) / 1450);
      draw(currentTime, burst.progress, true);
      if (burst.progress < 1) raf = requestAnimationFrame(tick);
      else {
        context.announce?.("Model prices refreshed.");
        burst = null;
      }
    };
    raf = requestAnimationFrame(tick);
  }

  const activateRefresh = (event) => {
    if (event.type === "click" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      runBurst();
    }
  };
  refresh.addEventListener("click", activateRefresh);
  refresh.addEventListener("keydown", activateRefresh);

  const onWheel = (event) => {
    event.preventDefault();
    context.pause?.();
    const maxScroll = Math.max(0, contentHeight - 423);
    manualScroll = clamp((manualScroll ?? interpolateScroll(currentTime)) + event.deltaY, 0, maxScroll);
    draw(currentTime);
  };
  svg.addEventListener("wheel", onWheel, { passive: false });

  function stop() { cancelAnimationFrame(raf); burst = null; }

  function reset() {
    stop();
    sounds.reset();
    burst = null;
    manualScroll = null;
    toggles.clear();
    draw(0, 0);
  }

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    refresh.removeEventListener("click", activateRefresh);
    refresh.removeEventListener("keydown", activateRefresh);
    svg.removeEventListener("wheel", onWheel);
    for (const { group } of rowEls.values()) {
      group.removeEventListener("click", group._activate);
      group.removeEventListener("keydown", group._activate);
    }
    svg.remove();
  }

  reset();
  return { render, reset, stop, destroy };
}
