'use strict';

const refreshButton = document.getElementById('dashboardRefresh');
const statusMessage = document.getElementById('dashboardStatus');
const yearSelect = document.getElementById('baseYear');
const baseView = document.getElementById('baseSummary');
const registrationView = document.getElementById('registrationSummary');
const number = new Intl.NumberFormat('ru');
const classOrder = new Intl.Collator('ru', { numeric: true });
const badgeColumns = [
  ['took', 'Сдавали'], ['gold', 'Золото'], ['silver', 'Серебро'],
  ['bronze', 'Бронза'], ['noBadge', 'Без знака']
];
let years = [];
let dateToClose = null;
const cacheKey = 'gto_dashboard_snapshot_v1';
let snapshot = {};
let registrationVersion = 0;

function readSnapshot(endpoint) {
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey));
    if (saved?.endpoint === endpoint.href) {
      return {
        registration: Array.isArray(saved.registration?.dates) ? saved.registration : undefined,
        base: Array.isArray(saved.base?.years) ? saved.base : undefined
      };
    }
  } catch (error) {}
  return {};
}

function saveSnapshot(endpoint) {
  try { localStorage.setItem(cacheKey, JSON.stringify({ endpoint: endpoint.href, ...snapshot })); } catch (error) {}
}
const closeDialog = document.getElementById('closeRegistrationDialog');
const closeForm = document.getElementById('closeRegistrationForm');
const closeCode = document.getElementById('closeRegistrationCode');
const closeError = document.getElementById('closeRegistrationError');
const cancelClose = document.getElementById('cancelCloseRegistration');

function dashboardEndpoint() {
  let endpoint = document.body.dataset.defaultApi;
  try { endpoint = localStorage.getItem('gto_apps_script_url') || endpoint; } catch (error) {}
  return new URL(endpoint);
}

function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function classTable(columns, rows) {
  const table = element('table', '', 'dash-table');
  const header = table.createTHead().insertRow();
  ['Класс', ...columns].forEach(label => {
    const cell = element('th', label);
    cell.scope = 'col';
    header.append(cell);
  });
  const body = table.createTBody();
  rows.sort(([a], [b]) => classOrder.compare(a, b)).forEach(([label, ...counts]) => {
    const row = body.insertRow();
    const name = element('th', label);
    name.scope = 'row';
    row.append(name);
    counts.forEach(count => {
      const cell = row.insertCell();
      cell.className = 'mono';
      cell.textContent = number.format(count);
    });
  });
  return table;
}

function renderRegistration(registration, fresh = true) {
  if (registration.error || !registration.dates.length) {
    registrationView.replaceChildren(element('p', registration.error || 'Нет записей о регистрации.', 'dash-note'));
    return;
  }
  const expanded = new Set(Array.from(registrationView.querySelectorAll('details[open]'),
    details => details.dataset.date));
  registrationView.replaceChildren(...registration.dates.map(date => {
    const details = element('details', '', 'dash-date');
    details.dataset.date = String(date.sheetId ?? date.name);
    details.open = expanded.has(details.dataset.date);
    const summary = element('summary');
    summary.append(element('strong', date.name), element('span', number.format(date.count) + ' чел.', 'mono'));
    details.append(summary);
    if (date.count) details.append(classTable(['Зарегистрировано'], Object.entries(date.classes)));
    else details.append(element('p', 'Пока нет заявок.', 'dash-note'));
    const card = element('div', '', 'dash-date-card');
    card.append(details);
    if (date.closed === true || (fresh && date.closed === false)) {
      const actions = element('div', '', 'dash-date-actions');
      renderDateAction(actions, date);
      card.append(actions);
    }
    return card;
  }));
}

function renderDateAction(actions, date) {
  if (date.closed) {
    actions.replaceChildren(element('span', 'Запись закрыта', 'dash-date-state'));
    return;
  }
  const button = element('button', 'Закрыть', 'btn');
  button.type = 'button';
  button.setAttribute('aria-label', 'Закрыть запись на ' + date.name);
  button.addEventListener('click', () => {
    dateToClose = { date, actions };
    closeForm.reset();
    closeError.textContent = '';
    document.getElementById('closeRegistrationDescription').textContent =
      date.name + '. Новые заявки на эту дату перестанут приниматься. Поданные заявки сохранятся.';
    closeDialog.showModal();
  });
  actions.replaceChildren(button);
}

closeForm.addEventListener('submit', async event => {
  event.preventDefault();
  const { date, actions } = dateToClose;
  const submit = closeForm.querySelector('[type=submit]');
  submit.disabled = cancelClose.disabled = true;
  closeError.textContent = '';
  const code = closeCode.value;
  closeCode.value = '';
  try {
    const endpoint = dashboardEndpoint();
    if (endpoint.origin !== 'https://script.google.com') {
      closeError.textContent = 'Для закрытия укажите HTTPS-адрес Google Apps Script.';
      return;
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'closeRegistration', sheetId: date.sheetId, code }),
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    if (!result.ok || result.closed !== true) {
      closeError.textContent = result.error || 'Сервер не подтвердил закрытие.';
      closeCode.focus();
      return;
    }
    registrationVersion++;
    date.closed = true;
    const savedDate = snapshot.registration?.dates.find(item => item.sheetId === date.sheetId);
    if (savedDate) {
      savedDate.closed = true;
      saveSnapshot(endpoint);
    }
    closeDialog.close();
    if (actions.isConnected) renderDateAction(actions, date);
    else if (snapshot.registration) renderRegistration(snapshot.registration);
  } catch (error) {
    closeError.textContent = 'Связь прервалась. Проверьте состояние даты перед повторной попыткой.';
  } finally {
    submit.disabled = cancelClose.disabled = false;
  }
});

cancelClose.addEventListener('click', () => closeDialog.close());
closeDialog.addEventListener('cancel', event => {
  if (cancelClose.disabled) event.preventDefault();
});
closeDialog.addEventListener('close', () => closeForm.reset());

function renderBase() {
  const year = years[Number(yearSelect.value)];
  if (!year) return;
  const cards = element('div', '', 'stats dash-cards');
  badgeColumns.forEach(([key, label]) => {
    const card = element('div', '', 'stat dash-card ' + key);
    card.append(element('span', label, 'lbl'), element('b', number.format(year.total[key]), 'mono'));
    cards.append(card);
  });
  const distribution = element('div', '', 'dash-distribution');
  distribution.setAttribute('aria-hidden', 'true');
  badgeColumns.slice(1).forEach(([key]) => {
    const count = year.total[key];
    if (!count) return;
    const segment = element('span', '', 'dash-color ' + key);
    segment.style.flexGrow = count;
    distribution.append(segment);
  });
  const rows = Object.entries(year.classes).map(([name, tally]) =>
    [name, ...badgeColumns.map(([key]) => tally[key])]
  );
  const note = element('p', 'Участники с результатами хотя бы одного испытания. Повторные сдачи за учебный год учтены один раз.', 'dash-note');
  baseView.replaceChildren(cards);
  if (!rows.length) {
    baseView.append(element('p', 'В этом разделе базы пока нет результатов.', 'dash-note'));
    return;
  }
  const tableArea = element('div', '', 'dash-scroll');
  tableArea.tabIndex = 0;
  tableArea.setAttribute('role', 'region');
  tableArea.setAttribute('aria-labelledby', 'baseClassesTitle');
  tableArea.append(classTable(badgeColumns.map(([, label]) => label), rows));
  const heading = element('h3', 'По классам');
  heading.id = 'baseClassesTitle';
  baseView.append(distribution, note, heading, tableArea);
}

function loadBase(base) {
  const previous = years[Number(yearSelect.value)]?.name;
  years = (base.years || []).slice().reverse();
  yearSelect.hidden = !years.length;
  yearSelect.replaceChildren(...years.map((year, i) =>
    new Option(year.name.replace(/^База сдавших\s+(?=\d)/i, ''), i)
  ));
  const selected = years.findIndex(year => year.name === previous);
  if (selected >= 0) yearSelect.value = selected;
  if (years.length) renderBase();
  else baseView.replaceChildren(element('p', base.error || 'В базе нет листов с результатами.', 'dash-note'));
}

async function loadDashboard() {
  if (refreshButton.disabled) return;
  refreshButton.disabled = true;
  const version = registrationVersion;
  const hasSnapshot = Boolean(snapshot.registration || snapshot.base);
  statusMessage.textContent = hasSnapshot ? 'Обновляем сводку…' : 'Загрузка сводки…';
  try {
    const endpoint = dashboardEndpoint();
    const url = new URL(endpoint);
    url.searchParams.set('view', 'dashboard');
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!data.ok || !data.registration || !data.base) {
      statusMessage.textContent = 'Сводка недоступна. Проверьте развёртывание Apps Script в главном протоколе.';
      if (hasSnapshot) statusMessage.textContent += ' Показаны сохранённые данные.';
      return;
    }

    const registrationOK = !data.registration.error && Array.isArray(data.registration.dates);
    const baseOK = !data.base.error && Array.isArray(data.base.years);
    if (registrationOK && version === registrationVersion) {
      snapshot.registration = data.registration;
      renderRegistration(snapshot.registration);
    } else if (!registrationOK && !snapshot.registration) {
      renderRegistration({ error: 'Не удалось обновить регистрацию.' });
    }
    if (baseOK) {
      snapshot.base = data.base;
      loadBase(snapshot.base);
    } else if (!snapshot.base) {
      loadBase({ error: 'Не удалось обновить базу.' });
    }
    if (registrationOK || baseOK) saveSnapshot(endpoint);

    const failed = [];
    if (!registrationOK) failed.push('регистрацию');
    if (!baseOK) failed.push('базу');
    const kept = (!registrationOK && snapshot.registration) || (!baseOK && snapshot.base);
    statusMessage.textContent = failed.length
      ? 'Не удалось обновить ' + failed.join(' и ') + '.' + (kept ? ' Показаны сохранённые данные.' : '')
      : '';
  } catch (error) {
    statusMessage.textContent = hasSnapshot
      ? 'Не удалось обновить сводку. Показаны сохранённые данные.'
      : 'Связь с таблицами недоступна. Нажмите «Обновить», чтобы повторить запрос.';
  } finally {
    refreshButton.disabled = false;
  }
}

yearSelect.addEventListener('change', renderBase);
refreshButton.addEventListener('click', loadDashboard);
window.addEventListener('pageshow', event => { if (event.persisted) loadDashboard(); });
try { snapshot = readSnapshot(dashboardEndpoint()); } catch (error) {}
if (snapshot.registration) renderRegistration(snapshot.registration, false);
if (snapshot.base) loadBase(snapshot.base);
loadDashboard();
