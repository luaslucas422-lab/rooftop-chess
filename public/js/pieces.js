/* Rooftop Chess – piece artwork (drawn for this app). PIECES.svg('wK') gives an SVG string, PIECES.url('wK') a data URL. */
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
  const STYLE = {
    w: '<style>*{fill:#fbf8f1;stroke:#26221d;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#26221d;stroke-width:2.4}.e{fill:#26221d;stroke:none}</style>',
    b: '<style>*{fill:#35302b;stroke:#120f0c;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#cfc7bb;stroke-width:2.4}.e{fill:#efe8dc;stroke:none}</style>',
  };
  const cache = {};
  function svg(code) {
    const c = code[0], t = code[1].toLowerCase();
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + STYLE[c] + '<g>' + SHAPES[t] + '</g></svg>';
  }
  function url(code) { return cache[code] || (cache[code] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(code))); }
  const api = { svg, url, CODES: ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PIECES = api;
})(typeof self !== 'undefined' ? self : this);
