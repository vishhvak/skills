export const meta = {
  id: "blog",
  title: "Live tools and skills",
  description: "An OpenCode session teaches itself new writing tools without reloading.",
  duration: 49.05,
  viewBox: [1080, 760],
  capabilities: ["playback", "seek", "interactive", "accordion"],
};

const PARAGRAPH = [
  "OpenCode can edit its config, connect an MCP server, or write a",
  "plugin, and any changes will immediately take effect across every",
  "session. It can make a tool for itself and invoke it the very same",
  "turn—without needing to quit, type /reload, start a new session,",
  "and certainly without busting the cache.",
];

const TOOL_NAMES = ["READ", "WRITE", "SHELL", "WORD_COUNT", "READING_TIME"];
const SKILL_NAMES = ["writing-shape", "edit-article", "grill-me"];

const SESSION_LINES = [
  { at: 0, kind: "message", text: "My boss Dax told me I needed to write a blog post, and I don't" },
  { at: 0, kind: "message", text: "know what to do. Can you write it for me while I go outside?" },
  { at: 0, kind: "space", text: "" },
  { at: 0, kind: "message", text: "I'll start a draft." },
  { at: 0, kind: "command", text: "↗ WRITE  the-post.md", value: "+232" },
  { at: 0, kind: "command", text: "↗ READ   the-post.md" },
  { at: 1.9, kind: "space", text: "" },
  { at: 2.0, kind: "message", text: "I'll add a word-count tool." },
  { at: 2.4, kind: "command", text: "↗ WRITE  .opencode/plugins/writing.ts", value: "+18" },
  { at: 4.4, kind: "command strong", text: "↗ WORD_COUNT  the-post.md", value: "1,248 words" },
  { at: 7.1, kind: "space", text: "" },
  { at: 7.4, kind: "message", text: "I'll install grill-me and load it." },
  { at: 8.2, kind: "command", text: "$ SHELL  bunx skills add … --skill grill-me" },
  { at: 9.5, kind: "command strong", text: "♦ LOAD SKILL  grill-me" },
  { at: 13.2, kind: "space", text: "" },
  { at: 13.5, kind: "message", text: "I'll add reading time, too." },
  { at: 14.5, kind: "command", text: "↗ WRITE  .opencode/plugins/writing.ts", value: "+14" },
  { at: 19.5, kind: "command strong", text: "↗ READING_TIME  the-post.md", value: "6 min read" },
  { at: 25.5, kind: "space", text: "" },
  { at: 26.0, kind: "message", text: "I'll add a word-count tool." },
  { at: 28.7, kind: "command", text: "↗ WRITE  .opencode/plugins/writing.ts", value: "+18" },
  { at: 30.2, kind: "command strong", text: "↗ WORD_COUNT  the-post.md", value: "1,248 words" },
  { at: 33.0, kind: "space", text: "" },
  { at: 33.4, kind: "message", text: "I'll install grill-me and load it." },
  { at: 34.3, kind: "command", text: "$ SHELL  bunx skills add … --skill grill-me" },
  { at: 35.5, kind: "command strong", text: "♦ LOAD SKILL  grill-me" },
  { at: 39.3, kind: "space", text: "" },
  { at: 39.7, kind: "message", text: "I'll add reading time, too." },
  { at: 41.0, kind: "command", text: "↗ WRITE  .opencode/plugins/writing.ts", value: "+14" },
  { at: 44.6, kind: "command strong", text: "↗ READING_TIME  the-post.md", value: "6 min read" },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (value) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const PANEL_EVENTS = [2.85, 8.35, 17.85, 27.95, 33.35, 42.95];

function accordionProgress(time) {
  let progress = 0;
  for (const [at, open] of [[9.6, true], [12.8, false], [34.8, true], [39.8, false]]) {
    if (time < at) break;
    const phase = reducedMotion() ? 1 : smooth((time - at) / .42);
    progress = open ? phase : 1 - phase;
  }
  return progress;
}
function phaseState(time) {
  const tools =
    time < 4.1 ? 3 :
      time < 19.2 ? 4 :
        time < 23.8 ? 5 :
          time < 29.2 ? 3 :
            time < 44.3 ? 4 :
              time < 47.4 ? 5 : 3;
  const skills =
    time < 9.3 ? 2 :
      time < 23.8 ? 3 :
        time < 34.4 ? 2 :
          time < 47.4 ? 3 : 2;
  const skillsOpen =
    (time >= 9.6 && time < 12.8) ||
    (time >= 34.8 && time < 39.8);
  return {
    tools,
    skills,
    skillsOpen,
    hasSkillTree: (time >= 8.4 && time < 23.8) || (time >= 33.8 && time < 47.4),
    hasSkillFile: (time >= 9.3 && time < 23.8) || (time >= 34.4 && time < 47.4),
  };
}

function iconFolder(x, y, label) {
  return `<g transform="translate(${x} ${y})"><path class="folder" d="M0 3h7l2 2h10v12H0z"/><text x="27" y="14">${label}</text></g>`;
}

function iconFile(x, y, label) {
  return `<g transform="translate(${x} ${y})"><path class="file" d="M1 1h10l5 5v15H1zM11 1v6h5"/><text x="27" y="15">${label}</text></g>`;
}

function markup() {
  const paragraph = PARAGRAPH.map((line, index) => `<tspan x="153" y="${67 + index * 45}" textLength="${[806, 806, 804, 811, 483][index]}" lengthAdjust="spacingAndGlyphs">${line}</tspan>`).join("");
  const tools = TOOL_NAMES.map((name, index) => `<text class="tool-row" data-tool="${index}" x="78" y="${414 + index * 38}">${name}</text>`).join("");
  const skills = SKILL_NAMES.map((name, index) => `<text class="skill-row" data-skill="${index}" x="78" y="${454 + index * 39}">${name}</text>`).join("");
  const lines = SESSION_LINES.map((line, index) => `<g class="session-line ${line.kind}" data-line="${index}"><text x="0" y="0">${line.text}</text>${line.value ? `<text class="value" x="518" y="0" text-anchor="end">${line.value}</text>` : ""}</g>`).join("");

  return `
    <style>
      .blog-scene { width:100%; height:100%; display:block; background:transparent; color:#777; }
      .blog-scene text { font-family:"CommitMono", "SFMono-Regular", Consolas, monospace; }
      .blog-scene .lede { font-family:Georgia, "Times New Roman", serif; font-size:28.5px; letter-spacing:.15px; fill:#d0cec7; }
      .blog-scene .wire, .blog-scene .panel-line { fill:none; stroke:#202020; stroke-width:1; }
      .blog-scene .port { fill:#5e5e5e; }
      .blog-scene .pulse { fill:#ccc; }
      .blog-scene .signal-tail { fill:none; stroke-width:1.4; stroke-linecap:round; }
      .blog-scene .signal-halo { fill:url(#blog-halo); pointer-events:none; }
      .blog-scene .panel { fill:#050505; stroke:#202020; stroke-width:1; }
      .blog-scene .panel-header { fill:#0c0c0c; }
      .blog-scene .activity-edge { fill:none; stroke:url(#blog-edge-light); stroke-width:1.4; pointer-events:none; }
      .blog-scene .heading { fill:#686868; font-size:11px; letter-spacing:1.35px; }
      .blog-scene .count { fill:#858585; letter-spacing:0; }
      .blog-scene .chevron { fill:none; stroke:#666; stroke-width:1.2; }
      .blog-scene .tool-row, .blog-scene .skill-row { fill:#777; font-size:14px; }
      .blog-scene .tool-row.active, .blog-scene .skill-row.active { fill:#d6d6d2; }
      .blog-scene .session-line { font-size:12px; fill:#505050; opacity:0; }
      .blog-scene .session-line.message { fill:#646464; font-size:13px; }
      .blog-scene .session-line.strong { fill:#aaa; }
      .blog-scene .session-line .value { fill:#777; }
      .blog-scene .folder, .blog-scene .file { fill:none; stroke:#686868; stroke-width:1.15; }
      .blog-scene .tree text { fill:#777; font-size:13px; }
      .blog-scene .tree .dim { opacity:.36; }
      .blog-scene .hit { fill:transparent; cursor:pointer; }
      .blog-scene .hit:hover + .hover-label { fill:#aaa; }
    </style>
    <svg class="blog-scene" viewBox="0 0 1080 760" role="group" aria-labelledby="blog-title blog-desc">
      <title id="blog-title">OpenCode adds live tools and skills</title>
      <desc id="blog-desc">An animated terminal diagram showing a session editing plugins and loading skills without reloading.</desc>
      <defs>
        <clipPath id="session-clip"><rect x="235" y="387" width="558" height="280"/></clipPath>
        <clipPath id="left-clip"><rect x="58" y="387" width="176" height="280"/></clipPath>
        <clipPath id="blog-tools-clip"><rect data-tools-clip x="58" y="387" width="176" height="234"/></clipPath>
        <radialGradient id="blog-halo"><stop stop-color="#ddd" stop-opacity=".25"/><stop offset=".25" stop-color="#ddd" stop-opacity=".10"/><stop offset="1" stop-color="#ddd" stop-opacity="0"/></radialGradient>
        <radialGradient id="blog-edge-light" gradientUnits="userSpaceOnUse" r="95"><stop stop-color="#bbb" stop-opacity=".8"/><stop offset="1" stop-color="#bbb" stop-opacity="0"/></radialGradient>
        <linearGradient id="blog-text-shimmer" gradientUnits="userSpaceOnUse" x1="-150" x2="0"><stop stop-color="#727272"/><stop offset=".45" stop-color="#888"/><stop offset=".66" stop-color="#ddd"/><stop offset="1" stop-color="#727272"/></linearGradient>
        ${["top", "side", "bridge"].map(name => `<linearGradient id="blog-tail-${name}" gradientUnits="userSpaceOnUse"><stop stop-color="#ccc" stop-opacity="0"/><stop offset="1" stop-color="#ccc" stop-opacity=".8"/></linearGradient>`).join("")}
      </defs>
      <rect width="1080" height="760" fill="#030303"/>
      <g class="page">
        <text class="lede">${paragraph}</text>
        <g class="diagram" transform="translate(0 20)">
          <path id="top-wire" class="wire" d="M58 364H45Q32 364 32 351V328Q32 315 45 315H928Q941 315 941 328V341"/>
          <path id="side-wire" class="wire" d="M58 364H45Q32 364 32 377V615Q32 644 45 628H58"/>
          <path id="bridge-wire" class="wire" d="M793 496H829"/>
          <circle class="port" cx="58" cy="364" r="4"/><circle class="port" cx="58" cy="644" r="4"/>
          <circle class="port" cx="941" cy="341" r="4"/><circle class="port" cx="793" cy="496" r="4"/><circle class="port" cx="829" cy="496" r="4"/>
          ${["top", "side", "bridge"].map(name => `<path class="signal-tail" data-tail="${name}" stroke="url(#blog-tail-${name})"/><circle class="signal-halo" data-halo="${name}" r="12"/><circle class="pulse" data-pulse="${name}" r="3.8"/>`).join("")}
          <rect class="panel" x="58" y="341" width="735" height="326"/>
          <rect class="panel-header" x="59" y="342" width="733" height="44"/>
          <rect class="panel-header" data-skills-header x="59" y="622" width="174" height="44"/>
          <path class="panel-line" d="M58 387H793M234 341V651M58 605H234"/>
          <rect class="panel" x="829" y="341" width="228" height="326"/>
          <rect class="panel-header" x="830" y="342" width="226" height="44"/>
          <path class="panel-line" d="M829 387H1057"/>
          <text class="heading hover-label" x="78" y="367">TOOLS <tspan class="count" data-tools-count>3</tspan></text>
          <path class="chevron" data-tools-chevron d="M209 361l4 4 4-4"/>
          <rect class="hit" data-toggle="tools" x="58" y="341" width="176" height="46" role="button" tabindex="0" aria-label="Toggle tools"/>
          <text class="heading" x="78" y="648">SKILLS <tspan class="count" data-skills-count>2</tspan></text>
          <path class="chevron" data-skills-chevron d="M211 624l4 4-4 4"/>
          <rect class="hit" data-toggle="skills" x="58" y="621" width="176" height="46" role="button" tabindex="0" aria-label="Toggle skills"/>
          <g data-tools-body clip-path="url(#blog-tools-clip)">${tools}</g>
          <g clip-path="url(#left-clip)"><g data-skills-body>${skills}</g></g>
          <text class="heading" x="255" y="367">SESSION</text>
          <g clip-path="url(#session-clip)"><g data-session transform="translate(255 418)">${lines}</g></g>
          <text class="heading" x="850" y="367">FILES</text>
          <g class="tree">
            ${iconFolder(857, 408, ".opencode")}
            ${iconFolder(877, 438, "plugins")}
            <g data-plugin-file>${iconFile(898, 467, "writing.ts")}</g>
            <g data-skill-tree>
              ${iconFolder(877, 498, "skills")}
              ${iconFolder(898, 528, "grill-me")}
              <g data-skill-file>${iconFile(919, 557, "SKILL.md")}</g>
            </g>
            <g data-post-file>${iconFile(857, 587, "the-post.md")}</g>
          </g>
          <rect class="activity-edge" data-files-glint x="829" y="341" width="228" height="326" opacity="0"/>
          <path class="activity-edge" data-inventory-glint d="M58 387V341H234V387" opacity="0"/>
        </g>
        <text class="lede" data-next-heading x="153" y="724" opacity="0" aria-hidden="true">How it works</text>
      </g>
    </svg>`;
}

export function mount(host, context = {}) {
  host.innerHTML = markup();
  const svg = host.querySelector(".blog-scene");
  const nextHeading = svg.querySelector("[data-next-heading]");
  const camera = svg.querySelector(".page");
  svg.appendChild(nextHeading);
  const toolsBody = svg.querySelector("[data-tools-body]");
  const toolsClip = svg.querySelector("[data-tools-clip]");
  const skillsHeader = svg.querySelector("[data-skills-header]");
  const skillsBody = svg.querySelector("[data-skills-body]");
  const toolsHeaderLine = svg.querySelector(".panel-line");
  const skillsCount = svg.querySelector("[data-skills-count]");
  const toolsCount = svg.querySelector("[data-tools-count]");
  const skillsLabel = skillsCount.closest("text");
  const skillsHit = svg.querySelector('[data-toggle="skills"]');
  const toolsChevron = svg.querySelector("[data-tools-chevron]");
  const skillsChevron = svg.querySelector("[data-skills-chevron]");
  const session = svg.querySelector("[data-session]");
  const lines = [...svg.querySelectorAll("[data-line]")];
  const toolRows = [...svg.querySelectorAll("[data-tool]")];
  const skillRows = [...svg.querySelectorAll("[data-skill]")];
  const skillTree = svg.querySelector("[data-skill-tree]");
  const skillFile = svg.querySelector("[data-skill-file]");
  const postFile = svg.querySelector("[data-post-file]");
  const pluginFile = svg.querySelector("[data-plugin-file]");
  const toolsHit = svg.querySelector('[data-toggle="tools"]');
  const paths = {
    top: svg.querySelector("#top-wire"),
    side: svg.querySelector("#side-wire"),
    bridge: svg.querySelector("#bridge-wire"),
  };
  const pulses = Object.fromEntries([...svg.querySelectorAll("[data-pulse]")].map((node) => [node.dataset.pulse, node]));
  const halos = Object.fromEntries([...svg.querySelectorAll("[data-halo]")].map((node) => [node.dataset.halo, node]));
  const tails = Object.fromEntries([...svg.querySelectorAll("[data-tail]")].map((node) => [node.dataset.tail, node]));
  const gradients = Object.fromEntries(["top", "side", "bridge"].map(name => [name, svg.querySelector(`#blog-tail-${name}`)]));
  const edgeLight = svg.querySelector("#blog-edge-light");
  const filesGlint = svg.querySelector("[data-files-glint]");
  const inventoryGlint = svg.querySelector("[data-inventory-glint]");
  const textShimmer = svg.querySelector("#blog-text-shimmer");
  const sidePort = svg.querySelector('.port[cx="58"][cy="644"]');
  const linePositions = [];
  SESSION_LINES.reduce((y, item, index) => {
    linePositions.push(y);
    return y + (index < 2 ? 23 : item.kind === "space" ? 30 : 29);
  }, 0);
  let override = null;
  let openFraction = 0;
  let layoutFrame = 0;

  function setAccordion(progress) {
    openFraction = clamp(progress, 0, 1);
    const skillsOpen = openFraction >= .5;
    const y = 621 - 234 * openFraction;
    toolsClip.setAttribute("height", String(234 * (1 - openFraction)));
    toolsBody.style.opacity = String(1 - openFraction);
    toolsBody.setAttribute("aria-hidden", String(openFraction > .98));
    skillsBody.style.opacity = String(openFraction);
    skillsBody.setAttribute("aria-hidden", String(openFraction < .02));
    skillsBody.setAttribute("transform", `translate(0 ${234 * (1 - openFraction)})`);
    skillsLabel.setAttribute("y", String(y + 27));
    skillsHit.setAttribute("y", String(y));
    skillsHeader.setAttribute("y", String(y + 1));
    skillsChevron.setAttribute("d", skillsOpen ? `M209 ${y + 18}l4 4 4-4` : `M211 ${y + 19}l4 4-4 4`);
    toolsChevron.setAttribute("d", skillsOpen ? "M211 359l4 4-4 4" : "M209 361l4 4 4-4");
    toolsHeaderLine.setAttribute("d", `M58 387H793M234 341V651M58 ${y}H234M58 ${y + 44}H234`);
    toolsHit.setAttribute("aria-expanded", String(!skillsOpen));
    skillsHit.setAttribute("aria-expanded", String(skillsOpen));
    const portY = y + 23;
    sidePort.setAttribute("cy", String(portY));
    paths.side.setAttribute("d", `M58 364H45Q32 364 32 377V${portY - 13}Q32 ${portY} 45 ${portY}H58`);
  }

  function toggle(which) {
    override = which === "skills";
    context.pause?.();
    context.announce?.(`${override ? "Skills" : "Tools"} expanded`);
    cancelAnimationFrame(layoutFrame);
    const from = openFraction;
    const to = Number(override);
    const start = performance.now();
    if (reducedMotion()) { layoutFrame = 0; setAccordion(to); return; }
    const animate = now => {
      const p = clamp((now - start) / 300, 0, 1);
      setAccordion(from + (to - from) * smooth(p));
      layoutFrame = p < 1 ? requestAnimationFrame(animate) : 0;
    };
    layoutFrame = requestAnimationFrame(animate);
  }

  const clickHandlers = [];
  for (const hit of svg.querySelectorAll("[data-toggle]")) {
    const handler = (event) => {
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle(hit.dataset.toggle);
    };
    hit.addEventListener("click", handler);
    hit.addEventListener("keydown", handler);
    clickHandlers.push([hit, handler]);
  }

  function positionPulse(name, progress, reverse = false) {
    const path = paths[name];
    const length = path.getTotalLength();
    const active = progress !== null && !reducedMotion();
    const p = active ? clamp(progress, 0, 1) : 0;
    const distance = (reverse ? 1 - p : p) * length;
    const point = path.getPointAtLength(distance);
    const tailLength = Math.min(name === "top" ? 110 : 26, reverse ? length - distance : distance);
    const behind = path.getPointAtLength(distance + (reverse ? tailLength : -tailLength));
    const opacity = active ? Math.min(1, p * 14, (1 - p) * 18) : 0;
    pulses[name].setAttribute("cx", point.x.toFixed(2));
    pulses[name].setAttribute("cy", point.y.toFixed(2));
    pulses[name].style.opacity = String(opacity);
    halos[name].setAttribute("cx", point.x.toFixed(2));
    halos[name].setAttribute("cy", point.y.toFixed(2));
    halos[name].style.opacity = String(opacity * .65);
    tails[name].setAttribute("d", path.getAttribute("d"));
    tails[name].setAttribute("stroke-dasharray", `${tailLength} ${length + 1}`);
    tails[name].setAttribute("stroke-dashoffset", String(-(reverse ? distance : distance - tailLength)));
    tails[name].style.opacity = String(tailLength > .01 ? opacity : 0);
    for (const [key, value] of Object.entries({ x1: behind.x, y1: behind.y, x2: point.x, y2: point.y })) gradients[name].setAttribute(key, String(value));
    return active ? point : null;
  }

  function render(timeSeconds) {
    const time = clamp(Number(timeSeconds) || 0, 0, meta.duration);
    const state = phaseState(time);
    const zoomProgress = Math.min(smooth(time / 1.4), 1 - smooth((time - 47.4) / .8));
    const zoom = reducedMotion() ? 1 : .92 + .08 * zoomProgress;
    camera.setAttribute("transform", `translate(540 0) scale(${zoom.toFixed(5)}) translate(-540 0)`);
    nextHeading.setAttribute("opacity", String(1 - zoomProgress));
    nextHeading.setAttribute("aria-hidden", String(zoomProgress > .98));
    toolsCount.textContent = String(state.tools);
    skillsCount.textContent = String(state.skills);
    if (override === null) setAccordion(accordionProgress(time));
    else if (!layoutFrame) setAccordion(Number(override));

    toolRows.forEach((row, index) => {
      row.style.display = index < state.tools ? "block" : "none";
      row.classList.toggle("active", index === state.tools - 1 && state.tools > 3);
    });
    skillRows.forEach((row, index) => {
      row.style.display = index < state.skills ? "block" : "none";
      row.classList.toggle("active", index === 2 && state.skills === 3);
    });

    const lastVisible = SESSION_LINES.reduce((last, item, index) => item.at <= time ? index : last, -1);
    const scroll = Math.max(0, (linePositions[lastVisible] ?? 0) - 225);
    const previousScroll = Math.max(0, (linePositions[lastVisible - 1] ?? 0) - 225);
    const entering = smooth((time - (SESSION_LINES[lastVisible]?.at ?? 0)) / .32);
    const shownScroll = previousScroll + (scroll - previousScroll) * (reducedMotion() ? 1 : entering);
    session.setAttribute("transform", `translate(255 ${(422 - shownScroll).toFixed(2)})`);
    const commandIndex = SESSION_LINES.reduce((last, item, index) => item.at <= time && item.kind.includes("command") ? index : last, -1);
    const commandStart = commandIndex >= 0 ? (SESSION_LINES[commandIndex].at || 2.3) : 0;
    const busy = time >= commandStart && time < commandStart + 1.65 && !reducedMotion();
    const sweepX = -180 + ((time - commandStart) / 1.65) * 780;
    textShimmer.setAttribute("x1", String(sweepX));
    textShimmer.setAttribute("x2", String(sweepX + 180));
    lines.forEach((node, index) => {
      const item = SESSION_LINES[index];
      const visible = item.at <= time;
      node.style.opacity = visible ? String(index === commandIndex ? 1 : clamp(.85 - (time - item.at) * .025, .4, .85)) : "0";
      node.setAttribute("aria-hidden", String(!visible));
      node.setAttribute("transform", `translate(0 ${linePositions[index]})`);
      for (const text of node.querySelectorAll("text")) text.style.fill = index < 2 && time < 1.4 ? "#a5a5a5" : busy && index === commandIndex ? "url(#blog-text-shimmer)" : "";
    });

    skillTree.style.opacity = state.hasSkillTree ? "1" : "0";
    skillFile.style.opacity = state.hasSkillFile ? "1" : "0";
    const hasPlugin = (time >= 2.4 && time < 23.8) || (time >= 28.7 && time < 47.4);
    pluginFile.style.opacity = hasPlugin ? "1" : "0";
    postFile.setAttribute("transform", `translate(0 ${state.hasSkillTree ? 0 : hasPlugin ? -90 : -120})`);

    const eventAt = PANEL_EVENTS.find(at => time >= at && time <= at + 1.3);
    const topPoint = positionPulse("top", eventAt === undefined ? null : (time - eventAt) / 1.3, true);
    const sideAt = [9.35, 34.35].find(at => time >= at && time <= at + .42);
    positionPulse("side", sideAt === undefined ? null : (time - sideAt) / .42);
    const bridgeAt = PANEL_EVENTS.find(at => time >= at - .42 && time < at);
    const bridgePoint = positionPulse("bridge", bridgeAt === undefined ? null : (time - bridgeAt + .42) / .42);
    const litPoint = topPoint ?? bridgePoint;
    edgeLight.setAttribute("cx", String(litPoint?.x ?? 0));
    edgeLight.setAttribute("cy", String(litPoint?.y ?? 0));
    filesGlint.setAttribute("opacity", litPoint ? ".55" : "0");
    inventoryGlint.setAttribute("opacity", litPoint ? ".55" : "0");
  }

  function reset() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
    override = null;
    render(0);
  }

  function destroy() {
    cancelAnimationFrame(layoutFrame);
    for (const [node, handler] of clickHandlers) {
      node.removeEventListener("click", handler);
      node.removeEventListener("keydown", handler);
    }
    host.innerHTML = "";
  }

  reset();
  return { render, reset, destroy };
}

export function mountDiagram(host, context = {}) {
  const mounted = mount(host, context);
  const svg = host.querySelector(".blog-scene");
  svg.setAttribute("viewBox", "20 320 1050 370");
  svg.querySelector(".lede").style.display = "none";
  return mounted;
}
