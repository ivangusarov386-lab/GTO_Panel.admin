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

function renderRegistration(registration) {
  if (registration.error || !registration.dates.length) {
    registrationView.replaceChildren(element('p', registration.error || 'Нет записей о регистрации.', 'dash-note'));
    return;
  }
  registrationView.replaceChildren(...registration.dates.map(date => {
    const details = element('details', '', 'dash-date');
    const summary = element('summary');
    summary.append(element('strong', date.name), element('span', number.format(date.count) + ' чел.', 'mono'));
    details.append(summary, classTable(['Зарегистрировано'], Object.entries(date.classes)));
    return details;
  }));
}

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
  refreshButton.disabled = true;
  statusMessage.textContent = 'Загрузка сводки…';
  try {
    let endpoint = document.body.dataset.defaultApi;
    try { endpoint = localStorage.getItem('gto_apps_script_url') || endpoint; } catch (error) {}
    const url = new URL(endpoint);
    url.searchParams.set('view', 'dashboard');
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!data.ok || !data.registration || !data.base) {
      statusMessage.textContent = 'Сводка недоступна. Проверьте, что в главном протоколе развёрнута версия Apps Script с панелью.';
      return;
    }
    renderRegistration(data.registration);
    loadBase(data.base);
    statusMessage.textContent = '';
  } catch (error) {
    statusMessage.textContent = 'Связь с таблицами недоступна. Нажмите «Обновить», чтобы повторить запрос.';
  } finally {
    refreshButton.disabled = false;
  }
}

yearSelect.addEventListener('change', renderBase);
refreshButton.addEventListener('click', loadDashboard);
loadDashboard();
