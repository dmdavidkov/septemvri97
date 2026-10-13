// Copies the club's latest Facebook posts into the site when it is published: site/data/posts.json and the
// photos in site/assets/fb/. Neither is committed (the repository is public), and visitors' browsers never
// contact Facebook. Needs FB_PAGE_TOKEN, a Page access token with pages_read_engagement (see README).
// If Facebook fails, the posts on the live site are copied instead and the run exits with code 1 so GitHub emails.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GRAPH = 'https://graph.facebook.com/';
const LIVE = 'https://www.septemvri97.eu/';
const MAX_POSTS = 5;
const MAX_TEXT = 600;
const MAX_IMAGE_BYTES = 3_000_000;
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const IMAGE_PATH = /^assets\/fb\/[\w-]+\.(jpg|png|webp)$/;

const sofiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' });

function shorten(text) {
  const t = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length <= MAX_TEXT) return t;
  const cut = t.slice(0, MAX_TEXT);
  return `${cut.slice(0, cut.lastIndexOf(' ') > MAX_TEXT * 0.8 ? cut.lastIndexOf(' ') : MAX_TEXT).trimEnd()}…`;
}

const isFacebookUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'facebook.com' || u.hostname.endsWith('.facebook.com'));
  } catch {
    return false;
  }
};

// Graph API posts → the newest few with text or a photo and a link back to Facebook.
export function toPosts(data, max = MAX_POSTS) {
  return (data ?? [])
    .filter((p) => p?.id && (p.message || p.full_picture) && isFacebookUrl(p.permalink_url))
    .slice(0, max)
    .map((p) => ({
      id: String(p.id).replace(/\W/g, '_'),
      // Facebook writes "+0000"; Date.parse wants "+00:00".
      date: sofiaDate.format(new Date(String(p.created_time).replace(/([+-]\d\d)(\d\d)$/, '$1:$2'))),
      text: p.message ? shorten(p.message) : '',
      picture: p.full_picture ?? null,
      url: p.permalink_url,
    }));
}

const strip = ({ posts }) => JSON.stringify(posts);

export async function run({ root, token, fetchImpl = fetch, live = LIVE, log = console.log }) {
  const outFile = path.join(root, 'site/data/posts.json');
  const imageDir = path.join(root, 'site/assets/fb');

  async function get(url, what) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
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

  // What the live site shows now: for the change check, and as the fallback when Facebook fails.
  let current = null;
  try {
    current = await (await get(new URL('data/posts.json', live), 'live posts')).json();
    if (!Array.isArray(current?.posts)) current = null;
  } catch { /* first publish, or the site is down */ }

  async function write(data) {
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, `${JSON.stringify(data, null, 2)}\n`);
    return { changed: !current || strip(current) !== strip(data), posts: data.posts.length };
  }

  if (!token) {
    log('FB_PAGE_TOKEN is not set: the site keeps the click-to-load Facebook box.');
    return { skipped: true, changed: false, posts: 0, error: null };
  }

  try {
    const url = new URL('me/posts', GRAPH);
    url.search = new URLSearchParams({ fields: 'id,message,created_time,permalink_url,full_picture', limit: '15', access_token: token });
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
    const body = await res.json().catch(() => ({}));
    // Facebook's error message never contains the token, so it is safe to log.
    if (!res.ok || body.error) throw new Error(`Facebook: ${body.error?.message ?? `HTTP ${res.status}`}`);

    const posts = [];
    for (const p of toPosts(body.data)) {
      let image = null;
      if (p.picture) {
        try {
          image = await saveImage(p.id, await get(p.picture, 'photo'));
        } catch (e) {
          log(`post ${p.id}: photo skipped (${e.message})`);
        }
      }
      posts.push({ id: p.id, date: p.date, text: p.text, image, url: p.url });
    }
    return { ...(await write({ posts })), skipped: false, error: null };
  } catch (e) {
    log(`${e.message} — keeping the posts that are on the live site.`);
    if (!current) return { skipped: false, changed: false, posts: 0, error: e.message };
    const posts = [];
    for (const p of current.posts) {
      let image = null;
      if (IMAGE_PATH.test(p.image ?? '')) {
        try {
          image = await saveImage(p.image.slice('assets/fb/'.length).replace(/\.\w+$/, ''), await get(new URL(p.image, live), 'live photo'));
        } catch { /* the card shows without its photo */ }
      }
      posts.push({ ...p, image });
    }
    return { ...(await write({ posts })), changed: false, skipped: false, error: e.message };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await run({ root, token: process.env.FB_PAGE_TOKEN });
  console.log(`${result.posts} posts${result.changed ? ', changed' : ''}`);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
  if (result.error) process.exitCode = 1;
}
