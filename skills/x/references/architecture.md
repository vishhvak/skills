# How the `x` skill talks to X, and why it does it this way

Three ways exist to programmatically touch X (Twitter). This skill deliberately
picks the third. Here is the full landscape and the evidence behind the choice.

## The three paths

| Path | Talks to | Auth | Returns | Cost | Notes |
|------|----------|------|---------|------|-------|
| xAI `x_search` (Grok) | `api.x.ai` | xAI key / SuperGrok OAuth | A written answer + citation links | Grok usage | Not real posts — model prose about posts. Read-only. |
| Official X API v2 (`xurl`) | `api.x.com/2` | Your X **developer app**, OAuth 2.0 | Real post JSON | Paid tier ($$ for search) | Sanctioned. Needs you to register a dev app. |
| **This skill** | `x.com/i/api/graphql` (X's own private web API) | Your **web session cookies** | Real post JSON | Free | Unofficial. Drives the logged-in web app. |

## Two engines: signed direct (fast) and the browser (reliable)

Reads try a **signed direct request** first — no browser at all — and fall back
to driving the headed browser if anything goes wrong. Writes are browser-only.

| | Direct (default for reads) | Browser (fallback, and all writes) |
|---|---|---|
| Speed | ~1s for a search | ~15s (launch + navigate + HAR) |
| Window | none | a visible Chrome window |
| How it authenticates | cookies + a self-computed `x-client-transaction-id` | X's own client signs its own requests |
| Breaks when | X rotates a queryId or changes its web bundle | rarely (it's a real browser) |

The fallback is what makes this safe to ship: a broken direct path costs
latency, never correctness. Verified by pointing the skill at a bogus queryId —
it 404'd, fell back to the browser, returned posts, **and re-learned the real
queryId**, so the next run went direct again.

### Where the transaction id comes from

`xclid.mjs` is a JS port of twscrape's `xclid.py` (MIT; algorithm originally
reverse-engineered by iSarabjitDhiman/XClientTransaction). It fetches X's
**authenticated** web build, then combines three things scraped from it:

1. `<meta name="twitter-site-verification">` → base64 → key bytes
2. the `loading-x-anim` SVG paths → animation frames
3. a dynamically-imported `sign.o-*.js` chunk → frame indices

…into an animation key via a cubic-bezier solve, then signs each request as
`sha256("METHOD!/path!<ts>obfiowerehiring<animKey>")`, XOR-masked and base64'd.
Building the generator takes ~500ms and is cached per process.

**This is the fragile part.** It parses X's live bundle, so a bundle reshuffle
breaks it. That is expected and handled: generation throws, and the caller falls
back to the browser. Never make a `xclid` failure fatal.

### queryIds and features are learned, not hardcoded

Each GraphQL operation needs a current `queryId` (a persisted-query hash X
rotates) and that operation's exact `features` blob (a missing flag is a hard
400). Hardcoding them guarantees rot, so instead **every browser capture records
what X's own client sent** into `~/.x-skill/ops.json`, and the direct path reads
from there. `SearchTimeline` and `Bookmarks` ship pre-seeded so a fresh install
can go direct immediately; everything else self-populates on first use.

## Why not call the private GraphQL API directly with cookies?

The obvious idea — take your `auth_token` + `ct0` cookies and hit
`x.com/i/api/graphql/<id>/SearchTimeline` yourself, the way Field Theory does
for the `Bookmarks` endpoint — **does not work for search (or writes) anymore.**

X enforces an `x-client-transaction-id` header on its GraphQL endpoints. That
header is computed per request by X's own obfuscated client JavaScript (keyed to
the HTTP method, the path, and a rotating verification secret baked into the web
bundle). A request without a valid one is rejected.

Verified 2026-08 on this machine:

- The **browser**, logged in, issuing `SearchTimeline` through X's own client →
  `200 OK`, 40 real posts. (Captured in a HAR.)
- A **direct `fetch`** replaying the exact same URL with the exact same cookies +
  the public web bearer token → **`404`, empty body.**
- The **same `fetch` run from inside the page** (so cookies and origin are
  perfect) but built by hand → **still `404`.** Proof that the blocker is the
  missing client-generated transaction id, not cookies or CORS.

The 404 (rather than 401/403) is X's deliberately misleading signal for "your
request didn't come through our instrumented client." Supplying a **valid**
generated transaction id flips the exact same request to `200` with 20 posts —
which is what the direct engine above does.

### There is no unguarded legacy search endpoint (all tested)

X guards **per operation**, not per queryId, so hunting for an older search API
is a dead end. Measured with valid cookies and no transaction id:

| Endpoint | Result | Verdict |
|---|---|---|
| `Bookmarks` GraphQL (`Z9GWmP0k…`) | 200, full timeline JSON | ✅ genuinely unguarded |
| `SearchTimeline`, current queryId | 404, empty | ❌ guarded |
| `SearchTimeline`, twscrape's older queryId | 404, empty | ❌ guarded (not a queryId issue) |
| `/i/api/2/search/adaptive.json` (classic pre-GraphQL search) | 200, **zero bytes** | ❌ stealth-blocked |
| `/1.1/search/tweets.json` | 404 "page does not exist" | ❌ retired |
| `/1.1/search/typeahead.json` | 200, works | ⚠️ accounts/topics only, not post search |

So Bookmarks is a genuine survivor, not a template. Search must be signed.

### How other projects solve this

- **twscrape** — forges the transaction id, same as this skill's direct engine.
- **birdclaw** — sidesteps live X entirely: imports your Twitter *archive* into
  SQLite and searches it with FTS5; live reads delegate to `xurl`.
- **xquik** — pays a hosted third party; collection method undisclosed.

## The design that follows from that

Let X's own client make the signed requests, and either read what it fetched or
drive the buttons it wired up.

- **Reads** (`search`, `user`, `bookmarks`): navigate the app to the right page,
  record a HAR, and pull the JSON body of the `SearchTimeline` / `UserTweets` /
  `Bookmarks` GraphQL response the app fetched. Real structured post data, no
  transaction-id forging. (`captureGraphql` in `lib.mjs`.)
- **Writes** (`post`, `like`, `repost`, `bookmark`): click the app's own controls
  via stable `data-testid` selectors (`like`, `unlike`, `retweet`,
  `retweetConfirm`, `bookmark`, `removeBookmark`, `tweetTextarea_0`,
  `tweetButton`, `tweetButtonInline`). X's client fires the signed request.

## Two hard requirements

1. **Headed browser.** X serves a *headless* browser a degraded, non-interactive
   server-rendered page: the post text is present but **zero** of the
   `data-testid` controls exist, and the app never hydrates. A real (headed)
   window gets the full app (verified: 0 testids headless vs ~300 headed on the
   same status URL). So the skill runs the agent-browser session **headed** by
   default. `X_HEADLESS=1` forces headless, which is **read-only** — writes will
   fail because the controls won't be there.

2. **A logged-in session.** Bootstrapped by extracting `auth_token` + `ct0` from
   your local browser's cookie store (`chrome-cookies.mjs`, same decrypt path as
   Field Theory) and injecting them into the agent-browser cookie jar. Cookie
   values are written only to `~/.x-skill/cookies.json` (mode 600) and never
   printed. If extraction fails, log in once by hand in the headed window.

## Terms-of-service note

Replaying web-session cookies against X's private GraphQL endpoints is against
X's Terms of Service, even when you only read or act on your own account. This
skill is for operating **your own** account on **your own** machine. It performs
no action you couldn't perform by clicking in your own browser. If you need a
sanctioned path, use `xurl` with your own developer app instead.
