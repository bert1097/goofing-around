// Fitbit adapter: turns Fitbit data (from Google Takeout) into normalized day metrics.
//
// FIELD NAMES NEED CHECKING against a real Takeout export. Accepted inputs:
//  1. The sample shape: { sleep: [...], restingHeartRate: [...], steps: [...] }
//  2. Real Takeout files, recognized by file name (as we understand the format):
//       sleep-YYYY-MM-DD.json               [{ dateOfSleep, minutesAsleep, ... }]
//       resting_heart_rate-YYYY-MM-DD.json  [{ dateTime, value: { date, value, error } }]
//       steps-YYYY-MM-DD.json               [{ dateTime, value }]  (per-minute, summed per day)
//     Takeout dates look like "01/31/21 00:00:00" (MM/DD/YY); ISO dates also work.
//
// Input: array of { name, json }.  Output: { 'YYYY-MM-DD': { sleepHours?, restingHr?, steps? } }
export function toIsoDate(s) {
  s = String(s).trim();
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const y = us[3].length === 2 ? '20' + us[3] : us[3];
    return `${y}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  return s.slice(0, 10);
}

export function adaptFitbit(files) {
  const byDate = {};
  const at = (date) => (byDate[toIsoDate(date)] ??= {});
  const sleep = [], rhr = [], steps = [];
  for (const { name, json } of files) {
    if (json && !Array.isArray(json)) {
      sleep.push(...(json.sleep || [])); rhr.push(...(json.restingHeartRate || [])); steps.push(...(json.steps || []));
      continue;
    }
    const base = (name || '').split('/').pop().toLowerCase();
    if (base.startsWith('sleep')) sleep.push(...json);
    else if (base.startsWith('resting_heart_rate')) rhr.push(...json);
    else if (base.startsWith('steps')) steps.push(...json);
  }
  for (const s of sleep) if (s.dateOfSleep && s.minutesAsleep != null) {
    const d = at(s.dateOfSleep); d.sleepHours = (d.sleepHours || 0) + s.minutesAsleep / 60; // naps add up
  }
  for (const r of rhr) {
    const v = Number(r.value?.value ?? r.value);
    if (v > 0) at(r.value?.date || r.dateTime).restingHr = Math.round(v);
  }
  for (const s of steps) { const d = at(s.dateTime); d.steps = (d.steps || 0) + Number(s.value || 0); }
  return byDate;
}
