# Project rules

Static site for БК Септември 97, a women's basketball club in Sofia. It's hosted on GitHub Pages from `site/`, and the repository is public.

- **No build step and no framework.** The site is plain HTML, CSS and ES modules. Node is only for tests (`npm test`), the BFB scraper, the Facebook and Stripe steps, the local server and the match link previews. Dependencies: cheerio only, used by the scraper.
- **Match link previews** (`site/m/<game>.html` and `.jpg`) are made when the site is published (`npm run cards`, with the runner's Chrome) and never committed. They exist only for BFB games, and the picture comes from `drawCard` in `share.js`. The `?v=` in their links changes with the game (`shareVersion`), because Facebook keeps a preview for weeks.
- **Relative URLs** for every asset and data file, because the site also runs under `dmdavidkov.github.io/septemvri97/`. Only canonical, OG, JSON-LD and sitemap URLs are absolute (`https://www.septemvri97.eu/`).
- **Sheet content is untrusted.** Render it with `textContent` and the `el()` helper in `site/assets/js/lib/dom.js`, never with `innerHTML`. Payment links must pass `checkPayUrl` (exact allow-listed https hosts), and game links must pass `checkLinkUrl`.
- **CSP lives in a `<meta>` tag** in `index.html`. That means no inline scripts, styles or `style=""` attributes. Setting styles through JS (`el.style`) is fine.
- **The UI is Bulgarian** (`lang="bg"`). Always write the club's name as "Септември 97": another club, БК „Септември", shares the youth hall.
- **Cause codes are ASCII**, matching `^[A-Z0-9-]{2,16}$`, because donors type them into bank transfer references.
- **Privacy:**
  - No photos or names of children. The only exception is the news cards, which mirror the club's own Facebook posts (the club decided this in October 2026).
  - Facebook posts and their photos go only into the published site, never into commits. `robots.txt` keeps `assets/fb/` out of image search.
  - Never scrape BFB rosters, box scores or protocol PDFs.
  - Don't publish the club's registered seat address, which is a private flat.
  - Keep personal data out of commits, since history is public.
  - Visitors' browsers never contact Facebook. The page plugin, a fallback for when there are no copied posts, loads only after the visitor clicks.
  - No analytics and no cookies.
- **BFB scraping is gentle:** one request per team, game pages only when needed, 1 s between requests. A failing team keeps its previous games. The 10-minute runs (`--soon`) ask only for teams playing around then.
- BFB TV links come only from BFB's own list (`liveUrl`). Don't build them from game IDs: a game without a broadcast has an empty BFB TV page.
- **Facebook reading is gentle too:** one page request every 30 minutes, and photos only for posts the site doesn't have yet. The 10-minute runs in between don't ask Facebook: when they publish, they carry the live posts over (`--keep`). If it fails, the live posts stay. Never commit real Facebook pages or posts: the tests use made-up ones.
- **Stripe totals** (`scraper/stripe.mjs`) use a restricted, read-only key (secret `STRIPE_KEY`). Only one euro total per payment link, and only for links in the „Нужди“ tab, goes into `site/data/stripe.json` (and `stripe.csv`, which the Sheet reads with IMPORTDATA), which is published, never committed. No donor names or emails leave Stripe. The Sheet's „Събрано €“ holds only money from outside Stripe, and the site adds the two. If Stripe fails, the live totals stay. Stripe sends donors back with `?dar=<code>`, which shows a thank-you.
- **Admin docs live in the GitHub wiki** (`https://github.com/dmdavidkov/septemvri97.wiki.git`, Bulgarian), written for club admins who aren't developers or the GitHub owner. When a change alters what admins see or do, update the matching wiki page too. The README only links there. Commit to the wiki with the same noreply identity as the repo.
- Update the tests in `test/` along with any parser change. Saved BFB pages live in `scraper/fixtures/`, trimmed so they contain no player data.
- Times are Europe/Sofia. `start` is ISO with the Sofia offset (`sofiaISO`), and the UI shows the stored `date` and `time` as they are.

## Maintenance

- Every new season BFB gives teams new IDs. Find each team on comps.basketball.bg (the club's pages end in `-septemvri-97`), update `tId` and `page` in `scraper/teams.json`, and run `npm run scrape`.
- If GitHub emails daily that the Facebook page couldn't be read, Facebook has changed its page. Compare `parsePage` in `scraper/facebook.mjs` with a freshly saved page, but keep that page out of the repository.
- After a gap, the site can only add the newest post per run. To fill it in, save Facebook's "more posts" answer from a logged-out browser (DevTools → Network → graphql) outside the repo, run `node scraper/facebook.mjs --seed <file>`, put the output in the secret `FB_SEED`, run the workflow once, then delete the secret.
- GitHub turns off the scheduled workflow after 60 days without commits, which can happen over the summer. Before the season: Actions → "Site" → Enable workflow, then Run workflow.
