# Voice, content & assets

## Copy voice

- **Wordmark = lowercase domain.** "example.wiki", "example.dev". Site title and
  tagline are a quiet pair: `text-lg` name over `text-md text-muted` line.
- **Manifesto over marketing.** One belief, one consequence:
  "Hello, I am <name>. I believe that most bad things in the world happen
  because of information failure." / "As a result, I build tools that record
  and comprehend information to amplify human wisdom." Product versions:
  "Great legal research requires great tools." "Your personal encyclopedia,
  written by agents."
- Sentence case everywhere. No exclamation marks in UI (one playful "More
  coming soon!" allowed per site). No feature-benefit-CTA formula; CTAs are
  two words ("Get Started", "Read Essay").
- Honest footnotes: an asterisk in body text, resolved in a hanging-indent
  `text-sm text-muted` note ("*When using agent harnesses with models hosted
  online, your data is sent to those providers.").
- Lists of guarantees as `<dt>/<dd>` facts, the dd allowed one joke ("Fork it,
  clone it, hack it, build it, cite it, tag it, ship, extend it.").
- Post titles are 2–3 word noun phrases: "Generative Interfaces",
  "Personal Encyclopedias", "Collaborative Assistants", "Sequential Function
  Calls". Posts open mid-thought with a claim, not a throat-clear.

## Fixture data (the specificity rule)

Demo content is never lorem and never generic. It is dense with proper nouns,
numbers, and running jokes that cross-reference each other:

- Objects have provenance: "Bought by Appa in 2008 for ₹6,500 from a Croma in
  Pune", "247 Hot Wheels cars tracked in a spreadsheet".
- People have catchphrases: Aai's "khana khaya?", the landlord's monthly
  "all ok?", Priya's "hills friday?".
- Systems reference each other: the dosa incident names the error channel on
  the Minecraft server; the camera page links the trip pages that used it.
- Numbers are oddly exact (94,000 messages, 2h 04m PR, 11 self-timer
  attempts) — precision is the humor.
- File names in demos are real-life messy: `backup_final_FINAL.zip`,
  `old_resume_v2.pdf`, `transactions.csv`, "Untitled folder".

When building a demo for a new product, write this fixture layer FIRST — it
does more stylistic work than any CSS.

## Imagery

- Default is NO imagery. Text, hairlines, and hand-drawn-in-divs UI.
- When photos are needed (memory/nostalgia contexts): AI-generated, treated as
  faded film/watercolor album prints — washed highlights, soft paper grain,
  occasionally gingham/checked scrapbook borders. Generated per an `imageMap`
  registry: `{ id: { src, alt, color } }` where `color` is a flat Tailwind
  200-tone (`bg-amber-200`, `bg-sky-200`) used as the placeholder block with a
  `text-[10px] text-black/30` alt label when the file is absent. Alt text is a
  caption, not a description ("Marine Drive, after the competition").
- Icons: inline 16×16 SVG, `stroke="currentColor" strokeWidth 1.5`, rendered
  in muted. Favicon/logo can be a plain colored dot.
- OG images generated via a `/api/og?title=` route, not static art.

## Interaction habits

- Links: `hover:underline underline-offset-4` (offset 4 always).
- Focus: `focus:outline-3` with 50%-alpha accent outline.
- Cursor feedback: `cursor-pointer` on everything interactive,
  `cursor-grab active:cursor-grabbing` on draggables.
- Body scroll locked while overlays open; drawers close on route change.
- `scrollbar-none` on demo scroll areas; `scroll-mt-24` on anchor headings.
- Easter-egg dev tools left in shipping code (Shift+P dumps layout JSON).
- Theme: system default, class strategy, the dot toggle in navbar AND footer.

## Page skeletons

Personal site:
- `/` — navbar (favicon dot · Posts · Email · theme dot) + centered 320px
  two-paragraph manifesto. Nothing else. Dark default.
- `/posts` — title rows with dates, breadcrumb navbar.
- `/posts/[slug]` — 480px column, title, date, prose with inline
  videos/images.

Product site:
- `/` — name+tagline pair, two pill CTAs, divider, one paragraph of what it
  does, then THE demo set piece (desktop scene / terminal / windows), then a
  paragraph + `<dl>` facts + footnote, footer.
- `/blog`, `/changelog`, `/docs` — same column grammar, docs get a sidebar.
