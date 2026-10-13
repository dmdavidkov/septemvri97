import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { toPosts, run } from '../scraper/facebook.mjs';

const apiPost = (n, extra = {}) => ({
  id: `107623030976164_${n}`,
  message: `Публикация ${n}`,
  created_time: '2026-10-11T21:30:00+0000',
  permalink_url: `https://www.facebook.com/107623030976164/posts/${n}`,
  full_picture: `https://scontent.xx.fbcdn.net/v/${n}.jpg`,
  ...extra,
});

test('posts: newest five with text or a photo, Sofia dates, links only to Facebook', () => {
  const posts = toPosts([
    apiPost(1),
    apiPost(2, { message: undefined }),
    apiPost(3, { message: undefined, full_picture: undefined }),
    apiPost(4, { permalink_url: 'https://evil.example/posts/4' }),
    apiPost(5), apiPost(6), apiPost(7), apiPost(8),
  ]);
  assert.deepEqual(posts.map((p) => p.id), ['107623030976164_1', '107623030976164_2', '107623030976164_5', '107623030976164_6', '107623030976164_7']);
  // 21:30 UTC is already the next day in Sofia.
  assert.equal(posts[0].date, '2026-10-12');
  assert.equal(posts[1].text, '');

  const [long] = toPosts([apiPost(9, { message: `${'дума '.repeat(200)}\n\n\n\nкрай` })]);
  assert.ok(long.text.length <= 601);
  assert.match(long.text, /…$/);
});

function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    const key = String(url);
    calls.push(key);
    const hit = Object.entries(routes).find(([prefix]) => key.startsWith(prefix));
    if (!hit) return new Response('not found', { status: 404 });
    const [, value] = hit;
    if (value instanceof Response) return value.clone();
    return Response.json(value[0], { status: value[1] ?? 200 });
  };
  return { fetchImpl, calls };
}

const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { headers: { 'content-type': 'image/jpeg' } });

test('run: writes posts and photos, keeps the live posts when Facebook fails, does nothing without a token', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fb-'));
  const read = async () => JSON.parse(await fs.readFile(path.join(root, 'site/data/posts.json'), 'utf8'));
  const live = 'https://live.test/';
  const log = () => {};

  // Facebook answers: one post with a photo; the live site has nothing yet.
  let { fetchImpl, calls } = fakeFetch({
    'https://graph.facebook.com/me/posts': [{ data: [apiPost(1)] }],
    'https://scontent.xx.fbcdn.net/': jpeg(),
  });
  let result = await run({ root, token: 'secret-token', fetchImpl, live, log });
  assert.deepEqual(result, { changed: true, posts: 1, skipped: false, error: null });
  const saved = await read();
  assert.equal(saved.posts[0].image, 'assets/fb/107623030976164_1.jpg');
  assert.equal(saved.posts[0].url, 'https://www.facebook.com/107623030976164/posts/1');
  await fs.access(path.join(root, 'site/assets/fb/107623030976164_1.jpg'));
  assert.ok(calls.some((c) => c.includes('access_token=secret-token')));

  // The token stopped working: the live posts and their photos are copied, and the run reports the error.
  await fs.rm(path.join(root, 'site'), { recursive: true });
  ({ fetchImpl } = fakeFetch({
    'https://graph.facebook.com/': [{ error: { message: 'Error validating access token', code: 190 } }, 400],
    'https://live.test/data/posts.json': [saved],
    'https://live.test/assets/fb/': jpeg(),
  }));
  result = await run({ root, token: 'secret-token', fetchImpl, live, log });
  assert.equal(result.changed, false);
  assert.match(result.error, /Error validating access token/);
  assert.doesNotMatch(result.error, /secret-token/);
  assert.deepEqual(await read(), saved);
  await fs.access(path.join(root, 'site/assets/fb/107623030976164_1.jpg'));

  // No token: nothing is written, the page keeps the click-to-load box.
  await fs.rm(path.join(root, 'site'), { recursive: true });
  result = await run({ root, token: '', fetchImpl, live, log });
  assert.equal(result.skipped, true);
  await assert.rejects(fs.access(path.join(root, 'site/data/posts.json')));
  await fs.rm(root, { recursive: true });
});
