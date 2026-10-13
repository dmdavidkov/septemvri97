import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parsePage, parseTimeline, toPosts, hideList, seedList, mergePosts, run } from '../scraper/facebook.mjs';

// Made-up posts shaped like Facebook's (real ones contain names, and the repository is public).
const at = (iso) => Date.parse(iso) / 1000;
const pfbid = (n) => `pfbid0post${n}`;
function story(n, { time = at(`2026-10-0${n}T10:00:00Z`), text = `Публикация ${n}`, photo = 'single', permalink } = {}) {
  const attachment = {
    single: { media: { photo_image: { uri: `https://scontent.xx.fbcdn.net/v/${n}.jpg`, width: 720, height: 540 } } },
    album: { all_subattachments: { nodes: [{ media: { image: { uri: `https://scontent.xx.fbcdn.net/v/${n}-s.jpg` }, viewer_image: { uri: `https://scontent.xx.fbcdn.net/v/${n}-l.jpg` } } }] } },
    foreign: { media: { photo_image: { uri: `https://evil.example/${n}.jpg` } } },
  }[photo];
  return {
    __typename: 'Story',
    post_id: String(n),
    creation_time: time,
    permalink_url: permalink ?? `https://www.facebook.com/permalink.php?story_fbid=${pfbid(n)}&id=100027526106237`,
    comet_sections: {
      content: { story: { message: text ? { text } : null } },
      context_layout: { story: { actors: [{ profile_picture: { uri: 'https://scontent.xx.fbcdn.net/v/avatar.jpg', width: 40, height: 40 } }] } },
    },
    attachments: attachment ? [{ styles: { attachment } }] : [],
  };
}

const pageHtml = (stories, { query = true } = {}) => {
  const preload = { __bbox: { result: { data: { user: { timeline_list_feed_units: { edges: stories.map((node) => ({ node })) } } } } } };
  const preloader = { preloaderID: 'p', queryID: '123', variables: { count: 1, omitPinnedPost: true, userID: '100027526106237' }, queryName: 'ProfileCometTimelineFeedQuery' };
  return `<!doctype html><title>Page</title>
<script type="application/json" data-sjs>${JSON.stringify({ require: [[preload], query ? [preloader] : []] })}</script>
<script>requireLazy(["LSD",[],{"token":"lsd-token"}])</script>`;
};

const timelineText = (stories) => [
  JSON.stringify({ data: { user: { timeline_list_feed_units: { edges: [{ node: stories[0] }] } } } }),
  ...stories.slice(1).map((node, i) => JSON.stringify({
    label: 'ProfileCometTimelineFeed_user$stream$ProfileCometTimelineFeed_user_timeline_list_feed_units',
    path: ['user', 'timeline_list_feed_units', 'edges', i + 1],
    data: { node, cursor: 'c' },
  })),
  JSON.stringify({ label: 'page_info', path: ['user', 'timeline_list_feed_units'], data: { page_info: { has_next_page: true } } }),
].join('\r\n');
const rateLimited = JSON.stringify({ errors: [{ message: 'Rate limit exceeded', code: 1675004 }] });

test('page and timeline: posts, the timeline query and the LSD token', () => {
  const page = parsePage(pageHtml([story(3)]));
  assert.equal(page.lsd, 'lsd-token');
  assert.deepEqual(page.query, { docId: '123', variables: { count: 1, omitPinnedPost: true, userID: '100027526106237' } });
  assert.deepEqual(page.stories.map((s) => s.post_id), ['3']);
  assert.equal(parsePage('<html>login</html>').stories.length, 0);

  const timeline = parseTimeline(timelineText([story(3), story(2), story(1)]));
  assert.deepEqual(timeline.stories.map((s) => s.post_id), ['3', '2', '1']);
  assert.equal(timeline.error, null);
  assert.deepEqual(parseTimeline(rateLimited), { stories: [], error: 'Rate limit exceeded' });
});

test('posts: text and the main photo, Sofia dates, only Facebook photos and links', () => {
  const posts = toPosts([
    story(1, { photo: 'album' }),
    story(2, { text: '', photo: 'single', time: at('2026-10-11T21:30:00Z') }),
    story(3, { text: '', photo: null }),
    story(4, { photo: 'foreign', permalink: 'https://evil.example/post' }),
    story(2),
  ]);
  assert.deepEqual(posts.map((p) => p.id), ['2', '4', '1']);
  // 21:30 UTC is already the next day in Sofia.
  assert.equal(posts[0].date, '2026-10-12');
  assert.equal(posts[0].picture, 'https://scontent.xx.fbcdn.net/v/2.jpg');
  assert.equal(posts[1].picture, null);
  assert.equal(posts[1].url, 'https://www.facebook.com/4');
  assert.equal(posts[2].picture, 'https://scontent.xx.fbcdn.net/v/1-s.jpg');

  const [long] = toPosts([story(5, { text: `${'дума '.repeat(200)}\n\n\n\nкрай` })]);
  assert.ok(long.text.length <= 601);
  assert.match(long.text, /…$/);
});

test('merge: the newest post joins the kept ones; deleted and hidden posts go', () => {
  const p = (n, day) => ({ id: String(n), created: `2026-10-${day}T10:00:00.000Z`, date: `2026-10-${day}`, url: `https://www.facebook.com/permalink.php?story_fbid=${pfbid(n)}` });
  const current = [p(9, 20), p(8, 18), p(7, 15), p(6, 14), p(5, 12)];

  // Post 9 is newer than the page's newest one (19 Oct), so it was deleted on Facebook.
  assert.deepEqual(mergePosts({ fresh: [p(1, 19)], current, complete: false }).map((x) => x.id), ['1', '8', '7', '6', '5']);
  assert.deepEqual(mergePosts({ fresh: [p(1, 21)], current, complete: false }).map((x) => x.id), ['1', '9', '8', '7', '6', '5']);
  const many = Array.from({ length: 9 }, (_, i) => p(20 + i, 10 + i));
  assert.equal(mergePosts({ fresh: [p(1, 21)], current: many, complete: false }).length, 8);
  assert.deepEqual(mergePosts({ fresh: [p(2, 22), p(1, 21)], current, complete: true }).map((x) => x.id), ['2', '1']);

  const hide = hideList(`https://www.facebook.com/permalink.php?story_fbid=${pfbid(8)}&id=100027526106237, 7\nhttps://www.facebook.com/profile.php?id=100027526106237`);
  assert.deepEqual(hide, [pfbid(8), '7']);
  assert.deepEqual(mergePosts({ fresh: [], current, complete: false, hide }).map((x) => x.id), ['9', '6', '5']);
});

function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const key = String(url);
    calls.push({ url: key, options });
    const hit = Object.entries(routes).find(([prefix]) => key.startsWith(prefix));
    if (!hit) return new Response('not found', { status: 404 });
    const value = typeof hit[1] === 'function' ? hit[1](options) : hit[1];
    return value instanceof Response ? value.clone() : new Response(value);
  };
  return { fetchImpl, calls };
}

const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { headers: { 'content-type': 'image/jpeg' } });

test('run: full list when Facebook allows, otherwise the newest post plus the live ones; live posts kept on errors', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-'));
  const read = async () => JSON.parse(await fs.readFile(path.join(root, 'site/data/posts.json'), 'utf8'));
  const reset = () => fs.rm(path.join(root, 'site'), { recursive: true, force: true });
  const live = 'https://live.test/';
  const opts = { root, live, log: () => {}, pause: 0 };

  // Facebook answers both requests: the site gets the full list.
  let { fetchImpl, calls } = fakeFetch({
    'https://www.facebook.com/profile.php': pageHtml([story(3)]),
    'https://www.facebook.com/api/graphql/': timelineText([story(3), story(2), story(1, { photo: null })]),
    'https://scontent.xx.fbcdn.net/': jpeg(),
  });
  let result = await run({ ...opts, fetchImpl });
  assert.deepEqual(result, { changed: true, posts: 3, complete: true, error: null });
  const full = await read();
  assert.deepEqual(full.posts.map((p) => [p.id, p.image]), [['3', 'assets/fb/3.jpg'], ['2', 'assets/fb/2.jpg'], ['1', null]]);
  const graphql = calls.find((c) => c.url.includes('/api/graphql/'));
  assert.equal(graphql.options.headers['x-fb-lsd'], 'lsd-token');
  const body = new URLSearchParams(graphql.options.body);
  assert.equal(body.get('doc_id'), '123');
  assert.equal(JSON.parse(body.get('variables')).count, 8);

  // "More posts" is rate-limited: the newest post joins the live ones, whose photos come from the live site.
  await reset();
  ({ fetchImpl, calls } = fakeFetch({
    'https://live.test/data/posts.json': JSON.stringify(full),
    'https://live.test/assets/fb/': jpeg(),
    'https://www.facebook.com/profile.php': pageHtml([story(4)]),
    'https://www.facebook.com/api/graphql/': rateLimited,
    'https://scontent.xx.fbcdn.net/': jpeg(),
  }));
  result = await run({ ...opts, fetchImpl });
  assert.deepEqual(result, { changed: true, posts: 4, complete: false, error: null });
  assert.deepEqual((await read()).posts.map((p) => [p.id, p.image]), [['4', 'assets/fb/4.jpg'], ['3', 'assets/fb/3.jpg'], ['2', 'assets/fb/2.jpg'], ['1', null]]);
  assert.deepEqual(calls.filter((c) => c.url.includes('fbcdn')).map((c) => c.url), ['https://scontent.xx.fbcdn.net/v/4.jpg']);

  // The same answer again: nothing changes, so nothing is published.
  const again = await read();
  ({ fetchImpl } = fakeFetch({
    'https://live.test/data/posts.json': JSON.stringify(again),
    'https://live.test/assets/fb/': jpeg(),
    'https://www.facebook.com/profile.php': pageHtml([story(4)]),
    'https://www.facebook.com/api/graphql/': rateLimited,
  }));
  await reset();
  assert.equal((await run({ ...opts, fetchImpl })).changed, false);

  // Facebook changed its page: the live posts stay (minus a hidden one) and the run reports the error.
  await reset();
  ({ fetchImpl } = fakeFetch({
    'https://live.test/data/posts.json': JSON.stringify(again),
    'https://live.test/assets/fb/': jpeg(),
    'https://www.facebook.com/profile.php': '<html>Please log in</html>',
  }));
  result = await run({ ...opts, fetchImpl, hide: ['3'] });
  assert.match(result.error, /no posts found/);
  assert.equal(result.changed, true);
  assert.deepEqual((await read()).posts.map((p) => p.id), ['4', '2', '1']);
  await fs.access(path.join(root, 'site/assets/fb/4.jpg'));

  // A seed fills the site after a gap; its photos come from Facebook's links.
  await reset();
  const seed = seedList(JSON.stringify({ posts: [
    { ...toPosts([story(2)])[0] },
    { ...toPosts([story(1)])[0], picture: 'https://evil.example/1.jpg' },
    { id: '../x', date: '2026-10-01', created: '2026-10-01T10:00:00Z', url: 'https://www.facebook.com/x' },
  ] }));
  assert.deepEqual(seed.map((p) => [p.id, p.picture]), [['2', 'https://scontent.xx.fbcdn.net/v/2.jpg'], ['1', null]]);
  assert.deepEqual(seedList('not json'), []);
  ({ fetchImpl } = fakeFetch({
    'https://www.facebook.com/profile.php': pageHtml([story(4)]),
    'https://www.facebook.com/api/graphql/': rateLimited,
    'https://scontent.xx.fbcdn.net/': jpeg(),
  }));
  result = await run({ ...opts, fetchImpl, seed });
  assert.deepEqual((await read()).posts.map((p) => [p.id, p.image]), [['4', 'assets/fb/4.jpg'], ['2', 'assets/fb/2.jpg'], ['1', null]]);

  // Neither Facebook nor a live copy: nothing is written, the page keeps the click-to-load box.
  await reset();
  ({ fetchImpl } = fakeFetch({}));
  result = await run({ ...opts, fetchImpl });
  assert.equal(result.posts, 0);
  await assert.rejects(fs.access(path.join(root, 'site/data/posts.json')));
  await fs.rm(root, { recursive: true });
});
