// Cause picker: the needs from the Sheet, where the club keeps its general cause as a row too. "Общо за клуба"
// below is only for when the Sheet has no open causes (not connected, unreachable or empty). Money never touches the site:
// donors pay through an allow-listed payment page or by bank transfer with the cause code as reference.
import { el, onVisible, announce, mailto } from './lib/dom.js';
import { checkPayUrl, providerName, formatEuro, dateParts } from './lib/values.js';

const GENERAL = {
  code: '',
  title: 'Общо за клуба',
  description: 'Където е най-нужно: зали, треньори, екипи и пътувания за всички отбори.',
  team: '',
  goal: null,
  collected: 0,
};

const groupIban = (iban) => iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

// The bar fills up when it first comes into view; redrawn with new totals, it shows the amount straight away.
function progress(cause, animate) {
  const pct = Math.min(100, Math.round((cause.collected / cause.goal) * 100));
  const bar = el('progress', { max: 100, value: animate ? 0 : pct, 'aria-label': `Събрани ${pct}%` });
  if (animate) onVisible(bar, () => { bar.value = pct; });
  const deadline = cause.deadline ? dateParts(cause.deadline) : null;
  return el('span', { class: 'cause-progress' }, bar,
    el('span', { class: 'amounts' },
      el('span', {}, el('strong', { text: formatEuro(cause.collected) }), ` от ${formatEuro(cause.goal)}`),
      deadline ? el('span', { text: `срок ${deadline.day} ${deadline.month}` }) : null));
}

// Without a goal: what has been collected so far and the deadline, when the Sheet has them.
function noGoal(cause) {
  const deadline = cause.deadline ? dateParts(cause.deadline) : null;
  if (!cause.collected && !deadline) return null;
  return el('span', { class: 'cause-progress' },
    el('span', { class: 'amounts' },
      el('span', {}, cause.collected ? ['Събрани ', el('strong', { text: formatEuro(cause.collected) })] : null),
      deadline ? el('span', { text: `срок ${deadline.day} ${deadline.month}` }) : null));
}

function causeCard(cause, checked, onPick, animate) {
  const input = el('input', { type: 'radio', name: 'cause', value: cause.code || 'general', checked });
  const card = el('label', { class: 'cause' }, input,
    el('span', { class: 'cause-head' },
      cause.team ? el('span', { class: 'tag', text: cause.team }) : null,
      el('span', { class: 'cause-title', text: cause.title })),
    cause.description ? el('span', { class: 'cause-desc', text: cause.description }) : null,
    cause.goal ? progress(cause, animate) : noGoal(cause));
  input.addEventListener('change', () => onPick(cause, card));
  return card;
}

function copyButton(value, label) {
  const idle = () => ['Копирай', el('span', { class: 'sr-only', text: ` ${label}` })];
  const btn = el('button', { type: 'button', class: 'copy' }, idle());
  btn.addEventListener('click', async () => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      ok = false;
    }
    btn.replaceChildren(ok ? 'Копирано' : 'Неуспешно');
    btn.classList.toggle('done', ok);
    announce(ok ? `Копирано: ${label}.` : 'Копирането не успя – маркирайте текста ръчно.');
    setTimeout(() => { btn.replaceChildren(...idle()); btn.classList.remove('done'); }, 1800);
  });
  return btn;
}

const bankRow = (label, shown, value = shown) =>
  el('div', { class: 'bank-row' }, el('dt', { text: label }), el('dd', { text: shown }), copyButton(value, label));

function shareButton(cause, className) {
  // The current address keeps working before and after the custom domain is connected.
  const url = new URL(location.pathname, location.origin);
  if (cause.code) url.searchParams.set('cause', cause.code);
  url.hash = 'podkrepi';
  const label = cause.code ? 'Сподели каузата' : 'Сподели с приятели';
  const btn = el('button', { type: 'button', class: className }, label);
  btn.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: cause.title, text: `Подкрепете „${cause.title}“ – БК Септември 97`, url: url.href });
      } catch { /* closed by the visitor */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url.href);
      announce('Линкът е копиран.');
      btn.textContent = 'Линкът е копиран';
      setTimeout(() => { btn.textContent = label; }, 1800);
    } catch {
      announce('Копирането не успя.');
    }
  });
  return btn;
}

const CONFETTI = ['#DA162D', '#F64E5A', '#FCFCFC', '#E5C35F'];

// Donors coming back from the payment page: a popup they can't miss, with the emblem and a burst of confetti.
function thankYou(cause) {
  const confetti = el('span', { class: 'thanks-confetti' });
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * 2 * Math.PI + Math.random() * 0.3;
    const distance = 72 + Math.random() * 56;
    const piece = el('i', { class: i % 3 ? null : 'round' });
    piece.style.setProperty('--x', `${Math.round(Math.cos(angle) * distance)}px`);
    piece.style.setProperty('--y', `${Math.round(Math.sin(angle) * distance - 16)}px`);
    piece.style.setProperty('--r', `${Math.round(Math.random() * 540 - 270)}deg`);
    piece.style.setProperty('--c', CONFETTI[i % CONFETTI.length]);
    piece.style.setProperty('--d', `${Math.round(Math.random() * 120)}ms`);
    confetti.append(piece);
  }
  const done = el('button', { type: 'button', class: 'btn btn-ghost', autofocus: true }, 'Затвори');
  const close = el('button', { type: 'button', class: 'share-close', 'aria-label': 'Затвори' });
  const dialog = el('dialog', { class: 'thanks-dialog', 'aria-labelledby': 'thanks-title', 'aria-describedby': 'thanks-text' },
    el('span', { class: 'thanks-mark', 'aria-hidden': 'true' }, confetti, el('img', { src: 'assets/img/emblem.svg', width: 96, height: 96, alt: '' })),
    el('h2', { class: 'thanks-title', id: 'thanks-title', text: 'Благодарим ви!' }),
    el('p', { class: 'thanks-text', id: 'thanks-text' },
      cause ? ['Подкрепихте ', el('strong', { text: `„${cause.title}“` }), '. '] : null,
      'Дарението ви ще се добави към събраната сума до около 20 минути.'),
    el('div', { class: 'thanks-actions' }, shareButton(cause || GENERAL, 'btn btn-primary'), done),
    close);
  for (const btn of [done, close]) btn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

export function initDonate({ config, needs, notice }) {
  const donateEl = document.getElementById('donate');
  const causesEl = document.getElementById('causes');
  const panel = document.getElementById('donate-panel');
  const noticeEl = document.getElementById('donate-notice');
  const coveredBox = document.getElementById('covered');
  const titleEl = document.getElementById('podkrepi-title');
  const introEl = document.getElementById('podkrepi-intro');
  const manyTexts = [titleEl.textContent, introEl.textContent];

  const generalPay = checkPayUrl(config.generalPayLink, config.payHosts);
  const general = { ...GENERAL, pay: generalPay.ok ? generalPay : null };
  // With no causes in the Sheet there is nothing to choose: the panel takes the whole width.
  let single = false;
  let selected = null;

  // ?cause=N014 preselects a cause; a covered or unknown code falls back to the first one.
  // Stripe sends donors back with ?dar=N014 (wiki: Stripe): they are thanked and see the cause they gave to.
  const search = new URLSearchParams(location.search);
  const thanked = search.has('dar');
  const wanted = (search.get('cause') || search.get('dar') || '').trim().toUpperCase();
  const notes = [notice];
  if (wanted && !thanked && needs.some((n) => n.covered && n.code === wanted)) notes.push('Тази кауза вече е покрита – благодарим! Можете да подкрепите друга.');
  noticeEl.textContent = notes.filter(Boolean).join(' ');
  noticeEl.hidden = !noticeEl.textContent;

  if (thanked) {
    thankYou(wanted && needs.find((n) => n.code === wanted));
    // A reload or a shared link shouldn't thank again.
    const url = new URL(location.href);
    url.searchParams.delete('dar');
    history.replaceState(history.state, '', url);
  }

  // Neither a payment link nor the IBAN is published yet: one block that asks donors to write.
  function writeUsBlock(cause, reference) {
    const body = `Здравейте,\n\nИскам да подкрепя „${cause.title}“. Моля, изпратете ми банковата сметка на клуба.\n`;
    return el('div', { class: 'panel-block' },
      el('h4', { text: 'Как да дарите' }),
      el('p', { text: 'Плащането с карта и банковата сметка на клуба ще бъдат публикувани тук съвсем скоро. Дотогава ни пишете и ще ви изпратим данните за превод.' }),
      el('a', { class: 'btn btn-primary', href: mailto(config.email, reference, body) }, 'Пишете ни'),
      el('dl', { class: 'bank' }, bankRow('Основание', reference)));
  }

  function onlineBlock(cause) {
    if (!cause.pay) return null;
    const block = el('div', { class: 'panel-block' }, el('h4', { text: 'Дари онлайн' }));
    if (cause.pay.placeholder) {
      block.append(
        el('button', { type: 'button', class: 'btn btn-soon', disabled: true }, 'Плащане с карта – скоро'),
        el('p', { class: 'pay-hint', text: 'Дотогава можете да дарите по банков път.' }));
    } else {
      const provider = providerName(cause.pay.host) || cause.pay.host;
      block.append(
        el('a', { class: 'btn btn-primary', href: cause.pay.url, target: '_blank', rel: 'noopener noreferrer' }, 'Дари онлайн'),
        el('p', { class: 'pay-hint', text: `Плащането става на защитената страница на ${provider}.` }));
    }
    return block;
  }

  function bankBlock(reference) {
    const { recipient, iban, bic, bankName } = config.bank;
    const block = el('div', { class: 'panel-block' }, el('h4', { text: 'По банков път' }));
    if (!iban) {
      block.append(
        el('p', {}, 'Банковата сметка ще бъде публикувана тук съвсем скоро. Дотогава ни пишете на ',
          el('a', { href: mailto(config.email, reference), text: config.email }), ' и ще ви я изпратим.'),
        el('dl', { class: 'bank' }, bankRow('Основание', reference)));
      return block;
    }
    block.append(el('dl', { class: 'bank' },
      bankRow('Получател', recipient),
      bankRow('IBAN', groupIban(iban), iban.replace(/\s+/g, '')),
      bic ? bankRow('BIC', bic) : null,
      bankRow('Основание', reference)));
    if (bankName) block.append(el('p', { class: 'pay-hint', text: bankName }));
    return block;
  }

  function companyBlock(cause) {
    const what = cause.code ? `${cause.code} ${cause.title}` : 'общо за клуба';
    const body = `Здравейте,\n\nИскаме да подкрепим „${cause.title}“ като фирма.\n\nФирма:\nЕИК:\nСума:\nЛице за контакт и телефон:\n`;
    return el('div', { class: 'panel-block' },
      el('h4', { text: 'Фирма сте?' }),
      el('p', { text: 'Пишете ни – ще подготвим договор за дарение или спонсорство и документи за вашето счетоводство.' }),
      el('a', { class: 'btn btn-ghost btn-small', href: mailto(config.email, `Дарение/спонсорство – ${what}`, body) }, 'Изпратете запитване'));
  }

  const shareBlock = (cause) => el('div', { class: 'panel-actions' }, shareButton(cause, 'btn btn-ghost btn-small'));

  let head;
  let body;
  let share;
  function renderPanel(cause) {
    const reference = cause.code ? `Дарение ${cause.code}` : 'Дарение';
    const left = cause.goal ? Math.max(0, cause.goal - cause.collected) : 0;
    const payReady = cause.pay && !cause.pay.placeholder;
    head = el('div', { class: 'panel-head' },
      el('p', { class: 'panel-kicker', text: cause.code ? `Кауза ${cause.code}` : 'Дарение' }),
      el('h3', { class: 'panel-title', text: cause.title }),
      // The cause card isn't shown when it is the only option, so its description goes here.
      single && cause.description ? el('p', { class: 'muted', text: cause.description }) : null,
      el('p', { class: 'muted', text: cause.goal ? `Остават ${formatEuro(left)} до целта.` : 'Всяка сума помага.' }));
    body = el('div', { class: 'panel-body' },
      payReady || config.bank.iban ? [onlineBlock(cause), bankBlock(reference)] : writeUsBlock(cause, reference),
      companyBlock(cause));
    share = shareBlock(cause);
    panel.replaceChildren(head, body);
  }

  // Phones: the panel opens right under the chosen cause. Wider screens keep it in its own column.
  // Sharing comes last, except in the wide single-cause panel, where it fills the left column under the title.
  const wideScreen = matchMedia('(min-width: 960px)');
  function placePanel() {
    const card = !single && !wideScreen.matches && causesEl.querySelector('input:checked')?.closest('.cause');
    if (card) card.after(panel);
    else if (panel.parentElement !== donateEl) donateEl.append(panel);
    (single && wideScreen.matches ? head : body).append(share);
  }

  function pick(cause, card) {
    // Moving the panel shifts the cards below it; keep the tapped card where it was on screen.
    const before = card.getBoundingClientRect().top;
    selected = cause;
    renderPanel(cause);
    placePanel();
    window.scrollBy(0, card.getBoundingClientRect().top - before);
    announce(`Избрано: ${cause.title}`);
  }

  // Draws the causes, and again when new card totals arrive (main.js), keeping the visitor's choice and focus.
  function show(list, animate) {
    const open = list.filter((n) => !n.covered);
    const covered = list.filter((n) => n.covered);
    const options = open.length ? open : [general];
    single = options.length === 1;
    const code = selected ? selected.code : wanted;
    selected = (code && open.find((n) => n.code === code)) || options[0];
    const focused = causesEl.contains(document.activeElement) ? document.activeElement.value : null;

    donateEl.classList.toggle('single', single);
    causesEl.hidden = single;
    titleEl.textContent = single ? 'Подкрепете отбора' : manyTexts[0];
    introEl.textContent = single
      ? 'Даренията отиват директно в клуба, без посредници. Скоро тук ще можете да изберете и конкретна кауза – пътуване до турнир, топки или екипи.'
      : manyTexts[1];
    causesEl.replaceChildren(
      el('legend', { class: 'sr-only', text: 'Изберете кауза' }),
      ...options.map((c) => causeCard(c, c === selected, pick, animate)));
    renderPanel(selected);
    placePanel();
    if (focused) causesEl.querySelector(`input[value="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });

    coveredBox.hidden = !covered.length;
    document.getElementById('covered-list').replaceChildren(...covered.map((n) =>
      el('li', {}, el('span', { text: n.title }), el('span', { class: 'muted', text: formatEuro(n.goal) }))));
  }

  show(needs, true);
  wideScreen.addEventListener('change', placePanel);
  if (wanted || thanked || location.hash === '#podkrepi') document.getElementById('podkrepi').scrollIntoView();
  return { update: (list) => show(list, false) };
}
