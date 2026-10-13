// Boot: load the BFB schedule and the Sheet tabs in parallel, render each section as its data arrives.
// URL switches: ?demo uses the sample CSVs and posts, ?check lists rows the site skipped (for the club's admins).
import config from './config.js';
import { el, onVisible, reducedMotion } from './lib/dom.js';
import { parseNeeds, parseGames, parsePackages } from './lib/sheet.js';
import { createGames } from './games.js';
import { initDonate } from './donate.js';
import { initPartners } from './partners.js';
import { initNews } from './news.js';

const params = new URLSearchParams(location.search);
const demo = params.has('demo');
const check = params.has('check');

// no-cache: browsers may otherwise reuse Google's copy for 5 minutes, so a reload after editing the Sheet
// still showed the old row.
async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function tabSource(key, sample) {
  if (demo) return { url: sample, label: 'примерни данни (?demo)' };
  if (config.sheet[key]) return { url: config.sheet[key], label: 'Google таблица' };
  return null;
}

async function loadTab(source, parse) {
  if (!source) return { rows: [], errors: [], source: null };
  try {
    return { ...parse(await fetchText(source.url)), source };
  } catch (e) {
    return { rows: [], errors: [], fatal: `Таблицата не се зареди (${e.name === 'TimeoutError' ? 'няма отговор' : e.message}).`, source };
  }
}

const stamp = new Intl.DateTimeFormat('bg-BG', { timeZone: 'Europe/Sofia', dateStyle: 'long', timeStyle: 'short' });

function renderCheck(tabs, games) {
  const tab = ({ title, result }) => [
    el('h3', { text: title }),
    el('p', { text: result.source ? `Източник: ${result.source.label}. Показани редове: ${result.rows.length}.` : 'Не е свързана (празен адрес в config.js).' }),
    result.fatal ? el('p', { class: 'bad', text: result.fatal }) : null,
    result.errors.length
      ? el('ul', {}, result.errors.map((e) => el('li', { text: `Ред ${e.row}: ${e.message}${e.skipped ? ' Редът е пропуснат.' : ''}` })))
      : result.source && !result.fatal ? el('p', { text: 'Няма проблеми.' }) : null,
  ];
  const s = games.summary();
  const box = el('section', { class: 'check', 'aria-label': 'Проверка на данните' },
    el('div', { class: 'wrap' },
      el('h2', { text: 'Проверка на данните' }),
      el('p', { text: s.updated ? `Програма от БФБ: ${s.bfb} мача (последна промяна: ${stamp.format(new Date(s.updated))}).` : 'Програмата от БФБ (data/games.json) не се зареди.' }),
      tabs.map(tab)));
  document.getElementById('main').prepend(box);
}

function wirePage() {
  // Close the phone menu after choosing a section.
  const menu = document.querySelector('.menu');
  menu?.addEventListener('click', (e) => { if (e.target.closest('a')) menu.open = false; });

  // Phones: show the "support" bar only while the hero, the support section and the footer are out of view.
  const bar = document.getElementById('mobile-cta');
  const watched = ['top', 'podkrepi', 'kontakt'].map((id) => document.getElementById(id)).filter(Boolean);
  if (bar && 'IntersectionObserver' in window) {
    const visible = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      bar.classList.toggle('show', visible.size === 0);
    });
    watched.forEach((node) => io.observe(node));
  }

  // Only cards fade in; headings and text are there from the start. Afterwards the classes go,
  // so the cards' own hover transforms work again.
  if (!reducedMotion()) {
    for (const node of document.querySelectorAll('.tier, .offer, .card')) {
      node.classList.add('reveal');
      onVisible(node, () => {
        node.addEventListener('transitionend', () => node.classList.remove('reveal', 'in'), { once: true });
        node.classList.add('in');
      });
    }
  }
}

wirePage();
initNews({ demo, pageUrl: config.facebookPage });

const games = createGames();
const gamesSource = tabSource('games', 'data/sample-games.csv');
const needsSource = tabSource('needs', 'data/sample-needs.csv');
const packagesSource = tabSource('packages', 'data/sample-packages.csv');

const needsDone = loadTab(needsSource, (text) => parseNeeds(text, { allowedHosts: config.payHosts })).then((result) => {
  initDonate({ config, needs: result.rows, notice: demo ? 'Показани са примерни каузи (?demo).' : '' });
  return result;
});

const packagesDone = loadTab(packagesSource, (text) => parsePackages(text, { allowedHosts: config.payHosts })).then((result) => {
  initPartners({ config, packages: result.rows });
  return result;
});

// no-cache: GitHub Pages lets browsers reuse files for 10 minutes; this asks the server (a cheap 304 if unchanged).
const bfbDone = fetch('data/games.json', { cache: 'no-cache' })
  .then((res) => (res.ok ? res.json() : null))
  .catch(() => null)
  .then((data) => {
    games.setData(data);
    return data;
  });

// Sheet games need the team list from games.json to recognise "U17", "Жени", ….
const sheetGamesDone = Promise.all([bfbDone, gamesSource ? fetchText(gamesSource.url).then((t) => ({ t }), (e) => ({ e })) : null])
  .then(([data, got]) => {
    if (!gamesSource) return { rows: [], errors: [], source: null };
    if (got.e) return { rows: [], errors: [], fatal: `Таблицата не се зареди (${got.e.message}).`, source: gamesSource };
    const result = { ...parseGames(got.t, { teams: data?.teams ?? [], clubNames: config.clubNames, linkDomains: config.gameLinkDomains }), source: gamesSource };
    games.setSheetGames(result.rows);
    return result;
  });

if (check) {
  Promise.all([needsDone, sheetGamesDone, packagesDone, bfbDone]).then(([needs, sheetGames, packages]) => renderCheck([
    { title: 'Таблица „Нужди“', result: needs },
    { title: 'Таблица „Мачове“', result: sheetGames },
    { title: 'Таблица „Пакети“', result: packages },
  ], games));
}
