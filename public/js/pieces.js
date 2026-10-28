/* Rooftop Chess – piece artwork (drawn for this app) in several styles, plus sets you draw yourself.
   PIECES.svg('wK') gives an SVG string and PIECES.url('wK') a data URL in the style chosen with PIECES.use(). */
(function (root) {
  'use strict';
  const base = '<path d="M22 84h56a5 5 0 0 1 5 5v4H17v-4a5 5 0 0 1 5-5z"/>';
  const SHAPES = {
    p: '<circle cx="50" cy="31" r="13"/><path d="M31 84c0-15 7-23 12-28h14c5 5 12 13 12 28z"/><rect x="34" y="47" width="32" height="9" rx="4.5"/>' + base,
    r: '<path d="M28 84l3-10h38l3 10z"/><path d="M34 74l3-36h26l3 36z"/><rect x="29" y="31" width="42" height="9" rx="2"/><path d="M29 33V17h9v7h7.5v-7h9v7H62v-7h9v16z"/>' + base +
      '<path class="d" d="M36 44h28M34.5 68h31" fill="none"/>',
    n: '<path d="M33 84c0-13 4-21 13-28-6 0-12 3-17 6-5 3-11 0-11-6 0-5 5-9 9-14 5-7 9-13 14-18l-1-9 7 5 5-7 3 9c13 6 19 19 18 35-1 11-4 19-4 27z"/>' +
      '<circle class="e" cx="45" cy="33" r="3.2"/><path class="d" d="M60 25c6 6 9 15 8 27M23 55l3-2" fill="none"/>' + base,
    b: '<circle cx="50" cy="15" r="5.5"/><path d="M50 21c-11 9-17 20-16 31 1 7 6 12 8 14h16c2-2 7-7 8-14 1-11-5-22-16-31z"/><path d="M41 72c0 6-6 9-10 12h38c-4-3-10-6-10-12z"/>' +
      '<rect x="37" y="64" width="26" height="9" rx="4.5"/><path class="d" d="M56 33l-10 13" fill="none"/>' + base,
    q: '<path d="M27 74L17 34l13 17 4-25 9 21 7-27 7 27 9-21 4 25 13-17-10 40z"/><circle cx="17" cy="32" r="4.5"/><circle cx="34" cy="24" r="4.5"/><circle cx="50" cy="17" r="5"/><circle cx="66" cy="24" r="4.5"/><circle cx="83" cy="32" r="4.5"/>' +
      '<path d="M26 84c1-3 1-7 1-10h46c0 3 0 7 1 10z"/><path class="d" d="M29 74h42" fill="none"/>' + base,
    k: '<path d="M46.5 9h7v8h7v6.5h-7v9h-7v-9h-7V17h7z"/><path d="M50 36c-4-5-9-6-13-6-10 0-17 9-14 21 2 8 5 15 6 23h42c1-8 4-15 6-23 3-12-4-21-14-21-4 0-9 1-13 6z"/>' +
      '<path d="M26 84c1-3 2-7 3-10h42c1 3 2 7 3 10z"/><path class="d" d="M50 37v24M30 74h40M32 62h36" fill="none"/>' + base,
  };
  /* the built-in styles: colors for the drawn shapes, or a different way of drawing them */
  const COLORS = {
    classic: { w: '<style>*{fill:#fbf8f1;stroke:#26221d;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#26221d;stroke-width:2.4}.e{fill:#26221d;stroke:none}</style>',
      b: '<style>*{fill:#35302b;stroke:#120f0c;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#cfc7bb;stroke-width:2.4}.e{fill:#efe8dc;stroke:none}</style>' },
    royal: { w: '<style>*{fill:#fff6dc;stroke:#8a6512;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#b8891c;stroke-width:2.4}.e{fill:#8a6512;stroke:none}</style>',
      b: '<style>*{fill:#1f2b4a;stroke:#d9b45a;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#e8c66c;stroke-width:2.4}.e{fill:#e8c66c;stroke:none}</style>' },
    neon: { w: '<style>*{fill:#0d1b26;stroke:#4ff3ff;stroke-width:3.6;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#4ff3ff;stroke-width:2.4}.e{fill:#4ff3ff;stroke:none}</style>',
      b: '<style>*{fill:#22081d;stroke:#ff4fd1;stroke-width:3.6;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#ff4fd1;stroke-width:2.4}.e{fill:#ff4fd1;stroke:none}</style>' },
    ink: { w: '<style>*{fill:#fff;stroke:#111;stroke-width:4.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#111;stroke-width:3}.e{fill:#111;stroke:none}</style>',
      b: '<style>*{fill:#111;stroke:#111;stroke-width:4.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#fff;stroke-width:3}.e{fill:#fff;stroke:none}</style>' },
    wood: { w: '<style>*{fill:#ecc995;stroke:#5a3a1a;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#8a5a2b;stroke-width:2.4}.e{fill:#5a3a1a;stroke:none}</style>',
      b: '<style>*{fill:#7a4520;stroke:#2b170a;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#d4a373;stroke-width:2.4}.e{fill:#f0d3a6;stroke:none}</style>' },
    ice: { w: '<style>*{fill:#f2fbff;stroke:#2f6f99;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#6fb3d9;stroke-width:2.4}.e{fill:#2f6f99;stroke:none}</style>',
      b: '<style>*{fill:#1d4f7c;stroke:#0a2742;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#9fd4f5;stroke-width:2.4}.e{fill:#d5f1ff;stroke:none}</style>' },
    candy: { w: '<style>*{fill:#ffe0ee;stroke:#c2185b;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#e85d9a;stroke-width:2.4}.e{fill:#c2185b;stroke:none}</style>',
      b: '<style>*{fill:#6a1b9a;stroke:#2e0a45;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#e1bee7;stroke-width:2.4}.e{fill:#f3e5f5;stroke:none}</style>' },
    metal: { w: '<style>*{fill:#eceff1;stroke:#546e7a;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#90a4ae;stroke-width:2.4}.e{fill:#37474f;stroke:none}</style>',
      b: '<style>*{fill:#c99a1e;stroke:#5c4300;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#7a5a00;stroke-width:2.4}.e{fill:#3d2c00;stroke:none}</style>' },
    shadow: { w: '<style>*{fill:#f6f6f6;stroke:#3b3b3b;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#3b3b3b;stroke-width:2.4}.e{fill:#3b3b3b;stroke:none}.d,.e{display:none}</style>',
      b: '<style>*{fill:#141414;stroke:#141414;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#141414;stroke-width:2.4}.e{fill:#141414;stroke:none}.d,.e{display:none}</style>' },
  };
  /* Pixel: 12×12 sprites; the outline is worked out around the filled cells */
  const SPRITES = {
    p: ['............', '.....##.....', '....####....', '....####....', '.....##.....', '....####....', '.....##.....', '.....##.....', '....####....', '...######...', '..########..', '............'],
    r: ['............', '..##.##.##..', '..########..', '...######...', '....####....', '....####....', '....####....', '....####....', '...######...', '..########..', '..########..', '............'],
    n: ['............', '....#.#.....', '....#####...', '...#######..', '..###.####..', '..#######...', '.....####...', '....#####...', '....#####...', '...######...', '..########..', '............'],
    b: ['............', '.....##.....', '....####....', '...##.###...', '...######...', '...######...', '....####....', '.....##.....', '....####....', '...######...', '..########..', '............'],
    q: ['............', '.#...##...#.', '.##..##..##.', '.##########.', '..########..', '...######...', '....####....', '....####....', '...######...', '..########..', '..########..', '............'],
    k: ['.....##.....', '....####....', '.....##.....', '...######...', '..########..', '..########..', '...######...', '....####....', '...######...', '..########..', '..########..', '............'],
  };
  function pixel(c, t) {
    const g = SPRITES[t], fill = c === 'w' ? '#f7f3ea' : '#2e2a26', line = c === 'w' ? '#221e1a' : '#ece4d6', u = 100 / 13, at = (x, y) => g[y] && g[y][x] === '#';
    let out = '';
    for (let y = -1; y <= 12; y++) for (let x = -1; x <= 12; x++) {
      const on = at(x, y), edge = !on && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1));
      if (on || edge) out += '<rect x="' + ((x + 0.5) * u).toFixed(2) + '" y="' + ((y + 0.5) * u).toFixed(2) + '" width="' + (u + 0.1).toFixed(2) + '" height="' + (u + 0.1).toFixed(2) + '" fill="' + (on ? fill : line) + '"/>';
    }
    return out;
  }
  /* Letters: a disc with the piece's letter */
  function letter(c, t) {
    const fill = c === 'w' ? '#f7f3ea' : '#2e2a26', ink = c === 'w' ? '#2e2a26' : '#f7f3ea';
    return '<circle cx="50" cy="50" r="38" fill="' + fill + '" stroke="' + ink + '" stroke-width="4"/><text x="50" y="51" text-anchor="middle" dominant-baseline="central" font-family="Georgia,serif" font-weight="700" font-size="46" fill="' + ink + '">' + t.toUpperCase() + '</text>';
  }
  /* your own drawn pieces: { name, w (pen width), s: { k: [[x0, y0, x1, y1, …], …], q: …, … } } on a 100×100 square.
     White pieces are drawn white with a dark edge, black ones dark with a light edge; a piece not drawn yet uses Classic. */
  function drawn(c, t, set) {
    const strokes = set.s && set.s[t]; if (!strokes || !strokes.length) return null;
    const w = Math.max(2, Math.min(16, +set.w || 7)), main = c === 'w' ? '#ffffff' : '#1d1b19', edge = c === 'w' ? '#1d1b19' : '#efe9dd';
    const d = strokes.map(p => { let s = ''; for (let i = 0; i + 1 < p.length; i += 2) s += (i ? 'L' : 'M') + (+p[i]).toFixed(1) + ' ' + (+p[i + 1]).toFixed(1); return p.length === 2 ? s + 'l.1 0' : s; }).join('');
    return '<path d="' + d + '" fill="none" stroke="' + edge + '" stroke-width="' + (w + 5) + '" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="' + main + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  const STYLES = [['classic', 'Classic'], ['royal', 'Royal'], ['neon', 'Neon'], ['ink', 'Ink'], ['wood', 'Wood'], ['ice', 'Ice'], ['candy', 'Candy'], ['metal', 'Metal'], ['shadow', 'Shadow'], ['pixel', 'Pixel'], ['letters', 'Letters']];
  const wrap = body => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + body + '</svg>';
  /* a piece in any style. set: one of your drawn sets (when style is its id) */
  function svgIn(code, style, set) {
    const c = code[0], t = code[1].toLowerCase();
    if (set) { const d = drawn(c, t, set); if (d) return wrap(d); style = 'classic'; }
    if (style === 'pixel') return wrap('<g shape-rendering="crispEdges">' + pixel(c, t) + '</g>');
    if (style === 'letters') return wrap(letter(c, t));
    return wrap((COLORS[style] || COLORS.classic)[c] + '<g>' + SHAPES[t] + '</g>');
  }
  const toUrl = svgText => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  let current = 'classic', currentSet = null, cache = {};
  /* switch every piece in the app to a style (sets: your drawn sets, to find a custom one by id) */
  function use(style, sets) {
    cache = {}; currentSet = null; current = 'classic';
    if (STYLES.some(x => x[0] === style)) current = style;
    else if (sets) { const c = sets.find(x => x.id === style); if (c) { current = style; currentSet = c; } }
    return current;
  }
  const svg = code => svgIn(code, current, currentSet);
  function url(code) { return cache[code] || (cache[code] = toUrl(svg(code))); }
  const preview = (code, style, set) => toUrl(svgIn(code, style, set));
  const api = { svg, url, use, preview, STYLES, SHAPES, get style() { return current; }, CODES: ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PIECES = api;
})(typeof self !== 'undefined' ? self : this);
