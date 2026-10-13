import test from 'node:test';
import assert from 'node:assert/strict';
import { gameStatus, buildIcs, sheetLogos } from '../site/assets/js/games.js';
import { shareText } from '../site/assets/js/share.js';

const game = {
  id: 'bfb-384690', source: 'bfb', team: 'women', competition: 'А група Жени', phase: 'Редовен сезон', round: 2,
  date: '2026-10-17', time: '16:00', start: '2026-10-17T16:00:00+03:00', venue: 'Триадица, София',
  home: { name: 'Септември 97', isUs: true }, away: { name: 'Рилски спортист', isUs: false },
  score: null, url: 'https://comps.basketball.bg/game-384690',
};
const at = (iso) => Date.parse(iso);

test('status: upcoming → live for 150 min → waiting for the score → played', () => {
  assert.equal(gameStatus(game, at('2026-10-17T15:59:00+03:00')), 'upcoming');
  assert.equal(gameStatus(game, at('2026-10-17T16:00:00+03:00')), 'live');
  assert.equal(gameStatus(game, at('2026-10-17T18:29:00+03:00')), 'live');
  assert.equal(gameStatus(game, at('2026-10-17T18:30:00+03:00')), 'pending');
  assert.equal(gameStatus({ ...game, score: { home: 70, away: 61 } }, at('2026-10-17T17:00:00+03:00')), 'played');
});

test('status: a game without a time stays upcoming for its whole day', () => {
  const noTime = { ...game, time: null, start: '2026-10-17T00:00:00+03:00' };
  assert.equal(gameStatus(noTime, at('2026-10-17T22:00:00+03:00')), 'upcoming');
  assert.equal(gameStatus(noTime, at('2026-10-18T00:01:00+03:00')), 'pending');
});

test('ics: UTC times, escaped text, folded lines', () => {
  const ics = buildIcs(game, { short: 'Жени' }, at('2026-10-13T08:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nDTSTART:20261017T130000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20261017T150000Z\r\n/);
  assert.match(ics, /\r\nLOCATION:Триадица\\, София\r\n/);
  assert.match(ics, /\r\nUID:bfb-384690@septemvri97\.eu\r\n/);
  const enc = new TextEncoder();
  for (const line of ics.split('\r\n')) assert.ok(enc.encode(line).length <= 75, line);
  // Unfolding restores the summary.
  assert.match(ics.replace(/\r\n /g, ''), /SUMMARY:Септември 97 – Рилски спортист \(Жени\)/);

  const allDay = buildIcs({ ...game, time: null }, null, at('2026-10-13T08:00:00Z'));
  assert.match(allDay, /\r\nDTSTART;VALUE=DATE:20261017\r\n/);
  assert.doesNotMatch(allDay, /DTEND/);
});

test('share text: result, live game, upcoming game', () => {
  const side = (name, isUs = false) => ({ name, isUs });
  const g = { date: '2026-10-17', time: '16:00', team: 'Жени', home: side('Септември 97', true), away: side('Рилски спортист'), venue: 'Триадица, София', tv: null };
  assert.equal(shareText({ ...g, status: 'upcoming' }), 'Жени: Септември 97 – Рилски спортист, събота, 17 октомври, 16:00, Триадица, София.');
  assert.equal(shareText({ ...g, status: 'upcoming', time: null, venue: null }), 'Жени: Септември 97 – Рилски спортист, събота, 17 октомври.');
  assert.equal(shareText({ ...g, status: 'live', tv: 'https://tv.basketball.bg/index.php?i_id=1' }), 'На живо: Септември 97 – Рилски спортист (Жени). Гледайте в BFB TV.');
  assert.equal(shareText({ ...g, status: 'played', score: { home: 77, away: 70 }, result: 'win' }), 'Жени: Септември 97 77:70 Рилски спортист. Победа!');
  assert.equal(shareText({ ...g, status: 'played', score: { home: 60, away: 70 }, result: 'loss' }), 'Жени: Септември 97 60:70 Рилски спортист.');
});

test('sheet games borrow BFB logos by club name, only when one club fits', () => {
  const side = (name, logo = null, isUs = false) => ({ name, logo, isUs });
  const bfb = [
    { home: side('Славия 1913', 'assets/logos/bfb/a.jpg'), away: side('Септември 97', 'assets/logos/bfb/us.jpg', true) },
    { home: side('Славия-1921', 'assets/logos/bfb/b.jpg'), away: side('Рилски спортист', 'assets/logos/bfb/c.png') },
  ];
  const row = (name) => ({ id: name, home: side('Септември 97', null, true), away: side(name) });
  const logo = (name) => sheetLogos([row(name)], bfb)[0].away.logo;
  assert.equal(logo('Славия 1913'), 'assets/logos/bfb/a.jpg');
  assert.equal(logo('Славия 1921'), 'assets/logos/bfb/b.jpg');
  assert.equal(logo('БК Рилски спортист Самоков'), 'assets/logos/bfb/c.png');
  assert.equal(logo('Славия'), null);
  assert.equal(logo('ŽKK Partizan'), null);
  assert.equal(sheetLogos([row('Славия 1913')], bfb)[0].home.logo, null);
});
