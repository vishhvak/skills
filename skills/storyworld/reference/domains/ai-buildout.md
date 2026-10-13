# Domain pack: the AI industry buildout

Checked against live endpoints on 2026-10-12. Re-check terms and endpoints when starting a new build.

## Story

"What has been built, by whom, with whose money and power, and under which rules, as of any date since 2022?"

## Tracks, kinds, relations

- Tracks: `labs` (frontier labs and releases), `compute` (chips, supply chain, hyperscaler capex),
  `infrastructure` (datacenter campuses, power deals, interconnection), `government` (laws, executive orders,
  export controls, subsidies), `capital` (funding, deals, valuations).
- Entity kinds: company, person, agency, place (campus, site), project, fund, product (model, chip).
- Relation types: invests_in, supplies, operates, powers, located_in, regulates, partners, acquired, employs,
  founded, competes, sues.
- Event kinds: release, funding, capex, chip_launch, export_control, executive_order, law, award,
  datacenter_announcement, groundbreaking, power_deal, outage, hire, departure.
- Eras (suggested): pre-ChatGPT (to 2022-11), the scramble (2022-12 to 2023-12), gigawatt announcements
  (2024), build and power (2025), and the current year.

## Sources, in the order to start

1. **Epoch AI CSVs.**
   - CC BY 4.0, credit required.
   - Files: `https://epoch.ai/data/data_centers/data_centers.csv` (sites, power, owners, investors) and
     `https://epoch.ai/data/notable_ai_models.csv`.
2. **SEC EDGAR.**
   - XBRL company facts, e.g. `https://data.sec.gov/api/xbrl/companyconcept/CIK0001045810/us-gaap/PaymentsToAcquirePropertyPlantAndEquipment.json`,
     for capex.
   - Submissions and full-text search for 8-K deals. Full-text search is unofficial and may change without
     notice.
   - Needs a User-Agent with a contact address. Stay at or under 10 requests per second.
3. **Federal Register API.**
   - Query: `https://www.federalregister.gov/api/v1/documents.json` with
     `conditions[presidential_document_type]=executive_order`.
   - Covers executive orders, BIS export-control rules and CHIPS notices. No key.
   - Use `curl -G --data-urlencode` for the bracketed parameters.
4. **EIA.** EIA-860M (monthly generator inventory) and API v2 (needs a free key). LBNL "Queued Up" for
   interconnection queues: yearly, downloaded by hand.
5. **GDELT 2.0 bulk files** (`http://data.gdeltproject.org/gdeltv2/lastupdate.txt`) for discovery and coverage
   volume. The DOC API allows one request per 5 s.
6. **Company newsroom feeds** (e.g. `https://openai.com/news/rss.xml`; other labs may need their sitemap) and
   the Hacker News Algolia API.
7. **Imagery.** Wikimedia Commons with licence and trademark fields, and Sentinel-2 L2A via Element84 Earth
   Search STAC for campus sites.
8. **Sentiment.** X through the `x` skill (private aggregates only), Bluesky search and Jetstream, and Hacker
   News, each on its own line.

## Not used, and why

- NewsAPI (production plan priced at $449 per month);
- Reddit (needs a commercial agreement);
- paywalled analyst trackers (link to them only).

Confirm EU AI Act dates against the Official Journal before publishing them.

## Sentiment and attention

Starter X queries (freeze and version them before collecting):

`"data center" (gigawatt OR GW)`, `"AI bubble"`, `Stargate`, `"export controls" (chips OR Nvidia)`,
`"AI power demand"`, `(Nvidia OR TSMC) capex`. For each, collect daily with `--latest` within `since:`/`until:`
windows. About 1 post in 40 arrives without a date; drop it from dated series and count it.
