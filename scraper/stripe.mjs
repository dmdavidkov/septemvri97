// Adds up the card donations that came through each cause's Stripe payment link and writes
// site/data/stripe.json ({ eurCents: { "<link>": cents } }) when the site is published. The site adds these to
// the Sheet's "Събрано €", which then holds only what came another way (bank transfers, cash).
// It reads with a restricted, read-only key (secret STRIPE_KEY) and publishes one total per link, only for the
// links in the Sheet's "Нужди" tab: links that aren't on the site (a partner's own link, say) stay private.
// No donor data leaves Stripe, and the file is never committed.
// Without STRIPE_KEY nothing is written and the site shows the Sheet's amounts. If Stripe or the Sheet can't be
// read, the live totals are kept and the run exits with code 1.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import config from '../site/assets/js/config.js';
import { parseNeeds } from '../site/assets/js/lib/sheet.js';
import { payLinkKey } from '../site/assets/js/lib/values.js';

const API = 'https://api.stripe.com/v1/';
const LIVE = 'https://www.septemvri97.eu/';
// 100 per page: 50 pages are 5,000 donations.
const MAX_PAGES = 50;

// Completed Checkout Sessions → euro cents per payment link, refunds taken off. With Adaptive Pricing a donor
// may pay in their own currency; the euro amount is then in currency_conversion.
export function sumByLink(sessions, linkUrls) {
  const totals = {};
  for (const s of sessions) {
    if (s?.mode !== 'payment' || s.payment_status !== 'paid') continue;
    const url = linkUrls[s.payment_link];
    if (!url) continue;
    const conversion = s.currency_conversion;
    let cents = conversion?.amount_total ?? s.amount_total;
    if ((conversion?.source_currency ?? s.currency) !== 'eur' || !Number.isSafeInteger(cents) || cents <= 0) continue;
    const charge = s.payment_intent?.latest_charge;
    if (charge && typeof charge === 'object' && charge.amount > 0) {
      cents = Math.round((cents * (charge.amount - (charge.amount_refunded ?? 0))) / charge.amount);
    }
    if (cents > 0) totals[url] = (totals[url] ?? 0) + cents;
  }
  return totals;
}

export async function run({ root, key, fetchImpl = fetch, live = LIVE, needsUrl = config.sheet.needs, log = console.log }) {
  const outFile = path.join(root, 'site/data/stripe.json');
  if (!key) {
    log('No STRIPE_KEY: the site shows only the amounts from the Sheet.');
    return { changed: false, links: 0, error: null };
  }
  if (key.startsWith('sk_')) log('STRIPE_KEY is a full secret key; a restricted key with read access is enough (README).');

  async function get(url, what, headers = {}) {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      // Stripe says what is wrong, e.g. a permission the restricted key lacks. It never repeats the key in full.
      const reason = (await res.json().catch(() => null))?.error?.message;
      throw new Error(`${what}: HTTP ${res.status}${reason ? ` (${reason})` : ''}`);
    }
    return res;
  }

  // Every page of a Stripe list.
  async function list(endpoint, params, what) {
    const items = [];
    let after = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams([...params, ['limit', '100']]);
      if (after) q.set('starting_after', after);
      const body = await (await get(`${API}${endpoint}?${q}`, what, { authorization: `Bearer ${key}` })).json();
      const data = Array.isArray(body?.data) ? body.data : [];
      items.push(...data);
      if (!body.has_more || !data.length) return items;
      after = data.at(-1).id;
    }
    throw new Error(`${what}: more than ${MAX_PAGES} pages`);
  }

  // What the live site shows now: kept on errors, and the change check.
  let current = null;
  try {
    current = await (await get(new URL('data/stripe.json', live), 'live totals')).json();
    if (!current?.eurCents || typeof current.eurCents !== 'object') current = null;
  } catch { /* first publish, or the site is down */ }

  async function write(eurCents) {
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, `${JSON.stringify({ eurCents }, null, 2)}\n`);
    return { changed: JSON.stringify(current?.eurCents ?? null) !== JSON.stringify(eurCents), links: Object.keys(eurCents).length };
  }

  try {
    const shown = new Set();
    if (needsUrl) {
      const needs = parseNeeds(await (await get(needsUrl, 'Sheet "Нужди"')).text(), { allowedHosts: config.payHosts });
      if (needs.fatal) throw new Error(`Sheet "Нужди": ${needs.fatal}`);
      for (const row of needs.rows) if (row.pay && !row.pay.placeholder) shown.add(payLinkKey(row.pay.url));
    }
    const links = shown.size ? await list('payment_links', [], 'Stripe payment links') : [];
    const linkUrls = Object.fromEntries(links.map((l) => [l.id, payLinkKey(l.url)]).filter(([, url]) => shown.has(url)));
    const sessions = Object.keys(linkUrls).length
      ? await list('checkout/sessions', [['status', 'complete'], ['expand[]', 'data.payment_intent.latest_charge']], 'Stripe payments')
      : [];
    const eurCents = Object.fromEntries(Object.entries(sumByLink(sessions, linkUrls)).sort(([a], [b]) => a.localeCompare(b)));
    return { ...(await write(eurCents)), error: null };
  } catch (e) {
    log(`${e.message} — keeping the totals that are on the live site.`);
    if (!current) return { changed: false, links: 0, error: e.message };
    return { ...(await write(current.eurCents)), error: e.message };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await run({ root, key: process.env.STRIPE_KEY });
  console.log(`${result.links} links with donations${result.changed ? ', changed' : ''}`);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
  if (result.error) process.exitCode = 1;
}
