import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../site/assets/js/lib/csv.js';
import {
  parseNumber, parseDate, parseTime, parseBool, parseScore, sofiaISO,
  checkPayUrl, checkLinkUrl, providerName, formatEuro, dateParts,
} from '../site/assets/js/lib/values.js';
import { parseNeeds, parseGames } from '../site/assets/js/lib/sheet.js';

const HOSTS = ['buy.stripe.com', 'www.paypal.com', 'paypal.me'];
const TEAMS = [
  { key: 'women', label: 'Жени', short: 'Жени' },
  { key: 'u17', label: 'Девойки U17', short: 'U17' },
  { key: 'u19', label: 'Девойки U19', short: 'U19' },
];
const GAME_OPTS = { teams: TEAMS, clubNames: ['Септември 97', 'Septemvri 97'], linkDomains: ['youtube.com', 'waba-league.com'] };

test('csv: quotes, escaped quotes, newlines in quotes, CRLF, BOM', () => {
  const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n,,\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'say "hi"', 'line1\nline2'], ['', '', '']]);
  assert.deepEqual(parseCsv('a,b'), [['a', 'b']]);
});

test('numbers as displayed in a Bulgarian sheet', () => {
  assert.equal(parseNumber('1 234,50 €'), 1234.5);
  assert.equal(parseNumber('1 200 €'), 1200);
  assert.equal(parseNumber('600'), 600);
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('1,234'), 1234);
  assert.equal(parseNumber('1.234.567,8'), 1234567.8);
  assert.equal(parseNumber('2 500'), 2500);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(''), null);
});

test('dates and times', () => {
  assert.equal(parseDate('15.11.2026'), '2026-11-15');
  assert.equal(parseDate('5.1.2027 г.'), '2027-01-05');
  assert.equal(parseDate('2026-10-17'), '2026-10-17');
  assert.equal(parseDate('31.02.2026'), null);
  assert.equal(parseDate('утре'), null);
  assert.equal(parseTime('16:00'), '16:00');
  assert.equal(parseTime('9.30'), '09:30');
  assert.equal(parseTime('18:00:00'), '18:00');
  assert.equal(parseTime('25:00'), null);
});

test('booleans and scores', () => {
  assert.equal(parseBool('TRUE'), true);
  assert.equal(parseBool('ИСТИНА'), true);
  assert.equal(parseBool('да'), true);
  assert.equal(parseBool('FALSE', true), false);
  assert.equal(parseBool('', true), true);
  assert.deepEqual(parseScore('65:58'), { home: 65, away: 58 });
  assert.deepEqual(parseScore('101 - 37'), { home: 101, away: 37 });
  assert.deepEqual(parseScore('65:58:00'), { home: 65, away: 58 });
  assert.equal(parseScore('65'), null);
});

test('Sofia time offsets across DST', () => {
  assert.equal(sofiaISO('2026-10-17', '16:00'), '2026-10-17T16:00:00+03:00');
  assert.equal(sofiaISO('2026-11-06', '14:00'), '2026-11-06T14:00:00+02:00');
  // DST ends 25 Oct 2026 at 04:00 local; DST starts 29 Mar 2026 at 03:00 local.
  assert.equal(sofiaISO('2026-10-25', '02:30'), '2026-10-25T02:30:00+03:00');
  assert.equal(sofiaISO('2026-10-25', '05:00'), '2026-10-25T05:00:00+02:00');
  assert.equal(sofiaISO('2026-03-29', '12:00'), '2026-03-29T12:00:00+03:00');
  assert.equal(new Date(sofiaISO('2026-10-17', '16:00')).toISOString(), '2026-10-17T13:00:00.000Z');
});

test('payment links: exact https hosts only', () => {
  assert.equal(checkPayUrl('https://buy.stripe.com/abc', HOSTS).ok, true);
  assert.equal(checkPayUrl('https://buy.stripe.com/abc', HOSTS).url, 'https://buy.stripe.com/abc?locale=bg');
  assert.equal(checkPayUrl('https://buy.stripe.com/abc?locale=en', HOSTS).url, 'https://buy.stripe.com/abc?locale=en');
  assert.equal(checkPayUrl('https://buy.stripe.com.evil.io/abc', HOSTS).ok, false);
  assert.equal(checkPayUrl('https://evil.io/?u=https://buy.stripe.com', HOSTS).ok, false);
  assert.equal(checkPayUrl('http://buy.stripe.com/abc', HOSTS).ok, false);
  assert.equal(checkPayUrl('javascript:alert(1)', HOSTS).ok, false);
  assert.equal(checkPayUrl('https://user:pw@www.paypal.com/x', HOSTS).ok, false);
  assert.equal(checkPayUrl('', HOSTS).empty, true);
  assert.equal(checkPayUrl('https://www.paypal.com/ncp/payment/PLACEHOLDER', HOSTS).placeholder, true);
  assert.equal(checkLinkUrl('https://www.youtube.com/watch?v=x', ['youtube.com']), 'https://www.youtube.com/watch?v=x');
  assert.equal(checkLinkUrl('https://youtube.com.evil.io/', ['youtube.com']), null);
  assert.equal(providerName('buy.stripe.com'), 'Stripe');
  assert.equal(providerName('www.paypal.com'), 'PayPal');
});

test('formatting', () => {
  // Bulgarian CLDR leaves 4-digit numbers ungrouped.
  assert.equal(formatEuro(1200), '1200 €');
  assert.equal(formatEuro(12000).replace(/\s/g, ' '), '12 000 €');
  assert.equal(formatEuro(12.5), '12,5 €');
  const p = dateParts('2026-10-17');
  assert.equal(p.weekday, 'събота');
  assert.equal(p.month, 'октомври');
});

const NEEDS_CSV = [
  'Покажи,Код,Заглавие,Описание,Отбор,Цел €,Събрано €,Линк за плащане,Срок',
  'TRUE,n014,Бус до Словения,"Транспорт, хотел",U17,600 €,420 €,https://buy.stripe.com/test_1,15.11.2026',
  'TRUE,N015,Топки,,,"1 200,00 €",1 250,,',
  'FALSE,N016,Скрита,,,100,0,,',
  'TRUE,N014,Дубликат,,,100,0,,',
  'TRUE,Н-ЛОШ,Кирилица в кода,,,100,0,,',
  'TRUE,N017,Без цел,,,,0,,',
  'TRUE,N018,Лош линк,,,300,abc,https://evil.io/pay,утре',
  ',,,,,,,,',
].join('\n');

test('needs: valid rows, hidden rows, bad rows reported', () => {
  const { rows, errors, fatal } = parseNeeds(NEEDS_CSV, { allowedHosts: HOSTS });
  assert.equal(fatal, undefined);
  assert.deepEqual(rows.map((r) => r.code), ['N014', 'N015', 'N017', 'N018']);
  assert.equal(rows[0].pay.url, 'https://buy.stripe.com/test_1?locale=bg');
  assert.equal(rows[0].deadline, '2026-11-15');
  assert.equal(rows[0].description, 'Транспорт, хотел');
  assert.equal(rows[1].goal, 1200);
  assert.equal(rows[1].covered, true);
  // A cause without a goal is shown without a progress bar and is never covered.
  assert.equal(rows[2].goal, null);
  assert.equal(rows[2].covered, false);
  assert.equal(rows[3].pay, null);
  assert.equal(rows[3].collected, 0);
  const skipped = errors.filter((e) => e.skipped).map((e) => e.row);
  assert.deepEqual(skipped, [5, 6]);
  assert.equal(errors.filter((e) => !e.skipped && e.row === 8).length, 3);
});

test('needs: Cyrillic look-alikes become Latin; clear reasons for bad codes', () => {
  // "А001" and "XCВ" are typed with Cyrillic А and В.
  const csv = ['Код,Заглавие,Цел €', 'А001,Кирилско А,100', '1,Само цифра,100', 'N-ЛОШ,Кирилица,100', 'XCВ,Смесен,100'].join('\n');
  const { rows, errors } = parseNeeds(csv, { allowedHosts: HOSTS });
  assert.deepEqual(rows.map((r) => r.code), ['A001', 'XCB']);
  assert.match(errors.find((e) => e.row === 3).message, /„1“ трябва да е поне 2 знака\. Таблицата маха нулите/);
  assert.match(errors.find((e) => e.row === 4).message, /само латински букви/);
});

test('needs: unpublished sheet or missing column is fatal', () => {
  assert.match(parseNeeds('<!DOCTYPE html><html>', { allowedHosts: HOSTS }).fatal, /публикувана/);
  assert.match(parseNeeds('Код\nN1', { allowedHosts: HOSTS }).fatal, /Заглавие/);
  const noGoal = parseNeeds('Код,Заглавие,Цел €\nKLUB,Общо за клуба,\nN2,Топки,много', { allowedHosts: HOSTS });
  assert.deepEqual(noGoal.rows.map((r) => [r.code, r.goal]), [['KLUB', null], ['N2', null]]);
  assert.deepEqual(noGoal.errors.map((e) => [e.row, e.skipped]), [[3, false]]);
  assert.match(parseNeeds('', { allowedHosts: HOSTS }).fatal, /празна/);
});

test('games from the sheet', () => {
  const csv = [
    'Покажи,Отбор,Дата,Час,Домакин,Гост,Състезание,Зала / град,Резултат,Линк',
    'TRUE,U17,21.11.2026,11:00,Septemvri 97,Partizan,WABA U17,Arena Samokov (Samokov),,https://waba-league.com/x',
    'TRUE,U17 WABA,22.11.2026,,Budućnost,Септември 97,WABA U17,,56:69,',
    'TRUE,U99,22.11.2026,,A,B,,,,',
    'TRUE,Жени,32.11.2026,,A,B,,,,',
    'TRUE,U17,22.11.2026,,Септември 97,C,,,,',
  ].join('\n');
  const { rows, errors } = parseGames(csv, GAME_OPTS);
  assert.equal(rows.length, 3);
  // Shared links and calendar entries use the ID, so it doesn't depend on the row.
  assert.deepEqual(rows.map((r) => r.id), ['sheet-u17-2026-11-21-1100', 'sheet-u17-2026-11-22', 'sheet-u17-2026-11-22-6']);
  assert.equal(rows[0].team, 'u17');
  assert.equal(rows[0].start, '2026-11-21T11:00:00+02:00');
  assert.equal(rows[0].home.isUs, true);
  assert.equal(rows[0].home.name, 'Септември 97');
  assert.equal(rows[0].url, 'https://waba-league.com/x');
  assert.equal(rows[1].team, 'u17');
  assert.equal(rows[1].time, null);
  assert.equal(rows[1].away.isUs, true);
  assert.deepEqual(rows[1].score, { home: 56, away: 69 });
  assert.deepEqual(errors.map((e) => e.row), [4, 5]);
});
