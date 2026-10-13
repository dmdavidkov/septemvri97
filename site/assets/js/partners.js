// Partner packages from the Sheet tab "Пакети", one card per row. With none (tab empty, not connected or
// unreachable), the section keeps the "write to us" block that index.html has.
import { el, cls, mailto } from './lib/dom.js';
import { providerName, formatNumber } from './lib/values.js';

// "1 000" large with a smaller "€"; a price in words ("по договаряне") on the same line. Always present, even
// empty, because every card has the same four rows (name, price, benefits, buttons) that line up in CSS.
function priceLine(p) {
  if (p.amount !== null) {
    return el('p', { class: 'price' }, el('span', { class: 'num', text: formatNumber(p.amount) }), el('span', { class: 'cur', text: '€' }));
  }
  return el('p', { class: 'price words' }, p.price ? el('span', { class: 'num', text: p.price }) : null);
}

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
    priceLine(p),
    el('ul', {}, p.benefits.map((b) => el('li', { text: b }))),
    el('div', { class: 'tier-actions' }, actions));
}

export function initPartners({ config, packages }) {
  const box = document.getElementById('packages');
  if (!box || !packages.length) return;
  const list = el('ol', { class: 'tiers' }, packages.map((p) => tierCard(p, config.email)));
  // Wide screens: one row for up to four. A single package keeps the width of two.
  list.style.setProperty('--tiers', String(Math.min(4, Math.max(2, packages.length))));
  box.replaceChildren(list);
}
