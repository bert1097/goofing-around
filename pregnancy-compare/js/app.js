import { renderDataView, wireDataView } from './data.js';
import { loadSample, buildModel, weekSummary, dateFor, FIRST_WEEK, LAST_WEEK, PREGNANCIES } from './model.js';

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

let model, P1, P2, currentWeek;

function chip(key, text, mark) {
  const [cat, name] = key.split('|');
  const m = mark === 'only' ? '<span class="mk mk-only" title="Not logged in the other pregnancy this week">◆</span>'
          : mark === 'gap' ? '<span class="mk mk-gap" title="Big difference in days logged">▲</span>' : '';
  return `<span class="chip ${CAT_CLASS[cat] || ''} ${mark ? 'is-' + mark : ''}">${m}${esc(name)}${text ? ` <b>${text}</b>` : ''}</span>`;
}

function cellHtml(s, other) {
  if (!s.hasData) return '<div class="empty">No data added</div>';
  if (!s.reached) return '<div class="empty">Not reached yet</div>';
  const compare = other.reached && other.loggedDays > 0 && s.loggedDays > 0;
  const keys = sortTags([...s.tagCounts.keys()]);
  const denom = s.partial || 7;
  const head = `<div class="logged">${s.loggedDays} of ${denom} days logged${s.partial ? ' (so far)' : ''}</div>`;
  if (!keys.length) return head + '<div class="empty">Nothing logged</div>';
  return head + '<div class="chips">' + keys.map((k) => {
    const n = s.tagCounts.get(k), o = other.tagCounts.get(k) || 0;
    const mark = !compare ? null : o === 0 ? 'only' : Math.abs(n - o) >= GAP ? 'gap' : null;
    return chip(k, `${n}/${denom}`, mark);
  }).join('') + '</div>';
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

function renderMain() {
  $('#title').textContent = 'Week by week';
  $('#colheads').innerHTML = `<span>${P1.label}<small>${P1.hasData ? 'complete' : 'no data added'}</small></span><span>${P2.label}<small>${P2.hasData ? `now: week ${P2.lastWeek}, day ${P2.lastDay}` : 'no data added'}</small></span>`;
  $('#colheads').hidden = false;
  let html = `<p class="legend"><span class="mk mk-only">◆</span> logged in only one pregnancy that week &nbsp; <span class="mk mk-gap">▲</span> ${GAP}+ days apart</p>`;
  for (let w = FIRST_WEEK; w <= LAST_WEEK; w++) {
    const a = weekSummary(P1, w), b = weekSummary(P2, w);
    html += `<a class="week ${w === currentWeek ? 'is-current' : ''}" id="w${w}" href="#week-${w}">
      <div class="week-label">Week ${w}${w === currentWeek ? ' <em>current</em>' : ''}<span class="more">Days ›</span></div>
      <div class="pair"><div class="cell">${cellHtml(a, b)}</div><div class="cell">${cellHtml(b, a)}</div></div>
      <div class="pair devrow"><div>${devHtml(a)}</div><div>${devHtml(b)}</div></div>
    </a>`;
  }
  $('#app').innerHTML = html;
}

function dayCell(preg, week, day) {
  const e = preg.days[`${week}-${day}`];
  const date = dateFor(preg.lmp, week, day);
  const reached = week < preg.lastWeek || (week === preg.lastWeek && day <= preg.lastDay);
  if (!preg.hasData) return '<div class="empty">No data added</div>';
  if (!reached) return '<div class="empty">Not reached yet</div>';
  let h = `<div class="date">${fmtDate(date)}</div>`;
  if (!e || !e.logged) h += '<div class="empty">Not logged</div>';
  else {
    const keys = sortTags(e.tags.map((t) => `${t.category}|${t.name}`));
    h += keys.length ? '<div class="chips">' + keys.map((k) => chip(k)).join('') + '</div>' : '';
    if (e.note) h += `<p class="note">“${esc(e.note)}”</p>`;
    const extra = [e.weightKg != null && `Weight ${e.weightKg} kg`, e.waterGlasses != null && `Water ${e.waterGlasses} glasses`].filter(Boolean);
    if (extra.length) h += `<div class="extra">${extra.join(' · ')}</div>`;
  }
  const d = e && e.device;
  if (d) h += `<div class="extra dev-line">${[d.sleepHours != null && `Sleep ${d.sleepHours.toFixed(1)} h`, d.restingHr != null && `HR ${d.restingHr}`, d.steps != null && `${d.steps.toLocaleString()} steps`].filter(Boolean).join(' · ')}</div>`;
  return h;
}

function renderWeek(w) {
  $('#title').textContent = `Week ${w}`;
  $('#colheads').innerHTML = `<span>${P1.label}</span><span>${P2.label}</span>`;
  const nav = `<nav class="wnav">
    <a href="#" data-back="${w}">‹ All weeks</a>
    <span>${w > FIRST_WEEK ? `<a href="#week-${w - 1}">‹ Wk ${w - 1}</a>` : ''}${w < LAST_WEEK ? `<a href="#week-${w + 1}">Wk ${w + 1} ›</a>` : ''}</span>
  </nav>`;
  let html = nav;
  for (let d = 1; d <= 7; d++) {
    html += `<section class="day"><h2>Day ${d}</h2><div class="pair"><div class="cell">${dayCell(P1, w, d)}</div><div class="cell">${dayCell(P2, w, d)}</div></div></section>`;
  }
  $('#app').innerHTML = html + nav;
  window.scrollTo(0, 0);
}

let lastMainWeek = null;
function route() {
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

// Swap in a model (sample or the viewer's own files) and redraw.
function useModel(m) {
  model = m;
  [P1, P2] = PREGNANCIES.map((p) => model.pregnancies[p.id]);
  currentWeek = Math.min(LAST_WEEK, Math.max(FIRST_WEEK, P2.lastWeek || FIRST_WEEK));
  const sel = $('#jump');
  sel.innerHTML = '';
  for (let w = FIRST_WEEK; w <= LAST_WEEK; w++) sel.add(new Option(w === currentWeek ? `${w} (now)` : String(w), w));
  const own = m.kind === 'own';
  document.body.classList.toggle('is-own', own);
  $('#banner').innerHTML = own
    ? 'Your data. It stays on this phone or computer and is gone when you close the page. <a href="#data">Change</a>'
    : 'Sample data. Everything here is invented. <a href="#data">Use your own data</a>';
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
