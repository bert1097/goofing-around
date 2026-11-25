// Flo adapter: turns a Flo export into normalized day entries.
//
// UNVERIFIED FORMAT: we have not seen a real Flo export yet. The shape read here
// ({ lastPeriodDate, days: [{ date, tags: [{category, name}], note, weightKg, waterGlasses }] })
// is our own guess, used by the invented sample files in /data. When a real export
// arrives, change only this file so it returns the same output shape.
//
// Output: [{ date, tags: [{category, name}], note?, weightKg?, waterGlasses? }]
// Pregnancy week/day is NOT taken from the file; model.js computes it from the
// last period date so both sources line up the same way.
export function adaptFlo(raw) {
  return (raw.days || []).map((d) => ({
    date: d.date,
    tags: (d.tags || []).map((t) => ({ category: t.category, name: t.name })),
    note: d.note || null,
    weightKg: d.weightKg ?? null,
    waterGlasses: d.waterGlasses ?? null,
  }));
}
