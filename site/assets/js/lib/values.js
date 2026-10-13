// Parsing and formatting helpers shared by the browser and the Node tests.
// Sheet values arrive "as displayed" in a Bulgarian-locale Google Sheet.

const pad = (n) => String(n).padStart(2, '0');

export function clean(s) {
  return String(s ?? '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeKey(s) {
  return clean(s).toLowerCase();
}

// "1 234,50 €", "1234.5", "600", "1,234" → number; anything without digits → null.
export function parseNumber(s) {
  const t = String(s ?? '').replace(/[^\d,.]/g, '');
  if (!/\d/.test(t)) return null;
  let intPart = t;
  let dec = '';
  const hasComma = t.includes(',');
  const hasDot = t.includes('.');
  if (hasComma && hasDot) {
    const k = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
    intPart = t.slice(0, k);
    dec = t.slice(k + 1);
  } else if (hasComma || hasDot) {
    const parts = t.split(hasComma ? ',' : '.');
    // One separator not followed by exactly three digits is a decimal mark; otherwise thousands.
    if (parts.length === 2 && parts[1].length !== 3) {
      intPart = parts[0];
      dec = parts[1];
    }
  }
  intPart = intPart.replace(/[.,]/g, '');
  const n = Number(`${intPart || '0'}${dec ? `.${dec}` : ''}`);
  return Number.isFinite(n) ? n : null;
}

function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// "15.11.2026", "15.11.2026 г.", "5.1.2027", "2026-11-15" → "2026-11-15"; invalid → null.
export function parseDate(s) {
  const t = clean(s).replace(/\s*г\.?$/i, '');
  let m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  let y, mo, d;
  if (m) {
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    return null;
  }
  return validDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

// "16:00", "9:30", "16.00", "16:00:00" → "16:00"; invalid → null.
export function parseTime(s) {
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?(?:\s*ч\.?)?$/i.exec(clean(s));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null;
}

const TRUE_WORDS = new Set(['true', 'истина', 'да', 'x', 'х', '1', 'yes', 'y', '✓', '✔']);
const FALSE_WORDS = new Set(['false', 'неистина', 'лъжа', 'не', '0', 'no', 'n']);

export function parseBool(s, fallback) {
  const t = normalizeKey(s);
  if (TRUE_WORDS.has(t)) return true;
  if (FALSE_WORDS.has(t)) return false;
  return fallback;
}

// "65:58", "65 - 58" → {home: 65, away: 58}; invalid → null.
// Google Sheets turns a typed 65:58 into the time 65:58:00 unless the column is plain text.
export function parseScore(s) {
  const m = /^(\d{1,3})\s*[:\-–]\s*(\d{1,3})(?::00)?$/.exec(clean(s));
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

function offsetMinutes(utcMs, timeZone) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(utcMs))
    .find((p) => p.type === 'timeZoneName').value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}

// Sofia wall-clock date + time → ISO 8601 with the right offset (+02:00 winter, +03:00 summer).
export function sofiaISO(date, time = '00:00') {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let off = offsetMinutes(wall, 'Europe/Sofia');
  off = offsetMinutes(wall - off * 60000, 'Europe/Sofia');
  const a = Math.abs(off);
  return `${date}T${pad(h)}:${pad(mi)}:00${off < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

// Payment links come from the Sheet, so only exact allow-listed https hosts are accepted.
export function checkPayUrl(raw, allowedHosts) {
  const text = clean(raw);
  if (!text) return { ok: false, empty: true };
  let u;
  try {
    u = new URL(text);
  } catch {
    return { ok: false };
  }
  if (u.protocol !== 'https:' || u.username || u.password) return { ok: false };
  const host = u.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) return { ok: false };
  if (host === 'buy.stripe.com' && !u.searchParams.has('locale')) u.searchParams.set('locale', 'bg');
  return { ok: true, url: u.href, host, placeholder: /placeholder/i.test(u.href) };
}

// Links next to games (streams, WABA pages): https and a host under one of the allowed domains.
export function checkLinkUrl(raw, allowedDomains) {
  const text = clean(raw);
  if (!text) return null;
  try {
    const u = new URL(text);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return allowedDomains.some((d) => host === d || host.endsWith(`.${d}`)) ? u.href : null;
  } catch {
    return null;
  }
}

export function providerName(host) {
  if (/(^|\.)stripe\.com$/.test(host)) return 'Stripe';
  if (/(^|\.)paypal\.(com|me)$/.test(host)) return 'PayPal';
  if (/(^|\.)ko-fi\.com$/.test(host)) return 'Ko-fi';
  if (/(^|\.)donorbox\.org$/.test(host)) return 'Donorbox';
  return '';
}

// Thousands always grouped ("1 000"): Bulgarian leaves four-digit numbers ungrouped by default.
const euro = new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 2, useGrouping: 'always' });

export function formatNumber(n) {
  return euro.format(n);
}

export function formatEuro(n) {
  return `${formatNumber(n)} €`;
}

const MONTHS = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
const MONTHS_SHORT = ['яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];
const WEEKDAYS = ['неделя', 'понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота'];
const WEEKDAYS_SHORT = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

// Calendar parts of a "YYYY-MM-DD" date, independent of the visitor's time zone.
export function dateParts(date) {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return {
    day: d,
    month: MONTHS[m - 1],
    monthShort: MONTHS_SHORT[m - 1],
    year: y,
    weekday: WEEKDAYS[wd],
    weekdayShort: WEEKDAYS_SHORT[wd],
  };
}

export function formatDateLong(date) {
  const p = dateParts(date);
  return `${p.weekday}, ${p.day} ${p.month}`;
}
