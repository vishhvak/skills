# The storyworld format

A storyworld site tells a subject as a cast of entities and a sequence of events, explored one event at a time
and filtered **as of** a point on the time axis. The model is dark.netflix.io (Netflix's guide to the series
*Dark*): its spoiler filter, family tree and character timelines generalize to any subject with a cast and a
chronology.

## The four primitives

| Primitive | What the reader does | Built from |
|---|---|---|
| **As-of scrubber** | Picks a point in time. Everything after it disappears: graph members, events, links, search results | One predicate, `visible(x) = x.date <= asOf`. The router guard, link renderer, search and graph all apply it |
| **Entity graph** | Explores who is connected to whom, as of the scrubber | Entities drawn as instanced portraits with labels. Relations drawn as typed lines that appear in start-date order. Layout is computed at build time and stays stable across as-of snapshots |
| **Storylines** | Reads one event per screen and steps forward or back | A per-entity storyline or a curated thread. Each screen has a hero image, a kicker (date, place and track), a short body with `{Label:id}` links, and a sources line. A WebGL transition plays between events |
| **Mood background** | Feels the period | A procedural noise field tinted per track. Its energy can carry a measured series, such as attention volume or sentiment |

- **Tracks** replace Dark's worlds. They are 3 to 5 swimlanes; they colour the background, place events on the
  timeline and group search.
- **Eras** replace seasons. They are named, non-overlapping periods on the scrubber.
- **Threads** are curated storylines across entities.

## Content model

`validate` enforces the schema, and `templates/example-content/` shows every field on a fictional subject.
Write `content/site.json` first: the tracks, plus `vocab` lists copied from the brief and the domain pack
(`validate --vocab` prints the current lists).

The rules that shape editorial work:

- **Events.** Each event has:
  - a date with its precision (`2025`, `2025-01` or `2025-01-21`);
  - one track;
  - at least one entity and at least one source;
  - a confidence: `confirmed`, `reported`, `disputed` or `estimate`.
- **Claims.** Each claim in an event cites its sources and quotes them verbatim. `validate` checks every quote
  against the source text saved in `.storyworld/archive/<sourceId>.txt`: one file per `sources.json` id, holding
  the source as plain text (markup stripped, wording untouched). That archive is private: the build publishes
  `content/` only.
- **The body states only what the claims and sources support.** A later development belongs in its own, later
  event.
- **Structured-data events.** Events ingested from structured data (filings, registers, datasets) set
  `"auto": true` and carry no claims. Their numbers come from the source fields directly.
- **Links.** Body text links other entities and events with `{Label:id}`. Every id must resolve, and the target
  must be known by the event's date: an entity's `firstSeen`, or the linked event's date, falls on or before it.
- **Relations** are typed verbs with a start date (and an end date when they stop), each with a source.
- **Media** carries a licence, a credit, a source URL and alt text. Generated media is data art only: chart,
  map, typographic or abstract. Photographs of real people and events are sourced.

## Editorial rules

- **One event, one screen.**
  - Title: 8 words or fewer.
  - Body: 40 to 90 words.
  - One hero image.
  - The kicker states date, place and track.
  - Longer material becomes two events or a thread. `validate` warns on length and on missing images.
- **The question first.** The brief's one-sentence question decides what counts as an event.
- **Uncertainty is visible.** `reported` and `disputed` render differently from `confirmed`. An estimate shows its
  range and method.
- **Corrections are public.** An approved event changes only by an appended revision with a reason. The site
  shows "updated" and links the corrections log.

## Look

The user chooses the look from three directions written to `.storyworld/look.md`.

1. Name the three looks you would produce by reflex for this subject (for an AI subject: neon circuit boards,
   a dark dashboard, a black-and-white Dark clone). Rule each out unless the brief asks for it by name.
2. Write three directions with distinct concrete-noun labels (e.g. *ledger*, *weather map*, *newsreel*). If two
   labels rhyme, they are one idea: replace one.
3. For each direction, give:
   - palette and type;
   - how the background carries mood;
   - how mixed-source photographs are unified (the treatments in reference/architecture.md, section "Image
     treatment");
   - transition grammar;
   - one sketch or reference image.
4. Present all three. The user picks one, and you write `Chosen: <label>`.
