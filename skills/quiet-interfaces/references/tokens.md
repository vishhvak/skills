# Tokens — exact values

Extracted verbatim from the sources. Current era (2025–26: the encyclopedia app,
the personal site) is the default; earlier eras included for flavor-matching.

## Typography

### Families by era

| Era | Sans | Serif | Mono | Notes |
|---|---|---|---|---|
| 2025–26 (encyclopedia app, personal site) | **Apercu** 300/400/500/700 + italics | **Signifier** (Test cuts) 400/500 | Apercu Mono 400 | all `next/font/local`, CSS vars `--font-apercu` etc. |
| 2024 (legal-research web/explorer) | **Uncut Sans** (single variable woff2) | — | **Söhne Mono** | `font-feature-settings: "ss01" on, "ss02" on, "ss06" on` |
| 2024 (data-editorial dashboard) | **Satoshi** at base `font-weight: 600` | — | — | editorial dashboard look |
| 2023 (chat framework) | **Apercu** | — | Apercu Mono | modular scale `ms()` for everything |
| 2020 (pandemic dashboard, React) | **Archia** (`* { font-family: 'archia' }`) | — | — | tiny sizes + 900 weights |
| 2020 (pandemic dashboard, static) | Open Sans | — | — | 650px column era |

Free substitutions with the right voice (Apercu is licensed):
- Apercu → **Inter** (ss01), **Geist Sans**, or **Uncut Sans** (free, and
  literally his 2024 pick — best choice)
- Signifier → **Newsreader** or **Source Serif 4** (used at `font-normal`)
- Apercu Mono / Söhne Mono → **Geist Mono** or **Commit Mono**

### Scale (current era)

- Body: 16px / `leading-6` (24px) UI, `leading-7` blog prose, `leading-[1.7]`
  wiki articles
- H1 page/post title: `text-2xl` (24px) `font-normal` (sans) or serif
  `font-normal`
- H2 section: `text-lg`–`text-2xl` `font-medium`; wiki H2 serif `text-lg`
- Site name in hero: `text-lg font-sans` with `text-md text-muted` tagline
- UI chrome / captions / infobox: `text-xs` (12px); window titlebar `text-[11px]`
- Micro (inside faux apps): `text-[8px]`–`text-[10px]`; sidebar section label
  `text-[9px] font-semibold uppercase tracking-wider` (the ONLY tracked caps)
- Code blocks: 13–14px mono
- 2020-dashboard era inversion: h1 24px/900, h2 18px/400, h3 14px/400, h4 13px/900,
  h5 12px/900, h6 11px/600 — tiny sizes, heavy weights
- `text-wrap: balance` on short centered copy (custom `wrap-balance` class)
- Mobile-only antialiasing: `@media (max-width: 640px) { @apply antialiased }`

## Color

### Semantic layer (the encyclopedia app's globals.css — copy this shape)

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
  --text-primary: #171717;
  --text-muted: #737373;      /* neutral-500 */
  --border-primary: rgb(0 0 0 / 0.15);
  --border-muted: rgb(0 0 0 / 0.1);
}
.dark {
  --background: #262626;      /* neutral-800, NOT black */
  --foreground: #ededed;
  --text-primary: #f5f5f5;
  --text-muted: #a3a3a3;      /* neutral-400 */
  --border-primary: rgb(255 255 255 / 0.15);
  --border-muted: rgb(255 255 255 / 0.1);
}
```

Registered via Tailwind v4 `@theme inline` + `@utility text-primary` /
`text-muted` / `border-primary` / `border-muted`. The personal site uses
`neutral-900` dark bg with `neutral-300` body text (`oklch(0.87 0 0)`) and
`neutral-400` muted (`oklch(0.708 0 0)`).

### Working colors

- Links / selection / wiki-links: `text-blue-600 dark:text-blue-400`;
  selected rows `bg-blue-500/10 dark:bg-blue-500/20`; primary button
  `bg-blue-600 text-blue-50 dark:bg-blue-800`
- Success/commands: emerald-400 (terminal), green-500
- Divider: `bg-neutral-200 dark:bg-neutral-700`
- Traffic lights: `#ff5f57` `#febc2e` `#28c840` (2.5 size in small windows);
  large frames use `bg-red-400 bg-yellow-400 bg-green-400` at `w-3 h-3`
- Theme-toggle dot: light mode → `bg-amber-500`, dark mode → `bg-purple-300`
  (app sites) or `bg-yellow-400` (personal site); focus ring
  `focus:outline-3 outline-<color>/50`
- The full Tailwind palette is the color vocabulary — vendored wholesale as
  `colors.ts` / `colors.scss` when outside Tailwind
- Data-editorial warm-paper variant: bg `#f5f4f0`, border `#e5e3dc`, ink
  `#1a1a1a`, muted `#666` (data-editorial only — not the default register)

### 2020 dashboard tint system (for dashboard-flavored work)

Base hex + alpha-suffix derivatives: `$cherry: #ff073a`, light `…20` (12%),
hover `…30` (19%), mid `…99` (60%). Chips = colored text on own-hue tint:
`color: $orange; background: $yellow-light; border-radius: 5px`. Stat colors:
confirmed `#ff073a`, active `#007bff`, recovered `#28a745`, deceased
`#6c757d`, tested `#201aa2dd`, vaccinated `#db5581`. Buttons/rows hover by
stepping tint 20→30.

## Spacing & layout

- Content columns, centered flex: `max-w-2xl` (672px) product pages,
  `md:w-[600px]` product-blog posts, `sm:w-[480px]` personal blog posts,
  `sm:w-80` (320px) homepage manifesto, `max-w-3xl` blog index,
  `max-w-4xl` demo frames, `max-w-360` (1440px) navbar/footer rail
- Page shell: `flex flex-col w-dvw items-center` → column with
  `gap-8 py-18 px-6`
- Stack gaps: 1 (tight pairs), 2 (buttons), 4, 6, 8 (sections), 10–12 (page)
- Full-viewport hero: `h-dvh flex items-center justify-center` (personal site:
  `h-[calc(100dvh-41px)]` under a 41px navbar)
- Navbar: `px-6 py-6`, links `text-sm`, active = ink / inactive = muted;
  personal site navbar is `px-4 py-2` with breadcrumb path (`/ posts / post`)
  in `text-neutral-400`
- Fact lists: `<dl class="grid grid-cols-[auto_1fr] gap-x-8 gap-y-6">`,
  `<dd class="text-muted">`
- Hanging footnote: `pl-[0.6em] -indent-[0.6em]` with leading `*`
- Dividers between all major blocks: `<div class="h-px w-full bg-neutral-200 dark:bg-neutral-700" />`
- 2020-dashboard era: 650px `margin: 0 auto` column; rem-based padding 0.25/0.5/0.75/1/1.5
- chat framework: modular scale spacing — `$modularscale: (base: 16px, ratio: 1.25)`,
  every padding/gap/radius/width is `ms(n)` from -8 to 13

## Radii & elevation

- UI elements/buttons `rounded-lg`, pills/dots `rounded-full`, cards + inline
  code `rounded-md`/`rounded-lg`, OS windows & demo frames `rounded-xl`,
  file icons `rounded-sm`/`rounded-[2px]`, 2020-dashboard era 3–5px
- Borders instead of shadows on flat surfaces:
  `border border-neutral-200 dark:border-neutral-700` (or `border-primary`)
- Shadows only for skeuomorphs: windows `shadow-xl`, hero browser frame
  `shadow-2xl`, phone bezel `drop-shadow-2xl`, map pin `shadow-sm`
- Buttons: `px-3.5 py-2`, `text-sm`, `rounded-full` (marketing, `isCircular`)
  or `rounded-lg` (app), accents primary(blue)/secondary(neutral-200)/
  tertiary(ink-inverted)/destructive(red-600); prefix/suffix icons at
  `opacity-65`; focus `focus:outline-3 outline-<accent>/50`

## Dark mode

`next-themes` ThemeProvider `attribute="class" defaultTheme="system"
enableSystem`, `suppressHydrationWarning` on `<html>`, Tailwind v4
`@custom-variant dark (&:where(.dark, .dark *))`. Every single color utility
ships its dark twin inline. Toggle is the colored dot (see above) — no icon,
no dropdown. Mounted-check via `useSyncExternalStore` snapshot trick before
rendering theme-dependent color.
