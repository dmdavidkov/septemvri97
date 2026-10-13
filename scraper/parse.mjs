// Pure parsers for comps.basketball.bg HTML (no network). BFB markup is messy, so cheerio is used
// in forgiving mode and every string is whitespace-collapsed.
import * as cheerio from 'cheerio';

export const BFB = 'https://comps.basketball.bg/';

export const clean = (s) => String(s ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

const absolute = (src) => {
  if (!src) return null;
  try {
    return new URL(src.trim(), BFB).href;
  } catch {
    return null;
  }
};

// team_games.inc.php?t_id=… → { season: {id, name}, games: [...] }.
// Throws when the markup isn't recognisable, so the caller keeps the previous data.
export function parseTeamGames(html) {
  const $ = cheerio.load(html);
  const root = $('#team_games');
  const select = $('select#season');
  if (!root.length || !select.length) throw new Error('unexpected markup: #team_games or select#season missing');

  const selected = select.find('option[selected]').first();
  const season = { id: Number(selected.attr('value')) || null, name: clean(selected.text()) || null };

  const games = [];
  root.find('div.tr').each((_, el) => {
    const row = $(el);
    const id = /^game-(\d+)$/.exec(clean(row.find('a.td.home').attr('href')))?.[1];
    if (!id) return;

    const side = (cls) => {
      const a = row.find(`a.td.${cls}`).first();
      return { name: clean(a.find('.td_name').text()), logo: absolute(a.find('img').attr('src')) };
    };
    const dateEl = row.find('span.date').first();
    const time = /^(\d{1,2}):(\d{2})$/.exec(clean(dateEl.find('span').text()));
    const date = /^(\d{2})-(\d{2})-(\d{4})$/.exec(clean(dateEl.clone().children().remove().end().text()));
    const [competition = '', phase = ''] = clean(row.find('a.td.champ').text()).split('|').map(clean);
    const sh = clean(row.find('a.score_home').text());
    const sa = clean(row.find('a.score_away').text());
    const live = clean(row.find('.td_info a.live').attr('href'));

    games.push({
      id: Number(id),
      date: date ? `${date[3]}-${date[2]}-${date[1]}` : null,
      time: time ? `${time[1].padStart(2, '0')}:${time[2]}` : null,
      competition,
      phase,
      home: side('home'),
      away: side('away'),
      score: /^\d+$/.test(sh) && /^\d+$/.test(sa) ? { home: Number(sh), away: Number(sa) } : null,
      liveUrl: live.startsWith('https://tv.basketball.bg/') ? live : null,
    });
  });

  // Game links present but no rows parsed means the layout changed, not an empty season.
  if (!games.length && /href="game-\d+"/.test(html)) throw new Error('unexpected markup: game links found but no rows parsed');
  return { season, games };
}

// game-<id> → { round, venue, homeTeamId, awayTeamId }. Header spans are classified by pattern,
// never by position: competition, phase, "Кръг N", "10 Октомври 2026", venue, "18:00", "Зрители: N".
export function parseGamePage(html) {
  const $ = cheerio.load(html);
  const spans = $('.bar_top > span').map((_, s) => clean($(s).text())).get().filter(Boolean);
  if (!spans.length) throw new Error('unexpected markup: .bar_top missing');

  let round = null;
  const rest = [];
  for (const s of spans) {
    const r = /^Кръг\s+(\d+)/i.exec(s);
    if (r) round = Number(r[1]);
    else if (/^\d{1,2}\s+\p{L}+\s+\d{4}$/u.test(s) || /^\d{1,2}:\d{2}$/.test(s) || /^Зрители:/i.test(s)) continue;
    else rest.push(s);
  }
  // rest = [competition, phase, venue…]; a two-item rest whose second item looks like "Hall - City" is a venue.
  let venue = rest.slice(2).join(', ') || null;
  if (!venue && rest.length === 2 && / - /.test(rest[1])) venue = rest[1];

  const teamId = (sel) => Number(/team-(\d+)/.exec($(sel).first().attr('href') || '')?.[1]) || null;
  return {
    round,
    venue,
    homeTeamId: teamId('.td_team.td_home a[href]'),
    awayTeamId: teamId('.td_team.td_away a[href]'),
  };
}
