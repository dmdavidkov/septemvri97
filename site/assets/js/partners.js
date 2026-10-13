// Partner packages from the Sheet tab "Пакети", one card per row. With none (tab empty, not connected or
// unreachable), the section keeps the "write to us" block that index.html has.
import { el, cls, mailto } from './lib/dom.js';
import { providerName } from './lib/values.js';

function tierCard(p, email) {
  const subject = `Партньорство – ${p.name}`;
  // A real payment link gets the main button; writing to the club is always possible.
  const online = p.pay && !p.pay.placeholder;
  const actions = online
    ? [
      el('a', { class: 'btn btn-primary', href: p.pay.url, target: '_blank', rel: 'noopener noreferrer' }, 'Плати онлайн'),
      el('p', { class: 'tier-hint' }, `Чрез ${providerName(p.pay.host) || p.pay.host} – или `, el('a', { href: mailto(email, subject), text: 'ни пишете' }), '.'),
    ]
    : el('a', { class: cls('btn', p.highlight ? 'btn-primary' : 'btn-outline'), href: mailto(email, subject) }, 'Пишете ни');
  return el('li', { class: cls('tier', p.highlight && 'tier-top') },
    el('h3', { text: p.name }),
    p.price ? el('p', { class: cls('price', !p.amount && 'words') }, el('span', { text: p.price })) : null,
    el('ul', {}, p.benefits.map((b) => el('li', { text: b }))),
    actions);
}

export function initPartners({ config, packages }) {
  const box = document.getElementById('packages');
  if (!box || !packages.length) return;
  const list = el('ol', { class: 'tiers' }, packages.map((p) => tierCard(p, config.email)));
  // Wide screens: one row for up to four. A single package keeps the width of two.
  list.style.setProperty('--tiers', String(Math.min(4, Math.max(2, packages.length))));
  box.replaceChildren(list);
}
