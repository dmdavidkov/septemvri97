// Copies the club's latest public Facebook posts into the site when it is published: site/data/posts.json and
// the photos in site/assets/fb/. Neither is committed (the repository is public), and visitors' browsers never
// contact Facebook. Without a page token there is no API for this, so it reads the public page the way a
// logged-out browser does: one page request, which carries the newest post, and one "more posts" request.
// Facebook usually rate-limits the second one from GitHub's servers; then the newest post is added to the
// posts already on the live site, so the site keeps the latest few over time. Photos are downloaded only for
// posts the site doesn't have yet.
// If the page can't be read, the live posts are kept and the run exits with code 1.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PAGE = 'https://www.facebook.com/profile.php?id=100027526106237';
const GRAPHQL = 'https://www.facebook.com/api/graphql/';
const TIMELINE_QUERY = 'ProfileCometTimelineFeedQuery';
const LIVE = 'https://www.septemvri97.eu/';
const MAX_POSTS = 8;
const MAX_TEXT = 600;
const MAX_IMAGE_BYTES = 3_000_000;
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const IMAGE_PATH = /^assets\/fb\/[\w-]+\.(jpg|png|webp)$/;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// Without the headers a browser sends, Facebook answers with an error page.
const PAGE_HEADERS = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'bg-BG,bg;q=0.9,en;q=0.8',
  'sec-ch-ua': '"Chromium";v="141", "Not?A_Brand";v="8"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};

const sofiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shorten(text) {
  const t = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length <= MAX_TEXT) return t;
  const cut = t.slice(0, MAX_TEXT);
  return `${cut.slice(0, cut.lastIndexOf(' ') > MAX_TEXT * 0.8 ? cut.lastIndexOf(' ') : MAX_TEXT).trimEnd()}…`;
}

const httpsHost = (url, test) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && test(u.hostname);
  } catch {
    return false;
  }
};
const isFacebookUrl = (url) => httpsHost(url, (h) => h === 'facebook.com' || h.endsWith('.facebook.com'));
const isFacebookImage = (url) => httpsHost(url, (h) => h.endsWith('.fbcdn.net'));

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const value of Object.values(node)) walk(value, visit);
}

// The profile page: its JSON blocks carry the newest post, the timeline query and the LSD token for asking more.
export function parsePage(html) {
  const blocks = [...html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => {
    try {
      return JSON.parse(m[1]);
    } catch {
      return null;
    }
  });
  let query = null;
  const stories = [];
  walk(blocks, (o) => {
    if (!query && o.queryName === TIMELINE_QUERY && o.queryID && o.variables) query = { docId: String(o.queryID), variables: o.variables };
    for (const edge of o.timeline_list_feed_units?.edges ?? []) if (edge?.node) stories.push(edge.node);
  });
  const lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"/)?.[1] ?? null;
  return { lsd, query, stories };
}

// The "more posts" answer: one JSON object per line, the first post in the first line and the rest streamed after it.
export function parseTimeline(text) {
  const stories = [];
  let error = null;
  for (const line of text.replace(/^for \(;;\);/, '').split('\n')) {
    let part;
    try {
      part = JSON.parse(line);
    } catch {
      continue;
    }
    error ??= part.errors?.[0]?.message ?? null;
    for (const edge of part.data?.user?.timeline_list_feed_units?.edges ?? []) if (edge?.node) stories.push(edge.node);
    if (part.data?.node && part.path?.[1] === 'timeline_list_feed_units') stories.push(part.data.node);
  }
  return { stories, error };
}

function pictureOf(story) {
  const attachment = story.attachments?.[0]?.styles?.attachment;
  for (const media of [attachment?.media, attachment?.all_subattachments?.nodes?.[0]?.media]) {
    // Album photos come as `image` (about 600 px) and `viewer_image` (1600 px); cards need only the smaller one.
    const image = media?.photo_image ?? media?.image ?? media?.viewer_image ?? media?.large_share_image ?? media?.preferred_thumbnail?.image;
    if (isFacebookImage(image?.uri)) return image.uri;
  }
  return null;
}

// Facebook posts → the newest few with text or a photo, newest first.
export function toPosts(stories) {
  const seen = new Set();
  const posts = [];
  for (const s of stories) {
    if (s?.__typename !== 'Story' || !s.post_id || !Number.isFinite(s.creation_time)) continue;
    const id = String(s.post_id).replace(/\W/g, '_');
    if (seen.has(id)) continue;
    seen.add(id);
    const message = s.comet_sections?.content?.story?.message?.text ?? s.message?.text ?? '';
    const picture = pictureOf(s);
    if (!message && !picture) continue;
    const created = new Date(s.creation_time * 1000);
    posts.push({
      id,
      created: created.toISOString(),
      date: sofiaDate.format(created),
      text: message ? shorten(message) : '',
      picture,
      url: isFacebookUrl(s.permalink_url) ? s.permalink_url : `https://www.facebook.com/${id}`,
    });
  }
  return posts.sort((a, b) => b.created.localeCompare(a.created)).slice(0, MAX_POSTS);
}

// FB_HIDE: post links (with "pfbid…") or numeric post IDs, separated by spaces, commas or new lines.
// Anything else is ignored, so a link to the page itself can't hide every post.
export function hideList(value = '') {
  return value.split(/[\s,]+/).map((v) => v.match(/pfbid\w+/)?.[0] ?? (/^\d+$/.test(v) ? v : null)).filter(Boolean);
}

// FB_SEED, a temporary secret for filling the site after a gap: posts as toPosts makes them (`picture` is a
// Facebook photo link, which Facebook lets expire after a few days). They join the posts already on the site.
export function seedList(value) {
  let data;
  try {
    data = JSON.parse(value || '[]');
  } catch {
    return [];
  }
  return (Array.isArray(data) ? data : data?.posts ?? [])
    .filter((p) => /^\w+$/.test(p?.id ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(p.date ?? '') && !Number.isNaN(Date.parse(p.created)) && isFacebookUrl(p.url))
    .map((p) => ({
      id: p.id,
      created: new Date(p.created).toISOString(),
      date: p.date,
      text: typeof p.text === 'string' ? shorten(p.text) : '',
      picture: isFacebookImage(p.picture) ? p.picture : null,
      url: p.url,
    }));
}

// complete: `fresh` is the page's full list of newest posts. Otherwise `fresh` holds only the newest post,
// which joins the posts already on the site; any of those newer than it must have been deleted.
export function mergePosts({ fresh, current = [], complete, hide = [] }) {
  let posts = fresh;
  if (!complete) {
    const newest = fresh[0]?.created;
    const kept = current.filter((p) => !fresh.some((f) => f.id === p.id) && (!newest || !p.created || p.created <= newest));
    posts = [...fresh, ...kept];
  }
  const hidden = (p) => hide.some((h) => (h.startsWith('pfbid') ? String(p.url).match(/pfbid\w+/)?.[0] === h : p.id === h));
  return posts
    .filter((p) => !hidden(p))
    .sort((a, b) => String(b.created ?? b.date).localeCompare(String(a.created ?? a.date)))
    .slice(0, MAX_POSTS);
}

export async function run({ root, fetchImpl = fetch, live = LIVE, log = console.log, hide = [], seed = [], pause = 1000 }) {
  const outFile = path.join(root, 'site/data/posts.json');
  const imageDir = path.join(root, 'site/assets/fb');
  const signal = () => AbortSignal.timeout(20_000);

  async function get(url, what, options = {}) {
    const res = await fetchImpl(url, { ...options, signal: signal() });
    if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
    return res;
  }

  async function saveImage(name, res) {
    const ext = IMAGE_TYPES[(res.headers.get('content-type') || '').split(';')[0].trim()];
    if (!ext) throw new Error('not an image');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) throw new Error('image too large');
    await fs.mkdir(imageDir, { recursive: true });
    await fs.writeFile(path.join(imageDir, `${name}.${ext}`), buf);
    return `assets/fb/${name}.${ext}`;
  }

  // What the live site shows now: the posts to keep, their photos, and the change check.
  let current = null;
  try {
    current = await (await get(new URL('data/posts.json', live), 'live posts')).json();
    if (!Array.isArray(current?.posts)) current = null;
  } catch { /* first publish, or the site is down */ }
  const known = [...(current?.posts ?? []), ...seed.filter((p) => !current?.posts.some((c) => c.id === p.id))];

  // A post's photo comes from the live site when it is already there, otherwise from Facebook.
  async function withPhotos(posts) {
    const out = [];
    for (const p of posts) {
      const old = current?.posts.find((c) => c.id === p.id)?.image;
      const sources = [IMAGE_PATH.test(old ?? '') ? new URL(old, live).href : null, isFacebookImage(p.picture) ? p.picture : null].filter(Boolean);
      let image = null;
      for (const src of sources) {
        try {
          image = await saveImage(p.id, await get(src, 'photo'));
          break;
        } catch (e) {
          log(`post ${p.id}: photo from ${new URL(src).hostname} skipped (${e.message})`);
        }
      }
      out.push({ id: p.id, created: p.created ?? null, date: p.date, text: p.text, image, url: p.url });
    }
    return out;
  }

  async function write(posts) {
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, `${JSON.stringify({ posts }, null, 2)}\n`);
    return { changed: !current || JSON.stringify(current.posts) !== JSON.stringify(posts), posts: posts.length };
  }

  try {
    const page = await get(PAGE, 'Facebook page', { headers: PAGE_HEADERS });
    const { lsd, query, stories } = parsePage(await page.text());
    let fresh = toPosts(stories);
    if (fresh.length === 0) throw new Error('Facebook page: no posts found (Facebook may have changed the page)');

    let complete = false;
    if (lsd && query) {
      await sleep(pause);
      try {
        const res = await fetchImpl(GRAPHQL, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': UA,
            'accept-language': PAGE_HEADERS['accept-language'],
            origin: 'https://www.facebook.com',
            referer: PAGE,
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'x-fb-friendly-name': TIMELINE_QUERY,
            'x-fb-lsd': lsd,
          },
          body: new URLSearchParams({
            av: '0', __user: '0', __a: '1', lsd,
            fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: TIMELINE_QUERY,
            variables: JSON.stringify({ ...query.variables, count: MAX_POSTS }), server_timestamps: 'true', doc_id: query.docId,
          }),
          signal: signal(),
        });
        const timeline = parseTimeline(await res.text());
        const more = toPosts(timeline.stories);
        if (more.length > 0) {
          fresh = more;
          complete = true;
        } else {
          log(`More posts: ${timeline.error ?? `HTTP ${res.status}`}. Adding only the newest post.`);
        }
      } catch (e) {
        log(`More posts: ${e.message}. Adding only the newest post.`);
      }
    }

    const posts = await withPhotos(mergePosts({ fresh, current: known, complete, hide }));
    return { ...(await write(posts)), complete, error: null };
  } catch (e) {
    log(`${e.message} — keeping the posts that are on the live site.`);
    if (known.length === 0) return { changed: false, posts: 0, complete: false, error: e.message };
    const posts = await withPhotos(mergePosts({ fresh: [], current: known, complete: false, hide }));
    return { ...(await write(posts)), complete: false, error: e.message };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await run({ root, hide: hideList(process.env.FB_HIDE), seed: seedList(process.env.FB_SEED) });
  console.log(`${result.posts} posts${result.complete ? ' (full list from Facebook)' : ''}${result.changed ? ', changed' : ''}`);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
  if (result.error) process.exitCode = 1;
}
