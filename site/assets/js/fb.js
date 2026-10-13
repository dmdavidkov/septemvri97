// Facebook posts load only after the visitor asks for them, so nothing reaches Meta before that.
// The choice is remembered on this device and can be withdrawn with the link under the posts.
import { el } from './lib/dom.js';

const KEY = 'fb-consent';

function remembered() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function remember(on) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* private mode: ask again next time */ }
}

export function initFacebook(pageUrl) {
  const box = document.getElementById('fb');
  const facade = box?.querySelector('.fb-facade');
  const button = document.getElementById('fb-load');
  if (!box || !facade || !button) return;

  function load() {
    const width = Math.max(180, Math.min(500, Math.floor(box.clientWidth - 24)));
    const src = new URL('https://www.facebook.com/plugins/page.php');
    src.search = new URLSearchParams({
      href: pageUrl, tabs: 'timeline', width, height: 720,
      small_header: 'true', adapt_container_width: 'true', hide_cover: 'false', show_facepile: 'false', locale: 'bg_BG',
    });
    const stop = el('button', { type: 'button', class: 'btn btn-outline btn-small' }, 'Не зареждай Facebook автоматично');
    stop.addEventListener('click', () => {
      remember(false);
      box.classList.remove('loaded');
      box.replaceChildren(facade);
      button.focus();
    });
    box.classList.add('loaded');
    box.replaceChildren(
      el('iframe', { src: src.href, width, height: 720, title: 'Публикации на БК Септември 97 във Facebook', loading: 'lazy', allow: 'encrypted-media' }),
      stop);
  }

  button.hidden = false;
  button.addEventListener('click', () => {
    remember(true);
    load();
  });
  if (remembered()) load();
}
