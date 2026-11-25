// Generates the invented sample files in ../data. Nothing here is real health data.
// Run: node scripts/generate-sample-data.js   (deterministic: same output every time)
const fs = require('fs');
const path = require('path');

let seed = 20261124;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const chance = (p) => rand() < p;
const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (s, n) => iso(Date.parse(s + 'T00:00:00Z') + n * DAY);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Weekly probability that a tag is logged on a logged day, per pregnancy.
// ramp(w, start, peak, end, max): 0 before start, rises to max at peak, falls to 0 by end.
const ramp = (w, s, p, e, m) => (w < s || w > e ? 0 : w <= p ? m * (w - s + 1) / (p - s + 1) : m * (e - w) / (e - p));

const PROFILES = {
  // Middle pregnancy: light nausea, strong swelling and backache late, best sleep.
  p2: (w) => ({
    'Digestion and stool|Nausea': ramp(w, 7, 9, 12, 0.3),
    'Digestion and stool|Constipation': ramp(w, 8, 16, 28, 0.35),
    'Digestion and stool|Heartburn': ramp(w, 30, 36, 41, 0.25),
    'Digestion and stool|Normal digestion': 0.3,
    'Symptoms|Fatigue': ramp(w, 6, 10, 14, 0.4) + ramp(w, 32, 39, 41, 0.45),
    'Symptoms|Tender breasts': ramp(w, 4, 6, 10, 0.4),
    'Symptoms|Backache': ramp(w, 18, 30, 41, 0.6),
    'Symptoms|Leg cramps': ramp(w, 20, 28, 36, 0.35),
    'Symptoms|Acne': ramp(w, 6, 10, 16, 0.3),
    'Symptoms|Everything is fine': w > 12 && w < 28 ? 0.4 : 0.1,
    'Appetite|Increased appetite': ramp(w, 10, 18, 30, 0.5),
    'Symptoms|Cravings': ramp(w, 10, 16, 24, 0.35),
    'Swelling|Limbs swelling': ramp(w, 24, 34, 41, 0.7),
    'Swelling|Face swelling': ramp(w, 34, 38, 41, 0.25),
    'Mood|Calm': 0.35, 'Mood|Happy': 0.35, 'Mood|Energetic': w > 12 && w < 26 ? 0.3 : 0.05,
    'Mood|Anxious': ramp(w, 36, 39, 41, 0.3),
    'Physical activity|Walking': 0.5, 'Physical activity|Swimming': w > 16 && w < 36 ? 0.2 : 0,
    'Physical activity|Yoga': w > 10 && w < 38 ? 0.25 : 0.05,
    "Physical activity|Didn't exercise": 0.12,
  }),
  p1: (w) => ({
    'Digestion and stool|Nausea': ramp(w, 6, 9, 14, 0.55),
    'Digestion and stool|Vomiting': ramp(w, 8, 9, 11, 0.12),
    'Digestion and stool|Heartburn': ramp(w, 22, 32, 41, 0.6),
    'Digestion and stool|Constipation': ramp(w, 10, 20, 30, 0.25),
    'Digestion and stool|Normal digestion': w < 6 || (w > 14 && w < 24) ? 0.4 : 0.1,
    'Symptoms|Fatigue': ramp(w, 5, 9, 16, 0.6) + ramp(w, 30, 38, 41, 0.5),
    'Symptoms|Tender breasts': ramp(w, 4, 7, 13, 0.5),
    'Symptoms|Frequent urination': ramp(w, 6, 10, 15, 0.3) + ramp(w, 30, 38, 41, 0.5),
    'Symptoms|Backache': ramp(w, 20, 34, 41, 0.45),
    'Symptoms|Leg cramps': ramp(w, 24, 32, 39, 0.25),
    'Symptoms|Insomnia': ramp(w, 32, 38, 41, 0.25),
    'Symptoms|Headache': ramp(w, 8, 12, 18, 0.15),
    'Symptoms|Cravings': ramp(w, 12, 18, 26, 0.3),
    'Symptoms|Everything is fine': w > 14 && w < 26 ? 0.35 : 0.08,
    'Appetite|Food aversions': ramp(w, 6, 9, 14, 0.3),
    'Appetite|Increased appetite': ramp(w, 14, 22, 32, 0.4),
    'Swelling|Limbs swelling': ramp(w, 30, 38, 41, 0.45),
    'Swelling|Nasal congestion': ramp(w, 14, 20, 28, 0.2),
    'Mood|Calm': 0.3, 'Mood|Happy': w > 14 && w < 30 ? 0.4 : 0.2,
    'Mood|Anxious': ramp(w, 4, 6, 12, 0.25) + ramp(w, 35, 39, 41, 0.3),
    'Mood|Low energy': ramp(w, 6, 9, 14, 0.3),
    'Mood|Energetic': w > 14 && w < 28 ? 0.25 : 0.03,
    'Physical activity|Walking': 0.45, 'Physical activity|Yoga': w > 12 && w < 36 ? 0.2 : 0.05,
    'Physical activity|Swimming': w > 20 && w < 34 ? 0.1 : 0,
    "Physical activity|Didn't exercise": ramp(w, 6, 9, 14, 0.3) + 0.1,
  }),
  p3: (w) => ({
    'Digestion and stool|Nausea': ramp(w, 4, 7, 16, 0.9),
    'Digestion and stool|Vomiting': ramp(w, 5, 8, 14, 0.4),
    'Digestion and stool|Bloating': ramp(w, 4, 8, 14, 0.3),
    'Digestion and stool|Normal digestion': w < 5 ? 0.3 : 0.03,
    'Symptoms|Fatigue': ramp(w, 4, 8, 16, 0.75),
    'Symptoms|Sleepiness': ramp(w, 5, 8, 14, 0.35),
    'Symptoms|Insomnia': ramp(w, 6, 10, 16, 0.3),
    'Symptoms|Tender breasts': ramp(w, 4, 6, 11, 0.35),
    'Symptoms|Frequent urination': ramp(w, 5, 9, 15, 0.35),
    'Symptoms|Headache': ramp(w, 6, 10, 15, 0.25),
    'Symptoms|Bleeding gums': ramp(w, 9, 12, 16, 0.2),
    'Symptoms|Everything is fine': 0.04,
    'Appetite|Food aversions': ramp(w, 5, 8, 15, 0.55),
    'Appetite|Decreased appetite': ramp(w, 6, 9, 14, 0.35),
    'Mood|Calm': 0.15, 'Mood|Happy': 0.15, 'Mood|Low energy': ramp(w, 5, 8, 15, 0.55),
    'Mood|Irritated': ramp(w, 6, 9, 14, 0.25), 'Mood|Anxious': ramp(w, 4, 6, 10, 0.2),
    'Mood|Mood swings': ramp(w, 6, 9, 13, 0.2),
    'Other|Stress': 0.12,
    'Physical activity|Walking': 0.35,
    "Physical activity|Didn't exercise": ramp(w, 5, 8, 14, 0.5) + 0.1,
  }),
};

const NOTES = {
  p1: { 8: 'Crackers before getting up helps.', 10: 'First ultrasound today.', 12: 'Nausea easing off a bit.', 18: 'Felt the first flutters?', 20: 'Anatomy scan.', 24: 'Heartburn after spicy dinner.', 27: 'Weekend trip to the lake.', 31: 'Ankles puffy after a long day standing.', 35: 'Packed the hospital bag.', 38: 'Hard to get comfortable at night.', 40: 'Still waiting!' },
  p2: { 9: 'Barely any nausea this time.', 12: 'First scan.', 16: 'Breakouts on my chin.', 20: 'Anatomy scan.', 26: 'Back sore after work.', 30: 'Started swimming again.', 34: 'Rings off, too tight.', 39: 'Any day now.' },
  p3: { 5: 'Positive test! Queasy already.', 7: 'Nausea way worse than last time.', 8: 'Could only keep down toast.', 9: 'Up at 3am again.', 10: 'First scan.', 11: 'Bleeding gums when brushing.', 12: 'Slightly better in the afternoons.', 13: 'Told the family.' },
};
const TRAVEL = { p1: [27], p2: [22], p3: [] };

function genFlo(id, lmp, endOffset, logRate) {
  const days = [];
  let skipUntil = -1;
  for (let off = 28; off <= endOffset; off++) {
    const week = Math.floor(off / 7), dayOfWeek = (off % 7) + 1;
    const recent = off >= endOffset - 1; // always log the last couple of days
    if (!recent && off < skipUntil) continue;
    if (!recent && chance(0.03)) { skipUntil = off + 2 + Math.floor(rand() * 4); continue; } // multi-day gap
    if (!recent && !chance(logRate)) continue;
    const tags = [];
    for (const [k, p] of Object.entries(PROFILES[id](week))) if (chance(clamp(p, 0, 0.95))) {
      const [category, name] = k.split('|'); tags.push({ category, name });
    }
    // Drop contradictions a real person wouldn't log together.
    const has = (n) => tags.some((t) => t.name === n);
    const drop = (n) => { const i = tags.findIndex((t) => t.name === n); if (i >= 0) tags.splice(i, 1); };
    if (['Nausea', 'Heartburn', 'Vomiting', 'Bloating', 'Constipation'].some(has)) drop('Normal digestion');
    if (tags.some((t) => t.category === 'Symptoms' && t.name !== 'Everything is fine')) drop('Everything is fine');
    if (tags.some((t) => t.category === 'Physical activity' && t.name !== "Didn't exercise")) drop("Didn't exercise");
    if (TRAVEL[id].includes(week)) tags.push({ category: 'Other', name: 'Travel' });
    const entry = { date: addDays(lmp, off), pregnancyWeek: week, pregnancyDay: dayOfWeek, tags };
    if (NOTES[id][week] && dayOfWeek === 3) entry.note = NOTES[id][week];
    if (dayOfWeek === 1 && chance(0.8)) entry.weightKg = +(61 + week * 0.32 + (rand() - 0.5)).toFixed(1);
    if (chance(0.6)) entry.waterGlasses = 4 + Math.floor(rand() * 5);
    if (tags.length || entry.note) days.push(entry);
  }
  return { _comment: 'INVENTED SAMPLE DATA. Shape is a guess at a Flo export, not a real file.', lastPeriodDate: lmp, days };
}

function genFitbit(id, lmp, endOffset) {
  const sleep = [], restingHeartRate = [], steps = [];
  for (let off = 28; off <= endOffset; off++) {
    const w = off / 7, date = addDays(lmp, off);
    if (chance(0.05)) continue; // watch not worn / not synced
    const sleepH = id === 'p1' ? 7.6 - (w > 32 ? (w - 32) * 0.12 : 0) - ramp(w, 6, 9, 14, 0.4)
                 : id === 'p2' ? 7.8 - (w > 34 ? (w - 34) * 0.15 : 0)
                 : 7.1 - ramp(w, 5, 9, 16, 1.1);
    sleep.push({ dateOfSleep: date, minutesAsleep: Math.round((sleepH + (rand() - 0.5) * 1.4) * 60) });
    const rhr = ({ p1: 61, p2: 60, p3: 63 }[id]) + w * 0.38 + (rand() - 0.5) * 4;
    restingHeartRate.push({ dateTime: date, value: { value: Math.round(rhr) } });
    const base = id === 'p1' ? 8200 - (w > 30 ? (w - 30) * 300 : 0) : id === 'p2' ? 9000 - (w > 32 ? (w - 32) * 350 : 0) : 7400 - ramp(w, 5, 9, 16, 2600);
    steps.push({ dateTime: date, value: String(Math.max(800, Math.round(base + (rand() - 0.5) * 4000))) });
  }
  return { _comment: 'INVENTED SAMPLE DATA. Loosely modelled on Fitbit Google Takeout files; field names need checking.', sleep, restingHeartRate, steps };
}

const out = path.join(__dirname, '..', 'data');
const P = [
  { id: 'p1', lmp: '2021-03-01', end: 280, rate: 0.72 },
  { id: 'p2', lmp: '2023-06-05', end: 279, rate: 0.6 },
  { id: 'p3', lmp: '2026-08-24', end: 13 * 7 + 1, rate: 0.82 }, // current: through week 13 day 2
];
for (const p of P) {
  fs.writeFileSync(path.join(out, `flo-${p.id}.json`), JSON.stringify(genFlo(p.id, p.lmp, p.end, p.rate), null, 1));
  fs.writeFileSync(path.join(out, `fitbit-${p.id}.json`), JSON.stringify(genFitbit(p.id, p.lmp, p.end), null, 1));
}
console.log('wrote sample data to', out);
