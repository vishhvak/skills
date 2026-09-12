import { mountDiagram } from "./blog.js";

export const meta = {
  id: "editor",
  title: "Live document",
  description: "A hot-reloaded article shifts between reading and live editing.",
  duration: 17.6,
  viewBox: [1024, 696],
  capabilities: ["playback", "seek", "interactive", "contenteditable"],
};

const SECOND_TEXT = "Thus, in OpenCode 2, we’ve gone through the trouble of making all reloading as unbearably hot as possible.";
const THIRD_TEXT = "OpenCode can edit its config, connect an MCP server, or write a plugin, and any changes will immediately take effect across every session. It can make a tool for itself and invoke it the very same turn—without needing to quit, type /reload, start a new session, and certainly without busting the cache.";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (value) => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};
const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function firstMarkup() {
  return `Let’s discuss the subtle pleasures of <em>hot reloading</em>. It spares us from the tedium of minor exertions, of hitting <kbd>⌘</kbd> <kbd>R</kbd> when we could have otherwise remained blissfully inert. To the human mind, the gulf between even the most negligible of impediments and <em>none whatsoever</em> is infinite.`;
}

function secondMarkup(time) {
  const prefix = "Thus, in ";
  const suffix = " 2, we’ve gone through the trouble of making all reloading as unbearably ";
  const end = " as possible.";
  if (time < 7.35) return `${prefix}OpenCode${suffix}<em>hot</em>${end}`;
  if (time < 8.55) return `${prefix}OpenCode${suffix}<em>hot</em>${end}<span class="caret-thin"></span>`;
  if (time < 9.2) return `${prefix}OpenCode${suffix}<em>hot</em>${end}<span class="typed selected">WOW</span>`;
  if (time < 10.45) return `${prefix}OpenCode${suffix}<em>hot</em>${end} <span class="typed selected">W</span>OWOWO`;
  if (time < 10.95) return `${prefix}OpenCode${suffix}<em>hot</em>${end}<span class="typed selected">WOW</span>`;
  if (time < 12.55) return `${prefix}OpenCode 2, <span class="selected">we’ve gone through</span> the trouble of making all reloading as unbearably <em>hot</em> as possible.`;
  if (time < 13.75) return `${prefix}OpenCode${suffix}<em>hot</em>${end}<span class="blank-line"><br></span>`;
  if (time < 14.55) return `${prefix}OpenCode${suffix}<em>hot</em>${end}`;
  if (time < 15.55) return `${prefix}OpenCode${suffix}<em>hot</em>${end} lol. u<span class="caret-thin"></span>`;
  if (time < 16.8) return `${prefix}OpenCode${suffix}<em>hot</em>${end}<span class="caret-thin"></span>`;
  return `${prefix}OpenCode${suffix}<em>hot</em>${end}`;
}

function articleOffset(time) {
  if (time <= 1.8) return 107 - 580 * smooth(time / 1.8);
  if (time <= 2.4) return -473;
  if (time <= 3.8) return -473 + 580 * smooth((time - 2.4) / 1.4);
  return 107;
}

function markup() {
  return `
    <style>
      .editor-shell { position:relative; width:100%; height:100%; overflow:hidden; background:transparent; }
      .editor-canvas { position:absolute; width:1024px; height:696px; transform-origin:0 0; overflow:hidden; background:#030303; color:#d0cec7; }
      .editor-page { position:absolute; left:181px; top:0; width:638px; }
      .editor-paragraph { margin:0 0 39px; font-family:Baskerville,"Times New Roman",serif; font-size:23px; line-height:35.64px; letter-spacing:.05px; color:#d5d2cc; }
      .editor-paragraph[data-first] { font-size:24px; }
      .editor-paragraph[data-third] { font-size:23.5px; }
      .editor-paragraph em { font-style:italic; }
      .editor-paragraph kbd { display:inline-block; min-width:21px; height:22px; padding:0 4px; border:1px solid #3a3a38; border-radius:3px; background:#171716; font:14px/20px "CommitMono","SFMono-Regular",monospace; text-align:center; vertical-align:2px; color:#868681; box-sizing:border-box; }
      .editor-paragraph.dim { opacity:.34; }
      .editor-paragraph.focus { opacity:1; }
      .editor-paragraph.settled { opacity:.92; }
      .editor-middle-wrap { position:relative; margin:0 0 39px; }
      .editor-middle-wrap .editor-paragraph { margin:0; }
      .editor-auto { cursor:text; }
      .editor-live { display:none; outline:none; white-space:pre-wrap; overflow-wrap:anywhere; caret-color:#dedbd4; }
      .editor-shell.user-mode .editor-auto { display:none; }
      .editor-shell.user-mode .editor-live { display:block; }
      .editor-live:focus { background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,.012) 50%, transparent 100%); }
      .selected { color:#e2dfd8; background:#514d45; box-shadow:0 0 0 1px rgba(220,214,203,.08); }
      .typed { font-style:normal; }
      .caret-block { display:inline-block; width:10px; height:30px; margin-right:-10px; vertical-align:-5px; background:#706b62; opacity:.8; }
      .caret-thin { display:inline-block; width:1px; height:28px; margin-left:2px; vertical-align:-5px; background:#d9d6cf; }
      .blank-line { display:block; height:25px; background:rgba(129,144,111,.035); }
      .editor-status { display:none; height:20px; margin-top:-31px; margin-bottom:11px; padding-left:8px; font:11px/20px "CommitMono","SFMono-Regular",monospace; color:#c12632; background:rgba(68,75,56,.12); }
      .editor-status.show { display:block; }
      .editor-diagram { width:724px; height:255px; margin:43px 0 0 -97px; opacity:.82; }
      .editor-diagram svg { display:block; }
    </style>
    <div class="editor-shell">
      <div class="editor-canvas">
        <main class="editor-page" aria-label="Live document">
          <p class="editor-paragraph" data-first>${firstMarkup()}</p>
          <div class="editor-middle-wrap">
            <p class="editor-paragraph editor-auto" data-auto tabindex="0" role="button" aria-label="Edit the highlighted paragraph"></p>
            <p class="editor-paragraph editor-live" data-live contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false" aria-label="Editable paragraph"></p>
            <div class="editor-status" data-status>1 lines yanked</div>
          </div>
          <p class="editor-paragraph" data-third>${escapeHtml(THIRD_TEXT)}</p>
          <div class="editor-diagram" data-diagram aria-hidden="true" inert></div>
        </main>
      </div>
    </div>`;
}

function moveCaretToEnd(element) {
  const selection = window.getSelection?.();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function mount(host, context = {}) {
  host.innerHTML = markup();
  const shell = host.querySelector(".editor-shell");
  const canvas = shell.querySelector(".editor-canvas");
  const page = shell.querySelector(".editor-page");
  const first = shell.querySelector("[data-first]");
  const auto = shell.querySelector("[data-auto]");
  const live = shell.querySelector("[data-live]");
  const status = shell.querySelector("[data-status]");
  const third = shell.querySelector("[data-third]");
  const diagramHost = shell.querySelector("[data-diagram]");
  const diagram = mountDiagram(diagramHost, context);
  let userMode = false;
  let lastAutoText = SECOND_TEXT;

  function resize() {
    const width = host.clientWidth || 1024;
    const height = host.clientHeight || 696;
    const scale = Math.min(width / meta.viewBox[0], height / meta.viewBox[1]);
    const left = (width - meta.viewBox[0] * scale) / 2;
    const top = (height - meta.viewBox[1] * scale) / 2;
    canvas.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
  }

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  resize();

  function beginEditing() {
    if (!userMode) {
      userMode = true;
      live.textContent = lastAutoText;
      shell.classList.add("user-mode");
    }
    first.className = "editor-paragraph dim";
    third.className = "editor-paragraph dim";
    live.className = "editor-paragraph editor-live focus";
    status.classList.remove("show");
    context.pause?.();
    live.focus({ preventScroll: true });
    moveCaretToEnd(live);
    context.announce?.("Paragraph editing enabled");
  }

  function onLiveFocus() {
    context.pause?.();
    first.className = "editor-paragraph dim";
    third.className = "editor-paragraph dim";
    live.className = "editor-paragraph editor-live focus";
  }

  function onAutoKey(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    beginEditing();
  }

  function onInput() {
    context.pause?.();
    context.announce?.("Document updated");
  }

  function onLiveKey(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    live.blur();
    context.announce?.("Paragraph editing ended");
  }

  auto.addEventListener("click", beginEditing);
  auto.addEventListener("keydown", onAutoKey);
  live.addEventListener("focus", onLiveFocus);
  live.addEventListener("input", onInput);
  live.addEventListener("keydown", onLiveKey);

  function render(timeSeconds) {
    const time = clamp(Number(timeSeconds) || 0, 0, meta.duration);
    page.style.top = `${articleOffset(time).toFixed(2)}px`;
    diagram.render(clamp(10.5 + time * 0.3, 0, 23));
    if (userMode) return;

    auto.innerHTML = secondMarkup(time);
    lastAutoText = auto.textContent || SECOND_TEXT;
    status.classList.toggle("show", time >= 12.55 && time < 13.75);

    const settled = time < 3.25 || time >= 16.8;
    const middleFocused = time >= 5.6 && !settled;
    const thirdFocused = time >= 3.25 && time < 5.6;
    first.className = `editor-paragraph ${settled ? "settled" : "dim"}`;
    auto.className = `editor-paragraph editor-auto ${settled ? "settled" : middleFocused ? "focus" : "dim"}`;
    third.className = `editor-paragraph ${settled ? "settled" : thirdFocused ? "focus" : "dim"}`;
  }

  function reset() {
    userMode = false;
    shell.classList.remove("user-mode");
    live.textContent = SECOND_TEXT;
    live.className = "editor-paragraph editor-live";
    live.blur();
    status.classList.remove("show");
    render(0);
  }

  function destroy() {
    observer?.disconnect();
    auto.removeEventListener("click", beginEditing);
    auto.removeEventListener("keydown", onAutoKey);
    live.removeEventListener("focus", onLiveFocus);
    live.removeEventListener("input", onInput);
    live.removeEventListener("keydown", onLiveKey);
    diagram.destroy();
    host.innerHTML = "";
  }

  reset();
  return { render, reset, destroy };
}
