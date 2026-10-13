// Link previews for shared BFB matches: site/m/<id>.html with Open Graph tags, and site/m/<id>.jpg, a
// 1200 × 630 picture that share.js draws in headless Chrome (the GitHub runner's, or Chrome/Edge here).
// Made when the site is published and never committed: npm run cards
// The pictures are best effort. Without Chrome the pages use the site's own preview picture.
import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { shareModel } from '../site/assets/js/games.js';
import { cardText, shareVersion, CARD } from '../site/assets/js/share.js';

const SITE = 'https://www.septemvri97.eu/';
const ID = /^bfb-\d+$/;
const TIMEOUT_MS = 120_000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The models share.js draws. The picture stays in Facebook's cache for weeks, so it shows only what lasts:
// the result once there is one, otherwise the upcoming game.
export function cardModels(data, now = Date.now()) {
  const teams = new Map((data.teams ?? []).map((t) => [t.key, t]));
  return (data.games ?? [])
    .filter((g) => g.source === 'bfb' && ID.test(g.id))
    .map((g) => ({ ...shareModel(g, teams.get(g.team), now), status: g.score ? 'played' : 'upcoming' }));
}

export function cardPage(g, { picture }) {
  const { title, description } = cardText(g);
  const v = shareVersion(g);
  const image = picture
    ? { src: `${SITE}m/${g.id}.jpg?v=${v}`, alt: title }
    : { src: `${SITE}assets/img/og-image.jpg`, alt: 'Логото на БК Септември 97 на червен фон' };
  const target = `../?game=${g.id}#machove`;
  return `<!doctype html>
<html lang="bg">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'">
  <meta name="robots" content="noindex">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="bg_BG">
  <meta property="og:site_name" content="БК Септември 97">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(image.src)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(image.alt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#0B0A0C">
  <link rel="icon" href="../assets/img/emblem.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../assets/css/style.css">
  <script type="module" src="../assets/js/go.js"></script>
</head>
<body>
  <main class="page paper match-page">
    <div class="wrap">
      <h1>${esc(title)}</h1>
      <p>${esc(description)}</p>
      ${picture ? `<p><img src="${esc(g.id)}.jpg?v=${v}" width="1200" height="630" alt=""></p>\n      ` : ''}<p><a class="btn btn-primary" href="${esc(target)}">Към мача на сайта</a></p>
    </div>
  </main>
</body>
</html>
`;
}

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const env = process.env;
  const list = process.platform === 'win32'
    ? [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean).flatMap((dir) => [
      path.join(dir, 'Google/Chrome/Application/chrome.exe'), path.join(dir, 'Microsoft/Edge/Application/msedge.exe')])
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return list.find((p) => existsSync(p));
}

// The page Chrome opens: it draws every card with share.js and sends each one back.
const RENDER_HTML = `<!doctype html><html lang="bg"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/style.css"><script type="module" src="/__cards.js"></script></head><body></body></html>`;
const RENDER_JS = `import { drawCard, CARD } from '/assets/js/share.js';
const models = await (await fetch('/__models.json')).json();
for (const g of models) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = CARD.width;
    canvas.height = CARD.height;
    await drawCard(canvas, g);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    await fetch('/__card/' + g.id, { method: 'POST', body: blob });
  } catch (e) {
    await fetch('/__log', { method: 'POST', body: g.id + ': ' + e });
  }
}
await fetch('/__done', { method: 'POST' });
`;

async function drawCards(root, out, models) {
  const chrome = findChrome();
  if (!chrome) {
    console.warn('No Chrome or Edge found (set CHROME_BIN), so the pages use the site picture.');
    return new Set();
  }
  const ids = new Set(models.map((g) => g.id));
  const drawn = new Set();
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const body = async () => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      return Buffer.concat(chunks);
    };
    try {
      if (req.method === 'POST') {
        const card = url.pathname.match(/^\/__card\/([\w-]+)$/)?.[1];
        if (card && ids.has(card)) {
          const jpg = await body();
          if (jpg.length > 1000 && jpg.length < 2_000_000) {
            await fs.writeFile(path.join(out, `${card}.jpg`), jpg);
            drawn.add(card);
          }
        } else if (url.pathname === '/__log') console.warn(`Card failed: ${await body()}`);
        else if (url.pathname === '/__done') finish();
        return res.writeHead(204).end();
      }
      const own = { '/__cards.html': [RENDER_HTML, '.html'], '/__cards.js': [RENDER_JS, '.js'], '/__models.json': [JSON.stringify(models), '.json'] }[url.pathname];
      if (own) return res.writeHead(200, { 'Content-Type': TYPES[own[1]] }).end(own[0]);
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'septemvri97-cards-'));
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--mute-audio', `--user-data-dir=${profile}`];
  // The Ubuntu runner doesn't allow Chrome's sandbox; it only opens this script's own page.
  if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
  const browser = spawn(chrome, [...args, `http://127.0.0.1:${server.address().port}/__cards.html`], { stdio: 'ignore' });
  browser.on('error', (e) => {
    console.warn(`Chrome did not start: ${e.message}`);
    finish();
  });
  browser.on('exit', () => finish());
  const timer = setTimeout(() => {
    console.warn(`Stopped after ${TIMEOUT_MS / 1000} s.`);
    finish();
  }, TIMEOUT_MS);

  await done;
  clearTimeout(timer);
  browser.kill();
  server.close();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  return drawn;
}

export async function run(root) {
  const site = path.join(root, 'site');
  const out = path.join(site, 'm');
  const data = JSON.parse(await fs.readFile(path.join(site, 'data/games.json'), 'utf8'));
  const models = cardModels(data);
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
  let drawn = new Set();
  try {
    drawn = await drawCards(site, out, models);
  } catch (e) {
    console.warn(`The pictures failed: ${e.message}`);
  }
  // The pages are written even without pictures, so shared links always open.
  for (const g of models) {
    await fs.writeFile(path.join(out, `${g.id}.html`), cardPage(g, { picture: drawn.has(g.id) }));
  }
  console.log(`Match pages: ${models.length}, with their own picture: ${drawn.size}.`);
  return { pages: models.length, pictures: drawn.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
}
