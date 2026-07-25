# Component recipes

Verbatim-faithful build instructions for the signature set pieces. All from
the encyclopedia app's `web/components/` unless noted.

## 1. macOS app window (`app-window.tsx` pattern)

Shell:
```tsx
<div className="absolute rounded-xl bg-neutral-100 dark:bg-neutral-900 shadow-xl
                overflow-hidden flex flex-col border border-primary"
     style={{ top, left, width, height, zIndex,
              transform: `translate(${offsetX}px, ${offsetY}px)` }}>
  {/* titlebar — also the drag handle */}
  <div className="flex items-center gap-2 px-2.5 py-1.5 bg-neutral-200/80
                  dark:bg-neutral-800/80 border-b border-primary shrink-0
                  cursor-grab active:cursor-grabbing select-none">
    <TrafficLights />  {/* three w-2.5 h-2.5 rounded-full: #ff5f57 #febc2e #28c840 */}
    <span className="text-[11px] font-sans text-neutral-600 dark:text-neutral-400 truncate">{title}</span>
  </div>
  <div className="flex-1 min-h-0"><Content /></div>
</div>
```

- Dragging: pointer events on the titlebar only. `onPointerDown` records
  `{clientX, clientY, offsetX, offsetY}` + `setPointerCapture`; move applies
  deltas via parent state; up clears. Window body `onPointerDown` calls
  `onFocus` → bring-to-front (`topZ + 1` counter with per-window overrides).
- Positions are % strings against a `relative w-full max-w-[1440px] h-full
  overflow-hidden` stage, sizes in px (e.g. 720×495, 432×468).
- Larger hero frames (browser/terminal): titlebar `p-3`, lights `w-3 h-3`
  with `bg-red-400 bg-yellow-400 bg-green-400`, `shadow-2xl`, `max-w-4xl`.

### Faux app content (the miniaturization grammar)

Everything inside is real divs at `font-sans text-xs`, never screenshots:
- **Sidebar**: `w-[28–40%] shrink-0 bg-neutral-200/60 dark:bg-neutral-800/60
  border-r border-primary`, rows `px-2 py-0.5 truncate`, section label
  `text-[9px] font-semibold uppercase tracking-wider text-muted`
- **Selection**: `bg-blue-500/10 dark:bg-blue-500/20 text-blue-600` (calm) or
  `bg-blue-500 text-white` (Finder active row)
- **List columns**: flex with `flex-[3]/flex-[2]` spans, header row
  `text-[9px] text-neutral-400 border-b border-muted`
- **Avatars**: `w-7 h-7 rounded-full bg-<color>-500` + white initials
- **Chat bubbles**: sent `bg-blue-500 text-white` right, received
  `bg-neutral-200 dark:bg-neutral-700` left, `rounded-lg px-2 py-1 max-w-[80%]`
- **Maps**: bg `bg-emerald-100 dark:bg-emerald-950/40`, roads = absolute 1px
  neutral lines, visits = `w-1.5 h-1.5 rounded-full bg-blue-500/70`, current
  pin `bg-red-500 border-2 border-white shadow-sm`, zoom control = bordered
  white +/− stack
- **Waveform**: 80–100 flex-1 bars, height from a sin composite —
  `0.2 + envelope * 0.8 * (0.45 + 0.55 * noise)` where envelope ramps
  0–10%, sustains, tapers after 85%; bars `bg-blue-500/60` (app) or
  `bg-neutral-400/60 rounded-sm` (embedded player)
- **Desktop file icons** (`file.tsx`): folder = two stacked blue-400 divs
  (tab `h-1 w-5 rounded-md rounded-b-none` + body `w-11 h-8 rounded-sm
  rounded-tl-none`); file = `w-10 h-12 <color> rounded-sm` + white/30
  corner-fold square + `text-[8px] font-bold text-white/80 uppercase` label.
  Colors: PDF red-400, ZIP yellow-500, CSV green-500, JSON purple-400,
  M4A pink-400, TXT neutral-400. Filename below in `text-xs text-white
  text-shadow-lg`. Names have personality: `backup_final_FINAL.zip`,
  `old_resume_v2.pdf`, `Untitled folder`.

## 2. Scroll-driven desktop scene (`desktop-scene.tsx`)

The signature scrollytelling move:

```tsx
<div ref={ref} className="h-[1200vh] relative">          {/* scroll track */}
  <div className="sticky top-0 h-dvh w-dvw bg-blue-200 dark:bg-neutral-900
                  flex items-center justify-center">      {/* stage */}
    <div className="relative w-full max-w-[1440px] h-full overflow-hidden">
      {/* files + windows, absolutely positioned */}
    </div>
    <WikiWindow activePage={activePage} zIndex={topZ + 1} />
  </div>
</div>
```

- Progress hook: rAF-throttled scroll listener,
  `p = clamp(-rect.top / (sectionHeight - viewportHeight), 0, 1)`.
- Content model: each window owns `items: {hideAt: number, page}[]`. A window
  renders while any item has `progress < hideAt`; the active display page is
  the last item whose `hideAt` has been passed (flattened + sorted across all
  windows). Files each carry their own `hideAt`. Thresholds are hand-tuned
  decimals (0.02 → 0.97).
- Effect: as you scroll, desktop windows/files vanish one by one ("consumed"),
  while a centered wiki/browser window flips through the pages built from
  them. Story = archive being eaten and encyclopedia being written.
- Swap animation: `AnimatePresence` on the wiki window,
  `initial {opacity 0, scale 0.85}` → animate 1 → exit same, `duration: 0.1`.
  Mobile gets a separate black/25 tint layer and a phone-bezel SVG frame
  (445×901 path, `fill-gray-200 dark:fill-neutral-800`, screen inset 2%,
  `borderRadius: '16% / 8%'`) instead of the browser chrome.
- Dev nicety: Shift+P logs current window positions+drag offsets as JSON to
  paste back into the config.

## 3. Terminal / agent loop (`agent-loop.tsx`, `terminal.tsx`)

- Frame: `rounded-xl bg-neutral-900 dark:bg-neutral-950 border border-primary`,
  titlebar `p-3 bg-neutral-800` + traffic lights, body `p-4 font-mono text-sm
  leading-relaxed tracking-tight h-96 overflow-y-auto scrollbar-none`.
- Script: an array of typed lines `{type: 'thinking'|'command'|'output', text}`.
  Colors: thinking `text-neutral-500 dark:text-neutral-400`, command
  `text-emerald-400` (prefixed `$ `), output `text-neutral-100`. Blank lines
  are ` ` spacers.
- Playback: starts on `useInView(ref, {once: true})`; each tick reveals one
  line then schedules the next with jitter — base delay by type (thinking 180,
  command 100, output 120, blank 500 ms) × `(0.6 + Math.random() * 0.8)`.
  Loops forever via index modulo. Auto-scroll to bottom on every line.
- Script content follows a real agent session: thinking → shell command →
  plausible output, with cross-references and dry humor. Commands are real
  (`exiftool | jq`, `grep -c`), outputs are aligned columns.

## 4. Wikipedia article grammar (`wiki-window.tsx`)

- Title: `font-serif text-xl md:text-2xl font-normal`, then
  `text-xs text-muted` tagline ("From <site>, your personal
  encyclopedia"), then `h-px` rule.
- Section heads: `font-serif text-lg font-normal` + `h-px` rule under each.
- Body: `font-sans text-sm leading-[1.7] text-neutral-700 dark:text-neutral-300`.
- Infobox: `md:float-right md:ml-4 md:w-48 border border-muted text-sm`
  — header band `bg-neutral-200 dark:bg-neutral-700 px-3 py-1.5 font-medium
  text-center text-xs`, optional `h-28` image, then label/value rows: label
  cell `w-20 bg-neutral-50 dark:bg-neutral-800 text-muted text-xs font-medium`.
- Wiki links: parse `[[Target]]` / `[[Target|display]]` →
  `text-blue-600 dark:text-blue-400 hover:underline`; citations `{{cite|N}}` →
  `<sup class="text-blue-600 text-[9px]">[N]</sup>`.
- TOC rail: absolute left, `w-48`, "Contents" in `text-xs font-medium
  uppercase tracking-wider text-muted`, nested `list-decimal list-inside`
  in link-blue.
- Blockquote: `ml-2 pl-3 border-l-2 border-neutral-300 dark:border-neutral-600
  text-sm italic` + non-italic muted attribution line.
- Thumb: floated `w-36 border border-muted bg-neutral-50` with `text-[10px]`
  caption. Gallery: flex row inside a bordered `bg-neutral-50` strip,
  `text-[10px]` centered captions.
- Table: full-width `text-sm border border-muted`, header row
  `bg-neutral-200 dark:bg-neutral-700` th `px-3 py-1.5 text-left text-xs
  font-medium`, cells `border-t border-muted px-3 py-1.5`; caption below in
  `text-xs text-muted`.
- Mid-read simulation: `style={{ marginTop: -scrollTop }}` px offset.

## 5. Hand-built charts (`*-chart.tsx` pattern)

No chart libraries. Bars are divs; scales come from `d3-scale`'s
`scaleLinear`. The reference implementation is a vertical two-series bar
chart, and the details below are the ones that go wrong when improvised.

### Geometry (exact)

```
maxHeight  = 256                        // px, the tallest a bar may draw
plotHeight = 292                        // px, container: 256 + 36 for x labels
countToHeight = scaleLinear().domain([0, maxCount]).range([0, maxHeight])
```

- Shell: `bg-zinc-100 dark:bg-zinc-800 rounded-lg p-6 pt-8 flex flex-col
  gap-6 w-full`. The whole chart is one `<button type="button">` so it is a
  single hover surface (and stays keyboard-reachable).
- Plot row: `flex flex-row h-[292px]`, then a y-axis rail `relative w-12`,
  then bars in `flex flex-row justify-between w-full`.
- Bar column: `flex flex-col items-center gap-4 relative`, with the x-axis
  label as the **last child** (`text-sm text-zinc-600 dark:text-zinc-300`).
  Bars are lifted off the baseline by `bottom: 36`–`40` so the label sits
  clear beneath them — that offset is what keeps the axis text from
  colliding with the bars.

### Two series is a stack of layers, never a nest

This is the one that gets built wrong. Both bars are the **same width**, the
total sits **in flow**, and the subset is **absolutely positioned on top**:

```jsx
{/* FRONT — the subset. Absolute, z-20, saturated. */}
<motion.div
  className="w-5 bg-blue-500 z-20 rounded-md mt-auto absolute pointer-events-none"
  initial={{ height: 0 }}
  whileInView={{ height: countToHeight(subset) }}
  style={{ bottom: 36 }}
  transition={{ delay: index * 0.1 }}
/>
{/* BACK — the total. In flow, same width, 200-tint of the same hue. */}
<motion.div
  className="w-5 bg-blue-200 rounded-md mt-auto pointer-events-none"
  initial={{ height: 0 }}
  whileInView={{ height: countToHeight(total) }}
  style={{ bottom: 40 }}
  transition={{ delay: index * 0.05 }}
/>
```

The light bar reads as the total; the saturated bar covers the part of it
that is the subset; the light sliver still showing above is the remainder.
**Do not nest the subset inside the total** and do not make the total a thin
cap above the subset — both produce a meaningless nub instead of a
comparison.

### Motion

- Every bar grows from `height: 0` on `whileInView`.
- Stagger by index, and give the **back bar the shorter delay** so the total
  leads and the subset fills in behind it: back `index * 0.05`, front
  `index * 0.1`.
- Tooltip follows the cursor on a spring — `{type: 'spring', stiffness: 300,
  damping: 30}` — animating `left`/`top`/`opacity`.
- Hover is detected on the **container**, not per bar: take
  `event.clientX - rect.left - 40`, divide by `(rect.width - 40) /
  data.length`, floor it for the index. One listener, no gaps between bars.
- Hover marker: a transparent ring behind the hovered column —
  `border-2 border-zinc-300 dark:border-zinc-700 rounded-xl w-8`, height
  `countToHeight(total) + 12`, fading `opacity 0→1`.

### Axes

- Ticks: `interval = Math.ceil(maxCount / 5)`, then `i * interval` for
  `i` in `0..5`.
- Labels are absolutely positioned in the rail by value, not spaced evenly:
  `style={{ bottom: countToHeight(tick) }}`, `text-xs text-zinc-400`.
- **Skip any label within 20px of the previous one** (`if (current - prev <
  20) return null`) — without this, low-max datasets stack labels on top of
  each other, which is the usual "the axis looks off" bug.
- Numbers run through `toLocaleString` for thousands separators.
- No gridlines. The register uses the value labels alone; ruled horizontal
  lines behind the bars are not part of it.

### Without a JS animation runtime

`initial={{height: 0}}` means the bars **are** zero-height until script runs.
That ships a blank chart to headless renderers, prerenders, and reader
modes — the failure the ship gate's reduced-motion/visibility item exists to
catch. Outside React/motion, invert it: render the bar at its true height in
CSS, then let script animate *from* zero only when it can.

```css
.bar { height: var(--h); transition: height 600ms cubic-bezier(0.22,1,0.36,1); }
.bar[data-armed="true"] { height: 0; }          /* only ever set by JS */
@media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
```

Two guards are required, not one. The no-JS fallback alone is not enough:
if script *does* run, it arms the bars to zero, and then a viewport event
that never fires (chart below the fold in a prerender, a full-page
screenshot, a background tab, a bot) leaves them at zero permanently. Always
pair the observer with a hard timeout.

```js
const chart = document.querySelector(".chart");
const bars = [...chart.querySelectorAll(".bar")];
if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
if (!("IntersectionObserver" in window)) return;   // guard 1: never arm

let released = false;
const release = () => {
  if (released) return;
  released = true;
  bars.forEach(b => b.removeAttribute("data-armed"));
};

bars.forEach(b => b.dataset.armed = "true");

const io = new IntersectionObserver((entries, obs) => {
  for (const e of entries) if (e.isIntersecting) {
    requestAnimationFrame(release);
    obs.disconnect();
  }
}, { threshold: 0.25 });
io.observe(chart);

setTimeout(() => { release(); io.disconnect(); }, 1600);  // guard 2: backstop
```

Stagger by putting the per-bar delay in the markup
(`style="--d: 165ms"`) and reading it in the transition
(`transition-delay: var(--d, 0ms)`), so releasing is one attribute removal
rather than a chain of timers that can half-complete.

- 2020-dashboard minigraphs: tiny inline sparklines per stat, colored by the stat's
  hue, `background: transparent`.

## 6. Blog / MDX kit

- Index: column `max-w-3xl`, header pair ("Blog" + muted tagline), `h-px`
  rule, then rows `flex justify-between` — left: title link
  (`hover:underline underline-offset-4`) over muted `<time>`; right:
  `size-7 rounded-full` avatar. Date format `d MMM, yyyy` → "25 Mar, 2026".
- Post page: `max-w-2xl` (personal site: `sm:w-[480px]`), title
  `text-2xl font-normal`, byline row (avatar + "Posted by <name>" linking to
  X) opposite the date, `h-px` rule, then article.
- Article styles (hand mapped, not default prose): p `leading-7 text-base
  mb-4` (personal site `leading-6`), inline code `text-sm font-mono p-0.5 px-1
  border border-neutral-300 dark:border-neutral-600 rounded-md`, pre block
  `text-sm p-4 border rounded-md bg-neutral-50 dark:bg-neutral-800`, links
  `underline underline-offset-4` (hover → blue), h2 `text-2xl font-medium
  scroll-mt-24` with slugified ids, media `w-full rounded-md` (videos loop
  inline, `rounded-xl` images via `prose-img:rounded-xl`).
- Frontmatter via gray-matter: `title, date, description`. Navbar shows
  breadcrumb `/ posts / post` in neutral-400.
- Code highlighting when needed: shiki, `bg-zinc-950 p-3 text-sm rounded-b-md`,
  13px Söhne/Geist Mono, line numbers via CSS counters in `text-zinc-500`.

## 7. Navbar / footer / mobile drawer

- Navbar: `px-6 py-6 text-sm max-w-360 mx-auto`, wordmark icon left + inline
  links (active ink / inactive `text-muted`), right: external links + dot
  toggle. Personal site: `sticky top-0 px-4 py-2` minimal.
- Mobile drawer: fixed overlay `bg-black/40` fade 0.2 + right panel `w-56`
  spring `{type: "spring", damping: 30, stiffness: 300, mass: 0.8}` sliding
  from `x: "100%"`; body scroll locked while open.
- Footer: `text-sm border-t`, 3-column link grid (`grid-cols-3 gap-8`,
  muted headings), bottom row "Made in <city>" + the dot toggle again.

## 8. Feature grid (the one card grid he allows)

`grid grid-cols-1 sm:grid-cols-2 gap-4`, cards `p-4 rounded-lg border
border-neutral-200 dark:border-neutral-700` with a 16px `strokeWidth 1.5`
line icon in muted, `text-sm font-medium` title, `text-sm text-muted
leading-snug` description. No hover effects, no shadows, 6 items max.
