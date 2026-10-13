# Data: sources, extraction, review, sentiment

## Pipeline

```
collectors -> raw store (immutable) -> extraction -> dedupe + entity resolution -> review -> content/ -> validate -> build
                                                                                    ^ corrections log
```

1. **Collectors.** One small script per source, on a schedule (daily for registers, feeds and social; monthly or
   yearly for slow datasets). Identify yourself in the User-Agent, respect rate limits, retry with backoff, keep
   the HTTP status and ETag.
2. **Raw store.** Content-addressed files plus an index (source, URL, fetched_at, hash, licence note). Never
   mutated. Copyrighted article text stays private.
3. **Extraction.**
   - **Structured numbers skip the LLM.** Filings, official registers and datasets are ingested
     deterministically, as events with `"auto": true`.
   - **Text goes through structured extraction** into the content schema. Every claim needs a verbatim quote
     from the source: save the source text to `.storyworld/archive/<sourceId>.txt` (private, never published),
     and `validate` rejects any quote that is not in it.
   - **High-impact claims get a second pass from a different model or prompt.** High impact means large amounts,
     laws, export controls, and deaths or injuries. Disagreements go to review.
4. **Dedupe and entity resolution.**
   - Merge an event reported by several sources into one event with several sources.
   - Match entities on external ids first (ticker, regulator id, Wikidata), then on an alias table kept in git,
     then by model judgment. Matches below threshold go to review.
5. **Review.**
   - A queue sorted by impact times uncertainty, with the extraction shown beside the source quote. Reviewers
     accept, edit or reject.
   - Everything LLM-derived needs one human approval before it reaches `content/`.
   - Run review as two blind passes:
     - **Editorial:** "is this the right event, fairly stated?"
     - **Mechanical:** `validate` plus quote checks.

     Then weave the two. Run the mechanical pass after the editorial one, so its confident output does not
     anchor the judgment.
6. **Build.** Only approved rows. Write a `build-meta.json` with the data cut-off time and source licences, and
   show "data as of" in the interface.

## Sources by type

| Type | Examples | Notes |
|---|---|---|
| Official registers | National gazettes and regulation registers (e.g. US Federal Register API), legislation APIs, court and regulator dockets | Public domain facts with stable ids and legal dates |
| Company disclosures | Securities filings (e.g. SEC EDGAR XBRL facts and full-text search), annual reports, investor releases | Derive quarterly values from year-to-date figures; record the metric definition |
| Curated datasets | Research-group datasets under open licences (e.g. Epoch AI, CC BY 4.0) | Credit on every visual that uses them |
| News discovery | GDELT bulk files (free, attribution), company newsroom RSS, Hacker News Algolia API | Use for finding events and measuring coverage volume; link out to articles and write your own summary |
| Imagery | Wikimedia Commons (licence and trademark recorded separately), Copernicus Sentinel-2 (credit "Contains modified Copernicus Sentinel data [year]"), national aerial imagery, generated data art | News and wire photos, Google, Planet and Maxar imagery, and logos used as decoration stay out |

The project's domain pack, `.storyworld/domain.md`, lists the concrete sources for its subject. `init --pack`
copies a ready pack from `reference/domains/`; for a new subject, fill in the template that `init` writes.

## Sentiment and attention

A series a reader can trust states its population, its sampling and its error:

1. **Population.** A frozen, versioned query set per topic plus a named account list.
2. **Sampling.** Per day, a capped sample (top N by a fixed ranker plus N at random). Record the sampling frame
   and the fraction sampled.
3. **De-bias.**
   - Cap posts per author per day.
   - Collapse near-duplicates.
   - Flag likely automated accounts.
   - Publish the series both weighted by log(1 + engagement) and unweighted.
4. **Classify.** Classify stance with an LLM against a published rubric with examples, and log the model and
   version. Run two models or prompts, and publish their agreement (Cohen's kappa).
5. **Calibrate.** Hand-label about 300 stratified posts. Report precision and recall per class, plus bootstrap
   bands on the daily shares.
6. **Label honestly:** "sampled posts matching these queries", never "public opinion".

Channels:

- **X.** Read through the user's own logged-in session if the `x` skill is installed: `search` with `since:` and
  `until:`, sorted `--latest` (the top-ranked mode returns only a few posts for old dates), plus user timelines.
  - X's terms forbid automated collection without consent, so the realistic risk is suspension of the account.
  - Keep the corpus private.
  - Publish aggregates only, plus a few posts a human picked, shown as official embeds.
- **Bluesky.** An open firehose (Jetstream) and unauthenticated search.
- **Hacker News.** An open API.

Show each channel as its own labelled line, never merged into one number.

## Corrections and freshness

- A public corrections log records the date, the item, what changed, why, and the source.
- A per-source health check records the last success and the row count, so a silent collector failure cannot
  freeze the site unnoticed.
- Rebuild daily after the collectors run.
