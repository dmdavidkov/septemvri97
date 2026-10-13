// Turns the published Google Sheet tabs (CSV) into validated rows.
// A missing required column fails the whole tab; a bad row is skipped and reported for ?check.
import { parseCsv } from './csv.js';
import {
  clean, normalizeKey, parseNumber, parseDate, parseTime, parseBool, parseScore,
  sofiaISO, checkPayUrl, checkLinkUrl,
} from './values.js';

const MAX_NEEDS = 30;
const MAX_GAMES = 100;

const NEEDS_COLUMNS = {
  show: 'Покажи',
  code: 'Код',
  title: 'Заглавие',
  description: 'Описание',
  team: 'Отбор',
  goal: 'Цел €',
  collected: 'Събрано €',
  link: 'Линк за плащане',
  deadline: 'Срок',
};
// A cause without a goal ("Цел €" empty or no such column) is shown without a progress bar.
const NEEDS_REQUIRED = ['code', 'title'];
// Cyrillic capitals that look Latin: a Bulgarian keyboard types "А001" for "A001". Codes stay ASCII for bank transfers.
const LOOKALIKE = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X' };

function codeProblem(code) {
  if (/[^A-Z0-9-]/.test(code)) return 'може да има само латински букви, цифри и тире';
  // Google Sheets turns 001 into 1.
  if (code.length < 2) return /^\d+$/.test(code) ? 'трябва да е поне 2 знака. Таблицата маха нулите отпред, затова започнете с буква' : 'трябва да е поне 2 знака';
  return code.length > 16 ? 'може да е най-много 16 знака' : null;
}

const GAMES_COLUMNS = {
  show: 'Покажи',
  team: 'Отбор',
  date: 'Дата',
  time: 'Час',
  home: 'Домакин',
  away: 'Гост',
  competition: 'Състезание',
  venue: 'Зала / град',
  score: 'Резултат',
  link: 'Линк',
};
const GAMES_REQUIRED = ['team', 'date', 'home', 'away'];

const headerKey = (s) => normalizeKey(s).replace(/\s*\/\s*/g, '/');

function truncate(s, max) {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// Shared table handling: header lookup, required columns, row numbering as seen in the Sheet.
function readTable(text, columns, required) {
  const body = String(text ?? '');
  if (/^\s*</.test(body)) {
    return { fatal: 'Таблицата не е публикувана като CSV.' };
  }
  const rows = parseCsv(body);
  const headerIndex = rows.findIndex((r) => r.some((c) => clean(c)));
  if (headerIndex < 0) return { fatal: 'Таблицата е празна.' };

  const index = {};
  rows[headerIndex].forEach((h, i) => {
    const k = headerKey(h);
    for (const [field, name] of Object.entries(columns)) {
      if (k === headerKey(name) && !(field in index)) index[field] = i;
    }
  });
  const missing = required.filter((f) => !(f in index)).map((f) => `„${columns[f]}“`);
  if (missing.length) return { fatal: `Липсва колона ${missing.join(', ')}.` };

  const records = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some((c) => clean(c))) continue;
    const get = (field) => (field in index ? clean(r[index[field]]) : '');
    records.push({ rowNumber: i + 1, get });
  }
  return { records };
}

export function parseNeeds(text, { allowedHosts }) {
  const { fatal, records } = readTable(text, NEEDS_COLUMNS, NEEDS_REQUIRED);
  if (fatal) return { rows: [], errors: [], fatal };

  const rows = [];
  const errors = [];
  const seen = new Set();
  for (const { rowNumber, get } of records) {
    const problem = (message, skipped = true) => errors.push({ row: rowNumber, message, skipped });
    if (!parseBool(get('show'), true)) continue;

    const code = get('code').toUpperCase().replace(/[АВЕКМНОРСТУХ]/g, (c) => LOOKALIKE[c]);
    const bad = codeProblem(code);
    if (bad) { problem(`Кодът „${get('code')}“ ${bad}, например N001.`); continue; }
    if (seen.has(code)) { problem(`Кодът ${code} се повтаря.`); continue; }
    const title = get('title');
    if (!title) { problem('Липсва заглавие.'); continue; }
    let goal = null;
    if (get('goal')) {
      goal = parseNumber(get('goal'));
      if (!(goal > 0)) {
        goal = null;
        problem('Целта не е сума над 0 – каузата се показва без цел.', false);
      }
    }
    if (rows.length >= MAX_NEEDS) { problem(`Показват се най-много ${MAX_NEEDS} нужди.`); continue; }
    seen.add(code);

    let collected = 0;
    if (get('collected')) {
      const n = parseNumber(get('collected'));
      if (n === null) problem('„Събрано €“ не е число — показва се 0.', false);
      else collected = n;
    }

    let pay = null;
    if (get('link')) {
      const check = checkPayUrl(get('link'), allowedHosts);
      if (check.ok) pay = { url: check.url, host: check.host, placeholder: check.placeholder };
      else problem('Линкът за плащане не е разрешен или е невалиден — бутонът е скрит.', false);
    }

    let deadline = null;
    if (get('deadline')) {
      deadline = parseDate(get('deadline'));
      if (!deadline) problem('Срокът не е дата (пример: 15.11.2026).', false);
    }

    rows.push({
      code,
      title: truncate(title, 80),
      description: truncate(get('description'), 500),
      team: truncate(get('team'), 30),
      goal,
      collected,
      covered: goal !== null && collected >= goal,
      pay,
      deadline,
    });
  }
  return { rows, errors };
}

// Matches the Sheet's "Отбор" text to a team: exact key/label/short, else a short code inside the text.
function resolveTeam(text, teams) {
  const t = normalizeKey(text);
  if (!t) return null;
  const exact = teams.find((tm) => [tm.key, tm.label, tm.short].some((v) => normalizeKey(v) === t));
  if (exact) return exact;
  return teams.find((tm) => /^u\d+$/i.test(tm.short) && new RegExp(`(^|[^\\p{L}\\d])${tm.short}($|[^\\p{L}\\d])`, 'iu').test(t)) || null;
}

export function parseGames(text, { teams, clubNames, linkDomains }) {
  const { fatal, records } = readTable(text, GAMES_COLUMNS, GAMES_REQUIRED);
  if (fatal) return { rows: [], errors: [], fatal };

  const ours = clubNames.map(normalizeKey);
  const isUs = (name) => ours.includes(normalizeKey(name));
  // However the club is typed, the site writes it as "Септември 97".
  const side = (name) => (isUs(name) ? { name: clubNames[0], logo: null, isUs: true } : { name: truncate(name, 40), logo: null, isUs: false });
  const rows = [];
  const errors = [];
  const ids = new Set();
  for (const { rowNumber, get } of records) {
    const problem = (message, skipped = true) => errors.push({ row: rowNumber, message, skipped });
    if (!parseBool(get('show'), true)) continue;

    const team = resolveTeam(get('team'), teams);
    if (!team) { problem(`Непознат отбор „${get('team')}“.`); continue; }
    const date = parseDate(get('date'));
    if (!date) { problem('Датата не е валидна (пример: 25.10.2026).'); continue; }
    const home = get('home');
    const away = get('away');
    if (!home || !away) { problem('Липсва домакин или гост.'); continue; }
    if (rows.length >= MAX_GAMES) { problem(`Показват се най-много ${MAX_GAMES} мача.`); continue; }

    let time = null;
    if (get('time')) {
      time = parseTime(get('time'));
      if (!time) problem('Часът не е валиден (пример: 16:00) — показва се „час предстои“.', false);
    }
    let score = null;
    if (get('score')) {
      score = parseScore(get('score'));
      if (!score) problem('Резултатът трябва да е във вида 65:58.', false);
    }
    let url = null;
    if (get('link')) {
      url = checkLinkUrl(get('link'), linkDomains);
      if (!url) problem('Линкът не е разрешен — пропуснат.', false);
    }

    // Team, date and time rather than the row number, so shared links and calendar entries survive new rows.
    let id = `sheet-${team.key}-${date}${time ? `-${time.replace(':', '')}` : ''}`;
    if (ids.has(id)) id += `-${rowNumber}`;
    ids.add(id);
    rows.push({
      id,
      source: 'sheet',
      team: team.key,
      competition: truncate(get('competition'), 60),
      phase: '',
      round: null,
      date,
      time,
      start: sofiaISO(date, time || '00:00'),
      venue: truncate(get('venue'), 80),
      home: side(home),
      away: side(away),
      score,
      liveUrl: null,
      url,
    });
  }
  return { rows, errors };
}
