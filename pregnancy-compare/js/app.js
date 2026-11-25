import { renderDataView, wireDataView } from './data.js';
import { loadSample, buildModel, weekSummary, dateFor, FIRST_WEEK, LAST_WEEK } from './model.js';
import { SIZE_BY_WEEK } from './sizes.js';

const CATEGORY_ORDER = ['Symptoms', 'Digestion and stool', 'Appetite', 'Swelling', 'Mood', 'Other', 'Physical activity'];
const CAT_CLASS = { Symptoms: 'c-sym', 'Digestion and stool': 'c-dig', Appetite: 'c-app', Swelling: 'c-swe', Mood: 'c-mood', Other: 'c-oth', 'Physical activity': 'c-act' };
const GAP = 3; // day-count difference that counts as a big gap

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const sortTags = (keys) => keys.sort((a, b) => {
  const [ca, na] = a.split('|'), [cb, nb] = b.split('|');
  return CATEGORY_ORDER.indexOf(ca) - CATEGORY_ORDER.indexOf(cb) || na.localeCompare(nb);
});

const CAT_LABEL = { Symptoms: 'Symptoms', 'Digestion and stool': 'Digestion', Appetite: 'Appetite', Swelling: 'Swelling', Mood: 'Mood', Other: 'Other', 'Physical activity': 'Activity' };

let model, COLS = [], CUR, currentWeek;

// Category filter: which categories are shown. All on by default; remembered on this phone or computer.
const shown = new Set(CATEGORY_ORDER);
try { const saved = JSON.parse(localStorage.getItem('shownCategories')); if (Array.isArray(saved) && saved.length) { shown.clear(); saved.forEach((c) => shown.add(c)); } } catch {}
const saveShown = () => { try { localStorage.setItem('shownCategories', JSON.stringify([...shown])); } catch {} };
const allShown = () => CATEGORY_ORDER.every((c) => shown.has(c));
const isShown = (key) => shown.has(key.split('|')[0]);

// Chips grouped one category per line, so the types of data sit apart.
function groupedChips(keys, render) {
  const groups = [];
  for (const k of keys) {
    const cat = k.split('|')[0];
    if (!groups.length || groups[groups.length - 1].cat !== cat) groups.push({ cat, keys: [] });
    groups[groups.length - 1].keys.push(k);
  }
  return '<div class="groups">' + groups.map((g) => `<div class="chips" aria-label="${esc(CAT_LABEL[g.cat] || g.cat)}">${g.keys.map(render).join('')}</div>`).join('') + '</div>';
}

function renderKey() {
  $('#key').innerHTML = `<button type="button" class="key-all" data-cat="*" aria-pressed="${allShown()}">All</button>` +
    CATEGORY_ORDER.map((c) => `<button type="button" class="key-btn ${CAT_CLASS[c]}" data-cat="${esc(c)}" aria-pressed="${shown.has(c)}"><i></i>${CAT_LABEL[c]}</button>`).join('');
}

function chip(key, text, mark) {
  const [cat, name] = key.split('|');
  const m = mark === 'only' ? '<span class="mk mk-only" title="Not logged in the other pregnancy this week">◆</span>'
          : mark === 'gap' ? '<span class="mk mk-gap" title="Big difference in days logged">▲</span>' : '';
  return `<span class="chip ${CAT_CLASS[cat] || ''} ${mark ? 'is-' + mark : ''}">${m}${esc(name)}${text ? ` <b>${text}</b>` : ''}</span>`;
}

function cellHtml(s, others) {
  if (!s.hasData) return '<div class="empty">No data added</div>';
  if (!s.reached) return '<div class="empty">Not reached yet</div>';
  // Compare only with pregnancies that have something logged this week.
  const peers = s.loggedDays > 0 ? others.filter((o) => o.reached && o.loggedDays > 0) : [];
  const keys = sortTags([...s.tagCounts.keys()].filter(isShown));
  const denom = s.partial || 7;
  const head = `<div class="logged">${s.loggedDays} of ${denom} days logged${s.partial ? ' (so far)' : ''}</div>`;
  if (!keys.length) return head + `<div class="empty">${s.tagCounts.size ? 'Nothing in the categories shown' : 'Nothing logged'}</div>`;
  return head + groupedChips(keys, (k) => {
    const n = s.tagCounts.get(k), counts = peers.map((o) => o.tagCounts.get(k) || 0);
    const mark = !peers.length ? null
      : counts.every((o) => o === 0) ? 'only'
      : counts.some((o) => o > 0 && Math.abs(n - o) >= GAP) ? 'gap' : null;
    return chip(k, `${n}/${denom}`, mark);
  });
}

function devHtml(s) {
  if (!s.reached) return '';
  const d = s.device, f = (v, fn) => (v == null ? '–' : fn(v));
  return `<dl class="dev">
    <div><dt>Sleep</dt><dd>${f(d.sleepHours, (v) => v.toFixed(1) + ' h')}</dd></div>
    <div><dt>Rest HR</dt><dd>${f(d.restingHr, (v) => Math.round(v))}</dd></div>
    <div><dt>Steps</dt><dd>${f(d.steps, (v) => Math.round(v).toLocaleString())}</dd></div>
  </dl>`;
}

function colHeads(withStatus) {
  $('#colheads').style.setProperty('--n', COLS.length);
  $('#colheads').innerHTML = '<span class="wk-head">Week</span>' + COLS.map((p) => `<span>${p.label}${withStatus
    ? `<small>${!p.hasData ? 'no data added' : p.current ? `now: week ${p.lastWeek}, day ${p.lastDay}` : 'complete'}</small>` : ''}</span>`).join('');
  $('#colheads').hidden = false;
}

function renderMain() {
  $('#title').textContent = 'Week by week';
  colHeads(true);
  const n = COLS.length;
  let html = `<p class="legend"><span class="mk mk-only">◆</span> logged in only one pregnancy that week &nbsp; <span class="mk mk-gap">▲</span> ${GAP}+ days apart</p>`;
  for (let w = FIRST_WEEK; w <= LAST_WEEK; w++) {
    const sums = COLS.map((p) => weekSummary(p, w));
    const cur = w === currentWeek;
    html += `<a class="week ${cur ? 'is-current' : ''}" id="w${w}" href="#week-${w}" style="--n:${n}">
      <div class="row">
        <div class="wk">
          <span class="wk-num"><small>Week</small>${w}</span>
          ${cur ? '<em>now</em>' : ''}
          <span class="size">Size of ${articled(SIZE_BY_WEEK[w])}</span>
          <span class="more">Days ›</span>
        </div>
        ${sums.map((s, i) => `<div class="cell">${cellHtml(s, sums.filter((_, j) => j !== i))}</div>`).join('')}
      </div>
      <div class="row devrow"><div class="wk wk-dev">Watch</div>${sums.map((s) => `<div class="cell">${devHtml(s)}</div>`).join('')}</div>
    </a>`;
  }
  $('#app').innerHTML = html;
}

const articled = (s) => (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s;

function dayCell(preg, week, day) {
  const e = preg.days[`${week}-${day}`];
  const date = dateFor(preg.lmp, week, day);
  const reached = week < preg.lastWeek || (week === preg.lastWeek && day <= preg.lastDay);
  if (!preg.hasData) return '<div class="empty">No data added</div>';
  if (!reached) return '<div class="empty">Not reached yet</div>';
  let h = `<div class="date">${fmtDate(date)}</div>`;
  if (!e || !e.logged) h += '<div class="empty">Not logged</div>';
  else {
    const keys = sortTags(e.tags.map((t) => `${t.category}|${t.name}`).filter(isShown));
    h += keys.length ? groupedChips(keys, (k) => chip(k)) : (e.tags.length ? '<div class="empty">Nothing in the categories shown</div>' : '');
    if (e.note) h += `<p class="note">“${esc(e.note)}”</p>`;
    const extra = [e.weightKg != null && `Weight ${e.weightKg} kg`, e.waterGlasses != null && `Water ${e.waterGlasses} glasses`].filter(Boolean);
    if (extra.length) h += `<div class="extra">${extra.join(' · ')}</div>`;
  }
  const d = e && e.device;
  if (d) h += `<div class="extra dev-line">${[d.sleepHours != null && `Sleep ${d.sleepHours.toFixed(1)} h`, d.restingHr != null && `HR ${d.restingHr}`, d.steps != null && `${d.steps.toLocaleString()} steps`].filter(Boolean).join(' · ')}</div>`;
  return h;
}

function renderWeek(w, keepScroll = false) {
  $('#title').textContent = `Week ${w}`;
  colHeads(false);
  $('#colheads').querySelector('.wk-head').textContent = 'Day';
  const nav = `<nav class="wnav">
    <a href="#" data-back="${w}">‹ All weeks</a>
    <span>${w > FIRST_WEEK ? `<a href="#week-${w - 1}">‹ Wk ${w - 1}</a>` : ''}${w < LAST_WEEK ? `<a href="#week-${w + 1}">Wk ${w + 1} ›</a>` : ''}</span>
  </nav>`;
  let html = nav + `<p class="size-banner">Week ${w}: about the size of ${articled(SIZE_BY_WEEK[w])}</p>`;
  for (let d = 1; d <= 7; d++) {
    html += `<section class="day" style="--n:${COLS.length}"><div class="row"><div class="wk"><span class="wk-num"><small>Day</small>${d}</span></div>${COLS.map((p) => `<div class="cell">${dayCell(p, w, d)}</div>`).join('')}</div></section>`;
  }
  $('#app').innerHTML = html + nav;
  if (!keepScroll) window.scrollTo(0, 0);
}

let lastMainWeek = null;
function route() {
  $('#key').hidden = location.hash === '#data';
  if (location.hash === '#data') { renderDataView(model); return; }
  if (!model) return;
  const m = location.hash.match(/^#week-(\d+)$/);
  const w = m && Math.min(LAST_WEEK, Math.max(FIRST_WEEK, +m[1]));
  if (w) { renderWeek(w); $('#jump').value = w; lastMainWeek = w; return; }
  renderMain();
  const target = lastMainWeek || currentWeek;
  $('#jump').value = target;
  scrollToWeek(target, false);
}

function scrollToWeek(w, smooth = true) {
  const el = document.getElementById('w' + w);
  if (!el) return;
  const offset = $('.top').getBoundingClientRect().bottom + 8;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: smooth ? 'smooth' : 'auto' });
}

// Redraw the current view after a filter change without losing your place.
function redraw() {
  const m = location.hash.match(/^#week-(\d+)$/);
  if (m) { const y = window.scrollY; renderWeek(+m[1], true); window.scrollTo(0, y); return; }
  if (location.hash === '#data') return;
  const top = $('.top').getBoundingClientRect().bottom;
  const visible = [...document.querySelectorAll('.week')].find((el) => el.getBoundingClientRect().bottom > top + 10);
  renderMain();
  if (visible) scrollToWeek(+visible.id.slice(1), false);
}

// Swap in a model (sample or the viewer's own files) and redraw.
function useModel(m) {
  model = m;
  COLS = model.order; CUR = model.current;
  document.body.style.setProperty('--n', COLS.length);
  document.body.classList.toggle('n3', COLS.length >= 3);
  currentWeek = Math.min(LAST_WEEK, Math.max(FIRST_WEEK, CUR.lastWeek || FIRST_WEEK));
  const sel = $('#jump');
  sel.innerHTML = '';
  for (let w = FIRST_WEEK; w <= LAST_WEEK; w++) sel.add(new Option(w === currentWeek ? `${w} (now)` : String(w), w));
  const own = m.kind === 'own';
  document.body.classList.toggle('is-own', own);
  $('#banner').textContent = own
    ? 'Your data. It stays on this phone or computer and is gone when you close the page.'
    : 'Sample data. Everything here is invented.';
  $('#addbtn').textContent = own ? 'Change data' : 'Add your data';
  lastMainWeek = null;
  if (location.hash) location.hash = ''; else route();
}

// Theme: System -> Light -> Dark. Remembered on this device only.
const THEMES = ['system', 'light', 'dark'];
function applyTheme(t) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const b = $('#theme');
  b.textContent = { system: 'Auto', light: 'Light', dark: 'Dark' }[t];
  b.setAttribute('aria-label', `Color theme: ${b.textContent}. Tap to change.`);
  b.dataset.theme = t;
}

async function init() {
  let saved = 'system';
  try { saved = localStorage.getItem('theme') || 'system'; } catch {}
  applyTheme(THEMES.includes(saved) ? saved : 'system');
  $('#theme').addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf($('#theme').dataset.theme) + 1) % THEMES.length];
    applyTheme(next);
    try { localStorage.setItem('theme', next); } catch {}
  });
  renderKey();
  $('#key').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-cat]');
    if (!b) return;
    const c = b.dataset.cat;
    if (c === '*') CATEGORY_ORDER.forEach((x) => shown.add(x));
    else if (allShown()) { shown.clear(); shown.add(c); } // first tap on a full key: show just that one
    else if (shown.has(c)) { shown.delete(c); if (!shown.size) CATEGORY_ORDER.forEach((x) => shown.add(x)); }
    else shown.add(c);
    saveShown(); renderKey(); redraw();
  });
  const sel = $('#jump');
  sel.addEventListener('change', () => {
    const w = +sel.value;
    if (location.hash.startsWith('#week-') || location.hash === '#data') location.hash = `#week-${w}`;
    else { lastMainWeek = w; scrollToWeek(w); }
  });
  document.addEventListener('click', (ev) => {
    const back = ev.target.closest('[data-back]');
    if (back) { ev.preventDefault(); lastMainWeek = +back.dataset.back || null; if (location.hash) location.hash = ''; else route(); }
  });
  window.addEventListener('hashchange', route);
  wireDataView({
    onLoad: (sources) => useModel(buildModel(sources, 'own')),
    onSample: async () => useModel(await loadSample()),
  });
  try { useModel(await loadSample()); }
  catch (e) { $('#app').innerHTML = `<p class="empty">${esc(e.message)}. Open this page through a local web server (see README).</p>`; }
}
init();
