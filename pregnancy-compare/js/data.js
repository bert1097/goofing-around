// "Your data" screen. Files are read in this browser with FileReader and kept in
// memory only: nothing is uploaded, saved or sent anywhere, and closing or
// reloading the page forgets them.
import { PREGNANCIES } from './model.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let handlers;

export function renderDataView(model) {
  $('#title').textContent = 'Your data';
  $('#colheads').hidden = true;
  const own = model?.kind === 'own';
  $('#app').innerHTML = `
  <nav class="wnav"><a href="#" data-back="0">‹ Back to weeks</a></nav>
  <section class="panel privacy">
    <h2>Private to this phone or computer</h2>
    <p>Files you pick here are read by your browser and never leave this phone or computer. Nothing is uploaded or saved, and nobody else (including whoever shared this page) can see them. Close or reload the page and they're gone.</p>
  </section>

  <form id="dataform" class="panel">
    ${PREGNANCIES.map((p) => `
    <fieldset>
      <legend>${p.label}${p.current ? ' (current)' : ''}</legend>
      <label class="field">First day of last period
        <input type="date" id="lmp-${p.id}">
        <small>Weeks are counted from this date, the way Flo does.</small>
      </label>
      <label class="field">Flo export
        <input type="file" id="flo-${p.id}" accept=".json,.csv,application/json,text/csv">
      </label>
      <label class="field">Fitbit files (pick several)
        <input type="file" id="fit-${p.id}" accept=".json,application/json" multiple>
      </label>
    </fieldset>`).join('')}
    <p id="dataerr" class="err" role="alert" hidden></p>
    <div class="actions">
      <button type="submit" class="primary">Show my data</button>
      ${own ? '<button type="button" id="usesample">Switch back to sample data</button>' : ''}
    </div>
  </form>

  <section class="panel howto">
    <h2>Getting your files</h2>
    <details open>
      <summary>Flo</summary>
      <ol>
        <li>In the Flo app, open your profile, then Settings, and look for the option to request or download your data. If you can't find it, ask Flo support for a copy of your data.</li>
        <li>Flo sends the export by email. Save the file to your phone (Files app) or computer and pick it above.</li>
      </ol>
      <p class="fine">We haven't seen a real Flo export yet, so it may not load as-is. This page reads JSON shaped like <code>{"days":[{"date":"2026-09-22","tags":[{"category":"Mood","name":"Happy"}],"note":"…"}]}</code>, or a CSV with columns <code>date,tags,note</code> where tags are separated by semicolons.</p>
    </details>
    <details>
      <summary>Fitbit (Google Takeout)</summary>
      <ol>
        <li>Go to takeout.google.com while signed in to the Google account your Fitbit uses.</li>
        <li>Click "Deselect all", then tick only <b>Fitbit</b>, then "Next step" and "Create export".</li>
        <li>Google emails a link when it's ready (can take hours). Download and unzip it.</li>
        <li>In the Fitbit folder, find the files whose names start with <code>sleep-</code>, <code>resting_heart_rate-</code> and <code>steps-</code> (in a folder like "Global Export Data"). Pick the ones covering each pregnancy. Picking extra months is fine.</li>
      </ol>
      <p class="fine">File and field names are based on Google's documented format and may need adjusting for a real export.</p>
    </details>
    <p class="fine">Only sleep, resting heart rate and steps are shown. Any other Fitbit files you pick are ignored.</p>
  </section>`;
  window.scrollTo(0, 0);
}

const readText = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error(`Couldn't read ${file.name}.`)); r.readAsText(file);
});

function parseJson(text, name) {
  try { return JSON.parse(text); } catch { throw new Error(`${name} isn't a JSON file this page can read.`); }
}

// Flo: JSON ({ lastPeriodDate?, days: [...] } or a bare array) or CSV (date,tags,note).
function parseFlo(text, name) {
  if (/\.csv$/i.test(name)) {
    const rows = text.split(/\r?\n/).filter(Boolean).map(splitCsv);
    const head = rows.shift().map((h) => h.trim().toLowerCase());
    const col = (n) => head.indexOf(n);
    if (col('date') < 0) throw new Error(`${name} needs a "date" column.`);
    return { days: rows.map((r) => ({
      date: r[col('date')]?.slice(0, 10),
      tags: (r[col('tags')] || '').split(';').map((t) => t.trim()).filter(Boolean).map((t) => {
        const [a, b] = t.includes(':') ? t.split(':').map((x) => x.trim()) : ['Other', t];
        return { category: a, name: b };
      }),
      note: col('note') >= 0 ? r[col('note')] : null,
    })).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)) };
  }
  const j = parseJson(text, name);
  const days = Array.isArray(j) ? j : j.days;
  if (!Array.isArray(days)) throw new Error(`${name} doesn't look like the Flo format this page expects (see "Getting your files").`);
  return { lastPeriodDate: j.lastPeriodDate, days };
}

function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}

async function collect() {
  const sources = {};
  let any = false;
  for (const p of PREGNANCIES) {
    const floFile = $(`#flo-${p.id}`).files[0];
    const fitFiles = [...$(`#fit-${p.id}`).files];
    const src = { lmp: $(`#lmp-${p.id}`).value || null, flo: null, fitbit: [] };
    if (floFile) { src.flo = parseFlo(await readText(floFile), floFile.name); any = true; }
    for (const f of fitFiles) { src.fitbit.push({ name: f.name, json: parseJson(await readText(f), f.name) }); any = true; }
    if (!src.lmp && !src.flo?.lastPeriodDate) throw new Error(`${p.label}: add the first day of the last period.`);
    sources[p.id] = src;
  }
  if (!any) throw new Error('Pick at least one Flo or Fitbit file.');
  return sources;
}

export function wireDataView(h) {
  handlers = h;
  document.addEventListener('submit', async (ev) => {
    if (ev.target.id !== 'dataform') return;
    ev.preventDefault();
    const err = $('#dataerr'); err.hidden = true;
    try { handlers.onLoad(await collect()); }
    catch (e) { err.textContent = e.message; err.hidden = false; }
  });
  document.addEventListener('click', (ev) => {
    if (ev.target.id === 'usesample') handlers.onSample();
  });
}
