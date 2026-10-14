import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sumByLink, run } from '../scraper/stripe.mjs';

// Made-up Stripe objects with only the fields the step reads.
const LINK_A = 'https://buy.stripe.com/test_aaa';
const LINK_B = 'https://buy.stripe.com/test_bbb';
const LINK_PARTNER = 'https://buy.stripe.com/test_partner';
const links = [
  { id: 'plink_a', url: LINK_A },
  { id: 'plink_b', url: LINK_B },
  { id: 'plink_partner', url: LINK_PARTNER },
];
let n = 0;
function session(link, cents, { status = 'paid', currency = 'eur', conversion, refunded = 0, mode = 'payment' } = {}) {
  n += 1;
  return {
    id: `cs_test_${n}`,
    mode,
    payment_status: status,
    payment_link: link,
    currency,
    amount_total: cents,
    currency_conversion: conversion ?? null,
    payment_intent: { id: `pi_${n}`, latest_charge: { id: `ch_${n}`, amount: conversion ? 999 : cents, amount_refunded: conversion ? Math.round(999 * refunded / cents) : refunded } },
  };
}

test('sum: paid euro donations per link, refunds taken off', () => {
  const urls = { plink_a: LINK_A, plink_b: LINK_B };
  const totals = sumByLink([
    session('plink_a', 5000),
    session('plink_a', 2000, { refunded: 500 }),
    session('plink_a', 1000, { refunded: 1000 }),
    session('plink_a', 3000, { status: 'unpaid' }),
    session('plink_a', 3000, { currency: 'usd' }),
    session('plink_a', 3000, { mode: 'subscription' }),
    // Adaptive Pricing: paid in another currency, counted in euros.
    session('plink_b', 1200, { currency: 'bgn', conversion: { amount_total: 1200, source_currency: 'eur' } }),
    session('plink_partner', 25000),
    session(null, 700),
  ], urls);
  assert.deepEqual(totals, { [LINK_A]: 6500, [LINK_B]: 1200 });
});

function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const key = String(url);
    calls.push({ url: key, options });
    const hit = Object.entries(routes).find(([prefix]) => key.startsWith(prefix));
    if (!hit) return new Response('not found', { status: 404 });
    const value = typeof hit[1] === 'function' ? hit[1](key, options) : hit[1];
    return value instanceof Response ? value.clone() : new Response(typeof value === 'string' ? value : JSON.stringify(value));
  };
  return { fetchImpl, calls };
}

const NEEDS = 'https://sheet.test/needs.csv';
const needsCsv = [
  'Покажи,Код,Заглавие,Цел €,Събрано €,Линк за плащане',
  `TRUE,KLUB,Общо за клуба,,,${LINK_A}`,
  `TRUE,N014,Турнир,600,100,${LINK_B}?locale=en`,
  'TRUE,N015,Топки,300,0,',
].join('\n');

test('run: totals for the causes\' links only; live totals kept on errors', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stripe-'));
  const file = path.join(root, 'site/data/stripe.json');
  const read = async () => JSON.parse(await fs.readFile(file, 'utf8'));
  const reset = () => fs.rm(path.join(root, 'site'), { recursive: true, force: true });
  const live = 'https://live.test/';
  const logs = [];
  const opts = { root, live, needsUrl: NEEDS, key: 'rk_test_made_up', log: (m) => logs.push(m) };

  // Two pages of payments; the partner's link isn't in the Sheet, so its total isn't published.
  const page1 = [session('plink_a', 5000), session('plink_partner', 25000)];
  const page2 = [session('plink_b', 1500)];
  const stripe = {
    'https://api.stripe.com/v1/payment_links': { data: links, has_more: false },
    'https://api.stripe.com/v1/checkout/sessions': (url) => (new URL(url).searchParams.get('starting_after')
      ? { data: page2, has_more: false }
      : { data: page1, has_more: true }),
  };
  let { fetchImpl, calls } = fakeFetch({ [NEEDS]: needsCsv, ...stripe });
  let result = await run({ ...opts, fetchImpl });
  assert.deepEqual(result, { changed: true, links: 2, error: null });
  const first = await read();
  assert.deepEqual(first, { eurCents: { [LINK_A]: 5000, [LINK_B]: 1500 } });
  const api = calls.filter((c) => c.url.startsWith('https://api.stripe.com/'));
  assert.equal(api.length, 3);
  assert.ok(api.every((c) => c.options.headers.authorization === 'Bearer rk_test_made_up'));
  const sessions = new URL(api[1].url).searchParams;
  assert.equal(sessions.get('status'), 'complete');
  assert.equal(sessions.get('expand[]'), 'data.payment_intent.latest_charge');
  assert.equal(new URL(api[2].url).searchParams.get('starting_after'), page1[1].id);

  // The same totals as the live site: nothing to publish.
  await reset();
  ({ fetchImpl } = fakeFetch({ 'https://live.test/data/stripe.json': first, [NEEDS]: needsCsv, ...stripe }));
  assert.equal((await run({ ...opts, fetchImpl })).changed, false);

  // A key without a permission: Stripe's reason is logged without the key's ends, and the live totals stay.
  await reset();
  const denied = new Response(JSON.stringify({ error: { message: "The provided key 'rk_test_*****e_up' does not have the required permissions." } }), { status: 403 });
  ({ fetchImpl } = fakeFetch({ 'https://live.test/data/stripe.json': first, [NEEDS]: needsCsv, 'https://api.stripe.com/': denied }));
  result = await run({ ...opts, fetchImpl });
  assert.match(result.error, /HTTP 403 \(The provided key … does not have the required permissions\.\)/);
  assert.equal(result.changed, false);
  assert.deepEqual(await read(), first);
  assert.ok(logs.some((m) => /keeping the totals/.test(m)));
  assert.ok(logs.every((m) => !m.includes('rk_test_') && !m.includes('*')));

  // Something else in the secret: Stripe isn't asked, the value isn't logged, the live totals stay.
  await reset();
  ({ fetchImpl, calls } = fakeFetch({ 'https://live.test/data/stripe.json': first, [NEEDS]: needsCsv, ...stripe }));
  result = await run({ ...opts, key: 'google-site-verification=made-up', fetchImpl });
  assert.match(result.error, /not a Stripe key/);
  assert.equal(calls.filter((c) => c.url.startsWith('https://api.stripe.com/')).length, 0);
  assert.deepEqual(await read(), first);
  assert.ok(logs.every((m) => !m.includes('made-up')));

  // The Sheet can't be read either: same, nothing is guessed.
  await reset();
  ({ fetchImpl } = fakeFetch({ 'https://live.test/data/stripe.json': first }));
  result = await run({ ...opts, fetchImpl });
  assert.match(result.error, /Sheet "Нужди": HTTP 404/);
  assert.deepEqual(await read(), first);

  // No causes with links: Stripe isn't asked and the file is empty.
  await reset();
  ({ fetchImpl, calls } = fakeFetch({ [NEEDS]: 'Код,Заглавие\nKLUB,Общо', ...stripe }));
  result = await run({ ...opts, fetchImpl });
  assert.deepEqual(await read(), { eurCents: {} });
  assert.equal(calls.filter((c) => c.url.startsWith('https://api.stripe.com/')).length, 0);

  // No key: nothing is written or asked, the site shows the Sheet's amounts.
  await reset();
  ({ fetchImpl, calls } = fakeFetch({}));
  result = await run({ ...opts, key: '', fetchImpl });
  assert.deepEqual(result, { changed: false, links: 0, error: null });
  assert.equal(calls.length, 0);
  await assert.rejects(fs.access(file));
  await fs.rm(root, { recursive: true });
});
