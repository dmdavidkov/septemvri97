// Sharing a match: a picture of it, drawn here in the visitor's browser, and a link that opens the site at that
// game (?game=<id>). Phones get the system share sheet with the picture (Instagram, Viber, Facebook, …);
// computers get links for Facebook, Viber and WhatsApp, plus copying the link and saving the picture.
// Loaded only when someone presses a share button.
import { el, announce } from './lib/dom.js';
import { dateParts } from './lib/values.js';

const W = 1080;
const H = 1350;
const C = {
  ink: '#0B0A0C', ink3: '#251D28', red: '#DA162D', coral: '#F64E5A', chalk: '#FCFCFC', white: '#FFFFFF',
  muted: 'rgba(252, 252, 252, .66)', faint: 'rgba(252, 252, 252, .45)',
};
const DISPLAY = "Unbounded, 'Segoe UI', system-ui, sans-serif";
const BODY = "Onest, system-ui, 'Segoe UI', sans-serif";

// ---- Text for the link ----

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

function shareUrl(id) {
  // The current address keeps working before and after the custom domain is connected.
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('game', id);
  url.hash = 'machove';
  return url.href;
}

// ---- Picture ----

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

function text(ctx, value, x, y, { font, color = C.chalk, align = 'center', spacing = 0, max = W - 200 }) {
  ctx.font = font;
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

function background(ctx) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(540, 540, 0, 540, 540, 780);
  glow.addColorStop(0, 'rgba(218, 22, 45, .45)');
  glow.addColorStop(0.5, 'rgba(99, 26, 38, .32)');
  glow.addColorStop(1, 'rgba(11, 10, 12, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(252, 252, 252, .04)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 54; x < W; x += 54) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 54; y < H; y += 54) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  // The half-court line and centre circle, behind the two teams.
  ctx.strokeStyle = 'rgba(252, 252, 252, .1)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(36, 540);
  ctx.lineTo(W - 36, 540);
  ctx.moveTo(540 + 170, 540);
  ctx.arc(540, 540, 170, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(252, 252, 252, .5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(36, 36, W - 72, H - 72, 40);
  ctx.stroke();
}

function teamBadge(ctx, side, img, cx, cy) {
  const r = 128;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .5)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = img ? C.white : C.ink3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (img) {
    // BFB's logos are only 75 px, so they are enlarged at most twice; the club's SVG emblem fills the circle.
    const box = r * 2 - 56;
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
    text(ctx, side.initials, cx, cy + 4, { font: `800 76px ${DISPLAY}` });
    ctx.textBaseline = 'alphabetic';
  }
  ctx.font = `700 38px ${BODY}`;
  wrap(ctx, side.name, 420, 2).forEach((line, i) =>
    text(ctx, line, cx, cy + r + 70 + i * 46, { font: `700 38px ${BODY}`, color: side.isUs ? C.chalk : C.muted, max: 420 }));
}

function playMark(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size / 2);
  ctx.lineTo(x + size * 0.86, y);
  ctx.lineTo(x, y + size / 2);
  ctx.closePath();
  ctx.fill();
}

export async function drawPoster(canvas, g) {
  const [, emblem, home, away] = await Promise.all([fontsReady(), image('assets/img/emblem.svg'), image(g.home.logo), image(g.away.logo)]);
  const ctx = canvas.getContext('2d');
  background(ctx);

  // Club and team
  if (emblem) ctx.drawImage(emblem, 84, 82, 88, 88);
  text(ctx, 'СЕПТЕМВРИ 97', 192, 126, { font: `800 40px ${DISPLAY}`, align: 'left', max: 520 });
  text(ctx, 'ЖЕНСКИ БАСКЕТБОЛ · СОФИЯ', 194, 162, { font: `700 22px ${BODY}`, color: C.muted, align: 'left', spacing: 3, max: 520 });
  pill(ctx, g.tag.toUpperCase(), W - 84, 92, { font: `800 30px ${DISPLAY}`, height: 64, pad: 26, align: 'right' });

  // What kind of moment this is
  const label = g.status === 'live' ? 'НА ЖИВО'
    : g.status === 'played' && g.result === 'win' ? 'ПОБЕДА!'
    : g.status === 'played' ? 'КРАЕН РЕЗУЛТАТ'
    : 'ПРЕДСТОЯЩ МАЧ';
  if (g.status === 'live') pill(ctx, label, 540, 222, { font: `800 32px ${DISPLAY}`, height: 66, pad: 34 });
  else text(ctx, label, 540, 272, { font: `800 ${g.result === 'win' ? 48 : 34}px ${DISPLAY}`, color: C.coral, spacing: 4 });
  if (g.competition) text(ctx, g.competition, 540, 334, { font: `600 30px ${BODY}`, color: C.muted, max: 880 });

  teamBadge(ctx, g.home, home, 290, 540);
  teamBadge(ctx, g.away, away, 790, 540);
  text(ctx, 'срещу', 540, 552, { font: `800 30px ${DISPLAY}`, color: C.coral });

  const p = dateParts(g.date);
  if (g.status === 'played' && g.score) {
    const pts = [g.score.home, g.score.away];
    const won = pts[0] === pts[1] ? -1 : pts[0] > pts[1] ? 0 : 1;
    const font = `900 190px ${DISPLAY}`;
    text(ctx, ':', 540, 1050, { font, color: C.coral });
    text(ctx, String(pts[0]), 500, 1050, { font, color: won === 1 ? C.faint : C.chalk, align: 'right', max: 460 });
    text(ctx, String(pts[1]), 580, 1050, { font, color: won === 0 ? C.faint : C.chalk, align: 'left', max: 460 });
    text(ctx, `${p.weekday}, ${p.day} ${p.month}`, 540, 1120, { font: `600 32px ${BODY}`, color: C.muted });
  } else {
    text(ctx, p.weekday.toUpperCase(), 540, 878, { font: `700 30px ${BODY}`, color: C.muted, spacing: 5 });
    text(ctx, `${p.day} ${p.month}`, 540, 976, { font: `900 88px ${DISPLAY}`, max: 900 });
    if (g.time) pill(ctx, g.time, 540, 1012, { font: `900 60px ${DISPLAY}`, height: 100, pad: 44 });
    else text(ctx, 'Час: предстои', 540, 1070, { font: `600 34px ${BODY}`, color: C.muted });
  }

  if (g.venue) text(ctx, g.venue, 540, 1192, { font: `600 34px ${BODY}`, max: 880 });

  // Footer: the site, and where to watch or a cheer
  text(ctx, 'septemvri97.eu', 84, 1268, { font: `700 30px ${DISPLAY}`, align: 'left', max: 440 });
  const note = g.tv
    ? { live: 'Гледайте в BFB TV', played: 'Запис в BFB TV', upcoming: 'Излъчване в BFB TV' }[g.status] ?? 'BFB TV'
    : g.status === 'upcoming' ? (g.home.isUs ? 'Елате да ни подкрепите!' : 'Стискайте ни палци!') : '';
  if (note) {
    text(ctx, note, W - 84, 1268, { font: `700 28px ${BODY}`, color: C.coral, align: 'right', max: 460 });
    if (g.tv) {
      ctx.font = `700 28px ${BODY}`;
      playMark(ctx, W - 84 - ctx.measureText(note).width - 34, 1258, 22, C.coral);
    }
  }
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
  const url = shareUrl(g.id);
  const message = shareText(g);
  const name = `septemvri97-${g.date}.jpg`;
  const withFiles = fileShare();
  // Phones have their own share sheet with every app on them; computers also get direct links.
  const sheetOnly = !!navigator.share && matchMedia('(pointer: coarse)').matches;

  const canvas = el('canvas', { class: 'share-poster', width: W, height: H, role: 'img', 'aria-label': message });
  const hint = el('p', { class: 'share-hint', text: withFiles ? '' : 'За Instagram: запазете картинката и я качете като история или публикация.' });
  const native = navigator.share
    ? el('button', { type: 'button', class: 'btn btn-primary share-native', autofocus: true }, withFiles ? 'Сподели картинката' : 'Сподели')
    : null;
  const copy = el('button', { type: 'button', class: 'share-app' }, 'Копирай линка');
  const save = el('button', { type: 'button', class: 'share-app' }, 'Запази картинката');
  const close = el('button', { type: 'button', class: 'share-close', 'aria-label': 'Затвори', autofocus: !native });
  const app = (label, href, blank = true) => el('a', { class: 'share-app', href, target: blank ? '_blank' : null, rel: blank ? 'noopener' : null }, label);
  const withLink = encodeURIComponent(`${message}\n${url}`);

  const dialog = el('dialog', { class: 'share-dialog', 'aria-labelledby': 'share-title' },
    el('div', { class: 'share-box' },
      el('div', { class: 'share-preview' }, canvas),
      el('div', { class: 'share-side' },
        el('h2', { class: 'share-title', id: 'share-title', text: 'Сподели мача' }),
        el('p', { class: 'share-text', text: message }),
        native,
        el('div', { class: 'share-apps' },
          sheetOnly ? null : [
            app('Facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`),
            app('Viber', `viber://forward?text=${withLink}`, false),
            app('WhatsApp', `https://wa.me/?text=${withLink}`),
          ],
          copy, save),
        hint)),
    close);

  let file = null;
  const ready = drawPoster(canvas, g)
    .then(() => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92)))
    .then((blob) => {
      if (blob) file = new File([blob], name, { type: 'image/jpeg' });
    })
    .catch(() => {});

  // Called straight from the click, so the browser still counts it as the visitor's action. In the
  // split second before the picture is ready, only the link is shared.
  native?.addEventListener('click', () => {
    const data = file && withFiles ? { files: [file], title: 'Септември 97', text: `${message}\n${url}` } : { title: 'Септември 97', text: message, url };
    navigator.share(data).catch((e) => {
      if (e.name !== 'AbortError') hint.textContent = 'Споделянето не успя. Опитайте с бутоните отдолу.';
    });
  });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = 'Копирано';
      announce('Линкът е копиран.');
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
