// Schedule, results and the next-match ticket: BFB data (games.json) plus games typed into the Sheet (e.g. WABA).
// ?game=<id> (a shared match) opens the list at that game.
import { el, cls, reducedMotion } from './lib/dom.js';
import { dateParts } from './lib/values.js';

const LIVE_MINUTES = 150;
const PAGE_SIZE = 8;
const DEFAULT_BFB = 'https://comps.basketball.bg/team-1890-septemvri-97';
const LOGO_PATH = /^assets\/logos\/bfb\/[\w-]+\.(jpe?g|png|gif|webp)$/i;

// played → has a score; live → started less than 150 min ago; pending → over, score not in yet.
export function gameStatus(game, now = Date.now()) {
  if (game.score) return 'played';
  const start = Date.parse(game.start);
  if (!game.time) return now < start + 86_400_000 ? 'upcoming' : 'pending';
  if (now < start) return 'upcoming';
  if (now < start + LIVE_MINUTES * 60_000) return 'live';
  return 'pending';
}

// On the page the team tag already names the age group, so "Момичета 14г." is left out, and "ЗАПАД" reads as "Запад".
const AGE_ONLY = /^(Момичета|Девойки|Жени)\s+\d+\s*г\.?$/i;
const calm = (s) => s.replace(/(?<!\p{L})([А-Я])([А-Я]{3,})(?!\p{L})/gu, (_, first, rest) => first + rest.toLowerCase());
const competitionText = (g, { full = false } = {}) => [
  full || !AGE_ONLY.test(g.competition ?? '') ? g.competition : '',
  full || !g.phase ? g.phase : calm(g.phase),
  g.round ? `Кръг ${g.round}` : '',
].filter(Boolean).join(' · ');
// BFB writes "Hall - City"; the last dash becomes a comma.
const venueText = (v) => v.replace(/ - (?!.* - )/, ', ');

function initials(name) {
  const words = name.replace(/[„“”"'«»()]/g, '').split(/[\s-]+/).filter(Boolean);
  const letters = words.length > 1 && /^\p{L}/u.test(words[1]) ? words[0][0] + words[1][0] : words[0]?.slice(0, 2) ?? '?';
  return letters.toUpperCase();
}

// Sheet games borrow the logo BFB uses for the same club. "Рилски спортист Самоков" finds "Рилски спортист",
// but "Славия" finds nothing, since BFB has both "Славия 1913" and "Славия 1921".
const nameKey = (s) => s.toLowerCase().replace(/[„“”"'«»().,]/g, '').replace(/[\s-]+/g, ' ').replace(/^(бк|bc|bk) /, '').trim();
export function sheetLogos(rows, bfbGames) {
  const logos = new Map();
  for (const g of bfbGames) {
    for (const s of [g.home, g.away]) if (!s.isUs && s.logo && !logos.has(nameKey(s.name))) logos.set(nameKey(s.name), s.logo);
  }
  const find = (name) => {
    const key = nameKey(name);
    if (logos.has(key)) return logos.get(key);
    const fits = new Set([...logos].filter(([k]) => k.startsWith(`${key} `) || key.startsWith(`${k} `)).map(([, logo]) => logo));
    return fits.size === 1 ? [...fits][0] : null;
  };
  const side = (s) => (s.isUs || s.logo ? s : { ...s, logo: find(s.name) });
  return rows.map((g) => ({ ...g, home: side(g.home), away: side(g.away) }));
}

const logoSrc = (side) => (side.isUs ? 'assets/img/emblem.svg' : LOGO_PATH.test(side.logo ?? '') ? side.logo : null);

function logo(side, size) {
  const src = logoSrc(side);
  if (!src) return el('span', { class: 'logo logo-initials', 'aria-hidden': 'true', text: initials(side.name) });
  return el('img', { class: 'logo', src, alt: '', width: size, height: size, loading: 'lazy', decoding: 'async' });
}

function ourResult(g) {
  if (!g.score) return null;
  const pts = [g.score.home, g.score.away];
  const us = g.home.isUs ? 0 : g.away.isUs ? 1 : -1;
  if (us < 0 || pts[0] === pts[1]) return null;
  return pts[us] > pts[1 - us] ? 'win' : 'loss';
}

function statusBadge(g, status) {
  if (status === 'played') {
    const result = ourResult(g);
    if (!result) return null;
    return el('span', { class: cls('result', result), text: result === 'win' ? 'Победа' : 'Загуба' });
  }
  if (status === 'live') return el('span', { class: 'pill live', text: 'На живо' });
  if (status === 'pending') return el('span', { class: 'pill pending', title: 'Очаква се резултат' }, 'Очаква се', el('span', { class: 'pill-more', text: ' резултат' }));
  return null;
}

function gameLink(g, status) {
  if (status === 'live' && g.liveUrl) return el('a', { class: 'link-arrow', href: g.liveUrl, target: '_blank', rel: 'noopener', text: 'Гледай' });
  if (!g.url) return null;
  return el('a', { class: 'link-arrow game-link', href: g.url, target: '_blank', rel: 'noopener', title: g.source === 'bfb' ? 'Мачът в сайта на БФБ' : null, text: g.source === 'bfb' ? 'БФБ' : 'Линк' });
}

// BFB adds the BFB TV link close to the game; the recording stays there afterwards.
function tvLink(g, status, labels = { upcoming: 'Излъчване в BFB TV', played: 'Запис в BFB TV', pending: 'Запис в BFB TV' }) {
  if (!g.liveUrl || !labels[status]) return null;
  return el('a', { class: 'tv-link', href: g.liveUrl, target: '_blank', rel: 'noopener', text: labels[status] });
}

// What share.js needs to draw and describe a game (scripts/share-cards.mjs uses it too). Only BFB games get a
// link preview page (m/<id>.html), since Sheet games are read in the browser.
export function shareModel(g, team, now = Date.now()) {
  const side = (s) => ({ name: s.name, isUs: s.isUs, logo: logoSrc(s), initials: initials(s.name) });
  return {
    id: g.id, date: g.date, time: g.time, status: gameStatus(g, now), team: team?.label ?? g.team, tag: team?.short ?? g.team,
    competition: competitionText(g), venue: g.venue ? venueText(g.venue) : null,
    home: side(g.home), away: side(g.away), score: g.score, result: ourResult(g), tv: g.liveUrl,
    card: g.source === 'bfb',
  };
}

const share = async (g, team) => (await import('./share.js')).openShare(shareModel(g, team, Date.now()));

function shareButton(g, team) {
  return el('button', {
    type: 'button', class: 'share-btn',
    'aria-label': `Сподели мача ${g.home.name} – ${g.away.name}`,
    onclick: () => share(g, team),
  }, 'Сподели');
}

function gameRow(g, team, now) {
  const status = gameStatus(g, now);
  const p = dateParts(g.date);
  const pts = g.score ? [g.score.home, g.score.away] : null;
  const side = (s, i) => el('div', { class: cls('side', s.isUs && 'us', pts && pts[i] > pts[1 - i] && 'won') },
    logo(s, 28),
    el('span', { class: 'name', title: s.name, text: s.name }),
    el('span', { class: 'pts', text: pts ? pts[i] : '' }));

  return el('li', { class: 'game', 'data-game': g.id },
    el('div', { class: 'game-date' },
      el('span', { class: 'd', text: p.day }),
      el('span', { class: 'm', text: p.monthShort }),
      el('span', { class: 'w', text: p.weekdayShort }),
      g.time && !pts ? el('span', { class: 't', text: g.time }) : null),
    el('div', { class: 'game-teams' }, side(g.home, 0), side(g.away, 1)),
    el('div', { class: 'game-meta' },
      el('span', { class: 'tag', text: team?.short ?? g.team }),
      competitionText(g) ? el('span', { text: competitionText(g) }) : null,
      g.venue ? el('span', { text: venueText(g.venue) }) : null,
      tvLink(g, status)),
    el('div', { class: 'game-status' },
      statusBadge(g, status),
      el('div', { class: 'game-actions' }, gameLink(g, status), shareButton(g, team))));
}

// ---- Calendar (.ics) for one game ----

const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsUtc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// RFC 5545: lines longer than 75 octets continue on the next line after a space.
function icsFold(line) {
  const enc = new TextEncoder();
  let out = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) {
      out += '\r\n ';
      bytes = 1;
    }
    out += ch;
    bytes += n;
  }
  return out;
}

export function buildIcs(g, team, now = Date.now()) {
  const start = Date.parse(g.start);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BK Septemvri 97//septemvri97.eu//BG', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${g.id}@septemvri97.eu`,
    `DTSTAMP:${icsUtc(now)}`,
    ...(g.time
      ? [`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(start + 2 * 3_600_000)}`]
      : [`DTSTART;VALUE=DATE:${g.date.replace(/-/g, '')}`]),
    `SUMMARY:${icsEscape(`${g.home.name} – ${g.away.name}${team ? ` (${team.short})` : ''}`)}`,
    g.venue ? `LOCATION:${icsEscape(g.venue)}` : null,
    `DESCRIPTION:${icsEscape([competitionText(g, { full: true }), g.url].filter(Boolean).join('\n'))}`,
    g.url ? `URL:${g.url}` : null,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

function downloadIcs(g, team) {
  const url = URL.createObjectURL(new Blob([buildIcs(g, team)], { type: 'text/calendar;charset=utf-8' }));
  const a = el('a', { href: url, download: `septemvri97-${g.date}.ics` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---- Next-match ticket ----

// A live game first (women's team preferred), then the women's next game, then any team's.
function pickNext(games, now) {
  const live = games.filter((g) => gameStatus(g, now) === 'live');
  const upcoming = games.filter((g) => gameStatus(g, now) === 'upcoming');
  return live.find((g) => g.team === 'women') ?? live[0] ?? upcoming.find((g) => g.team === 'women') ?? upcoming[0] ?? null;
}

const plural = (n, one, many) => (n === 1 ? one : many);

function countdownParts(ms) {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  return [[days, plural(days, 'ден', 'дни')], [hours, plural(hours, 'час', 'часа')], [mins, 'мин']];
}

function ticketTeam(side) {
  return el('div', { class: cls('ticket-team', side.isUs && 'us') }, logo(side, 64), el('span', { class: 'name', text: side.name }));
}

// Returns a function that refreshes the countdown in place (keeps focus on the ticket's buttons).
function renderTicket(box, g, team, now) {
  if (!g) {
    box.replaceChildren(
      el('p', { class: 'ticket-note', text: 'В момента няма насрочени мачове.' }),
      el('p', {}, el('a', { class: 'link-arrow', href: team?.bfbUrl ?? DEFAULT_BFB, target: '_blank', rel: 'noopener', text: 'Програма в БФБ' })));
    return null;
  }
  const p = dateParts(g.date);
  const status = gameStatus(g, now);
  let timeBox = null;
  let tick = null;
  if (status === 'live') {
    timeBox = el('p', { class: 'ticket-live' },
      el('span', { class: 'pill live', text: 'На живо' }),
      g.liveUrl ? el('a', { class: 'link-arrow', href: g.liveUrl, target: '_blank', rel: 'noopener', text: 'Гледай в BFB TV' }) : null);
  } else if (g.time) {
    const cells = [0, 1, 2].map(() => [el('b'), el('span')]);
    timeBox = el('div', { class: 'countdown', 'aria-hidden': 'true' }, cells.map((c) => el('div', {}, c)));
    tick = (t) => countdownParts(Date.parse(g.start) - t).forEach(([n, label], i) => {
      cells[i][0].textContent = String(n).padStart(2, '0');
      cells[i][1].textContent = label;
    });
    tick(now);
  }

  box.replaceChildren(
    el('div', { class: 'ticket-meta' },
      el('span', { class: 'tag', text: team?.label ?? g.team }),
      competitionText(g) ? el('span', { text: competitionText(g) }) : null),
    el('div', { class: 'ticket-teams' }, ticketTeam(g.home), el('span', { class: 'ticket-vs', text: 'срещу' }), ticketTeam(g.away)),
    el('dl', { class: 'ticket-when' },
      el('div', {}, el('dt', { text: p.weekday }), el('dd', { text: `${p.day} ${p.month}` })),
      el('div', { class: 'time' }, el('dt', { text: 'Начало' }), el('dd', { class: g.time ? null : 'soon', text: g.time ?? 'предстои' })),
      g.venue ? el('div', { class: 'wide venue' }, el('dt', { text: 'Зала' }), el('dd', { text: venueText(g.venue) })) : null),
    timeBox,
    el('div', { class: 'ticket-actions' },
      el('button', { type: 'button', class: 'btn btn-primary btn-small', onclick: () => downloadIcs(g, team) }, 'В календара'),
      el('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => share(g, team) }, 'Сподели'),
      tvLink(g, status, { upcoming: 'Излъчване в BFB TV' }),
      g.url ? el('a', { class: 'link-arrow', href: g.url, target: '_blank', rel: 'noopener', text: g.source === 'bfb' ? 'Детайли в БФБ' : 'Детайли' }) : null));
  return tick;
}

// ---- Section controller ----

const updatedFormat = new Intl.DateTimeFormat('bg-BG', { timeZone: 'Europe/Sofia', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function createGames() {
  const $ = (id) => document.getElementById(id);
  const ui = {
    controls: $('games-controls'), chips: $('team-chips'), list: $('games-list'), empty: $('games-empty'),
    more: $('games-more'), bfb: $('games-bfb'), updated: $('games-updated'), ticket: $('next-match'), season: $('games-season'),
    views: [...document.querySelectorAll('.seg [data-view]')],
  };
  const state = { data: null, failed: false, sheet: [], team: 'all', view: null, limit: PAGE_SIZE, focus: new URLSearchParams(location.search).get('game') };
  let teams = new Map();
  let games = [];
  let lastStatuses = '';
  let tick = null;

  function merge() {
    teams = new Map((state.data?.teams ?? []).map((t) => [t.key, t]));
    const bfb = state.data?.games ?? [];
    games = [...bfb, ...sheetLogos(state.sheet, bfb)]
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
    // A shared game: its team and tab, once it is in the data.
    const shared = state.focus && games.find((g) => g.id === state.focus);
    if (shared) {
      state.team = shared.team;
      state.view = ['upcoming', 'live'].includes(gameStatus(shared)) ? 'upcoming' : 'results';
    }
    renderChips();
    render();
    if (shared) {
      const row = [...ui.list.children].find((li) => li.dataset.game === shared.id);
      row?.classList.add('is-target');
      row?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      state.focus = null;
    }
  }

  // Built once per data load; render() only flips aria-pressed, so keyboard focus stays on the chip.
  function renderChips() {
    const used = new Set(games.map((g) => g.team));
    const options = [['all', 'Всички'], ...[...teams.values()].filter((t) => used.has(t.key)).map((t) => [t.key, t.short])];
    if (!options.some(([key]) => key === state.team)) state.team = 'all';
    ui.chips.replaceChildren(...options.map(([key, label]) => el('button', {
      type: 'button',
      'aria-pressed': String(key === state.team),
      title: key === 'all' ? 'Всички отбори' : teams.get(key)?.label,
      'data-team': key,
      onclick: () => { state.team = key; state.limit = PAGE_SIZE; render(); },
    }, label)));
  }

  function render() {
    const now = Date.now();
    const mine = games.filter((g) => state.team === 'all' || g.team === state.team);
    const upcoming = mine.filter((g) => ['upcoming', 'live'].includes(gameStatus(g, now)));
    const results = mine.filter((g) => ['played', 'pending'].includes(gameStatus(g, now))).reverse();
    state.view ??= upcoming.length || !results.length ? 'upcoming' : 'results';
    const shown = state.view === 'upcoming' ? upcoming : results;
    const focusAt = state.focus ? shown.findIndex((g) => g.id === state.focus) : -1;
    if (focusAt >= state.limit) state.limit = Math.ceil((focusAt + 1) / PAGE_SIZE) * PAGE_SIZE;

    ui.controls.hidden = !games.length;
    for (const b of ui.chips.children) b.setAttribute('aria-pressed', String(b.dataset.team === state.team));
    for (const b of ui.views) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
    ui.list.replaceChildren(...shown.slice(0, state.limit).map((g) => gameRow(g, teams.get(g.team), now)));
    ui.more.hidden = shown.length <= state.limit;

    // BFB's current season ("2026/2027"); earlier seasons aren't shown, so the section names it.
    const season = state.data?.season;
    if (season) ui.season.textContent = `Сезон ${season}`;
    ui.empty.hidden = shown.length > 0;
    if (state.failed && !games.length) ui.empty.textContent = 'Програмата не успя да се зареди. Вижте я в сайта на БФБ.';
    else if (state.view === 'upcoming') ui.empty.textContent = 'Няма предстоящи мачове в програмата.';
    else ui.empty.textContent = season ? `Още няма изиграни мачове през сезон ${season}.` : 'Още няма изиграни мачове този сезон.';

    const team = teams.get(state.team);
    ui.bfb.href = team?.bfbUrl ?? DEFAULT_BFB;
    ui.bfb.textContent = team?.bfbUrl ? `Програма на ${team.short} в БФБ` : 'Пълна програма в БФБ';
    ui.updated.textContent = state.data?.updated ? `Последна промяна: ${updatedFormat.format(new Date(state.data.updated))}` : '';

    const next = pickNext(games, now);
    if (games.length || state.failed || state.data) tick = renderTicket(ui.ticket, next, teams.get(next?.team ?? 'women'), now);
    lastStatuses = games.map((g) => gameStatus(g, now)).join();
  }

  for (const b of ui.views) {
    b.addEventListener('click', () => { state.view = b.dataset.view; state.limit = PAGE_SIZE; render(); });
  }
  ui.more.addEventListener('click', () => { state.limit += PAGE_SIZE; render(); });

  // Keep the countdown and live/finished states current while the page stays open.
  setInterval(() => {
    if (!games.length) return;
    const now = Date.now();
    if (games.map((g) => gameStatus(g, now)).join() !== lastStatuses) render();
    else tick?.(now);
  }, 30_000);

  return {
    setData(data) {
      state.data = data;
      state.failed = !data;
      merge();
    },
    setSheetGames(rows) {
      state.sheet = rows;
      merge();
    },
    summary: () => ({ updated: state.data?.updated ?? null, bfb: state.data?.games.length ?? 0, sheet: state.sheet.length }),
  };
}
