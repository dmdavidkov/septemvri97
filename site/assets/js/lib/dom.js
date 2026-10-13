// Tiny DOM helpers. Text always goes in through textContent / text nodes, never as HTML.

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

export const cls = (...names) => names.filter(Boolean).join(' ');

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Runs fn once when the node scrolls into view (immediately when motion is reduced).
const pending = new WeakMap();
let observer;
export function onVisible(node, fn) {
  if (!('IntersectionObserver' in window) || reducedMotion()) {
    fn();
    return;
  }
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      pending.get(entry.target)?.();
      pending.delete(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  pending.set(node, fn);
  observer.observe(node);
}

// Screen-reader announcement through the page's polite live region.
export function announce(text) {
  const region = document.getElementById('sr-status');
  if (!region) return;
  region.textContent = '';
  setTimeout(() => { region.textContent = text; }, 50);
}

export function mailto(email, subject, body = '') {
  const q = new URLSearchParams({ subject });
  if (body) q.set('body', body);
  // URLSearchParams encodes spaces as "+", which mail clients show literally.
  return `mailto:${email}?${q.toString().replace(/\+/g, '%20')}`;
}
