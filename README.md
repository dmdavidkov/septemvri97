# septemvri97.eu

The website of women's basketball club **БК Септември 97** (Sofia): one static page that shows the club, every team's games and results, and how to support the team. Payments happen off-site, through a payment link (Stripe recommended) or a bank transfer.

- **Hosting:** GitHub Pages, free. Every commit to `main` is tested and published by `.github/workflows/site.yml`.
- **Schedule:** a GitHub Action scrapes the Bulgarian Basketball Federation (BFB) site every 3 hours into `site/data/games.json`, which is committed.
- **Causes and extra games:** a Google Sheet published as CSV, read directly by the visitor's browser. Edits show up in about 5 minutes.
- **No build step:** plain HTML, CSS and JavaScript modules in `site/`.

## Local development

Node 22 or newer.

```bash
npm install
npm test          # parsers, scraper (against saved BFB pages), match rules
npm run serve     # http://localhost:8097
npm run scrape    # refresh site/data/games.json from BFB (about 10 requests)
```

URL switches: `?demo` uses `site/data/sample-*.csv` instead of the Sheet, `?check` lists the Sheet rows the site skipped and why, and `?cause=N014` preselects a cause.

## Connecting the domain (Namecheap)

In Namecheap → Domain List → septemvri97.eu → **Advanced DNS**:

1. Delete the parking records (for example `A @ 192.64.119.16`, and any `www` record pointing to a Namecheap parking page).
2. **Keep** the email-forwarding MX records and the `TXT @ v=spf1 include:spf.efwd.registrar-servers.com ~all` record.
3. Add:

   | Type | Host | Value |
   |---|---|---|
   | CNAME | `www` | `dmdavidkov.github.io.` |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA | `@` | `2606:50c0:8000::153` |
   | AAAA | `@` | `2606:50c0:8001::153` |
   | AAAA | `@` | `2606:50c0:8002::153` |
   | AAAA | `@` | `2606:50c0:8003::153` |

4. Once `nslookup www.septemvri97.eu` points to GitHub, set the custom domain to `www.septemvri97.eu` under the repository's Settings → Pages. GitHub issues the certificate (minutes up to an hour); then tick **Enforce HTTPS**. The apex `septemvri97.eu` redirects to `www`.

Optional takeover protection: GitHub profile → Settings → Pages → Add a verified domain, then add the TXT record it shows.

## The Google Sheet

1. Create a spreadsheet (File → Settings → Locale: Bulgaria). Import `site/data/sample-needs.csv` and `site/data/sample-games.csv` (File → Import → Upload → "Insert new sheet(s)"), then rename the tabs to **Нужди** and **Мачове**. Delete the example rows marked "ПРИМЕР ЗА ГРЕШКА".
2. File → Share → **Publish to web** → pick the tab → **Comma-separated values (.csv)** → Publish. Do this for each of the two tabs, with "Automatically republish" on.
3. Put the two links in `site/assets/js/config.js` (`sheet.needs`, `sheet.games`) and commit.
4. Open `https://www.septemvri97.eu/?check` to confirm that both tabs load.

Publish only those two tabs, and keep anything private (donor names, notes) in a separate, unpublished spreadsheet: published tabs are public.

## Payment links

- **Recommended: Stripe Payment Links.** Create one link per cause with "Customer chooses what to pay". Standard EEA cards cost 1.5% + €0.25, and payouts to the club's Bulgarian IBAN are free. The site adds `locale=bg` to `buy.stripe.com` links so checkout appears in Bulgarian.
- PayPal payment links work as well, but cost more (3.4% + €0.35 by wallet). They're useful for donors abroad.
- Paste a link into the cause's **Линк за плащане** cell in the Sheet. For "Общо за клуба", set `generalPayLink` in `config.js`. Only hosts listed in `payHosts` in `config.js` are accepted. A link containing `PLACEHOLDER` shows a disabled "Онлайн дарение – скоро" button.
- Bank transfer: fill in `bank.iban`, `bank.bic` and `bank.bankName` in `config.js`. While `iban` is empty, the site asks donors to write for the bank details.

## Every new season

BFB gives teams new IDs each season. Find each team on comps.basketball.bg (the club's teams end in `-septemvri-97`), then update `tId` and `page` in `scraper/teams.json` and run `npm run scrape`.

GitHub disables scheduled workflows in public repositories after 60 days without activity, which can happen over the summer. Before the season starts, open the **Actions** tab, select "Site", and click **Enable workflow**, then **Run workflow**.

## What the club still has to provide

The IBAN, BIC and recipient name; a public phone number; training days and times per age group; the real partnership packages (the current ones are placeholders); confirmation of the achievements copy; the vector logo if one exists (`assets/img/emblem.svg` is a simplified trace); whether the club is registered for public benefit, which determines whether tax-relief wording can be used; and photos, only with consent. No children's photos or names are published on this site.

---

## Ръководство за администратори (Google таблицата)

**Таб „Нужди“** – каузите, за които събираме пари. Редът в таблицата е редът на сайта.

| Колона | Какво пишете |
|---|---|
| Покажи | TRUE – показва се; FALSE – скрита |
| Код | Латински букви и цифри, например `N014`. Дарителите го пишат в основанието на превода („Дарение N014“). Не го сменяйте, след като сте го споделили. |
| Заглавие | До 80 знака |
| Описание | До 500 знака |
| Отбор | Например `U17`, `Жени` (по желание) |
| Цел € | Сумата, която събираме |
| Събрано € | Обновявайте ръчно. Когато стигне целта, каузата отива в „Покрити – благодарим!“ |
| Линк за плащане | Линк от Stripe или PayPal за тази кауза (по желание) |
| Срок | Например `15.11.2026` (по желание) |

**Таб „Мачове“** – само мачове, които ги няма в БФБ (например WABA). Мачовете от БФБ се появяват сами.

| Колона | Какво пишете |
|---|---|
| Покажи | TRUE / FALSE |
| Отбор | `U17`, `Жени`, `U19` … |
| Дата / Час | `25.10.2026` / `11:00` |
| Домакин / Гост | Пишете „Септември 97“ за нашия отбор |
| Състезание | Например `WABA U17` |
| Зала / град | По желание |
| Резултат | След мача, например `65:58` (домакин:гост) |
| Линк | YouTube, WABA или Facebook (по желание) |

Промените излизат на сайта до 5 минути. Ако нещо липсва, отворете сайта с `?check` накрая на адреса, за да видите кои редове са пропуснати и защо.
