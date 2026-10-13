// Cause picker: needs from the Sheet plus "Общо за клуба". Money never touches the site:
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

function progress(cause) {
  const pct = Math.min(100, Math.round((cause.collected / cause.goal) * 100));
  const bar = el('progress', { max: 100, value: 0, 'aria-label': `Събрани ${pct}%` });
  onVisible(bar, () => { bar.value = pct; });
  const deadline = cause.deadline ? dateParts(cause.deadline) : null;
  return el('span', { class: 'cause-progress' }, bar,
    el('span', { class: 'amounts' },
      el('span', {}, el('strong', { text: formatEuro(cause.collected) }), ` от ${formatEuro(cause.goal)}`),
      deadline ? el('span', { text: `срок ${deadline.day} ${deadline.month}` }) : null));
}

function causeCard(cause, checked, onPick) {
  const input = el('input', { type: 'radio', name: 'cause', value: cause.code || 'general', checked });
  input.addEventListener('change', () => onPick(cause));
  return el('label', { class: 'cause' }, input,
    el('span', { class: 'cause-head' },
      cause.team ? el('span', { class: 'tag', text: cause.team }) : null,
      el('span', { class: 'cause-title', text: cause.title })),
    cause.description ? el('span', { class: 'cause-desc', text: cause.description }) : null,
    cause.goal ? progress(cause) : null);
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

export function initDonate({ config, needs, notice }) {
  const causesEl = document.getElementById('causes');
  const panel = document.getElementById('donate-panel');
  const noticeEl = document.getElementById('donate-notice');
  const coveredBox = document.getElementById('covered');

  const generalPay = checkPayUrl(config.generalPayLink, config.payHosts);
  const general = { ...GENERAL, pay: generalPay.ok ? generalPay : null };
  const open = needs.filter((n) => !n.covered);
  const covered = needs.filter((n) => n.covered);
  const options = [...open, general];

  // ?cause=N014 preselects a cause; a covered or unknown code falls back to the club in general.
  const wanted = (new URLSearchParams(location.search).get('cause') || '').trim().toUpperCase();
  let selected = (wanted && open.find((n) => n.code === wanted)) || (wanted ? general : options[0]);
  const notes = [notice];
  if (wanted && covered.some((n) => n.code === wanted)) notes.push('Тази кауза вече е покрита – благодарим! Можете да подкрепите клуба като цяло.');
  noticeEl.textContent = notes.filter(Boolean).join(' ');
  noticeEl.hidden = !noticeEl.textContent;

  function onlineBlock(cause) {
    if (!cause.pay) return null;
    const block = el('div', { class: 'panel-block' }, el('h4', { text: 'Дари онлайн' }));
    if (cause.pay.placeholder) {
      block.append(
        el('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Онлайн дарение – скоро'),
        el('p', { class: 'pay-hint', text: config.bank.iban
          ? 'Подготвяме плащането с карта. Дотогава можете да дарите по банков път.'
          : 'Подготвяме плащането с карта. Дотогава ни пишете и ще ви изпратим банковата сметка.' }));
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
      el('a', { class: 'btn btn-ghost btn-small', href: mailto(config.email, `Дарение/спонсорство – ${what}`, body) }, 'Пишете ни'));
  }

  function shareBlock(cause) {
    // The current address keeps working before and after the custom domain is connected.
    const url = new URL(location.pathname, location.origin);
    if (cause.code) url.searchParams.set('cause', cause.code);
    url.hash = 'podkrepi';
    const btn = el('button', { type: 'button', class: 'btn btn-ghost btn-small' }, 'Сподели каузата');
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
        setTimeout(() => { btn.textContent = 'Сподели каузата'; }, 1800);
      } catch {
        announce('Копирането не успя.');
      }
    });
    return el('div', { class: 'panel-actions' }, btn);
  }

  function renderPanel(cause) {
    const reference = cause.code ? `Дарение ${cause.code}` : 'Дарение';
    const left = cause.goal ? Math.max(0, cause.goal - cause.collected) : 0;
    panel.replaceChildren(
      el('p', { class: 'panel-kicker', text: cause.code ? `Кауза ${cause.code}` : 'Дарение' }),
      el('h3', { class: 'panel-title', text: cause.title }),
      el('p', { class: 'muted', text: cause.goal ? `Остават ${formatEuro(left)} до целта.` : 'Всяка сума помага.' }),
      onlineBlock(cause),
      bankBlock(reference),
      companyBlock(cause),
      shareBlock(cause));
  }

  function pick(cause) {
    selected = cause;
    renderPanel(cause);
    announce(`Избрано: ${cause.title}`);
  }

  causesEl.replaceChildren(
    el('legend', { class: 'sr-only', text: 'Изберете кауза' }),
    ...options.map((c) => causeCard(c, c === selected, pick)));
  renderPanel(selected);

  coveredBox.hidden = !covered.length;
  document.getElementById('covered-list').replaceChildren(...covered.map((n) =>
    el('li', {}, el('span', { text: n.title }), el('span', { class: 'muted', text: formatEuro(n.goal) }))));

  if (wanted || location.hash === '#podkrepi') document.getElementById('podkrepi').scrollIntoView();
}
