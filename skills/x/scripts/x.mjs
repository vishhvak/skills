#!/usr/bin/env node
// `x` skill CLI — full control of a logged-in X (Twitter) account through the
// web app, driven by agent-browser. No paid API, no X developer app.
//
// Commands:
//   session [--browser b] [--profile p]     Ensure a logged-in session; print @handle
//   search <query...> [--top|--latest] [--limit N] [--json]
//   user <handle> [--limit N] [--json]      Recent posts from one account
//   bookmarks [--search <q>] [--limit N] [--json]
//   post <text...> [--reply-to <url|id>]
//   like <url|id>       |  unlike <url|id>
//   repost <url|id>
//   bookmark <url|id>   |  unbookmark <url|id>
//
// Reads capture X's own GraphQL responses (real post JSON). Writes drive the
// UI via stable data-testid selectors. See references/architecture.md for why.

import * as X from './lib.mjs';

const argv = process.argv.slice(2);
const cmd = argv.shift();

function flag(name) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
}
function opt(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
}
function rest() { return argv.filter((a) => !a.startsWith('--')).join(' ').trim(); }

const asJson = flag('json');
function emit(obj, human) {
  if (asJson) { process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); return; }
  human(obj);
}
function line(s = '') { process.stdout.write(s + '\n'); }
function fmtPost(p, i) {
  const stats = [p.likes && `♥${p.likes}`, p.reposts && `⇄${p.reposts}`, p.replies && `↩${p.replies}`, p.views && `👁${p.views}`].filter(Boolean).join(' ');
  line(`${String(i + 1).padStart(2)}. @${p.handle}${p.name ? ` (${p.name})` : ''}  ${stats}`);
  line(`    ${p.text}`);
  if (p.url) line(`    ${p.url}`);
}

function requireArg(v, what) {
  if (!v) { process.stderr.write(`error: ${what} is required\n`); process.exit(2); }
  return v;
}

// Read posts the fast way (signed request, no browser), falling back to the
// headed browser if the direct path fails for any reason — a rotated queryId,
// a bundle change that breaks transaction-id generation, missing cookies.
// The fallback also re-learns the operation's current queryId/features, so the
// skill heals itself for the next run.
async function readPosts(op, vars, limit, browser, profile, headedAction, headedOp) {
  if (!process.env.X_NO_DIRECT) {
    try {
      const posts = await X.directPaged(op, vars, limit);
      if (posts.length) return { posts, via: 'direct' };
      throw new Error('direct path returned no posts');
    } catch (e) {
      if (process.env.X_DEBUG) process.stderr.write(`[x] direct path failed: ${e.message}\n`);
    }
  }
  X.ensureSession({ browser, profile });
  const json = X.captureGraphql(headedOp || op, headedAction);
  return { posts: X.parsePosts(json).slice(0, limit), via: 'browser' };
}

async function main() {
  switch (cmd) {
    case 'session': {
      const who = X.ensureSession({ browser: opt('browser', 'chrome'), profile: opt('profile', 'Default') });
      emit({ ok: true, handle: who }, (o) => line(`Logged in as @${o.handle}`));
      break;
    }

    case 'search': {
      const browser = opt('browser', 'chrome'), profile = opt('profile', 'Default');
      const limit = parseInt(opt('limit', '20'), 10);
      const product = flag('top') ? 'Top' : 'Latest'; // default: newest first
      const q = requireArg(rest(), 'query');
      const vars = { rawQuery: q, count: 20, querySource: 'typed_query', product };
      const url = `https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=${product === 'Latest' ? 'live' : 'top'}`;
      const { posts, via } = await readPosts('SearchTimeline', vars, limit, browser, profile, () => {
        X.openUrl(url);
        X.ab(['wait', '--load', 'networkidle'], { allowFail: true });
      });
      emit({ ok: true, query: q, product, via, count: posts.length, posts },
        (o) => { line(`${o.count} ${product} posts for "${o.query}"  [${via}]:\n`); o.posts.forEach(fmtPost); });
      break;
    }

    case 'user': {
      const browser = opt('browser', 'chrome'), profile = opt('profile', 'Default');
      const limit = parseInt(opt('limit', '20'), 10);
      const handle = requireArg(rest(), 'handle').replace(/^@/, '');
      // Direct path uses search's `from:` operator (no userId lookup needed);
      // the browser fallback navigates the real profile timeline.
      const vars = { rawQuery: `from:${handle}`, count: 20, querySource: 'typed_query', product: 'Latest' };
      const { posts, via } = await readPosts('SearchTimeline', vars, limit, browser, profile, () => {
        X.openUrl(`https://x.com/${handle}`);
        X.ab(['wait', '--load', 'networkidle'], { allowFail: true });
      }, 'UserTweets');
      emit({ ok: true, handle, via, count: posts.length, posts },
        (o) => { line(`${o.count} recent posts from @${o.handle}  [${via}]:\n`); o.posts.forEach(fmtPost); });
      break;
    }

    case 'bookmarks': {
      const browser = opt('browser', 'chrome'), profile = opt('profile', 'Default');
      const limit = parseInt(opt('limit', '30'), 10);
      const search = opt('search', null);
      // When filtering, pull a wider net so the filter has material to work on.
      const fetchLimit = search ? Math.max(limit, 200) : limit;
      let { posts, via } = await readPosts('Bookmarks', { count: 20 }, fetchLimit, browser, profile, () => {
        X.openUrl('https://x.com/i/bookmarks');
        X.ab(['wait', '--load', 'networkidle'], { allowFail: true });
        const pages = Math.min(6, Math.ceil(fetchLimit / 20));
        for (let i = 1; i < pages; i++) { X.ab(['scroll', 'down', '1600'], { allowFail: true }); X.ab(['wait', '1200'], { allowFail: true }); }
      });
      if (search) {
        const needle = search.toLowerCase();
        posts = posts.filter((p) => (p.text || '').toLowerCase().includes(needle) || (p.handle || '').toLowerCase().includes(needle));
      }
      posts = posts.slice(0, limit);
      emit({ ok: true, search: search || undefined, via, count: posts.length, posts },
        (o) => { line(`${o.count} bookmark(s)${search ? ` matching "${search}"` : ''}  [${via}]:\n`); o.posts.forEach(fmtPost); });
      break;
    }

    case 'post': {
      X.ensureSession({ browser: opt('browser', 'chrome'), profile: opt('profile', 'Default') });
      const replyTo = opt('reply-to', null);
      const text = requireArg(rest(), 'post text');
      const r = X.post(text, { replyTo });
      emit({ ok: r.ok, replyTo: replyTo || undefined, text },
        (o) => line(o.ok ? `Posted${replyTo ? ' reply' : ''}: "${text}"` : 'Post may not have gone through — verify on X.'));
      if (!r.ok) process.exitCode = 1;
      break;
    }

    case 'like': case 'unlike': case 'repost': case 'bookmark': case 'unbookmark': {
      X.ensureSession({ browser: opt('browser', 'chrome'), profile: opt('profile', 'Default') });
      const target = requireArg(rest(), 'post url or id');
      const fn = { like: X.like, unlike: X.unlike, repost: X.repost, bookmark: X.bookmark, unbookmark: X.unbookmark }[cmd];
      const past = { like: 'liked', unlike: 'unliked', repost: 'reposted', bookmark: 'bookmarked', unbookmark: 'removed bookmark' }[cmd];
      const r = fn(target);
      emit({ ok: r.ok, action: cmd, already: r.already, target },
        (o) => line(o.already ? `Already ${past}.` : o.ok ? `${past}: ${target}` : `${cmd} may have failed — verify on X.`));
      if (!r.ok) process.exitCode = 1;
      break;
    }

    default:
      process.stderr.write(
        'usage: x.mjs <session|search|user|bookmarks|post|like|unlike|repost|bookmark|unbookmark> [...]\n' +
        'examples:\n' +
        '  x.mjs session\n' +
        '  x.mjs search "anthropic claude" --latest --limit 20\n' +
        '  x.mjs user @karpathy --limit 10\n' +
        '  x.mjs bookmarks --search "rust" --limit 30\n' +
        '  x.mjs post "hello from the x skill"\n' +
        '  x.mjs post "great thread" --reply-to https://x.com/user/status/123\n' +
        '  x.mjs like https://x.com/user/status/123\n' +
        '  x.mjs repost 123456789\n');
      process.exit(2);
  }
}

main().catch((e) => { process.stderr.write(String(e.message || e) + '\n'); process.exit(1); });
