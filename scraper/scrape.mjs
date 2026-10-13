// Fetches the club's BFB schedules and writes site/data/games.json.
// Gentle on BFB: one request per team, game pages only when needed, 1 s between requests.
// A team that fails keeps its previous games; the run then exits with code 1 so GitHub emails.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BFB, parseTeamGames, parseGamePage } from './parse.mjs';
import { sofiaISO } from '../site/assets/js/lib/values.js';

const UA = 'Mozilla/5.0 (compatible; Septemvri97Site/1.0; +https://www.septemvri97.eu)';
const CLUB_NAMES = ['Септември 97'];
const MAX_PAGE_FETCHES = 25;
const VENUE_RETRY_DAYS = 7;
const MAX_LOGO_BYTES = 500_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function run({ root, fetchImpl = fetch, delayMs = 1000, now = new Date(), log = console.log }) {
  const teams = JSON.parse(await fs.readFile(path.join(root, 'scraper/teams.json'), 'utf8'));
  const outFile = path.join(root, 'site/data/games.json');
  const logoDir = path.join(root, 'site/assets/logos/bfb');
  const prev = await readJson(outFile, { teams: [], games: [] });
  const prevById = new Map(prev.games.map((g) => [g.id, g]));

  let requests = 0;
  async function get(url, binary = false) {
    if (requests++) await sleep(delayMs);
    const res = await fetchImpl(new URL(url, BFB), {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
  }

  const logos = new Map();
  async function localLogo(url) {
    if (!url) return null;
    const parts = new URL(url).pathname.split('/');
    const name = `${parts.at(-2)}-${parts.at(-1)}`;
    if (!/^[\w-]+\.(jpe?g|png|gif|webp)$/i.test(name)) return null;
    if (logos.has(name)) return logos.get(name);
    const rel = `assets/logos/bfb/${name}`;
    const file = path.join(logoDir, name);
    try {
      await fs.access(file);
    } catch {
      try {
        const buf = await get(url, true);
        if (buf.length > MAX_LOGO_BYTES) throw new Error('logo too large');
        await fs.mkdir(logoDir, { recursive: true });
        await fs.writeFile(file, buf);
      } catch (e) {
        log(`logo ${name}: ${e.message}`);
        logos.set(name, null);
        return null;
      }
    }
    logos.set(name, rel);
    return rel;
  }

  const isOurs = (name) => CLUB_NAMES.includes(name);
  const errors = [];
  const games = [];
  let pageFetches = 0;

  for (const team of teams) {
    if (!team.tId) continue;
    const previous = prev.games.filter((g) => g.source === 'bfb' && g.team === team.key);
    let parsed;
    try {
      parsed = parseTeamGames(await get(`team_games.inc.php?t_id=${team.tId}`));
    } catch (e) {
      errors.push(`${team.key}: ${e.message}`);
      games.push(...previous);
      continue;
    }
    if (!parsed.games.length) {
      log(`${team.key}: no games in season ${parsed.season.name ?? '?'} — keeping previous data`);
      games.push(...previous);
      continue;
    }

    for (const g of parsed.games) {
      if (!g.date) {
        log(`${team.key}: game ${g.id} has no date — skipped`);
        continue;
      }
      const id = `bfb-${g.id}`;
      const start = sofiaISO(g.date, g.time || '00:00');
      const old = prevById.get(id);
      const sameSlot = old && old.date === g.date && old.time === g.time;
      const daysAway = (Date.parse(start) - now.getTime()) / 86_400_000;
      // Re-read the game page when details were never captured, or the venue is still missing close to the game.
      const retryVenue = sameSlot && !old.venue && (!old.round || (daysAway > -1 && daysAway < VENUE_RETRY_DAYS));

      let details = sameSlot
        ? { round: old.round, venue: old.venue, homeIsUs: old.home.isUs, awayIsUs: old.away.isUs }
        : null;
      if ((!details || retryVenue) && pageFetches < MAX_PAGE_FETCHES) {
        pageFetches++;
        try {
          const p = parseGamePage(await get(`game-${g.id}`), [g.competition, g.phase]);
          details = {
            round: p.round,
            venue: p.venue,
            homeIsUs: p.homeTeamId === team.tId,
            awayIsUs: p.awayTeamId === team.tId,
          };
        } catch (e) {
          log(`${id}: game page failed (${e.message})`);
        }
      }
      details ??= { round: old?.round ?? null, venue: old?.venue ?? null, homeIsUs: false, awayIsUs: false };
      // Data saved before the parser knew the phase can hold the phase as the venue.
      if (details.venue === g.phase) details.venue = null;
      if (!details.homeIsUs && !details.awayIsUs) {
        details.homeIsUs = isOurs(g.home.name);
        details.awayIsUs = isOurs(g.away.name);
      }

      games.push({
        id,
        source: 'bfb',
        team: team.key,
        competition: g.competition,
        phase: g.phase,
        round: details.round,
        date: g.date,
        time: g.time,
        start,
        venue: details.venue,
        home: { name: g.home.name, logo: await localLogo(g.home.logo), isUs: details.homeIsUs },
        away: { name: g.away.name, logo: await localLogo(g.away.logo), isUs: details.awayIsUs },
        score: g.score,
        liveUrl: g.liveUrl,
        url: `${BFB}game-${g.id}`,
      });
    }
  }

  games.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  const data = {
    teams: teams.map(({ key, label, short, page }) => ({ key, label, short, bfbUrl: page ? `${BFB}${page}` : null })),
    games,
  };
  const changed = JSON.stringify(data) !== JSON.stringify({ teams: prev.teams, games: prev.games });
  if (changed) {
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, `${JSON.stringify({ updated: now.toISOString(), ...data }, null, 2)}\n`);
  }
  return { changed, errors, games: games.length, requests };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await run({ root });
  console.log(`${result.games} games, ${result.requests} requests, ${result.changed ? 'games.json updated' : 'no changes'}`);
  if (result.errors.length) {
    console.error(`Errors:\n- ${result.errors.join('\n- ')}`);
    process.exitCode = 1;
  }
}
