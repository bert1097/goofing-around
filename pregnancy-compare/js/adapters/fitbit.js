// Fitbit adapter: turns Fitbit data (from Google Takeout) into normalized day metrics.
//
// FIELD NAMES NEED CHECKING against a real Takeout export. We assumed:
//   sleep:            [{ dateOfSleep, minutesAsleep }]
//   restingHeartRate: [{ dateTime, value: { value } }]
//   steps:            [{ dateTime, value }]   (value may be a string)
// Real Takeout splits these across many per-month files (e.g. sleep-YYYY-MM-DD.json,
// steps-YYYY-MM-DD.json) and may use timestamps instead of dates; merge them before
// calling this, or extend this file. Keep the output shape the same.
//
// Output: { 'YYYY-MM-DD': { sleepHours?, restingHr?, steps? } }
export function adaptFitbit(raw) {
  const byDate = {};
  const at = (date) => (byDate[date.slice(0, 10)] ??= {});
  for (const s of raw.sleep || []) {
    const d = at(s.dateOfSleep);
    d.sleepHours = (d.sleepHours || 0) + s.minutesAsleep / 60; // naps add up
  }
  for (const r of raw.restingHeartRate || []) {
    const v = r.value?.value ?? r.value;
    if (v) at(r.dateTime).restingHr = Number(v);
  }
  for (const s of raw.steps || []) at(s.dateTime).steps = (at(s.dateTime).steps || 0) + Number(s.value);
  return byDate;
}
