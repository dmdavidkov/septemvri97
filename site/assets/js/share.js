// Sharing a match: a picture of it, drawn here in the visitor's browser, and a link to it. For BFB games the link
// is m/<game>.html, a small page that scripts/share-cards.mjs makes when the site is published, so Facebook, Viber
// and WhatsApp show that match in the link preview; it sends visitors on to ?game=<game>.
// Phones get the system share sheet with the picture (Instagram, Viber, Facebook, …); computers copy the picture
// to paste it into a chat or post, plus links for Facebook, Viber and WhatsApp.
// Loaded only when someone presses a share button.
import { el, announce } from './lib/dom.js';
import { dateParts } from './lib/values.js';

const W = 1080;
const H = 1350;
export const CARD = { width: 1200, height: 630 };
const C = {
  ink: '#0B0A0C', ink3: '#251D28', red: '#DA162D', coral: '#F64E5A', chalk: '#FCFCFC', white: '#FFFFFF',
  muted: 'rgba(252, 252, 252, .66)', faint: 'rgba(252, 252, 252, .45)',
};
const DISPLAY = "Unbounded, 'Segoe UI', system-ui, sans-serif";
const BODY = "Onest, system-ui, 'Segoe UI', sans-serif";
const CHEER = 'Елате да ни подкрепите!';
const TV = { live: 'Гледайте в BFB TV', played: 'Запис в BFB TV', pending: 'Запис в BFB TV', upcoming: 'Излъчване в BFB TV' };

// ---- Text ----

export function shareText(g) {
  const p = dateParts(g.date);
  const teams = `${g.home.name} – ${g.away.name}`;
  if (g.status === 'played' && g.score) {
    return `${g.team}: ${g.home.name} ${g.score.home}:${g.score.away} ${g.away.name}${g.result === 'win' ? '. Победа!' : '.'}`;
  }
  if (g.status === 'live') return `На живо: ${teams} (${g.team})${g.tv ? '. Гледайте в BFB TV.' : ''}`;
  const when = `${p.weekday}, ${p.day} ${p.month}${g.time ? `, ${g.time}` : ''}`;
  return `${g.team}: ${teams}, ${when}${g.venue ? `, ${g.venue}` : ''}.`;
}

// Title and description of the link preview (m/<game>.html), from what is known when the site is published.
export function cardText(g) {
  const p = dateParts(g.date);
  const date = `${p.weekday}, ${p.day} ${p.month}`;
  if (g.score) {
    // "А група Жени" already names the team.
    const what = g.competition?.includes(g.team) ? [g.competition] : [g.team, g.competition];
    return {
      title: `${g.home.name} ${g.score.home}:${g.score.away} ${g.away.name}`,
      description: `${[...what, date].filter(Boolean).join(' · ')}.${g.result === 'win' ? ' Победа!' : ''}${g.tv ? ' Запис в BFB TV.' : ''}`,
    };
  }
  return {
    title: `${g.home.name} – ${g.away.name}`,
    description: `${[g.team, `${date}${g.time ? `, ${g.time}` : ''}`, g.venue].filter(Boolean).join(' · ')}.${g.tv ? ' Излъчване в BFB TV.' : ''} ${CHEER}`,
  };
}

// Changes whenever the preview would, so Facebook (which keeps previews for weeks) reads the new one.
export function shareVersion(g) {
  const key = JSON.stringify([g.date, g.time, g.venue, g.score, g.home.name, g.away.name, g.home.logo, g.away.logo, g.competition, !!g.tv, g.team, g.tag]);
  let h = 0x811c9dc5;
  for (const ch of key) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193);
  return (h >>> 0).toString(36);
}

function shareUrl(g) {
  // Relative to the current address, which keeps working before and after the custom domain is connected.
  const base = new URL('.', location.href);
  if (g.card) return new URL(`m/${g.id}.html?v=${shareVersion(g)}`, base).href;
  const url = new URL(`?game=${encodeURIComponent(g.id)}`, base);
  url.hash = 'machove';
  return url.href;
}

// ---- Pictures ----

// Load events rather than img.decode(), which can wait indefinitely while the tab is in the background.
function image(src) {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => {
      clearTimeout(timer);
      resolve(img.complete && img.naturalWidth > 0 ? img : null);
    };
    const timer = setTimeout(done, 4000);
    img.onload = done;
    img.onerror = done;
    img.src = src;
  });
}

function fontsReady() {
  const sample = 'Септември 97 – 0123456789:';
  const load = Promise.all([document.fonts.load('900 80px Unbounded', sample), document.fonts.load('700 30px Onest', sample)]);
  // System fonts are fine too, if the site's fonts take too long.
  return Promise.race([load, new Promise((resolve) => setTimeout(resolve, 3000))]).catch(() => {});
}

const assets = (g) => Promise.all([fontsReady(), image('assets/img/emblem.svg'), image(g.home.logo), image(g.away.logo)]);

function ellipsize(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text.replace(/…$/, '');
  while (t && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function wrap(ctx, text, max, maxLines) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(next).width <= max) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  if (out.length > maxLines) {
    out.length = maxLines;
    out[maxLines - 1] += '…';
  }
  return out.map((l) => ellipsize(ctx, l, max));
}

// With `size` (and `weight`, `family`) instead of `font`, text that is too wide shrinks instead of being cut.
function text(ctx, value, x, y, { font, size, weight = 700, family = BODY, color = C.chalk, align = 'center', spacing = 0, max = 880 }) {
  if (size) {
    ctx.font = `${weight} ${size}px ${family}`;
    const w = ctx.measureText(value).width;
    if (w > max) ctx.font = `${weight} ${Math.floor((size * max) / w)}px ${family}`;
  } else ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(ellipsize(ctx, value, max), x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function pill(ctx, value, cx, y, { font, height, pad, fill = C.red, color = C.white, align = 'center' }) {
  ctx.font = font;
  const w = ctx.measureText(value).width + pad * 2;
  const x = align === 'right' ? cx - w : align === 'left' ? cx : cx - w / 2;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, height, height / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x + w / 2, y + height / 2 + 2);
  ctx.textBaseline = 'alphabetic';
  return w;
}

// Ink, a red glow, the grid, the half-court line with the centre circle behind the teams, and the chalk frame.
function background(ctx, w, h, { cy, circle, cell, inset, radius }) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, Math.max(w, h) * 0.58);
  glow.addColorStop(0, 'rgba(218, 22, 45, .45)');
  glow.addColorStop(0.5, 'rgba(99, 26, 38, .32)');
  glow.addColorStop(1, 'rgba(11, 10, 12, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(252, 252, 252, .04)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = cell; x < w; x += cell) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = cell; y < h; y += cell) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(252, 252, 252, .1)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(inset, cy);
  ctx.lineTo(w - inset, cy);
  ctx.moveTo(w / 2 + circle, cy);
  ctx.arc(w / 2, cy, circle, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(252, 252, 252, .5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, radius);
  ctx.stroke();
}

function teamBadge(ctx, side, img, cx, cy, { r, name, nameWidth, nameGap, lineHeight }) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .5)';
  ctx.shadowBlur = r * 0.375;
  ctx.shadowOffsetY = r * 0.1;
  ctx.fillStyle = img ? C.white : C.ink3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (img) {
    // BFB's logos are only 75 px, so they are enlarged at most twice; the club's SVG emblem fills the circle.
    const box = r * 1.56;
    const nw = img.naturalWidth || box;
    const nh = img.naturalHeight || box;
    const scale = Math.min(box / nw, box / nh, /\.svg$/.test(img.src) ? Infinity : 2);
    const w = nw * scale;
    const h = nh * scale;
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  } else {
    ctx.strokeStyle = 'rgba(252, 252, 252, .2)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textBaseline = 'middle';
    text(ctx, side.initials, cx, cy + 4, { font: `800 ${Math.round(r * 0.6)}px ${DISPLAY}` });
    ctx.textBaseline = 'alphabetic';
  }
  const font = `700 ${name}px ${BODY}`;
  ctx.font = font;
  wrap(ctx, side.name, nameWidth, 2).forEach((line, i) =>
    text(ctx, line, cx, cy + r + nameGap + i * lineHeight, { font, color: side.isUs ? C.chalk : C.muted, max: nameWidth }));
}

// "▶ Запис в BFB TV", centred on cx.
function tvNote(ctx, g, cx, y, size) {
  const note = g.tv && TV[g.status];
  if (!note) return;
  const font = `700 ${size}px ${BODY}`;
  ctx.font = font;
  const mark = size * 0.8;
  const gap = size * 0.45;
  const left = cx - (mark * 0.86 + gap + ctx.measureText(note).width) / 2;
  const mid = y - size * 0.35;
  ctx.fillStyle = C.coral;
  ctx.beginPath();
  ctx.moveTo(left, mid - mark / 2);
  ctx.lineTo(left + mark * 0.86, mid);
  ctx.lineTo(left, mid + mark / 2);
  ctx.closePath();
  ctx.fill();
  text(ctx, note, left + mark * 0.86 + gap, y, { font, color: C.coral, align: 'left' });
}

const momentLabel = (g) => (g.status === 'live' ? 'НА ЖИВО'
  : g.status === 'played' && g.result === 'win' ? 'ПОБЕДА!'
  : g.status === 'played' ? 'КРАЕН РЕЗУЛТАТ'
  : 'ПРЕДСТОЯЩ МАЧ');
const bigLabel = (g) => g.status === 'played' && g.result === 'win';

function score(ctx, g, cx, y, size) {
  const pts = [g.score.home, g.score.away];
  const won = pts[0] === pts[1] ? -1 : pts[0] > pts[1] ? 0 : 1;
  const font = `900 ${size}px ${DISPLAY}`;
  const gap = size * 0.21;
  text(ctx, ':', cx, y, { font, color: C.coral });
  text(ctx, String(pts[0]), cx - gap, y, { font, color: won === 1 ? C.faint : C.chalk, align: 'right', max: cx });
  text(ctx, String(pts[1]), cx + gap, y, { font, color: won === 0 ? C.faint : C.chalk, align: 'left', max: cx });
}

// 1080 × 1350: for the share sheet, Instagram, chats and saving.
export async function drawPoster(canvas, g) {
  const [, emblem, home, away] = await assets(g);
  const ctx = canvas.getContext('2d');
  background(ctx, W, H, { cy: 540, circle: 170, cell: 54, inset: 36, radius: 40 });

  // Club and team
  if (emblem) ctx.drawImage(emblem, 84, 82, 88, 88);
  text(ctx, 'СЕПТЕМВРИ 97', 192, 126, { font: `800 40px ${DISPLAY}`, align: 'left', max: 520 });
  text(ctx, 'ЖЕНСКИ БАСКЕТБОЛ · СОФИЯ', 194, 162, { font: `700 22px ${BODY}`, color: C.muted, align: 'left', spacing: 3, max: 520 });
  pill(ctx, g.tag.toUpperCase(), W - 84, 92, { font: `800 30px ${DISPLAY}`, height: 64, pad: 26, align: 'right' });

  // What kind of moment this is
  if (g.status === 'live') pill(ctx, momentLabel(g), 540, 222, { font: `800 32px ${DISPLAY}`, height: 66, pad: 34 });
  else text(ctx, momentLabel(g), 540, 272, { font: `800 ${bigLabel(g) ? 48 : 34}px ${DISPLAY}`, color: C.coral, spacing: 4 });
  if (g.competition) text(ctx, g.competition, 540, 334, { font: `600 30px ${BODY}`, color: C.muted });

  const badge = { r: 128, name: 38, nameWidth: 420, nameGap: 70, lineHeight: 46 };
  teamBadge(ctx, g.home, home, 290, 540, badge);
  teamBadge(ctx, g.away, away, 790, 540, badge);
  text(ctx, 'срещу', 540, 552, { font: `800 30px ${DISPLAY}`, color: C.coral });

  const p = dateParts(g.date);
  let y;
  if (g.status === 'played' && g.score) {
    score(ctx, g, 540, 1024, 190);
    text(ctx, `${p.weekday}, ${p.day} ${p.month}`, 540, 1090, { font: `600 32px ${BODY}`, color: C.muted });
    y = 1146;
  } else {
    text(ctx, p.weekday.toUpperCase(), 540, 858, { font: `700 30px ${BODY}`, color: C.muted, spacing: 5 });
    text(ctx, `${p.day} ${p.month}`, 540, 956, { size: 88, weight: 900, family: DISPLAY, max: 900 });
    if (g.time) pill(ctx, g.time, 540, 986, { font: `900 60px ${DISPLAY}`, height: 100, pad: 44 });
    else text(ctx, 'Час: предстои', 540, 1046, { font: `600 34px ${BODY}`, color: C.muted });
    y = 1146;
  }
  if (g.venue) text(ctx, g.venue, 540, y, { font: `600 34px ${BODY}` });
  tvNote(ctx, g, 540, y + 48, 28);

  text(ctx, 'septemvri97.eu', 84, 1272, { font: `700 30px ${DISPLAY}`, align: 'left', max: 440 });
  text(ctx, CHEER, W - 84, 1272, { font: `700 28px ${BODY}`, color: C.coral, align: 'right', max: 460 });
}

// 1200 × 630: the link preview on Facebook, Viber and WhatsApp, drawn when the site is published.
export async function drawCard(canvas, g) {
  const { width: w, height: h } = CARD;
  const [, emblem, home, away] = await assets(g);
  const ctx = canvas.getContext('2d');
  background(ctx, w, h, { cy: 300, circle: 120, cell: 50, inset: 24, radius: 30 });

  if (emblem) ctx.drawImage(emblem, 60, 50, 58, 58);
  text(ctx, 'СЕПТЕМВРИ 97', 130, 88, { font: `800 24px ${DISPLAY}`, align: 'left', max: 290 });
  pill(ctx, g.tag.toUpperCase(), w - 60, 54, { font: `800 24px ${DISPLAY}`, height: 50, pad: 20, align: 'right' });
  text(ctx, momentLabel(g), w / 2, 94, { font: `800 ${bigLabel(g) ? 34 : 26}px ${DISPLAY}`, color: C.coral, spacing: 3, max: 400 });
  if (g.competition) text(ctx, g.competition, w / 2, 136, { font: `600 22px ${BODY}`, color: C.muted, max: 600 });

  const badge = { r: 100, name: 28, nameWidth: 320, nameGap: 46, lineHeight: 34 };
  teamBadge(ctx, g.home, home, 220, 300, badge);
  teamBadge(ctx, g.away, away, w - 220, 300, badge);

  const p = dateParts(g.date);
  if (g.status === 'played' && g.score) {
    score(ctx, g, w / 2, 344, 116);
    text(ctx, `${p.weekday}, ${p.day} ${p.month}`, w / 2, 400, { font: `600 24px ${BODY}`, color: C.muted, max: 400 });
  } else {
    text(ctx, p.weekday.toUpperCase(), w / 2, 232, { font: `700 22px ${BODY}`, color: C.muted, spacing: 4, max: 400 });
    text(ctx, `${p.day} ${p.month}`, w / 2, 300, { size: 54, weight: 900, family: DISPLAY, max: 420 });
    if (g.time) pill(ctx, g.time, w / 2, 326, { font: `900 40px ${DISPLAY}`, height: 70, pad: 30 });
    else text(ctx, 'Час: предстои', w / 2, 370, { font: `600 24px ${BODY}`, color: C.muted, max: 400 });
  }
  if (g.venue) text(ctx, g.venue, w / 2, 456, { font: `600 24px ${BODY}`, max: 400 });
  tvNote(ctx, g, w / 2, 496, 21);

  text(ctx, 'septemvri97.eu', 60, 582, { font: `700 22px ${DISPLAY}`, align: 'left', max: 400 });
  text(ctx, CHEER, w - 60, 582, { font: `700 22px ${BODY}`, color: C.coral, align: 'right', max: 400 });
}

// ---- Dialog ----

const fileShare = () => {
  try {
    return !!navigator.canShare?.({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] });
  } catch {
    return false;
  }
};

export function openShare(g) {
  const url = shareUrl(g);
  const message = shareText(g);
  const name = `septemvri97-${g.date}.jpg`;
  const withFiles = fileShare();
  // Phones have their own share sheet with every app on them. On computers the share sheet hands Viber and
  // similar apps only a link, so there the picture is copied and pasted into the chat or post instead.
  const phone = matchMedia('(pointer: coarse)').matches;
  const copyImage = !phone && !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined';
  const paste = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';

  const canvas = el('canvas', { class: 'share-poster', width: W, height: H, role: 'img', 'aria-label': message });
  const hint = el('p', {
    class: 'share-hint',
    text: copyImage ? `Копирайте картинката и я поставете с ${paste} в чат във Viber или Messenger или в публикация във Facebook.`
      : withFiles ? '' : 'За Instagram: запазете картинката и я качете като история или публикация.',
  });
  const button = (label, cls = 'share-app', props = {}) => el('button', { type: 'button', class: cls, ...props }, label);
  const native = navigator.share ? button(withFiles ? 'Сподели картинката' : 'Сподели', 'btn btn-primary share-native', { autofocus: true }) : null;
  const copyPicture = copyImage ? button('Копирай картинката', 'btn btn-primary share-native', { autofocus: true }) : null;
  const more = copyImage && native ? button('Още…') : null;
  const copyText = button('Копирай текста');
  const save = button('Запази картинката');
  const close = button(null, 'share-close', { 'aria-label': 'Затвори', autofocus: !native && !copyPicture });
  const app = (label, href, blank = true) => el('a', { class: 'share-app', href, target: blank ? '_blank' : null, rel: blank ? 'noopener' : null }, label);
  const withLink = encodeURIComponent(`${message}\n${url}`);
  const viber = phone ? null : app('Viber', `viber://forward?text=${withLink}`, false);

  const dialog = el('dialog', { class: 'share-dialog', 'aria-labelledby': 'share-title' },
    el('div', { class: 'share-box' },
      el('div', { class: 'share-preview' }, canvas),
      el('div', { class: 'share-side' },
        el('h2', { class: 'share-title', id: 'share-title', text: 'Сподели мача' }),
        el('p', { class: 'share-text', text: message }),
        copyPicture ?? native,
        el('div', { class: 'share-apps' },
          phone ? null : [
            app('Facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`),
            viber,
            app('WhatsApp', `https://wa.me/?text=${withLink}`),
          ],
          copyText, save, more),
        hint)),
    close);

  let file = null;
  let png = null;
  const ready = drawPoster(canvas, g)
    .then(() => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92)))
    .then((blob) => {
      if (blob) file = new File([blob], name, { type: 'image/jpeg' });
    })
    .catch(() => {});
  // The clipboard takes only PNG.
  const pngReady = copyImage ? ready.then(() => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))).then((b) => { png = b; return b; }) : null;

  // Called straight from the click, so the browser still counts it as the visitor's action. In the
  // split second before the picture is ready, only the link is shared.
  const shareNow = () => {
    const data = file && withFiles ? { files: [file], title: 'Септември 97', text: message, url } : { title: 'Септември 97', text: message, url };
    navigator.share(data).catch((e) => {
      if (e.name !== 'AbortError') hint.textContent = 'Споделянето не успя. Опитайте с другите бутони.';
    });
  };
  native?.addEventListener('click', shareNow);
  more?.addEventListener('click', shareNow);

  async function copyPictureNow(done = `Картинката е копирана. Поставете я с ${paste} в чата или публикацията.`) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png ?? pngReady })]);
      hint.textContent = done;
      announce('Картинката е копирана.');
      return true;
    } catch {
      hint.textContent = 'Картинката не успя да се копира. Запазете я и я прикачете.';
      return false;
    }
  }
  copyPicture?.addEventListener('click', () => copyPictureNow());
  // Viber for computers ignores the text in its share link, so it gets the picture through the clipboard.
  viber?.addEventListener('click', async (e) => {
    if (!copyImage) return;
    e.preventDefault();
    await copyPictureNow(`Картинката е копирана. Във Viber отворете чат и я поставете с ${paste}.`);
    location.href = viber.href;
  });
  copyText.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(`${message}\n${url}`);
      copyText.textContent = 'Копирано';
      announce('Текстът и линкът са копирани.');
    } catch {
      announce('Копирането не успя.');
    }
  });
  save.addEventListener('click', async () => {
    await ready;
    if (!file) {
      announce('Картинката не успя да се създаде.');
      return;
    }
    const href = URL.createObjectURL(file);
    const a = el('a', { href, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  });

  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return ready;
}
