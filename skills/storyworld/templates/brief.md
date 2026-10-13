# Brief: {{domain}}

Replace every placeholder with the user's answer, one or two sentences each. `status` stays BLOCKED while any
placeholder or open decision box remains.

## Story

- **The question the site answers** (one sentence a reader could repeat): <fill>
- **Audience and what they already know:** <fill>
- **The as-of axis** (what the scrubber moves through: dates, quarters, eras): <fill>
- **Date range** (first and last event; how the site stays current): <fill>

## Cast and structure

These become `content/site.json` (tracks, and `vocab` lists that `validate` enforces; `validate --vocab` prints
the defaults).

- **Tracks** (3 to 5 swimlanes): <fill>
- **Entity kinds:** <fill>
- **Relation types** (verbs on graph edges): <fill>
- **Event kinds:** <fill>
- **Threads** (5 to 20 curated storylines): <fill>
- **Eras** (named, non-overlapping periods on the scrubber): <fill>

## Sources

- **Primary sources, news discovery, sentiment channels and imagery:** written in `.storyworld/domain.md`.

## Decisions for the user

Ask these in one message. Mark each `- [x]` with the user's answer.

- [ ] Social data: private aggregates plus hand-picked official embeds, or open platforms only?
- [ ] First release scope: a curated set of reviewed events, or broad automatic ingest?
- [ ] Who reviews LLM-extracted events, and how many per day?
- [ ] Languages and right-to-left locales?
