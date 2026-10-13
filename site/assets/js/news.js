// The club's latest Facebook posts as cards. They are copied into data/posts.json when the site is published
// (scraper/facebook.mjs), so the visitor's browser never contacts Facebook. Without copied posts the
// section keeps the click-to-load Facebook box (fb.js).
import { el, cls } from './lib/dom.js';
import { initFacebook } from './fb.js';

const MAX = 5;
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
  return el('li', { class: cls('post', i === 0 && 'post-lead', !p.image && 'post-noimg') },
    el('a', { class: 'post-link', href: p.url, target: '_blank', rel: 'noopener' },
      p.image ? el('img', { src: p.image, alt: '', loading: i === 0 ? null : 'lazy', decoding: 'async' }) : null,
      el('span', { class: 'post-body' },
        el('time', { class: 'post-date', datetime: p.date, text: showDate(p.date) }),
        p.text ? el('span', { class: 'post-msg', text: p.text }) : null,
        el('span', { class: 'post-more link-arrow', text: 'Виж във Facebook' }))));
}

export async function initNews({ demo, pageUrl }) {
  const list = document.getElementById('posts');
  let posts = [];
  try {
    const res = await fetch(demo ? 'data/sample-posts.json' : 'data/posts.json', { signal: AbortSignal.timeout(8000) });
    if (res.ok) posts = ((await res.json())?.posts ?? []).map(valid).filter(Boolean).slice(0, MAX);
  } catch { /* no copied posts yet: the Facebook box below */ }

  if (!list || posts.length === 0) {
    initFacebook(pageUrl);
    return;
  }
  // The grids are made for 1, 2, 3 or 5 cards; with 4, the oldest waits for the next post.
  if (posts.length === 4) posts.pop();
  document.getElementById('fb')?.remove();
  list.closest('section')?.classList.add('has-posts');
  list.dataset.count = posts.length;
  list.replaceChildren(...posts.map(card));
  list.hidden = false;
}
