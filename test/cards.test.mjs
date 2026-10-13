import test from 'node:test';
import assert from 'node:assert/strict';
import { cardText, shareVersion } from '../site/assets/js/share.js';
import { cardModels, cardPage } from '../scripts/share-cards.mjs';

// Made-up games in the games.json format.
const side = (name, isUs = false, logo = null) => ({ name, isUs, logo });
const DATA = {
  teams: [{ key: 'women', label: 'Жени', short: 'Жени' }, { key: 'u14', label: 'Момичета U14', short: 'U14' }],
  games: [
    {
      id: 'bfb-1', source: 'bfb', team: 'women', competition: 'А група Жени', phase: 'Редовен сезон', round: 2,
      date: '2026-10-17', time: '16:00', start: '2026-10-17T16:00:00+03:00', venue: 'Триадица - София',
      home: side('Септември 97', true), away: side('Рилски "Спортист" <Самоков>', false, 'assets/logos/bfb/x.jpg'),
      score: null, liveUrl: null, url: 'https://comps.basketball.bg/game-1',
    },
    {
      id: 'bfb-2', source: 'bfb', team: 'u14', competition: 'Момичета 14г.', phase: 'ЗАПАД', round: 1,
      date: '2026-10-11', time: '11:00', start: '2026-10-11T11:00:00+03:00', venue: 'Септември - София',
      home: side('Славия'), away: side('Септември 97', true),
      score: { home: 40, away: 52 }, liveUrl: 'https://tv.basketball.bg/index.php?i_id=2', url: 'https://comps.basketball.bg/game-2',
    },
    { id: 'sheet-u17-2026-11-21', source: 'sheet', team: 'u17', date: '2026-11-21', home: side('A'), away: side('B') },
  ],
};

test('match previews: BFB games only, result or upcoming game', () => {
  // Long after the first game started: the preview still shows it as upcoming, since the score isn't in yet.
  const models = cardModels(DATA, Date.parse('2026-10-20T12:00:00+03:00'));
  assert.deepEqual(models.map((g) => [g.id, g.status, g.tag]), [['bfb-1', 'upcoming', 'Жени'], ['bfb-2', 'played', 'U14']]);
  assert.equal(models[1].result, 'win');
  assert.equal(models[1].home.logo, null);
  assert.equal(models[1].away.logo, 'assets/img/emblem.svg');
});

test('match previews: title and description', () => {
  const [upcoming, played] = cardModels(DATA);
  assert.deepEqual(cardText(upcoming), {
    title: 'Септември 97 – Рилски "Спортист" <Самоков>',
    description: 'Жени · събота, 17 октомври, 16:00 · Триадица, София. Елате да ни подкрепите!',
  });
  assert.deepEqual(cardText(played), {
    title: 'Славия 40:52 Септември 97',
    description: 'Момичета U14 · Запад · Кръг 1 · неделя, 11 октомври. Победа! Запис в BFB TV.',
  });
  assert.match(cardText({ ...upcoming, tv: 'https://tv.basketball.bg/index.php?i_id=1' }).description, /Излъчване в BFB TV\. Елате/);
});

test('match previews: the version changes with what the picture shows', () => {
  const [g] = cardModels(DATA);
  assert.equal(shareVersion(g), shareVersion({ ...g, status: 'live' }));
  assert.notEqual(shareVersion(g), shareVersion({ ...g, score: { home: 70, away: 60 } }));
  assert.notEqual(shareVersion(g), shareVersion({ ...g, time: '18:00' }));
  assert.match(shareVersion(g), /^[0-9a-z]+$/);
});

test('match previews: page with escaped text and absolute picture links', () => {
  const [g] = cardModels(DATA);
  const v = shareVersion(g);
  const html = cardPage(g, { picture: true });
  assert.ok(!html.includes('<Самоков>'));
  assert.match(html, /<meta property="og:title" content="Септември 97 – Рилски &#34;Спортист&#34; &#60;Самоков&#62;">/);
  assert.ok(html.includes(`<meta property="og:image" content="https://www.septemvri97.eu/m/bfb-1.jpg?v=${v}">`));
  assert.ok(html.includes('<script type="module" src="../assets/js/go.js"></script>'));
  assert.ok(html.includes('href="../?game=bfb-1#machove"'));
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  // Facebook takes the shared address (with ?v=) when there is no og:url.
  assert.ok(!html.includes('og:url'));
  assert.ok(!/<style|style=|<script>/.test(html));

  const plain = cardPage(g, { picture: false });
  assert.ok(plain.includes('content="https://www.septemvri97.eu/assets/img/og-image.jpg"'));
  assert.ok(!plain.includes('<img'));
});
