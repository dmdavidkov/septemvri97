// The club's latest Facebook posts as a row of cards: four at a time on wide screens, the rest with the arrows
// or by swiping. They are copied into data/posts.json when the site is published (scraper/facebook.mjs), so the
// visitor's browser never contacts Facebook. Without copied posts the section keeps the click-to-load box (fb.js).
import { el, cls, reducedMotion } from './lib/dom.js';
import { initFacebook } from './fb.js';

const MAX = 8;
const IMAGE = /^assets\/(fb|img)\/[\w-]+\.(jpe?g|png|webp)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const dayMonth = new Intl.DateTimeFormat('bg-BG', { timeZone: 'UTC', day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('bg-BG', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const sofiaYear = () => new Intl.DateTimeFormat('en', { timeZone: 'Europe/Sofia', year: 'numeric' }).format(new Date());

const isFacebookUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'facebook.com' || u.hostname.endsWith('.facebook.com'));
  } catch {
    return false;
  }
};

function valid(p) {
  if (!p || typeof p !== 'object' || !DATE.test(p.date ?? '') || !isFacebookUrl(p.url)) return null;
  const text = typeof p.text === 'string' ? p.text : '';
  const image = typeof p.image === 'string' && IMAGE.test(p.image) ? p.image : null;
  return text || image ? { date: p.date, text, image, url: p.url } : null;
}

function showDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return (iso.slice(0, 4) === sofiaYear() ? dayMonth : dayMonthYear).format(d).replace(/\s*г\.$/, '');
}

function card(p, i) {
  return el('li', { class: cls('post', !p.image && 'post-noimg') },
    el('a', { class: 'post-link', href: p.url, target: '_blank', rel: 'noopener' },
      p.image ? el('img', { src: p.image, alt: '', loading: i < 4 ? null : 'lazy', decoding: 'async' }) : null,
      el('span', { class: 'post-body' },
        el('time', { class: 'post-date', datetime: p.date, text: showDate(p.date) }),
        p.text ? el('span', { class: 'post-msg', text: p.text }) : null,
        el('span', { class: 'post-more link-arrow', text: 'Виж във Facebook' }))));
}

// Arrow buttons for mouse users; they hide themselves while everything fits.
function arrows(rail, list) {
  const prev = el('button', { type: 'button', class: 'rail-btn rail-prev', 'aria-label': 'По-нови публикации' });
  const next = el('button', { type: 'button', class: 'rail-btn rail-next', 'aria-label': 'По-стари публикации' });
  const step = (dir) => list.scrollBy({ left: dir * list.clientWidth * 0.9, behavior: reducedMotion() ? 'auto' : 'smooth' });
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  const update = () => {
    prev.disabled = list.scrollLeft <= 4;
    next.disabled = list.scrollLeft >= list.scrollWidth - list.clientWidth - 4;
  };
  list.addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  rail.append(prev, next);
  update();
}

export async function initNews({ demo, pageUrl }) {
  const rail = document.getElementById('rail');
  const list = document.getElementById('posts');
  let posts = [];
  try {
    // GitHub Pages lets browsers reuse files for 10 minutes; no-cache asks the server each time (a cheap 304 if unchanged).
    const res = await fetch(demo ? 'data/sample-posts.json' : 'data/posts.json', { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
    if (res.ok) posts = ((await res.json())?.posts ?? []).map(valid).filter(Boolean).slice(0, MAX);
  } catch { /* no copied posts yet: the Facebook box below */ }

  if (!rail || !list || posts.length === 0) {
    initFacebook(pageUrl);
    return;
  }
  document.getElementById('fb')?.remove();
  list.closest('section')?.classList.add('has-posts');
  list.replaceChildren(...posts.map(card));
  rail.hidden = false;
  arrows(rail, list);
}
