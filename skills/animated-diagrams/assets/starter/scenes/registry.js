import {createSoundEvents} from '../sound-events.js';
import {displacementMap} from './registry-distortion.js';
import {replayState, rowEntrance, blendWeights, settle, smooth, timerReels, ROW_Y} from './registry-motion.js';

export const meta = {
  id: "registry",
  title: "Live model registry",
  description: "Sources and policy stream model availability into a live registry.",
  duration: 33.92,
  viewBox: [1024, 510],
  capabilities: ["playback", "seek", "interactive", "toggles", "refresh"],
};

const MODELS = [
  { family: "PERINIUM", icon: "orbit", name: "Clench 4 Pro" },
  { family: "PERINIUM", icon: "orbit", name: "Clench 4 Mini" },
  { family: "SPHINCTRAL", icon: "spark", name: "Squeeze 3.5" },
  { family: "SPHINCTRAL", icon: "spark", name: "Squeeze 3.5 Fast" },
  { family: "LOCAL", icon: "screen", name: "Couch Potato 8B" },
  { family: "LOCAL", icon: "screen", name: "Pocket Goblin 14B" },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const ease = (value) => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};
function familyIcon(kind) {
  if (kind === "orbit") return '<path d="M4 2C.5 4.5.5 8.5 4 11M8 2c3.5 2.5 3.5 6.5 0 9M5.5 4.2 3.2 6.5l2.3 2.3 2.3-2.3z"/>';
  if (kind === "spark") return '<path d="m6.5 1 1.3 2.4 2.7.4-.4 2.7 1.9 2-1.9 2-.4 2.7-2.7.4L6.5 12l-2.4-1.3-2.7.4L1.8 8 0 6.5l1.8-2-.4-2.7 2.7.4z"/>';
  return '<path d="M1 2h11v8H1zM4 12h5M6.5 10v2M3 4h3"/>';
}

function sourceIcon(kind) {
  if (kind === "model") return '<rect x="0" y="0" width="20" height="20" rx="1"/><text class="model-mark" x="10" y="14" text-anchor="middle">M.</text>';
  return '<path d="M2 2v4a4 4 0 0 0 8 0V2M0 4h4M8 4h4M6 10v3"/>';
}

function markup() {
  const rows = MODELS.map((model, index) => {
    const y = ROW_Y[index];
    const groupStart = index === 0 || index === 2 || index === 4;
    const headingY = y - 38;
    return `${groupStart ? `<g class="family-label" data-family="${model.family}" transform="translate(333 ${headingY})"><g class="family-icon">${familyIcon(model.icon)}</g><text x="25" y="11">${model.family}</text></g>` : ""}
      <g class="model-row" data-model="${index}" transform="translate(333 ${y})">
        <text x="0" y="0">${model.name}</text>
        <g class="switch" data-switch="${index}" role="switch" tabindex="0" aria-label="Enable ${model.name}" aria-checked="false" transform="translate(602 -16)">
          <rect class="switch-box" width="23" height="15"/><rect class="switch-pip" x="3" y="4" width="7" height="7"/>
          <rect class="hit" x="-9" y="-13" width="41" height="41"/>
        </g>
      </g>`;
  }).join("");

  return `
    <style>
      .registry-scene { width:100%; height:100%; display:block; -webkit-font-smoothing:antialiased; }
      .registry-scene text { font-family:"CommitMono", "SFMono-Regular", Consolas, monospace; }
      .registry-scene .wire, .registry-scene .frame, .registry-scene .rule { fill:none; stroke:#292929; stroke-width:1; }
      .registry-scene .frame { fill:#030303; }
      .registry-scene .header { fill:#111; }
      .registry-scene .port { fill:#454545; }
      .registry-scene .source text, .registry-scene .model-row text { fill:#898989; font-size:14px; letter-spacing:.1px; }
      .registry-scene .source text { font-size:12px; }
      .registry-scene .source { cursor:pointer; }
      .registry-scene .source-frame { fill:#050505; stroke:#292929; stroke-width:1; }
      .registry-scene .source-inset { fill:none; stroke:#202020; stroke-width:1; }
      .registry-scene .source:hover .source-frame, .registry-scene .source:focus .source-frame { stroke:#5b5b5b; }
      .registry-scene .source-icon { fill:none; stroke:#858585; stroke-width:1.15; }
      .registry-scene .source-icon.model rect { fill:#3b3b3b; stroke:none; }
      .registry-scene .model-mark { fill:#dededb; stroke:none; font-size:8px; font-weight:700; }
      .registry-scene .status { fill:none; stroke:#999; stroke-width:1.2; stroke-linecap:round; }
      .registry-scene .timer { fill:#797979; font-size:12px; font-variant-numeric:tabular-nums; }
      .registry-scene .header-label, .registry-scene .family-label text { fill:#737373; font-size:11px; letter-spacing:1px; }
      .registry-scene .count { fill:#929292; font-size:12px; font-variant-numeric:tabular-nums; }
      .registry-scene .family-icon { fill:none; stroke:#797979; stroke-width:1.15; }
      .registry-scene .switch { cursor:pointer; }
      .registry-scene .switch-box { fill:#050505; stroke:#858585; stroke-width:1; }
      .registry-scene .switch-pip { fill:#464646; }
      .registry-scene .source-sheen { fill:none; stroke:#bbb; stroke-width:1; stroke-dasharray:.12 .88; pointer-events:none; }
      .registry-scene .switch:hover .switch-box, .registry-scene .switch:focus .switch-box { stroke:#deded8; }
      .registry-scene .hit { fill:transparent; }
      .registry-scene .pulse { fill:#eeeeeb; filter:url(#registry-glow); }
      .registry-scene .arrival { fill:none; stroke:#cfcfca; stroke-width:1; opacity:0; }
      .registry-scene .empty-icon { fill:none; stroke:#4c4c4c; stroke-width:1.2; }
      @media (prefers-reduced-motion: reduce) { .registry-scene .pulse { filter:none; } }
    </style>
    <svg class="registry-scene" viewBox="0 0 1024 510" role="group" aria-labelledby="registry-title registry-desc">
      <title id="registry-title">Live model registry pipeline</title>
      <desc id="registry-desc">Models flow from source files through a provider policy into an interactive six-model registry.</desc>
      <defs>
        <filter id="registry-glow" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="2.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="registry-ripple" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="-40" y="-40" width="1104" height="590" color-interpolation-filters="sRGB">
          <feImage href="${displacementMap()}" x="-40" y="-1000" width="1104" height="2500" preserveAspectRatio="none" result="wave-map"/>
          <feOffset data-wave-offset in="wave-map" dy="0" result="moving-wave"/>
          <feDisplacementMap data-ripple-map in="SourceGraphic" in2="moving-wave" scale="0" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <clipPath id="registry-table-clip"><rect x="313" y="121" width="663" height="317"/></clipPath>
        <linearGradient id="registry-reveal-gradient" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="100" y2="140"><stop stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
        <mask id="registry-reveal-mask" maskUnits="userSpaceOnUse" x="313" y="121" width="663" height="317"><rect x="313" y="121" width="663" height="317" fill="url(#registry-reveal-gradient)"/></mask>
        <radialGradient id="registry-arrival-light"><stop stop-color="white" stop-opacity=".06"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>
        ${ROW_Y.map((_, index) => `<filter id="registry-row-blur-${index}" x="-10%" y="-100%" width="120%" height="300%"><feGaussianBlur data-row-blur="${index}" stdDeviation="0"/></filter>`).join('')}
        <clipPath id="registry-count-clip"><rect x="918" y="88" width="14" height="18"/></clipPath>
        <clipPath id="registry-timer-clip"><rect x="206" y="177" width="40" height="15"/></clipPath>
      </defs>

      <rect width="1024" height="510" fill="#030303"/>

      <g data-ripple-group>
      <path id="wire-models" class="wire" d="M155 121V160"/>
      <path id="wire-dev" class="wire" d="M263 183H276Q287 183 287 172V61Q287 49 299 49H632Q644 49 644 61V75"/>
      <path id="wire-policy" class="wire" d="M263 256H276Q287 256 287 245V61Q287 49 299 49H632Q644 49 644 61V75"/>
      <circle class="port" cx="155" cy="121" r="4"/><circle class="port" cx="155" cy="160" r="4"/>
      <circle class="port" cx="263" cy="183" r="4"/><circle class="port" cx="263" cy="256" r="4"/><circle class="port" cx="644" cy="75" r="4"/>
      <circle class="pulse" data-pulse="models" r="4"/><circle class="pulse" data-pulse="dev" r="4"/><circle class="pulse" data-pulse="policy" r="4"/>
      <circle class="arrival" data-arrival cx="644" cy="75" r="5"/><circle class="arrival" data-input-arrival cx="155" cy="121" r="4"/>

      <g class="source" data-source="models" role="button" tabindex="0" aria-label="Refresh models.dev source">
        <rect class="source-frame" x="48" y="75" width="215" height="46"/>
        <rect class="source-inset" x="52" y="79" width="207" height="38"/><rect class="source-sheen" data-sheen="models" x="49" y="76" width="213" height="44" pathLength="1"/>
        <g class="source-icon model" transform="translate(64 88)">${sourceIcon("model")}</g>
        <text x="91" y="104">models.dev</text>
      </g>
      <g class="source" data-source="dev" role="button" tabindex="0" aria-label="Refresh models-dev.ts source">
        <rect class="source-frame" x="48" y="160" width="215" height="46"/>
        <rect class="source-inset" x="52" y="164" width="207" height="38"/><rect class="source-sheen" data-sheen="dev" x="49" y="161" width="213" height="44" pathLength="1"/>
        <g class="source-icon" transform="translate(65 176)">${sourceIcon("plug")}</g>
        <text x="89" y="189">models-dev.ts</text>
        <g class="timer" data-timer role="img" clip-path="url(#registry-timer-clip)" aria-label="Refresh countdown">
          ${[0,1,2,3,4].map(index => `<g data-digit="${index}" aria-hidden="true" transform="translate(${208+index*7.2} 189)"><text data-digit-current>0</text><text data-digit-next y="15">0</text></g>`).join('')}
        </g>
        <g class="status" data-dev-status><path data-spinner d="M236 177a6 6 0 1 1-5 2"/><path data-check d="M232 182l4 4 7-9" pathLength="1"/></g>
      </g>
      <g class="source" data-source="policy" role="button" tabindex="0" aria-label="Toggle provider policy">
        <rect class="source-frame" x="48" y="233" width="215" height="46"/>
        <rect class="source-inset" x="52" y="237" width="207" height="38"/><rect class="source-sheen" data-sheen="policy" x="49" y="234" width="213" height="44" pathLength="1"/>
        <g class="source-icon" transform="translate(65 249)">${sourceIcon("plug")}</g>
        <text x="89" y="262">provider-policy.ts</text>
        <g class="status" data-policy-status><path data-spinner d="M236 250a6 6 0 1 1-5 2"/><path data-check d="M232 255l4 4 7-9" pathLength="1"/></g>
      </g>

      <path class="frame" data-table-frame d="M313 75H976V438H313Z"/>
      <rect class="header" x="314" y="76" width="661" height="45"/>
      <path class="rule" d="M313 121H976"/>
      <ellipse data-arrival-light cx="644" cy="180" rx="310" ry="270" fill="url(#registry-arrival-light)" clip-path="url(#registry-table-clip)"/>
      <text class="header-label" x="333" y="102">MODEL</text>
      <g class="count" data-count role="img" aria-label="0 / 0"><g clip-path="url(#registry-count-clip)" aria-hidden="true"><text data-count-old x="921" y="102">0</text><text data-count-new x="921" y="87">0</text></g><text data-count-total x="957" y="102" text-anchor="end" aria-hidden="true">/ 0</text></g>

      <g data-content clip-path="url(#registry-table-clip)"><g mask="url(#registry-reveal-mask)"><path class="rule" data-group-rules d="M313 225H976M313 329H976"/><g class="rows" data-rows>${rows}</g></g></g>
      <g class="empty-icon" data-empty transform="translate(634 269)"><path d="M1 1h19v16H1zM5 10h3l2 2h3l2-2h3"/></g>
      </g>
    </svg>`;
}

export function mount(host, context = {}) {
  const sounds = createSoundEvents(event => context.sound?.(event));
  host.innerHTML = markup();
  const svg = host.querySelector('.registry-scene');
  const $ = selector => svg.querySelector(selector);
  const rows = [...svg.querySelectorAll('[data-model]')];
  const switches = [...svg.querySelectorAll('[data-switch]')];
  const pips = switches.map(node => node.querySelector('.switch-pip'));
  const families = [...svg.querySelectorAll('[data-family]')];
  const blurs = [...svg.querySelectorAll('[data-row-blur]')];
  const digits = [...svg.querySelectorAll('[data-digit]')].map(node => ({node, current: node.querySelector('[data-digit-current]'), next: node.querySelector('[data-digit-next]')}));
  const paths = Object.fromEntries(['models', 'dev', 'policy'].map(name => {
    const path = $(`#wire-${name}`);
    const trail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    for (const [key, value] of Object.entries({d: path.getAttribute('d'), fill: 'none', stroke: '#aaa', 'stroke-width': '1.3', 'stroke-linecap': 'round', opacity: '0'})) trail.setAttribute(key, value);
    path.after(trail);
    return [name, {path, trail, length: path.getTotalLength(), pulse: $(`[data-pulse="${name}"]`)}];
  }));
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? {matches: false};
  const listeners = [];
  let manual = null, lastPose = null, lastTime = 0, actionGeneration = 0, destroyed = false, frame = 0;
  const attribute = (node, name, value) => { const text = String(value); if (node.getAttribute(name) !== text) node.setAttribute(name, text); };
  const opacity = (node, value) => attribute(node, 'opacity', Math.max(0, Math.min(1, value)).toFixed(3));

  function pulse(name, phase) {
    const {path, trail, length, pulse: point} = paths[name];
    const visible = !reducedMotion.matches && phase !== null && phase >= 0 && phase <= 1;
    opacity(point, visible ? Math.min(1, (phase + .04) * 14, (1.04 - phase) * 14) : 0);
    opacity(trail, visible && name !== 'models' ? Math.max(0, Math.min(.7, phase * 8, (1 - phase) * 8)) : 0);
    attribute(trail, 'stroke-dasharray', `30 ${length}`);
    attribute(trail, 'stroke-dashoffset', -(length * (phase ?? 0) - 30));
    if (!visible) return;
    const position = path.getPointAtLength(length * phase);
    attribute(point, 'cx', position.x.toFixed(2)); attribute(point, 'cy', position.y.toFixed(2));
  }

  function drawStatus(node, state, y) {
    const spinner = node.querySelector('[data-spinner]'), check = node.querySelector('[data-check]');
    const progress = reducedMotion.matches ? 1 : state.progress;
    opacity(spinner, state.busy ? 1 : state.check ? 1 - progress : 0);
    attribute(spinner, 'transform', `rotate(${reducedMotion.matches ? 0 : state.spin.toFixed(2)} 236 ${y})`);
    opacity(check, state.check ? progress : 0);
    attribute(check, 'stroke-dasharray', '1'); attribute(check, 'stroke-dashoffset', 1 - progress);
  }

  function drawTimer(seconds, speed = 1) {
    opacity($('[data-timer]'), seconds === null ? 0 : 1);
    attribute($('[data-timer]'), 'aria-hidden', seconds === null);
    if (seconds === null) return;
    const integer = Math.max(0, Math.ceil(seconds));
    const label = `${String(Math.floor(integer / 60)).padStart(2, '0')}:${String(integer % 60).padStart(2, '0')}`;
    attribute($('[data-timer]'), 'aria-label', `Refresh countdown ${label}`);
    const reels = timerReels(seconds, speed);
    for (let i = 0; i < digits.length; i++) {
      const digit = digits[i], reel = reels[i];
      digit.current.textContent = reel.from; digit.next.textContent = reel.to;
      attribute(digit.next, 'y', -15);
      attribute(digit.node, 'transform', `translate(${208 + i * 7.2} ${(189 + (reducedMotion.matches ? 0 : reel.offset)).toFixed(2)})`);
      if (reducedMotion.matches) digit.current.textContent = label[i];
    }
  }

  function draw(pose, playing = false) {
    lastPose = pose;
    const motion = !reducedMotion.matches;
    const visible = pose.present || pose.exit < .99 && pose.enteredAt !== null;
    const exits = pose.present ? 1 : 1 - pose.exit;
    const events = [];
    if (pose.input !== null && pose.input > 0) events.push({key: 'source', event: 'source'});
    if (pose.present) events.push({key: `enabled:${pose.targets.join('')}`, event: 'toggle'});
    sounds.sample(pose.time, events, playing);
    const count = $('[data-count]');
    const countTo = pose.countTo ?? pose.targets.reduce((a,b) => a+b,0);
    const countFrom = pose.countFrom ?? countTo;
    const countProgress = motion ? pose.countProgress ?? 1 : 1;
    attribute(count, 'aria-label', `${countTo} / ${pose.present ? 6 : 0}`);
    const direction = countTo < countFrom ? 1 : -1;
    $('[data-count-old]').textContent = String(countFrom); $('[data-count-new]').textContent = String(countTo);
    attribute($('[data-count-old]'), 'y', 102 + direction * countProgress * 15);
    attribute($('[data-count-new]'), 'y', 102 - direction * (1 - countProgress) * 15);
    $('[data-count-total]').textContent = `/ ${pose.present || pose.enteredAt !== null && countProgress < 1 ? 6 : 0}`;
    const front = motion ? pose.front : pose.present ? 500 : 100;
    attribute($('#registry-reveal-gradient'), 'y1', (front - 14).toFixed(2));
    attribute($('#registry-reveal-gradient'), 'y2', (front + 12).toFixed(2));
    opacity($('[data-content]'), motion ? exits : Number(pose.present));
    opacity($('[data-empty]'), pose.empty);
    attribute($('[data-empty]'), 'transform', `translate(634 269) scale(${motion ? .86 + .14 * pose.empty : 1})`);
    opacity($('[data-arrival-light]'), pose.present ? Math.max(0, 1 - (pose.time - pose.enteredAt) / 1.15) : 0);

    rows.forEach((row, index) => {
      const entry = rowEntrance(pose.time, pose.enteredAt, index);
      const weight = motion ? pose.weights[index] : pose.targets[index];
      const rowOpacity = (motion ? entry.opacity : Number(pose.present)) * mix(.46, 1, weight);
      opacity(row, visible ? rowOpacity : 0);
      attribute(row, 'transform', `translate(333 ${(motion ? entry.y : ROW_Y[index]).toFixed(2)})`);
      const blur = motion && entry.opacity > 0 && entry.blur > .06 ? entry.blur : 0;
      attribute(row, 'filter', blur ? `url(#registry-row-blur-${index})` : 'none');
      attribute(blurs[index], 'stdDeviation', blur.toFixed(2));
      attribute(pips[index], 'transform', `translate(${(weight * 10).toFixed(2)} 0)`);
      attribute(pips[index], 'style', `fill:rgb(${Math.round(mix(70, 214, weight))},${Math.round(mix(70, 214, weight))},${Math.round(mix(70, 209, weight))})`);
      attribute(switches[index], 'aria-checked', Boolean(pose.targets[index]));
      const interactive = pose.present && (!motion || entry.opacity > .8 && front > entry.y + 8);
      attribute(switches[index], 'tabindex', interactive ? 0 : -1);
      attribute(row, 'aria-hidden', !interactive);
    });
    families.forEach((family, index) => {
      const entry = rowEntrance(pose.time, pose.enteredAt, index * 2);
      opacity(family, visible ? (motion ? entry.opacity : 1) * mix(.7, 1, Math.max(pose.weights[index * 2], pose.weights[index * 2 + 1])) : 0);
      attribute(family, 'transform', `translate(333 ${((motion ? entry.y : ROW_Y[index * 2]) - 38).toFixed(2)})`);
    });
    drawStatus($('[data-dev-status]'), pose.devStatus, 183);
    drawStatus($('[data-policy-status]'), pose.policyStatus, 256);
    attribute($('[data-source="dev"]'), 'aria-busy', pose.devStatus.busy);
    attribute($('[data-source="policy"]'), 'aria-busy', pose.policyStatus.busy);
    for (const name of ['models','dev','policy']) {
      const status = name === 'models' ? {busy: pose.input !== null, spin: (pose.input ?? 0) * 360} : name === 'dev' ? pose.devStatus : pose.policyStatus;
      opacity($(`[data-sheen="${name}"]`), motion && status.busy ? .65 : 0);
      attribute($(`[data-sheen="${name}"]`), 'stroke-dashoffset', (-status.spin / 540).toFixed(4));
    }
    drawTimer(pose.timer, pose.timerRate);
    pulse('models', pose.input); pulse('dev', pose.dev); pulse('policy', pose.policyPulse);
    const inputArrival = pose.inputArrival;
    opacity($('[data-input-arrival]'), motion && inputArrival !== null && inputArrival >= 0 && inputArrival < 1 ? (1 - inputArrival) * .6 : 0);
    attribute($('[data-input-arrival]'), 'r', 4 + smooth(inputArrival ?? 0) * 12);
    const arrival = pose.arrival;
    opacity($('[data-arrival]'), motion && arrival !== null && arrival >= 0 && arrival < 1 ? (1 - arrival) * .55 : 0);
    attribute($('[data-arrival]'), 'r', 4 + Math.max(0, Math.min(1, arrival ?? 0)) * 15);
    const warp = motion ? pose.warp : 0;
    attribute($('[data-ripple-group]'), 'filter', warp > .001 ? 'url(#registry-ripple)' : 'none');
    attribute($('[data-ripple-map]'), 'scale', (warp * 12).toFixed(2));
    attribute($('[data-wave-offset]'), 'dy', (pose.waveY ?? 0).toFixed(2));
    const header = motion ? pose.header ?? 17 : 17;
    attribute($('.header'), 'style', `fill:rgb(${header},${header},${header})`);
  }

  function render(time, {playing = false} = {}) {
    if (destroyed) return;
    lastTime = Math.max(0, Math.min(meta.duration, Number(time) || 0));
    if (manual) { draw(manual.pose); return; }
    draw(replayState(lastTime), playing);
  }

  function manualPose(age) {
    const {from, targets, kind} = manual;
    const refreshing = kind !== 'toggle', ready = kind === 'policy' ? 1.45 : 1.1, send = kind === 'policy' ? .48 : 1.35, arrived = send + .8;
    const switchAt = refreshing ? arrived : 0;
    const startedEmpty = !from.present;
    const present = from.present || refreshing && age >= arrived;
    const time = from.time + age;
    const enteredAt = startedEmpty ? present ? from.time + arrived : from.enteredAt : from.enteredAt;
    const progress = phase => clamp(phase, 0, 1);
    const inactive = {busy: false, check: false, progress: 0, spin: 0};
    const status = {busy: refreshing && age < ready, check: refreshing && age >= ready && age < arrived + .3, progress: settle(age - ready, 28), spin: age * 400};
    return {...from, time, enteredAt, present,
      targets: age >= switchAt ? targets : from.targets,
      weights: blendWeights(from.weights, targets, age - switchAt, kind === 'toggle' ? 0 : .13),
      front: !present && from.enteredAt !== null ? from.front : enteredAt === null ? 100 : 121 + 350 * clamp((time - enteredAt) / .65, 0, 1) ** 1.6,
      empty: present ? 1 - smooth((time - enteredAt) / .35) : mix(from.empty, 1, settle(age, 26)),
      exit: present ? 0 : mix(from.exit, 1, settle(age, 26)),
      warp: from.warp * (1 - settle(age, 16)), waveY: from.waveY - age * 670, header: mix(from.header, 17, settle(age, 16)),
      countTo: age >= switchAt ? targets.reduce((a,b) => a+b,0) : from.countTo,
      countFrom: from.countTo,
      countProgress: startedEmpty && age < switchAt ? smooth(age / .14 + from.countProgress) : smooth((age - switchAt) / .16),
      input: refreshing && kind !== 'policy' && age < .58 ? 1 - clamp((age - .38) / .2, 0, 1) : null,
      inputArrival: refreshing && kind !== 'policy' && age >= .58 ? (age - .58) / .46 : null,
      dev: refreshing && kind !== 'policy' && age >= send && age <= arrived ? progress((age - send) / .8) : null,
      policyPulse: kind === 'policy' && age >= send && age <= arrived ? progress((age - send) / .8) : null,
      devStatus: kind === 'policy' ? inactive : status, policyStatus: kind === 'policy' ? status : inactive,
      timer: refreshing && kind !== 'policy' ? age >= arrived + .3 ? 3600 : null : from.timer,
      timerRate: refreshing && kind !== 'policy' && age >= arrived + .3 ? 1 : from.timerRate,
      arrival: refreshing && age >= arrived ? (age - arrived) / .5 : null,
    };
  }

  function begin(kind, targets, announcement) {
    context.pause?.();
    const from = lastPose;
    manual = {kind, targets, from, pose: from, startedAt: performance.now()};
    sounds.reset();
    manual.pose = manualPose(0);
    draw(manual.pose);
    context.sound?.(kind === 'toggle' ? 'toggle' : 'source');
    const tick = now => {
      if (destroyed || !manual) return;
      const age = Math.max(0, (now - manual.startedAt) / 1000);
      manual.pose = manualPose(age); draw(manual.pose, true);
      if (age < (kind === 'toggle' ? .7 : 3.2)) frame = requestAnimationFrame(tick);
      else context.announce?.(announcement);
    };
    frame = requestAnimationFrame(tick);
  }

  function activate(node, handler) {
    const listener = async event => {
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (node.hasAttribute('data-switch') && node.getAttribute('tabindex') === '-1') return;
      event.preventDefault();
      const token = ++actionGeneration;
      await context.prepareSound?.();
      if (!destroyed && token === actionGeneration) handler();
    };
    node.addEventListener('click', listener); node.addEventListener('keydown', listener); listeners.push([node, listener]);
  }
  for (const node of svg.querySelectorAll('[data-source]')) activate(node, () => {
    if (node.dataset.source === 'policy') {
      const localOnly = lastPose.targets.some((value, index) => index < 4 && value);
      begin('policy', localOnly ? [0,0,0,0,1,1] : [1,1,1,1,1,1], localOnly ? 'Provider policy set to local models' : 'Provider policy allows all models');
    } else begin('refresh', [1,1,1,1,1,1], 'Source refreshed: 6 models enabled');
  });
  switches.forEach((node, index) => activate(node, () => {
    const targets = [...lastPose.targets]; targets[index] = targets[index] ? 0 : 1;
    begin('toggle', targets, `${MODELS[index].name} ${targets[index] ? 'enabled' : 'disabled'}`);
  }));

  function stop() { actionGeneration++; cancelAnimationFrame(frame); }
  function reset() { stop(); sounds.reset(); manual = null; render(0); }
  function destroy() { destroyed = true; stop(); for (const [node, listener] of listeners) { node.removeEventListener('click', listener); node.removeEventListener('keydown', listener); } svg.remove(); }
  reset();
  return {render, reset, stop, destroy};
}
