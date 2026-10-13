# Architecture

## Stack

Vite, Vue 3 with Pinia and vue-router, vue-i18n for interface strings, GSAP for timelines and easing, and a
small custom WebGL1 engine (VAO, instancing and uint-index extensions) for the background, image transitions and
the entity graph. TypeScript throughout. Content is compiled at build time into static JSON shards; the site is
static and cacheable.

## Packages

| Package | Holds | Rule |
|---|---|---|
| `engine` | GL core, ticker, image pipeline, scene registry, scenes (noise background, image, graph), shaders | Imports nothing from the app or the site. Budgets come in through `createEngine({gpuBudget, keptImageBudget, imageCacheBytes, maxDpr, colors})` |
| `shell` | Page transitions, text reveal, overlays, navigation and search, cookie and language handling, share, the as-of filter and guard | Every brand value (name, logo, fonts, colours, socials, legal pages, sounds) comes from `SiteConfig`. A grep for one site's names in `shell` returns nothing |
| `content` | Schema, compiler: validate, shard by month and entity, build the search index, lay out the graph per era, process images | A missing source or licence fails the build |
| `site` | `site.json`, content, theme tokens, site-only components | The only package that knows the subject |

Freeze `engine/api.ts` before the fan-out: it is the contract every area builds against.

## Performance primitives

Build these first and keep them; together they removed every task over 50 ms from the dark.netflix.io rebuild:

1. **One frame loop.** A single GSAP ticker drives the engine, every tween and every per-frame callback, in a
   fixed order. `requestAnimationFrame` appears nowhere else.
2. **Upload budget.** Textures go to the GPU in 1 MB strips under a per-frame budget (2.5 ms, preload 1.5 ms,
   an adaptive ms-per-byte estimate). A transition waiting on its image may raise its own budget to 6 ms on slow
   uploaders (the acceptance row allows exactly that). Large images are never uploaded in one call.
3. **Decode off the main thread.** A worker fetches and decodes images. Blink and Gecko transfer
   `ImageBitmap`s; WebKit gets RGBA byte strips instead (transferring bitmaps from a worker crashed WPE).
   Mipmaps for atlas cells are built in the worker with a 2x2 box filter, because Firefox's
   `createImageBitmap` resize crops instead of scaling.
4. **Task slicing.** `nextTask(fn)` over a `MessageChannel` (no 4 ms timer clamp) and
   `runSliced(step(deadline), budgetMs = 5)`. Page mounts are split so the visible view mounts first and its
   neighbours, overlays and helpers each mount in a later task.
5. **One-slot transition queue.** The latest request wins; a superseded transition settles as `'superseded'`
   instead of queueing.
6. **Bounded GPU memory.** A total budget (256 MB at DPR 2 measured fine) plus a cap on textures nobody holds
   (72 MB, three full-screen heroes with mips), evicting least-recently-used first. Prefetch a fixed window of
   neighbours (3 either side) so memory never scales with the number of events.
7. **Background at bounded resolution.** The heavy noise shader renders at no more than about 2.5 Mpx and is
   upscaled; a resolution governor lowers it under load.
8. **Composited CSS only.** Infinite CSS animations only on `transform` and `opacity`; prime a tween's `from`
   value inline so GSAP never reads computed style during a frame.
9. **Browser-specific decode-ahead.** On WebKit, decode linked pages' images on hover, press or focus, not on
   every step: per-step decode-ahead overflowed the decode cache and re-decoded during transitions.

## Images

- **Specs.**
  - Hero images: 2048 px wide for desktop and 1024 px for mobile, as WebP, with a recorded focal point.
    Panoramas are 4096 px wide and use the mirror pan.
  - Atlas inputs: square crops at 256 px (detail cells) and 64 px (thumbnails).
  - Built by the content compiler (e.g. with `sharp`) from the licensed originals.
- **Image treatment.** One treatment makes mixed sources read as one site:
  - halftone black-and-white, or a duotone per track, in the image shader;
  - a mirror pan for panoramas;
  - a ripple or wipe fade between events;
  - the noise background tinted per track;
  - a post pass with grain and vignette.

  Each is a small fragment shader written for this site.

## Scale

Dark had 836 events and 166 entities. A news subject reaches thousands. What breaks and what replaces it:

| Limit in the Dark design | Replacement |
|---|---|
| One portrait atlas of 128 cells (16x8 of 256² in 4096x2048) | Two tiers: 64² thumbnails for every entity (1,024 cells in 2048²), 256² detail cells for visible entities, with a free list and priority by viewport and zoom |
| Name labels rasterized into 128 fixed slots | MSDF glyph atlas with instanced glyph quads; any label length at any zoom |
| Graph positions placed by hand per episode | Build-time layout (layered for ownership and supply chains, seeded force layout otherwise), pinned at each entity's first-seen position so as-of changes only animate new nodes |
| SVG timeline at one unit per year with per-event special cases | Swimlanes per track on a continuous date axis with zoom and greedy collision packing; WebGL or canvas overview, SVG only for the focused window |
| All events in one file, all copy in the locale file awaited before first navigation | Manifest plus shards by month and entity, copy shards per locale, search index built at compile time and queried in a worker |
| Linear hit testing | Uniform grid above about 2,000 nodes |

The scale row in acceptance.md tests this with `storyworld.mjs fixture --events 10000 --entities 600`. The
first navigation downloads only the manifest, the route's shard and its locale chunk.

## Provenance

Code and shaders copied or translated from another site's bundle belong to that site's owner. A published
storyworld uses engine code and shaders written for it. When recreating an existing site for study, keep the
recreation private and keep a `PROVENANCE.md` that lists every file derived from the original.

## Reference implementation

If `STORYWORLD_REFERENCE` points at a local checkout of a previous storyworld build:

- read its engine and task-slicing helper before writing new ones;
- reuse only files that its `PROVENANCE.md` does not list.

With no `PROVENANCE.md`, treat the whole checkout as derived: read it for design, and write fresh code from the
primitives above. With no reference at all, start from the primitives above.
