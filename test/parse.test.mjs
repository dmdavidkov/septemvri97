import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTeamGames, parseGamePage } from '../scraper/parse.mjs';
import { run } from '../scraper/scrape.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (name) => fs.readFile(path.join(ROOT, 'scraper/fixtures', name), 'utf8');

test('team schedule: upcoming and played rows', async () => {
  const { season, games } = parseTeamGames(await fixture('team_games_1890.html'));
  assert.deepEqual(season, { id: 29, name: '2026/2027' });
  assert.equal(games.length, 12);

  const next = games.find((g) => g.id === 384690);
  assert.equal(next.date, '2026-10-17');
  assert.equal(next.time, '16:00');
  assert.equal(next.competition, 'А група Жени');
  assert.equal(next.phase, 'Редовен сезон');
  assert.equal(next.home.name, 'Септември 97');
  assert.equal(next.away.name, 'Рилски спортист');
  assert.equal(next.score, null);
  assert.equal(next.home.logo, 'https://comps.basketball.bg/pictures/pic_small/clubs/20250725084541.jpg');

  const played = games.find((g) => g.id === 384686);
  assert.deepEqual(played.score, { home: 70, away: 77 });
  assert.equal(played.away.name, 'Септември 97');
  assert.equal(played.liveUrl, 'https://tv.basketball.bg/index.php?i_id=384686');
});

test('team schedule: empty season is valid, broken markup throws', async () => {
  const empty = parseTeamGames(await fixture('team_games_empty.html'));
  assert.equal(empty.games.length, 0);
  assert.equal(empty.season.id, 28);
  assert.throws(() => parseTeamGames('<html><body>Грешка</body></html>'), /unexpected markup/);
  assert.throws(
    () => parseTeamGames('<div id="team_games"><select id="season"></select><table><a href="game-1">x</a></table></div>'),
    /no rows parsed/,
  );
});

test('team schedule: whitespace collapsed, foreign live links dropped', () => {
  const html = `<div id="team_games"><select id="season"><option value="29" selected>2026/2027</option></select>
    <div class="tr"><a href="game-5" class="td home"><div class="td_name">  Септември   97 </div></a>
    <a href="game-5" class="td away"><div class="td_name">Септември</div></a>
    <a class="td td_date"><span class="date">01-11-2026 <span>9:30</span></span></a>
    <a class="td champ">Девойки 16г.  |  Група  А </a><a class="score_home"></a><a class="score_away"></a>
    <div class="td td_info"><a class="live" href="https://evil.example/x">Live</a></div></div></div>`;
  const [g] = parseTeamGames(html).games;
  assert.equal(g.home.name, 'Септември 97');
  assert.equal(g.away.name, 'Септември');
  assert.equal(g.time, '09:30');
  assert.equal(g.phase, 'Група А');
  assert.equal(g.liveUrl, null);
});

test('game page: round, venue, team ids; month "Септември" is a date, not a venue', async () => {
  assert.deepEqual(parseGamePage(await fixture('game_384686_played.html')), {
    round: 1, venue: 'Триадица - София', homeTeamId: 1971, awayTeamId: 1890,
  });
  assert.deepEqual(parseGamePage(await fixture('game_384690_upcoming.html')), {
    round: 2, venue: 'Триадица - София', homeTeamId: 1890, awayTeamId: 636,
  });
  const html = '<div class="bar_top"><span>Купа</span><span>Финал</span><span>12 Септември 2026</span><span>Зала Септември - София</span><span>11:00</span></div>';
  assert.deepEqual(parseGamePage(html), { round: null, venue: 'Зала Септември - София', homeTeamId: null, awayTeamId: null });
  // A phase that looks like "Hall - City" is not a venue when the schedule row names it.
  const phaseOnly = '<div class="bar_top"><span>Момичета 12г.</span><span>Северозапад - група Б</span><span>Кръг 3</span></div>';
  assert.equal(parseGamePage(phaseOnly, ['Момичета 12г.', 'Северозапад - група Б']).venue, null);
  assert.throws(() => parseGamePage('<html></html>'), /bar_top/);
});

// A fake BFB built from the fixtures; `broken` makes one team's schedule fail.
async function fakeBfb(broken = new Set()) {
  const pages = {
    'team_games.inc.php?t_id=1890': await fixture('team_games_1890.html'),
    'team_games.inc.php?t_id=3672': await fixture('team_games_3672.html'),
    'game-384686': await fixture('game_384686_played.html'),
    'game-384690': await fixture('game_384690_upcoming.html'),
  };
  const calls = [];
  const fetchImpl = async (url) => {
    const key = url.pathname.slice(1) + url.search;
    calls.push(key);
    if (key.startsWith('pictures/')) return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    if ([...broken].some((b) => key.includes(b))) return new Response('err', { status: 500 });
    return key in pages ? new Response(pages[key], { status: 200 }) : new Response('nf', { status: 404 });
  };
  return { fetchImpl, calls };
}

test('scraper run: writes once, is stable, keeps a failing team', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sp97-'));
  await fs.mkdir(path.join(dir, 'scraper'));
  await fs.writeFile(path.join(dir, 'scraper/teams.json'), JSON.stringify([
    { key: 'women', label: 'Жени', short: 'Жени', tId: 1890, page: 'team-1890-septemvri-97' },
    { key: 'u19', label: 'Девойки U19', short: 'U19', tId: 3672, page: 'team-3672-septemvri-97' },
    { key: 'u17', label: 'Девойки U17 · WABA', short: 'U17', tId: null, page: null },
  ]));
  const opts = { root: dir, delayMs: 0, now: new Date('2026-10-13T08:00:00Z'), log: () => {} };

  const first = await fakeBfb();
  const r1 = await run({ ...opts, fetchImpl: first.fetchImpl });
  assert.equal(r1.changed, true);
  assert.deepEqual(r1.errors, []);
  assert.equal(r1.games, 22);
  const data = JSON.parse(await fs.readFile(path.join(dir, 'site/data/games.json'), 'utf8'));
  assert.equal(data.teams.length, 3);
  assert.equal(data.teams[2].bfbUrl, null);

  const next = data.games.find((g) => g.id === 'bfb-384690');
  assert.equal(next.start, '2026-10-17T16:00:00+03:00');
  assert.equal(next.venue, 'Триадица - София');
  assert.equal(next.round, 2);
  assert.equal(next.home.isUs, true);
  assert.equal(next.away.isUs, false);
  assert.equal(next.home.logo, 'assets/logos/bfb/clubs-20250725084541.jpg');
  const played = data.games.find((g) => g.id === 'bfb-384686');
  assert.equal(played.away.isUs, true);
  assert.deepEqual(played.score, { home: 70, away: 77 });
  // Games whose page 404s still know which side is ours, by name.
  assert.ok(data.games.filter((g) => g.team === 'u19').every((g) => g.home.isUs || g.away.isUs));
  assert.deepEqual(data.games.map((g) => g.start), [...data.games.map((g) => g.start)].sort((a, b) => Date.parse(a) - Date.parse(b)));

  // Second run: nothing changed, no game pages for known games, logos not re-downloaded.
  const second = await fakeBfb();
  const r2 = await run({ ...opts, fetchImpl: second.fetchImpl });
  assert.equal(r2.changed, false);
  assert.ok(!second.calls.some((c) => c.startsWith('pictures/')));
  assert.ok(!second.calls.includes('game-384690'));

  // A failing team keeps its previous games and reports an error.
  const third = await fakeBfb(new Set(['t_id=3672']));
  const r3 = await run({ ...opts, fetchImpl: third.fetchImpl });
  assert.equal(r3.changed, false);
  assert.equal(r3.errors.length, 1);
  assert.match(r3.errors[0], /^u19: HTTP 500/);
  assert.equal(r3.games, 22);
});
