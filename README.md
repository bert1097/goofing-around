# Grain & Ember

> Personal side project for goofing around. It is **not** part of Brett AI and
> should not be picked up by any Brett AI tooling, scanners, or indexes.

A tiny falling-sand toy in a single HTML file. Open `index.html` in a browser.

## Elements

| Key | Element | Behavior |
| --- | ------- | -------- |
| 1 | Sand  | Falls and piles up; sinks through liquids |
| 2 | Water | Flows and spreads; puts out fire |
| 3 | Stone | Doesn't move |
| 4 | Plant | Drinks nearby water and grows; flammable |
| 5 | Fire  | Burns out, spreads to plants and oil |
| 6 | Oil   | Floats on water; very flammable |
| 7 | Lava  | Slow liquid; ignites things, turns water to stone |
| 8 | Steam | Rises, sometimes condenses back to water |
| 9 | Smoke | Rises and fades |
| 0 | Eraser | Digs a hole (right-click works too) |

Space pauses. The Rain and Meteor buttons do what you'd expect.

---

# 2 Minute Drill

`two-minute-drill/index.html` is a single-file football game: take over a real
end-of-game drive the coach lost and try to change the ending. You get the same
score, clock, field position and timeouts, then call every play.

Drives included: Super Bowl XLIX (Seahawks at the 1), the 2020 NFC Championship
(Packers, 1st & goal at the 8), Super Bowl LI (Falcons in field-goal range),
Super Bowl XXXIX (Eagles' slow drive) and the 2021 NFC Wild Card (Cowboys, 14
seconds). There's also a random late-game deficit mode.

- **Tempo**: hurry-up, huddle or milk the clock decides how much clock runs
  before the next snap.
- **Clock rules**: incompletions stop the clock, out of bounds stops it inside
  5:00, there's a two-minute warning, and spiking or kneeling costs a down.
- **The field**: a vertical, behind-the-offense camera like Madden's. All 22
  players are numbered dots from that game's lineups, and every snap animates:
  routes, throws, runs, sacks, kicks. Players ease to a stop, a callout marks
  the result at the whistle, and the teams jog back to the line. Tap the field
  to skip a replay.
- **Play card**: above the call sheet, the last play (with clock used), where
  you stand now (down, clock, timeouts, what score you need, field-goal odds)
  and a scouting note on the defense you're facing.
- **Defense**: you see the defensive front before you call the play (base,
  nickel, blitz, prevent, goal line), but they rotate at the snap about a
  quarter of the time. The front shifts the odds of each call.
- **On phones**: a floating play-call bar sits at the bottom of the screen
  with the clock, down and distance, a tempo toggle and a swipeable row of
  every call, so you can watch the field while you call plays.
- **Play-by-play**: uses the real names ("Wilson pass to Lockette,
  intercepted by Butler").
- **After you score**: choose the extra point or two, kick deep or onside, then
  play defense with your remaining timeouts while the opponent drives.

Situations and lineups are approximations from public game accounts; a few
depth-chart spots and jersey numbers may be off.

---

# Parts Bin

`parts-bin/index.html` is a single-file aftermarket firearm parts catalog with a
product-customizer front end, the way sneaker sites let you build your own shoe.

- **Build**: pick a firearm and set it up (Gen 3/4/5, MOS or standard slide,
  rail or no rail; for an AR the upper, handguard, barrel length, thread,
  trigger pins and buffer tube). It appears on a studio stage as a generic
  silhouette. Numbered hotspots walk you through each slot, and your picks
  show up on the drawing. A Finish step recolors the slide and frame. The
  running total uses the best retailer price you've logged, or the estimate.
- **Fit check**: every part is checked against the firearm *and* the other
  parts in the build. Firearms resolve to interfaces (optic cut, light mount,
  gas block, buffer tube...); parts say what they need, what they provide and
  what space they take. When something doesn't fit, the app searches the
  catalog for the parts that bridge the gap, chaining up to three deep (a light
  on a polymer handguard → low-profile gas block + M-LOK handguard + rail
  section), and adds them in one click. It also flags clashes (two forend
  replacements), soft "works, but" notes (co-witness sight height, steel mag
  catch) and parts nothing needs any more.
- **Install plan**: the steps from every part, in a sensible order (shop work,
  then gas and barrel work, internals, optics, lights, holster), starting with
  an unload check and ending with a function check and zero. It shows the
  overall difficulty (DIY → gunsmith), tools, hands-on time, and checkboxes to
  track progress, and flags legal points like pinning a muzzle device on a
  14.5" barrel or 922(r) on imported AKs. Copy it as text.
- **Catalog**: search and filter every part by firearm, category and brand, and
  sort by price. Open a part to log what retailers charge (with date, link and
  stock). It shows the best current price, the change since your last check at
  that store, and the older history.
- **Firearms**: add your own platforms, optionally copying another one's fit
  setup (and which parts fit) as a starting point.
- **Data**: everything saves in the browser. Export to JSON (full backup) or
  CSV (parts and prices), import a JSON backup, or reset to the starter data.

- **Sources**: every rule (which firearms a part fits, each need, what it
  provides, what it replaces, its install steps) and every firearm setup fact
  can cite sources: link, publisher, type (maker / retailer / reference), a
  verbatim quote, the date checked, and whether it supports, partly supports or
  contradicts the rule. A part is *Sourced* only when every rule has a
  supporting source; *Disputed* if any source contradicts it. The fit check
  and install plan show the source next to each verdict and step, a coverage
  bar shows how much of a build's check is backed, and the catalog can filter
  to Unsourced parts as a to-do list.

The starter data (64 parts across 17 platforms) was drafted from general
knowledge, then checked against maker, retailer and reference pages. That pass
corrected about 40 rules: the RMSc vs. Holosun K footprint, separate RMR plates
for each optic system, the P320's ROMEO1PRO cut, SIG and Hellcat rails, the
S15's required steel mag catch, large-pin and commercial-tube versions, and
more. It attached 119 sources. About 60% of rules are sourced so far; install
steps are the main gap. The raw findings and the generator live in
`parts-bin/research/`. No retailer prices are included; those are yours to log.
