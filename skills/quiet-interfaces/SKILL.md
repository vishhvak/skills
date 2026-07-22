---
name: quiet-interfaces
description: A quiet, text-first design register for personal sites, blogs, and product pages — narrow measure, small type, neutral palette, dot motifs, macOS-window demo scenes, scroll-driven storytelling, hand-built charts. Use when building or reviewing a surface that should feel calm and text-led rather than promotional, when the user asks for a "quiet"/"minimal"/"text-first"/"wiki-style" site, or when a product story is told through faithful miniature OS windows and terminals.
---

# quiet-interfaces

A design register distilled first-hand from a family of exemplary text-first
products: a personal-encyclopedia app, a legal-research platform, an AI chat
framework, a high-traffic pandemic dashboard, and their builder's personal
site. Exact values live in `references/`:

- `references/tokens.md` — fonts, colors, spacing, radii, type scale, per-era values
- `references/components.md` — build recipes: macOS windows, terminals, scrollytelling desktop scene, wiki page grammar, hand-built charts, blog/MDX kit
- `references/motion.md` — duration table, easing decision flowchart, scale grammar, scenario→solution
- `references/voice.md` — copy voice, blog structure, content patterns, asset making

This is a **reference skill**: read the doctrine below once, then open exactly
the reference file the current task needs (setting up CSS → tokens; building a
set piece → components; animating anything → motion; writing copy or fixtures
→ voice). Never load all four for a small task.

## The doctrine (what makes the register)

1. **Text is the interface.** No hero images, no display type, no gradients.
   A page opens with one or two plain sentences in body-size type. The
   reference personal-site homepage is two paragraphs in a 320px column,
   centered in the viewport, and nothing else.
2. **Small type, quiet hierarchy.** Body 16px/24px. H1 is 24px and often
   `font-normal`. Hierarchy comes from color (ink vs muted), weight, and
   hairline dividers — never from size jumps. UI chrome runs at 12px; miniature
   UIs go to 8–11px.
3. **Narrow measure.** Content columns are 320–672px (`sm:w-80`,
   `sm:w-[480px]`, `md:w-[600px]`, `max-w-2xl`). Wide layouts exist only for
   dashboards and staged desktop scenes.
4. **Neutral field, one working accent.** Tailwind `neutral` for everything;
   blue-600/blue-400 for links and selection (Wikipedia blue); semantic
   green/red/yellow only where they mean something (commands, errors, traffic
   lights). Dark mode is a first-class equal, toggled by a bare colored dot.
5. **Hairline dividers, alpha borders.** Sections separate with
   `h-px bg-neutral-200 dark:bg-neutral-700`. Borders are black/white at
   10–15% alpha (`--border-primary: rgb(0 0 0 / 0.15)`), so they sit on any
   surface.
6. **Flat by default, shadow = skeuomorphism.** Marketing surfaces and cards
   have borders, not shadows. `shadow-xl/2xl` appears only on things
   pretending to be OS windows or phones.
7. **Skeuomorphs carry the demo.** Product stories are told through faithful
   miniature macOS apps (Finder, Photos, Messages, Maps…), browser windows,
   phone bezels, and terminals — all built from pure divs, no screenshots.
   Traffic lights `#ff5f57 #febc2e #28c840`.
8. **Scroll is the timeline.** Big narratives are scroll-driven state machines:
   a tall track (`h-[1200vh]`), a sticky `h-dvh` stage, a 0→1 progress value,
   and thresholds that consume/reveal elements. Not parallax-for-decoration —
   scroll literally advances the story.
9. **Motion is fast and factual.** 100–200ms fades/scales, spring drawers
   (damping 30, stiffness 300, mass 0.8), staggered chart growth
   (`delay: index * 0.05`), typed terminals with jittered timeouts. Nothing
   bouncy, nothing slower than 300ms, nothing that blocks reading. Exact
   durations, the easing flowchart, and scenario→solution pairs:
   `references/motion.md`.
10. **Data is drawn by hand.** Charts are divs + `d3-scale` (+ motion
    `whileInView` height animations), or tiny SVG paths — never a chart
    library. Waveforms are sin-composite bars. Maps are lines and dots.
11. **Structured facts love tables.** Infoboxes, `<dl>` label/value grids
    (`grid-cols-[auto_1fr] gap-x-8 gap-y-6`), bordered tables with tinted
    header rows. The Wikipedia article is a recurring format: serif heading +
    hairline rule + floated infobox + blue links + `[n]` citations.
12. **The dot is the brand.** Logos, theme toggles, avatars, file icons,
    status markers — `rounded-full` colored dots (`size-4`/`size-4.5`).
    Wordmark is the lowercase domain name itself ("example.dev").
13. **Human-specific content.** Demo/fixture data is never lorem: it's ₹6,500
    cameras, "server's down again", a landlord texting "all ok?". Specificity
    is the aesthetic. Footnote asterisks welcome.
14. **Nostalgic generated imagery.** When images exist at all they're
    AI-generated in a faded watercolor/film-album wash (sometimes with gingham
    scrapbook edges), keyed by an `imageMap` with flat pastel color-block
    placeholders (`bg-amber-200` + tiny alt label) as fallback.

## Stack defaults

Next.js App Router + Tailwind v4 (`@theme inline`, `@utility`,
`@custom-variant dark (&:where(.dark, .dark *))`), `next-themes`
(class strategy, `suppressHydrationWarning`, system default), `motion/react`,
`classnames`, MDX via `next-mdx-remote` + `gray-matter` with a hand-rolled
component map (never bare `prose` alone), `next/font/local` with CSS
variables, Vercel Analytics. Fonts self-hosted. pnpm. Biome or ESLint.

## Workflow

1. Read `references/tokens.md`; set up `globals.css` exactly in that shape
   (4-token semantic layer over Tailwind neutrals + `@utility` helpers).
2. Pick fonts per the substitution table there (Apercu/Signifier are licensed;
   the table lists free stand-ins with the right voice).
3. Build pages as centered flex columns with `gap-6/8`, `py-18`, hairline
   dividers. Start from text; add one skeuomorph or one hand-built chart only
   where it earns its place.
4. For any showpiece (landing demo, story section), reach for the recipes in
   `references/components.md` rather than inventing new furniture.
5. Write copy per `references/voice.md` before polishing visuals — the voice
   is half the style.

## Anti-patterns → the in-register move

Match-and-replace. If you're about to write the left column, build the right
column instead:

| Off-style | In-register replacement |
|---|---|
| Display headline > 30px | 24px `font-normal` + hairline rule; let color/weight carry hierarchy |
| Gradient text, glassmorphism | Solid ink; emphasis via weight or the one accent |
| Card grid of icon+title+blurb | Prose paragraph, `<dl>` fact grid, or the single allowed bordered feature grid |
| Drop shadow on a flat surface | `border border-primary` (10–15% alpha) |
| Stock photo / screenshot | Faux UI built from divs, or AI album imagery per voice.md |
| Chart library (recharts etc.) | Divs + `d3-scale` + motion `whileInView` per components.md §5 |
| Section eyebrow / tracked caps heading | `font-mono text-sm text-muted` label, or nothing (caps tracking only at ≤9px inside faux OS chrome) |
| Border radius > 16px | `rounded-xl` max on frames; `rounded-full` only on pills/dots |
| Cream/beige body background | True off-white (`#fafaf9`-class, chroma ≈ 0) or the dark neutral |
| Second decorative accent hue | Fold it into the one accent; semantic colors only where they mean something |

## Ship gate — run before calling any surface done

Check every line; a miss means the work is not done. Do not skip items
because the surface "looks fine":

1. Body text ≥ 4.5:1 contrast against its background (muted text included).
2. Content column between 320–672px; body 16px with 1.5–1.7 leading.
3. Every color utility has its `dark:` twin; toggle both themes and look.
4. Every animation has a `prefers-reduced-motion` branch and nothing is
   opacity-0 without JS.
5. No row of the anti-pattern table's left column survives.
6. Fixture/demo content is specific (names, numbers, provenance) — zero
   lorem, zero "John Doe".
7. Links use `underline-offset-4`; interactive elements have cursor and
   focus states; hit areas ≥ 44px.
