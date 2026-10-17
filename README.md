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
- **Defense**: the opponent picks a front each play (base, nickel, blitz,
  prevent, goal line) that shifts the odds of each call.
- **After you score**: choose the extra point or two, kick deep or onside, then
  play defense with your remaining timeouts while the opponent drives.

Situations are approximations from public game accounts.
