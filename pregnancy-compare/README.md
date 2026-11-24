# Week by Week: pregnancy comparison (proof of concept)

**All data in this folder is invented.** No real health data is stored here, and none should ever be committed.

Apps like Flo let you log symptoms daily, but you can't line up the same week across two pregnancies. This page does that: one row per pregnancy week (4–40), Pregnancy 1 on the left, Pregnancy 2 on the right.

- Each week shows the tags logged and how many days each was logged (`Nausea 5/7`).
- ◆ marks a tag logged in only one pregnancy that week; ▲ marks a gap of 3+ days between the two.
- A smaller row underneath shows average sleep, resting heart rate and steps from the watch.
- Tap a week for a day-by-day view of both pregnancies, with notes.
- Opens on the current week; "Jump to week" moves around.

The page only shows what was logged. It doesn't interpret anything.

## Using your own data

Tap **Use your own data** in the banner. For each pregnancy, enter the first day of the last period and pick the Flo export and/or the Fitbit files. The page has step-by-step instructions for getting both.

Files are read in the browser on her phone or computer with `FileReader` and kept in memory only. Nothing is uploaded, saved or sent anywhere, so the person who shared the page can't see them. Reloading or closing the page forgets them. The only thing stored on the device is the light/dark/auto theme choice.

## Run it

It loads JSON with `fetch`, so it needs a local web server (opening the file directly won't work):

```bash
cd pregnancy-compare && python3 -m http.server 8000
```

Then open http://localhost:8000. Plain HTML/CSS/JS: no build step, backend, accounts, analytics or external calls.

## Files

```
index.html, css/style.css, js/app.js   UI
js/model.js            normalizes both sources into pregnancy + week + day
js/adapters/flo.js     Flo export   -> [{ date, tags, note, weightKg, waterGlasses }]
js/data.js             "Your data" screen: reads picked files in the browser
js/adapters/fitbit.js  Fitbit data  -> { date: { sleepHours, restingHr, steps } }
data/flo-p1.json, flo-p2.json, fitbit-p1.json, fitbit-p2.json   invented sample data
scripts/generate-sample-data.js       regenerates the sample files (node)
```

Pregnancy week/day is computed from each pregnancy's last period date (`lastPeriodDate` in the Flo file): week = full weeks since that date, day = 1–7. Sources are joined by calendar date, so both line up the same way.

## Plugging in real exports

Both formats are unverified; the sample files use our best guess.

- **Flo**: we haven't seen a real Flo export yet. When one is available, change `js/adapters/flo.js` so it returns the same output shape, and point `PREGNANCIES` in `js/model.js` at the new file. If the export doesn't include the last period date, add it by hand. Check that the computed week/day matches what Flo shows for a few days.
- **Fitbit (Google Takeout)**: the field names (`dateOfSleep`, `minutesAsleep`, `dateTime`, `value`) need checking against a real Takeout. Takeout splits data into many per-period files, so they'd need merging into one per pregnancy (or teach `fitbit.js` to read several).

Real exports should stay off GitHub: keep them local, and add them to `.gitignore` before copying them into `data/`.
