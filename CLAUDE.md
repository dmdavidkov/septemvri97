# Project rules

Static site for БК Септември 97, a women's basketball club in Sofia. It's hosted on GitHub Pages from `site/`, and the repository is public.

- **No build step and no framework.** The site is plain HTML, CSS and ES modules. Node is only for tests (`npm test`), the BFB scraper and the local server. Dependencies: cheerio only, used by the scraper.
- **Relative URLs** for every asset and data file, because the site also runs under `dmdavidkov.github.io/septemvri97/`. Only canonical, OG, JSON-LD and sitemap URLs are absolute (`https://www.septemvri97.eu/`).
- **Sheet content is untrusted.** Render it with `textContent` and the `el()` helper in `site/assets/js/lib/dom.js`, never with `innerHTML`. Payment links must pass `checkPayUrl` (exact allow-listed https hosts), and game links must pass `checkLinkUrl`.
- **CSP lives in a `<meta>` tag** in `index.html`. That means no inline scripts, styles or `style=""` attributes. Setting styles through JS (`el.style`) is fine.
- **The UI is Bulgarian** (`lang="bg"`). Always write the club's name as "Септември 97": another club, БК „Септември", shares the youth hall.
- **Cause codes are ASCII**, matching `^[A-Z0-9-]{2,16}$`, because donors type them into bank transfer references.
- **Privacy:**
  - No photos or names of children.
  - Never scrape BFB rosters, box scores or protocol PDFs.
  - Don't publish the club's registered seat address, which is a private flat.
  - Keep personal data out of commits, since history is public.
  - Facebook loads only after the visitor clicks.
  - No analytics and no cookies.
- **BFB scraping is gentle:** one request per team, game pages only when needed, 1 s between requests. A failing team keeps its previous games.
- Update the tests in `test/` along with any parser change. Saved BFB pages live in `scraper/fixtures/`, trimmed so they contain no player data.
- Times are Europe/Sofia. `start` is ISO with the Sofia offset (`sofiaISO`), and the UI shows the stored `date` and `time` as they are.

## Maintenance

- Every new season BFB gives teams new IDs. Find each team on comps.basketball.bg (the club's pages end in `-septemvri-97`), update `tId` and `page` in `scraper/teams.json`, and run `npm run scrape`.
- GitHub turns off the scheduled workflow after 60 days without commits, which can happen over the summer. Before the season: Actions → "Site" → Enable workflow, then Run workflow.
