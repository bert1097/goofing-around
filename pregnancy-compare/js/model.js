// Normalized model. Everything the UI reads comes from here, keyed by
// pregnancy + week + day, e.g. model.pregnancies.p2.days['13-2'].
import { adaptFlo } from './adapters/flo.js';
import { adaptFitbit } from './adapters/fitbit.js';

export const FIRST_WEEK = 4, LAST_WEEK = 40;

export const PREGNANCIES = [
  { id: 'p1', label: 'Pregnancy 1', short: 'P1', flo: 'data/flo-p1.json', fitbit: 'data/fitbit-p1.json' },
  { id: 'p2', label: 'Pregnancy 2', short: 'P2', flo: 'data/flo-p2.json', fitbit: 'data/fitbit-p2.json', current: true },
];

const DAY = 86400000;
const toUtc = (s) => Date.parse(s + 'T00:00:00Z');

// Week/day from the last period date, counted like Flo shows it ("Week 13, Day 2"):
// week = full weeks since the last period started, day = 1..7 within that week.
// (Check this against what Flo shows on a real day once we have real data.)
export function weekDay(lastPeriodDate, date) {
  const off = Math.round((toUtc(date) - toUtc(lastPeriodDate)) / DAY);
  return { week: Math.floor(off / 7), day: (off % 7) + 1 };
}
export const dateFor = (lmp, week, day) => new Date(toUtc(lmp) + (week * 7 + day - 1) * DAY).toISOString().slice(0, 10);

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url}`);
  return r.json();
}

// sources: { p1: { lmp?, flo?, fitbit: [{name, json}] }, p2: {...} }
// Works the same for the bundled sample files and for files the viewer picks.
export function buildModel(sources, kind) {
  const pregnancies = {};
  for (const p of PREGNANCIES) {
    const src = sources[p.id] || {};
    const lmp = src.lmp || src.flo?.lastPeriodDate;
    if (!lmp) throw new Error(`${p.label}: add the first day of the last period.`);
    const logs = src.flo ? adaptFlo(src.flo) : [];
    const device = adaptFitbit(src.fitbit || []);
    const days = {};
    const slot = (date) => {
      const { week, day } = weekDay(lmp, date);
      return (days[`${week}-${day}`] ??= { week, day, date, tags: [], note: null, device: null, logged: false });
    };
    for (const l of logs) Object.assign(slot(l.date), l, { logged: true });
    for (const [date, m] of Object.entries(device)) slot(date).device = m;
    const dates = [...logs.map((l) => l.date), ...Object.keys(device)].filter((d) => d >= lmp).sort();
    const last = dates.length ? weekDay(lmp, dates[dates.length - 1]) : { week: 0, day: 0 };
    pregnancies[p.id] = { ...p, lmp, days, lastWeek: last.week, lastDay: last.day, hasData: dates.length > 0 };
  }
  return { pregnancies, kind };
}

export async function loadSample() {
  const sources = {};
  for (const p of PREGNANCIES) {
    const [flo, fit] = await Promise.all([getJson(p.flo), getJson(p.fitbit)]);
    sources[p.id] = { flo, fitbit: [{ name: p.fitbit, json: fit }] };
  }
  return buildModel(sources, 'sample');
}

// Weekly summary for one pregnancy.
export function weekSummary(preg, week) {
  const tagCounts = new Map(); // "Category|Name" -> days
  let loggedDays = 0;
  const dev = { sleepHours: [], restingHr: [], steps: [] };
  for (let d = 1; d <= 7; d++) {
    const e = preg.days[`${week}-${d}`];
    if (!e) continue;
    if (e.logged) {
      loggedDays++;
      for (const t of e.tags) { const k = `${t.category}|${t.name}`; tagCounts.set(k, (tagCounts.get(k) || 0) + 1); }
    }
    if (e.device) for (const k in dev) if (e.device[k] != null) dev[k].push(e.device[k]);
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return {
    hasData: preg.hasData,
    reached: week <= preg.lastWeek,
    partial: preg.current && week === preg.lastWeek && preg.lastDay < 7 ? preg.lastDay : null,
    loggedDays, tagCounts,
    device: { sleepHours: avg(dev.sleepHours), restingHr: avg(dev.restingHr), steps: avg(dev.steps) },
  };
}
