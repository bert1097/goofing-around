// Popular "size of" comparisons used by pregnancy apps, by week.
// General reference only, rounded and approximate. Not a measurement of anyone's baby.
export const SIZE_BY_WEEK = {
  4: 'poppy seed', 5: 'sesame seed', 6: 'lentil', 7: 'blueberry', 8: 'raspberry', 9: 'cherry',
  10: 'strawberry', 11: 'fig', 12: 'lime', 13: 'lemon', 14: 'peach', 15: 'apple', 16: 'avocado',
  17: 'pear', 18: 'bell pepper', 19: 'mango', 20: 'banana', 21: 'carrot', 22: 'papaya',
  23: 'grapefruit', 24: 'ear of corn', 25: 'cauliflower', 26: 'zucchini', 27: 'head of lettuce',
  28: 'eggplant', 29: 'butternut squash', 30: 'cabbage', 31: 'coconut', 32: 'jicama',
  33: 'pineapple', 34: 'cantaloupe', 35: 'honeydew melon', 36: 'romaine lettuce',
  37: 'bunch of Swiss chard', 38: 'leek', 39: 'mini watermelon', 40: 'small pumpkin',
};

// Little hand-drawn-style pictures for each week's comparison, as inline SVG (48x48).
// Simple shapes on purpose: playful, not botanical.
const O = 'stroke="#3a2f28" stroke-opacity=".35" stroke-width="1.2"';
const leaf = (x, y, r = 0, c = '#5c9a4a') => `<path d="M${x} ${y} q6 -7 12 -3 q-5 6 -12 3z" fill="${c}" ${O} transform="rotate(${r} ${x} ${y})"/>`;
const stem = (x, y, h = 6) => `<path d="M${x} ${y} q1 -${h / 2} 3 -${h}" stroke="#6b4a2b" stroke-width="2" fill="none" stroke-linecap="round"/>`;
const shine = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="1.6" fill="#fff" opacity=".45" transform="rotate(-30 ${x} ${y})"/>`;
const dots = (pts, c, r = 0.9) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('');
const round = (r, c) => `<circle cx="24" cy="26" r="${r}" fill="${c}" ${O}/>`;
const oval = (rx, ry, c, rot = 0) => `<ellipse cx="24" cy="26" rx="${rx}" ry="${ry}" fill="${c}" ${O} transform="rotate(${rot} 24 26)"/>`;
const pear = (c, s = 1) => `<path transform="translate(24 26) scale(${s}) translate(-24 -26)" d="M24 10 c5 0 6 6 7 9 c5 4 8 9 8 14 c0 7 -7 10 -15 10 s-15 -3 -15 -10 c0 -5 3 -10 8 -14 c1 -3 2 -9 7 -9z" fill="${c}" ${O}/>`;

const DRAW = {
  4: () => dots([[22, 26], [26, 24], [25, 28]], '#4a4a52', 1.6),
  5: () => `<path d="M24 19 q5 7 0 14 q-5 -7 0 -14z" fill="#e8d6a8" ${O}/>`,
  6: () => oval(7, 5, '#c9813f'),
  7: () => round(9, '#4f6fb5') + `<path d="M21 18 l3 2 l3 -2" stroke="#2f4580" stroke-width="1.5" fill="none"/>` + shine(20, 23),
  8: () => round(11, '#d9485f') + dots([[19, 22], [24, 20], [29, 23], [18, 28], [23, 27], [28, 29], [21, 33], [27, 34]], '#a92c45', 1.4) + leaf(22, 15, -20),
  9: () => `<circle cx="22" cy="30" r="9" fill="#c4213b" ${O}/>` + `<path d="M22 21 q2 -9 9 -12" stroke="#5a7a2a" stroke-width="2" fill="none"/>` + shine(19, 27),
  10: () => `<path d="M12 20 q12 -6 24 0 q-2 14 -12 20 q-10 -6 -12 -20z" fill="#e2384d" ${O}/>` + dots([[18, 24], [24, 23], [30, 24], [21, 30], [27, 30], [24, 35]], '#f7d66b', 0.9) + `<path d="M16 19 l4 -4 l4 3 l4 -3 l4 4z" fill="#4f9a45"/>`,
  11: () => pear('#7a4b7e', 0.85) + stem(24, 12, 5),
  12: () => oval(13, 11, '#8cc152') + shine(18, 21),
  13: () => oval(15, 11, '#f6d53b') + `<circle cx="9" cy="26" r="2" fill="#f6d53b"/><circle cx="39" cy="26" r="2" fill="#f6d53b"/>` + shine(18, 21),
  14: () => round(14, '#f7a26b') + `<path d="M24 13 q-2 6 0 26" stroke="#e0804f" stroke-width="1" fill="none"/>` + leaf(25, 12, -30) + shine(17, 21),
  15: () => `<path d="M24 16 c6 -4 16 -2 16 10 c0 9 -7 16 -16 16 s-16 -7 -16 -16 c0 -12 10 -14 16 -10z" fill="#d6403a" ${O}/>` + stem(23, 16) + leaf(26, 12, -10) + shine(16, 23),
  16: () => pear('#4f7a33') + `<path transform="translate(24 28) scale(.68) translate(-24 -28)" d="M24 12 c5 0 6 6 7 9 c5 4 8 9 8 14 c0 7 -7 10 -15 10 s-15 -3 -15 -10 c0 -5 3 -10 8 -14 c1 -3 2 -9 7 -9z" fill="#d7e59a"/>` + `<circle cx="24" cy="33" r="5" fill="#8a5a33"/>`,
  17: () => pear('#c9d65a') + stem(24, 10) + leaf(27, 7, -10),
  18: () => `<path d="M10 22 q0 -6 7 -6 q7 2 14 0 q7 0 7 6 q0 12 -6 18 q-4 2 -8 -1 q-4 3 -8 1 q-6 -6 -6 -18z" fill="#e2382f" ${O}/>` + `<path d="M22 16 q0 -6 4 -7" stroke="#3f7a33" stroke-width="3" fill="none" stroke-linecap="round"/>` + shine(16, 23),
  19: () => oval(16, 11, '#f5a623', -25) + `<path d="M13 32 q8 6 20 -8" stroke="#e8504a" stroke-opacity=".5" stroke-width="5" fill="none" stroke-linecap="round"/>` + leaf(34, 14, -40),
  20: () => `<path d="M8 18 q4 22 30 18 q4 -1 2 -4 q-22 2 -28 -16z" fill="#f7d84a" ${O}/>` + `<path d="M7 18 l4 -3" stroke="#6b4a2b" stroke-width="3" stroke-linecap="round"/>`,
  21: () => `<path d="M14 16 l22 4 q-10 14 -24 22 q-2 -14 2 -26z" fill="#f08a2b" ${O}/>` + `<path d="M18 22 l5 1 M16 30 l5 1" stroke="#c96a17" stroke-width="1"/>` + `<path d="M34 18 l8 -10 M33 17 l3 -12 M35 19 l11 -4" stroke="#4f9a45" stroke-width="2.5" stroke-linecap="round"/>`,
  22: () => oval(17, 11, '#f39c4a', -10) + `<ellipse cx="24" cy="26" rx="10" ry="5" fill="#f6c27a" transform="rotate(-10 24 26)"/>` + dots([[20, 26], [24, 25], [28, 27], [22, 28], [26, 28]], '#2b2b2b', 1.2),
  23: () => round(17, '#f28b6d') + `<circle cx="24" cy="26" r="13" fill="#f7b29f"/>` + `<path d="M24 13 v26 M11 26 h26 M15 17 l18 18 M33 17 l-18 18" stroke="#fde3d9" stroke-width="1.5"/>`,
  24: () => `<path d="M16 42 q-4 -16 8 -36 q12 20 8 36z" fill="#f7d84a" ${O}/>` + dots([[21, 16], [25, 16], [20, 22], [24, 22], [28, 22], [20, 28], [24, 28], [28, 28], [21, 34], [25, 34]], '#e6b52a', 1.6) + `<path d="M16 42 q-8 -10 -6 -22 q6 10 10 22z M32 42 q8 -10 6 -22 q-6 10 -10 22z" fill="#79b04a" ${O}/>`,
  25: () => `<path d="M8 32 q4 -6 8 -2 q-4 10 -8 2z M40 32 q-4 -6 -8 -2 q4 10 8 2z" fill="#5c9a4a"/>` + `<circle cx="17" cy="24" r="7" fill="#f3ecd2" ${O}/><circle cx="25" cy="20" r="8" fill="#f3ecd2" ${O}/><circle cx="31" cy="26" r="7" fill="#f3ecd2" ${O}/><circle cx="23" cy="29" r="8" fill="#f3ecd2" ${O}/>`,
  26: () => oval(20, 6, '#3d7a3a', -20) + `<path d="M8 30 q16 -4 32 -12" stroke="#6fa860" stroke-width="1.5" fill="none" stroke-dasharray="2 3"/>` + `<rect x="40" y="13" width="5" height="4" rx="1" fill="#6b8a3a" transform="rotate(-20 42 15)"/>`,
  27: () => `<path d="M24 42 c-14 0 -18 -10 -14 -18 c-2 -8 6 -14 14 -12 c8 -2 16 4 14 12 c4 8 0 18 -14 18z" fill="#8cc152" ${O}/>` + `<path d="M24 42 v-22 M24 30 q-6 -3 -9 -8 M24 30 q6 -3 9 -8" stroke="#5c9a4a" stroke-width="1.5" fill="none"/>`,
  28: () => `<path d="M30 12 c8 2 10 10 6 18 c-4 8 -12 14 -20 12 c-8 -2 -8 -10 -2 -16 c6 -6 6 -14 16 -14z" fill="#6a3d8a" ${O}/>` + `<path d="M28 10 q6 -2 8 4 q-4 0 -8 -4z M30 11 l4 -7" fill="#4f9a45" stroke="#4f9a45" stroke-width="2"/>` + shine(20, 30),
  29: () => `<path d="M24 6 c4 0 6 4 6 10 c0 4 8 8 8 16 c0 7 -6 11 -14 11 s-14 -4 -14 -11 c0 -8 8 -12 8 -16 c0 -6 2 -10 6 -10z" fill="#e9b872" ${O}/>` + `<circle cx="24" cy="33" r="5" fill="#e48f3c"/>` + stem(24, 7, 4),
  30: () => round(17, '#9cc77a') + `<path d="M24 9 q-10 10 0 34 M24 9 q10 10 0 34 M10 22 q14 4 28 0" stroke="#6fa860" stroke-width="1.5" fill="none"/>`,
  31: () => round(16, '#7a5233') + dots([[20, 18], [27, 18], [23.5, 23]], '#3f2a1a', 2) + `<path d="M12 30 q6 2 8 -2 M30 34 q4 0 6 -4" stroke="#5a3a22" stroke-width="1" fill="none"/>`,
  32: () => `<path d="M24 12 c10 0 16 6 16 14 c0 10 -8 16 -16 16 s-16 -6 -16 -16 c0 -8 6 -14 16 -14z" fill="#c9a77a" ${O}/>` + `<path d="M24 42 q1 3 0 5" stroke="#8a6a44" stroke-width="2" stroke-linecap="round"/>` + stem(23, 12, 4),
  33: () => oval(11, 14, '#f2b632') + `<path d="M14 18 l20 20 M14 28 l12 12 M20 14 l16 16 M34 18 l-20 20 M34 28 l-12 12 M28 14 l-16 16" stroke="#c4862a" stroke-width="1" opacity=".7"/>` + `<path d="M24 12 l-6 -10 l5 6 l1 -8 l1 8 l5 -6z" fill="#4f9a45"/>`,
  34: () => round(17, '#d9b27a') + `<path d="M10 20 q14 8 28 0 M8 28 q16 8 32 0 M12 36 q12 6 24 0 M18 11 q-4 16 0 30 M30 11 q4 16 0 30" stroke="#f3e2c2" stroke-width="1.5" fill="none"/>`,
  35: () => oval(18, 15, '#cfe3a0') + `<path d="M10 22 q6 -4 10 -6" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  36: () => `<path d="M24 44 c-8 -6 -10 -20 -6 -34 c2 -4 10 -4 12 0 c4 14 2 28 -6 34z" fill="#79b04a" ${O}/>` + `<path d="M24 44 v-34" stroke="#d8e9b6" stroke-width="2"/>` + `<path d="M24 22 l-4 -3 M24 30 l4 -3" stroke="#d8e9b6" stroke-width="1.2"/>`,
  37: () => `<path d="M24 42 c-12 -4 -14 -22 -4 -34 c10 -6 16 10 12 22 c-2 6 -4 10 -8 12z" fill="#3f7a3a" ${O}/>` + `<path d="M24 46 q-2 -18 -2 -36" stroke="#d8384d" stroke-width="2.5" fill="none" stroke-linecap="round"/>` + `<path d="M22 22 l-5 -3 M22 30 l6 -4" stroke="#d8384d" stroke-width="1.2"/>`,
  38: () => `<rect x="20" y="22" width="8" height="22" rx="4" fill="#eef1de" ${O}/>` + `<path d="M21 24 q-12 -10 -8 -22 q4 8 7 12 z M27 24 q12 -10 8 -22 q-4 8 -7 12 z M23 22 q-1 -14 2 -20 q2 8 1 20z" fill="#5c9a4a"/>` + `<path d="M22 44 l-1 2 M24 44 v3 M26 44 l1 2" stroke="#b8a888" stroke-width="1"/>`,
  39: () => oval(18, 14, '#3f8a3f') + `<path d="M8 22 q16 -4 32 0 M7 28 q17 4 34 0 M12 36 q12 4 24 0 M12 16 q12 -3 24 0" stroke="#9fd18a" stroke-width="2.5" fill="none"/>`,
  40: () => `<ellipse cx="17" cy="28" rx="9" ry="13" fill="#ec8a2e" ${O}/><ellipse cx="31" cy="28" rx="9" ry="13" fill="#ec8a2e" ${O}/><ellipse cx="24" cy="28" rx="8" ry="14" fill="#f39c3c" ${O}/>` + `<path d="M23 15 q0 -6 4 -8" stroke="#5a7a2a" stroke-width="3" fill="none" stroke-linecap="round"/>` + leaf(26, 12, -30),
};

export function sizeDrawing(week) {
  const d = DRAW[week];
  return d ? `<svg class="fruit" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${d()}</svg>` : '';
}
