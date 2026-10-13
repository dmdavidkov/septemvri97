import test from 'node:test';
import assert from 'node:assert/strict';
import { gameStatus, buildIcs } from '../site/assets/js/games.js';

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
