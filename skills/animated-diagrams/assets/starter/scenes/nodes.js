import {createSoundEvents} from '../sound-events.js';

export const meta = {
  id: "nodes",
  title: "Routing with nodes",
  description: "A request selects a virtual model, then follows a visible route to the matching model.",
  duration: 21.6533,
  viewBox: [1089, 579],
  capabilities: ["interactive", "scrubbable", "keyboard-accessible", "deterministic"],
};

const USERS = ["Luke", "Kit", "Dax"];
const SVG_NS = "http://www.w3.org/2000/svg";

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const ease = (value) => {
  const x = clamp(value);
  return 1 - (1 - x) ** 3;
};

function timeline(time) {
  const t = Math.max(0, Math.min(meta.duration, Number(time) || 0));
  if (t < 1.75) return { user: "Luke", route: null, pending: true, inputProgress: clamp(t / 1.55) };
  if (t < 2.3) return { user: "Luke", route: null, decision: "cheap", decisionProgress: clamp((t - 1.75) / .55) };
  if (t < 4.5) return { user: "Luke", route: "cheap", progress: clamp((t - 2.3) / 1.3), arrivalProgress: clamp((t - 3.55) / .95) };
  if (t < 6.45) return { user: "Luke", route: null, pending: true };
  if (t < 8.75) return { user: "Kit", route: null, pending: true, inputProgress: clamp((t - 6.8) / 1.3) };
  if (t < 9.7) return { user: "Kit", route: null, decision: "primary", decisionProgress: clamp((t - 8.75) / .95) };
  if (t < 11.8) return { user: "Kit", route: "primary", progress: clamp((t - 9.7) / 1.3), arrivalProgress: clamp((t - 10.95) / .85) };
  if (t < 13.45) return { user: "Kit", route: null, pending: true };
  if (t < 15.75) return { user: "Dax", route: null, pending: true, inputProgress: clamp((t - 13.7) / 1.4) };
  if (t < 16.75) return { user: "Dax", route: null, decision: "primary", decisionProgress: clamp((t - 15.75) / 1) };
  if (t < 18.8) return { user: "Dax", route: "primary", progress: clamp((t - 16.75) / 1.3), arrivalProgress: clamp((t - 18) / .8) };
  return { user: t < 19 ? "Dax" : "Luke", route: null, pending: false };
}

function nodeMarkup({ id, x, y, width, height, title, rows, action, interactive = false }) {
  const rowMarkup = rows
    .map(
      ([label, value], index) => `<text class="n-label" x="${x + 19}" y="${y + 56 + index * 24}">${label}${label && value ? ": " : ""}${value ? `<tspan class="n-value">${value}</tspan>` : ""}</text>`,
    )
    .join("");
  return `
    <g id="${id}" class="node${interactive ? " node--interactive" : ""}" ${
      interactive ? 'role="button" tabindex="0" aria-label="Change request user ID"' : ""
    }>
      <rect class="node-body" x="${x}" y="${y}" width="${width}" height="${height}" rx="11" />
      <text class="node-title" x="${x + 28}" y="${y + 34}">${title}</text>
      ${action ? `<g class="node-action ${action.kind}" transform="translate(${x + width - 68} ${y + 22})">
        <rect class="action-outer" width="46" height="48" rx="9"/>
        <rect class="action-inner" x="4" y="4" width="38" height="40" rx="7"/>
        <text x="23" y="30" text-anchor="middle">${action.label}</text>
      </g>` : ""}
      ${rowMarkup}
    </g>`;
}

export function mount(host, context = {}) {
  host.replaceChildren();
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${meta.viewBox[0]} ${meta.viewBox[1]}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-labelledby", "nodes-title nodes-desc");
  svg.classList.add("nodes-scene");
  svg.innerHTML = `
    <title id="nodes-title">Request routing through a virtual model</title>
    <desc id="nodes-desc">Choose Luke, Kit, or Dax in the request node, then run the request to see which model receives it.</desc>
    <style>
      .nodes-scene { display:block; overflow:visible; color:#e8e8e5; font-family:"Commit Mono", "CommitMono", ui-monospace, monospace; -webkit-font-smoothing:antialiased; }
      .nodes-scene text { user-select:none; }
      .node-body { fill:#0d0d0d; stroke:#303030; stroke-width:1.25; }
      .node-title { fill:#dededb; font-size:16px; font-weight:520; letter-spacing:-.3px; }
      .n-label { fill:#747474; font-size:13px; }
      .n-value { fill:#bdbdb9; font-size:14px; }
      .node--interactive { cursor:pointer; outline:none; }
      .node--interactive:hover .node-body, .node--interactive:focus-visible .node-body { stroke:#777; }
      .route { fill:none; stroke:#303030; stroke-width:1.25; }
      .route.active { stroke:#626262; }
      .route-label { fill:#777; font-size:12px; letter-spacing:.15px; }
      .port { fill:#4a4a4a; }
      .center-caption { fill:#777; font-size:13px; }
      .request-arrow { cursor:pointer; outline:none; }
      .node-action rect { fill:#090909; stroke:#303030; stroke-width:1.1; }
      .node-action .action-inner { stroke:#242424; }
      .node-action text { fill:#b7b7b3; font-size:13px; }
      .request-arrow:hover rect, .request-arrow:focus-visible rect { stroke:#888; }
      .pulse-core { fill:#f2f2ef; }
      .pulse-halo { fill:#eee; filter:url(#soft-glow); opacity:.55; }
      .arrival { fill:none; stroke:#dededb; stroke-width:1.25; }
      .port-flash { fill:#ededeb; filter:url(#soft-glow); }
      .glint, .glint-halo { fill:none; stroke:#f0f0ed; stroke-width:1.6; stroke-linecap:round; stroke-dasharray:18 82; opacity:0; }
      .glint-halo { stroke-width:3; filter:url(#soft-glow); opacity:0; }
      .node-action.decision-control.is-active .action-outer { stroke:#555; }
      .node-action.decision-control.is-active .action-inner { stroke:#393939; }
      .node-action.cost.hit .action-outer { stroke:#414b43; }
      .node-action.cost.hit .action-inner { stroke:#55765d; }
      .node-action.cost.hit text { fill:#89a78d; }
      @media (prefers-reduced-motion: reduce) { .pulse-halo, .glint-halo, .port-flash { filter:none; } }
    </style>
    <defs>
      <filter id="soft-glow" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="3"/></filter>
      <path id="route-primary-path" d="M672 270H724Q740 270 740 254V191Q740 175 756 175H808" />
      <path id="route-cheap-path" d="M672 306H724Q740 306 740 322V386Q740 402 756 402H808" />
      <path id="route-request-path" d="M286 288H399" />
    </defs>
    <rect width="1089" height="579" fill="#030303" />
    <g id="camera">
      <text class="center-caption" x="483" y="224">Virtual model</text>
      <path class="route route-primary" d="M672 270H724Q740 270 740 254V191Q740 175 756 175H808" />
      <path class="route route-cheap" d="M672 306H724Q740 306 740 322V386Q740 402 756 402H808" />
      <text class="route-label" x="704" y="251">Otherwise</text>
      <text class="route-label" x="728" y="354">Yes</text>

      <path class="route request-link" d="M286 288H399" />

      ${nodeMarkup({ id: "request-node", x: 36, y: 242, width: 250, height: 92, title: "Request", rows: [["userID", "Luke"]], action: { kind: "run", label: "→" }, interactive: true })}
      <g id="request-arrow" class="request-arrow" role="button" tabindex="0" aria-label="Run request">
        <rect x="218" y="264" width="46" height="48" rx="9" fill="transparent"/>
      </g>
      ${nodeMarkup({ id: "virtual-node", x: 399, y: 242, width: 273, height: 92, title: "Luke?", rows: [["principal.userID", ""]], action: { kind: "decision-control", label: "?" } })}
      ${nodeMarkup({ id: "primary-node", x: 808, y: 129, width: 254, height: 92, title: "Primary", rows: [["", "Default"]], action: { kind: "cost", label: "$$$" } })}
      ${nodeMarkup({ id: "cheap-node", x: 808, y: 356, width: 254, height: 92, title: "Cheaper", rows: [["", "Luke only"]], action: { kind: "cost", label: "$" } })}

      <circle class="port" cx="286" cy="288" r="4" />
      <circle class="port" cx="399" cy="288" r="4" />
      <circle class="port" cx="672" cy="270" r="4" />
      <circle class="port" cx="672" cy="306" r="4" />
      <circle class="port" cx="808" cy="175" r="4" />
      <circle class="port" cx="808" cy="402" r="4" />

      <rect id="glint-halo" class="glint-halo" x="604" y="264" width="46" height="48" rx="9" pathLength="100" />
      <rect id="glint" class="glint" x="604" y="264" width="46" height="48" rx="9" pathLength="100" />
      <circle id="port-flash" class="port-flash" cx="0" cy="0" r="5" visibility="hidden" />
      <circle id="pulse-halo" class="pulse-halo" cx="0" cy="0" r="7" visibility="hidden" />
      <circle id="pulse" class="pulse-core" cx="0" cy="0" r="3.6" visibility="hidden" />
      <circle id="arrival" class="arrival" cx="0" cy="0" r="5" visibility="hidden" />
    </g>
  `;
  host.appendChild(svg);

  const requestNode = svg.querySelector("#request-node");
  const runButton = svg.querySelector("#request-arrow");
  const requestValue = requestNode.querySelector(".n-value");
  const camera = svg.querySelector("#camera");
  const decisionMark = svg.querySelector(".decision-control text");
  const primaryNode = svg.querySelector("#primary-node");
  const cheapNode = svg.querySelector("#cheap-node");
  const primaryRoute = svg.querySelector(".route-primary");
  const cheapRoute = svg.querySelector(".route-cheap");
  const pulse = svg.querySelector("#pulse");
  const pulseHalo = svg.querySelector("#pulse-halo");
  const arrival = svg.querySelector("#arrival");
  const portFlash = svg.querySelector("#port-flash");
  const glint = svg.querySelector("#glint");
  const glintHalo = svg.querySelector("#glint-halo");
  const primaryPath = svg.querySelector("#route-primary-path");
  const cheapPath = svg.querySelector("#route-cheap-path");
  const requestPath = svg.querySelector("#route-request-path");

  const sounds = createSoundEvents(event => context.sound?.(event));
  let choiceIndex = 0;
  let manual = null;
  let animationFrame = 0;
  let destroyed = false;
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ?? { matches: false };

  function setCirclePosition(circle, point, visible) {
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("visibility", visible ? "visible" : "hidden");
  }

  function draw(state, renderTime = meta.duration, manualRender = false, playing = false) {
    const events = [];
    if (state.inputProgress > .38 && state.inputProgress < 1) events.push({key: `request:${state.user}`, event: 'request'});
    if (state.progress > .5 && state.progress < 1) events.push({key: `route:${state.user}`, event: 'route'});
    if (state.arrivalProgress > .38 && state.arrivalProgress < 1) events.push({key: `arrival:${state.user}`, event: 'arrival'});
    sounds.sample(renderTime, events, playing);
    const route = state.route;
    const progress = clamp(state.progress || 0);
    const arrivalProgress = clamp(state.arrivalProgress || 0);
    const user = state.user;
    const targetNode = route === "cheap" ? cheapNode : primaryNode;
    const targetCost = targetNode.querySelector(".cost");
    const path = route === "cheap" ? cheapPath : primaryPath;
    const pathElement = route === "cheap" ? cheapRoute : primaryRoute;
    const otherPath = route === "cheap" ? primaryRoute : cheapRoute;
    const target = route === "cheap" ? { x: 808, y: 402 } : { x: 808, y: 175 };
    const motionAllowed = !reducedMotion.matches;
    const introScale = motionAllowed && !manualRender ? mix(.92, 1, ease(clamp(renderTime / 1.4))) : 1;
    camera.setAttribute("transform", `translate(545 290) scale(${introScale.toFixed(4)}) translate(-545 -290)`);

    requestValue.textContent = user;
    const decision = state.decision || route;
    decisionMark.textContent = state.pending || !decision ? "?" : decision === "cheap" ? "↓" : "↑";
    decisionMark.parentElement.classList.toggle("is-active", Boolean(state.decisionProgress));
    primaryNode.querySelector(".cost").classList.remove("hit");
    cheapNode.querySelector(".cost").classList.remove("hit");
    primaryRoute.classList.remove("active");
    cheapRoute.classList.remove("active");
    setCirclePosition(pulse, { x: 0, y: 0 }, false);
    setCirclePosition(pulseHalo, { x: 0, y: 0 }, false);
    setCirclePosition(portFlash, { x: 0, y: 0 }, false);
    portFlash.setAttribute("r", "4");
    portFlash.style.opacity = "0";
    glint.style.opacity = "0";
    glintHalo.style.opacity = "0";
    glint.style.strokeDashoffset = "0";
    glintHalo.style.strokeDashoffset = "0";
    arrival.setAttribute("visibility", "hidden");
    arrival.setAttribute("cx", "0");
    arrival.setAttribute("cy", "0");
    arrival.setAttribute("r", "5");
    arrival.setAttribute("opacity", "0");

    if (!route) {
      if (motionAllowed && state.inputProgress > 0) {
        const point = requestPath.getPointAtLength(requestPath.getTotalLength() * ease(state.inputProgress));
        setCirclePosition(pulse, point, true);
        setCirclePosition(pulseHalo, point, true);
      }
      if (motionAllowed && state.decisionProgress > 0) {
        const decisionProgress = clamp(state.decisionProgress);
        const glintProgress = clamp((decisionProgress - .08) / .62);
        const glintOpacity = Math.sin(glintProgress * Math.PI);
        glint.style.strokeDashoffset = String(95 - glintProgress * 100);
        glintHalo.style.strokeDashoffset = String(95 - glintProgress * 100);
        glint.style.opacity = String(glintOpacity);
        glintHalo.style.opacity = String(glintOpacity * .55);
        if (decisionProgress > .68) {
          const flashProgress = clamp((decisionProgress - .68) / .32);
          const port = state.decision === "cheap" ? { x: 672, y: 306 } : { x: 672, y: 270 };
          setCirclePosition(portFlash, port, true);
          portFlash.setAttribute("r", String(4 + flashProgress * 4));
          portFlash.style.opacity = String(Math.sin(flashProgress * Math.PI));
        }
      }
      return;
    }
    pathElement.classList.add("active");
    otherPath.classList.remove("active");
    const length = path.getTotalLength();
    const point = path.getPointAtLength(length * progress);
    if (motionAllowed && progress > 0 && progress < 0.98) {
      setCirclePosition(pulse, point, true);
      setCirclePosition(pulseHalo, point, true);
    }
    if (arrivalProgress > 0 && arrivalProgress < 1) {
      arrival.setAttribute("cx", target.x);
      arrival.setAttribute("cy", target.y);
      arrival.setAttribute("r", String(3 + arrivalProgress * 12));
      arrival.setAttribute("opacity", motionAllowed ? String(.7 * (1 - arrivalProgress) ** 2) : "0");
      arrival.setAttribute("visibility", motionAllowed ? "visible" : "hidden");
      if (arrivalProgress > .12) targetCost.classList.add("hit");
    }
  }

  function render(timeSeconds, {playing = false} = {}) {
    if (destroyed || manual) return;
    const state = timeline(timeSeconds);
    choiceIndex = Math.max(0, USERS.indexOf(state.user));
    draw(state, timeSeconds, false, playing);
  }

  function runManual() {
    context.pause?.();
    context.prepareSound?.();
    cancelAnimationFrame(animationFrame);
    const user = USERS[choiceIndex];
    const route = user === "Luke" ? "cheap" : "primary";
    manual = { user, route, startedAt: performance.now() };
    sounds.reset();
    sounds.sample(0, []);
    context.announce?.(`${user}'s request is routing to the ${route === "cheap" ? "cheaper" : "primary"} model.`);
    const tick = (now) => {
      if (!manual || destroyed) return;
      const elapsed = (now - manual.startedAt) / 1000;
      if (elapsed < .55) draw({ user, route: null, pending: true, inputProgress: elapsed / .55 }, elapsed, true, true);
      else if (elapsed < 1.1) draw({ user, route: null, pending: false, decision: route, decisionProgress: (elapsed - .55) / .55 }, elapsed, true, true);
      else draw({ user, route, pending: false, progress: clamp((elapsed - 1.1) / 1.3), arrivalProgress: clamp((elapsed - 2.35) / .7) }, elapsed, true, true);
      if (elapsed < 3.05) animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
  }

  function cycleUser() {
    context.pause?.();
    choiceIndex = (choiceIndex + 1) % USERS.length;
    cancelAnimationFrame(animationFrame);
    const user = USERS[choiceIndex];
    manual = { user, route: null };
    draw({ user, route: null, pending: true, progress: 0 }, 0, true);
    context.announce?.(`Request user ID changed to ${user}.`);
  }

  function activate(handler) {
    return (event) => {
      if (event.type === "click" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handler();
      }
    };
  }

  const cycle = activate(cycleUser);
  const run = activate(runManual);
  requestNode.addEventListener("click", cycle);
  requestNode.addEventListener("keydown", cycle);
  runButton.addEventListener("click", run);
  runButton.addEventListener("keydown", run);

  function stop() { cancelAnimationFrame(animationFrame); }

  function reset() {
    stop();
    sounds.reset();
    manual = null;
    choiceIndex = 0;
    draw(timeline(0), 0);
  }

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(animationFrame);
    requestNode.removeEventListener("click", cycle);
    requestNode.removeEventListener("keydown", cycle);
    runButton.removeEventListener("click", run);
    runButton.removeEventListener("keydown", run);
    svg.remove();
  }

  reset();
  return { render, reset, stop, destroy };
}
