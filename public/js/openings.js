/* Rooftop Chess – opening names (shown during games, "Book" moves in Game Review, and variety for the bots) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Openings = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LINES = [
    ['King’s Pawn Opening', 'e4'], ['Queen’s Pawn Opening', 'd4'], ['English Opening', 'c4'], ['Zukertort Opening', 'Nf3'], ['Bird’s Opening', 'f4'],
    ['Nimzo-Larsen Attack', 'b3'], ['Van’t Kruijs Opening', 'e3'], ['Polish Opening', 'b4'], ['Grob Opening', 'g4'], ['Hungarian Opening', 'g3'],
    ['Van Geet Opening', 'Nc3'], ['Mieses Opening', 'd3'], ['Anderssen’s Opening', 'a3'],
    // 1.e4 replies
    ['Sicilian Defense', 'e4 c5'], ['French Defense', 'e4 e6'], ['Caro-Kann Defense', 'e4 c6'], ['Pirc Defense', 'e4 d6'], ['Modern Defense', 'e4 g6'],
    ['Alekhine’s Defense', 'e4 Nf6'], ['Scandinavian Defense', 'e4 d5'], ['Owen’s Defense', 'e4 b6'], ['Nimzowitsch Defense', 'e4 Nc6'], ['St. George Defense', 'e4 a6'],
    ['King’s Pawn Game', 'e4 e5'],
    // Sicilian
    ['Sicilian Defense: Open', 'e4 c5 Nf3 d6 d4'], ['Sicilian Defense: Najdorf Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
    ['Sicilian Defense: Dragon Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'], ['Sicilian Defense: Classical Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6'],
    ['Sicilian Defense: Richter-Rauzer Attack', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Bg5'], ['Sicilian Defense: Scheveningen Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6'],
    ['Sicilian Defense: Old Sicilian', 'e4 c5 Nf3 Nc6'], ['Sicilian Defense: Sveshnikov Variation', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5'],
    ['Sicilian Defense: Kalashnikov Variation', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 e5 Nb5 d6'], ['Sicilian Defense: Accelerated Dragon', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6'],
    ['Sicilian Defense: Hyperaccelerated Dragon', 'e4 c5 Nf3 g6'], ['Sicilian Defense: French Variation', 'e4 c5 Nf3 e6'],
    ['Sicilian Defense: Taimanov Variation', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6'], ['Sicilian Defense: Kan Variation', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6'],
    ['Sicilian Defense: Four Knights Variation', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6'], ['Sicilian Defense: Alapin Variation', 'e4 c5 c3'],
    ['Sicilian Defense: Closed', 'e4 c5 Nc3'], ['Sicilian Defense: Grand Prix Attack', 'e4 c5 Nc3 Nc6 f4'], ['Sicilian Defense: Smith-Morra Gambit', 'e4 c5 d4 cxd4 c3'],
    ['Sicilian Defense: Rossolimo Variation', 'e4 c5 Nf3 Nc6 Bb5'], ['Sicilian Defense: Moscow Variation', 'e4 c5 Nf3 d6 Bb5+'],
    // French
    ['French Defense: Advance Variation', 'e4 e6 d4 d5 e5'], ['French Defense: Exchange Variation', 'e4 e6 d4 d5 exd5'], ['French Defense: Tarrasch Variation', 'e4 e6 d4 d5 Nd2'],
    ['French Defense: Winawer Variation', 'e4 e6 d4 d5 Nc3 Bb4'], ['French Defense: Classical Variation', 'e4 e6 d4 d5 Nc3 Nf6'], ['French Defense: Rubinstein Variation', 'e4 e6 d4 d5 Nc3 dxe4'],
    // Caro-Kann
    ['Caro-Kann Defense: Advance Variation', 'e4 c6 d4 d5 e5'], ['Caro-Kann Defense: Exchange Variation', 'e4 c6 d4 d5 exd5 cxd5'], ['Caro-Kann Defense: Panov Attack', 'e4 c6 d4 d5 exd5 cxd5 c4'],
    ['Caro-Kann Defense: Classical Variation', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'], ['Caro-Kann Defense: Two Knights Attack', 'e4 c6 Nc3 d5 Nf3'], ['Caro-Kann Defense: Fantasy Variation', 'e4 c6 d4 d5 f3'],
    // Pirc, Modern, Alekhine, Scandinavian
    ['Pirc Defense: Main Line', 'e4 d6 d4 Nf6 Nc3 g6'], ['Pirc Defense: Austrian Attack', 'e4 d6 d4 Nf6 Nc3 g6 f4'], ['Modern Defense: Main Line', 'e4 g6 d4 Bg7'],
    ['Alekhine’s Defense: Four Pawns Attack', 'e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 f4'], ['Alekhine’s Defense: Modern Variation', 'e4 Nf6 e5 Nd5 d4 d6 Nf3'],
    ['Scandinavian Defense: Main Line', 'e4 d5 exd5 Qxd5 Nc3 Qa5'], ['Scandinavian Defense: Modern Variation', 'e4 d5 exd5 Nf6'], ['Scandinavian Defense: Portuguese Variation', 'e4 d5 exd5 Nf6 d4 Bg4'],
    // 1.e4 e5
    ['King’s Knight Opening', 'e4 e5 Nf3'], ['Ruy López Opening', 'e4 e5 Nf3 Nc6 Bb5'], ['Ruy López: Morphy Defense', 'e4 e5 Nf3 Nc6 Bb5 a6'],
    ['Ruy López: Closed', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7'], ['Ruy López: Marshall Attack', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5'],
    ['Ruy López: Open Variation', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4'], ['Ruy López: Berlin Defense', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
    ['Ruy López: Exchange Variation', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'], ['Ruy López: Schliemann Defense', 'e4 e5 Nf3 Nc6 Bb5 f5'], ['Ruy López: Steinitz Defense', 'e4 e5 Nf3 Nc6 Bb5 d6'],
    ['Italian Game', 'e4 e5 Nf3 Nc6 Bc4'], ['Italian Game: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'], ['Italian Game: Giuoco Pianissimo', 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3'],
    ['Italian Game: Evans Gambit', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4'], ['Italian Game: Hungarian Defense', 'e4 e5 Nf3 Nc6 Bc4 Be7'], ['Italian Game: Two Knights Defense', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
    ['Italian Game: Two Knights Defense, Knight Attack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5'], ['Italian Game: Fried Liver Attack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7'],
    ['Italian Game: Traxler Counterattack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 Bc5'],
    ['Scotch Game', 'e4 e5 Nf3 Nc6 d4'], ['Scotch Game: Main Line', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4'], ['Scotch Gambit', 'e4 e5 Nf3 Nc6 d4 exd4 Bc4'],
    ['Three Knights Opening', 'e4 e5 Nf3 Nc6 Nc3'], ['Four Knights Game', 'e4 e5 Nf3 Nc6 Nc3 Nf6'], ['Four Knights Game: Halloween Gambit', 'e4 e5 Nf3 Nc6 Nc3 Nf6 Nxe5'],
    ['Ponziani Opening', 'e4 e5 Nf3 Nc6 c3'], ['Petrov’s Defense', 'e4 e5 Nf3 Nf6'], ['Petrov’s Defense: Classical Attack', 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4'],
    ['Petrov’s Defense: Stafford Gambit', 'e4 e5 Nf3 Nf6 Nxe5 Nc6'], ['Philidor Defense', 'e4 e5 Nf3 d6'], ['Latvian Gambit', 'e4 e5 Nf3 f5'], ['Elephant Gambit', 'e4 e5 Nf3 d5'],
    ['Damiano Defense', 'e4 e5 Nf3 f6'], ['Vienna Game', 'e4 e5 Nc3'], ['Vienna Gambit', 'e4 e5 Nc3 Nf6 f4'], ['Vienna Game: Frankenstein-Dracula Variation', 'e4 e5 Nc3 Nf6 Bc4 Nxe4'],
    ['King’s Gambit', 'e4 e5 f4'], ['King’s Gambit Accepted', 'e4 e5 f4 exf4'], ['King’s Gambit Declined: Falkbeer Countergambit', 'e4 e5 f4 d5'],
    ['Bishop’s Opening', 'e4 e5 Bc4'], ['Center Game', 'e4 e5 d4 exd4 Qxd4'], ['Danish Gambit', 'e4 e5 d4 exd4 c3'], ['Bongcloud Attack', 'e4 e5 Ke2'],
    // 1.d4
    ['Queen’s Pawn Game', 'd4 d5'], ['Queen’s Pawn Game: Zukertort Variation', 'd4 d5 Nf3'], ['Queen’s Gambit', 'd4 d5 c4'], ['Queen’s Gambit Declined', 'd4 d5 c4 e6'],
    ['Queen’s Gambit Declined: Orthodox Defense', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7'], ['Queen’s Gambit Declined: Exchange Variation', 'd4 d5 c4 e6 Nc3 Nf6 cxd5'],
    ['Queen’s Gambit Declined: Ragozin Defense', 'd4 d5 c4 e6 Nc3 Nf6 Nf3 Bb4'], ['Queen’s Gambit Declined: Semi-Tarrasch Defense', 'd4 d5 c4 e6 Nc3 Nf6 Nf3 c5'],
    ['Tarrasch Defense', 'd4 d5 c4 e6 Nc3 c5'], ['Queen’s Gambit Accepted', 'd4 d5 c4 dxc4'], ['Queen’s Gambit Accepted: Main Line', 'd4 d5 c4 dxc4 Nf3 Nf6 e3'],
    ['Slav Defense', 'd4 d5 c4 c6'], ['Slav Defense: Exchange Variation', 'd4 d5 c4 c6 cxd5 cxd5'], ['Semi-Slav Defense', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6'],
    ['Albin Countergambit', 'd4 d5 c4 e5'], ['Chigorin Defense', 'd4 d5 c4 Nc6'], ['London System', 'd4 d5 Bf4'], ['London System', 'd4 Nf6 Bf4'],
    ['Colle System', 'd4 d5 Nf3 Nf6 e3'], ['Blackmar-Diemer Gambit', 'd4 d5 e4'], ['Trompowsky Attack', 'd4 Nf6 Bg5'], ['Torre Attack', 'd4 Nf6 Nf3 e6 Bg5'],
    ['Indian Defense', 'd4 Nf6'], ['King’s Indian Defense', 'd4 Nf6 c4 g6'], ['King’s Indian Defense: Classical Variation', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5'],
    ['King’s Indian Defense: Sämisch Variation', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3'], ['King’s Indian Defense: Four Pawns Attack', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4'],
    ['King’s Indian Defense: Fianchetto Variation', 'd4 Nf6 c4 g6 Nf3 Bg7 g3'], ['Grünfeld Defense', 'd4 Nf6 c4 g6 Nc3 d5'], ['Grünfeld Defense: Exchange Variation', 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4'],
    ['Nimzo-Indian Defense', 'd4 Nf6 c4 e6 Nc3 Bb4'], ['Nimzo-Indian Defense: Rubinstein Variation', 'd4 Nf6 c4 e6 Nc3 Bb4 e3'], ['Nimzo-Indian Defense: Classical Variation', 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2'],
    ['Queen’s Indian Defense', 'd4 Nf6 c4 e6 Nf3 b6'], ['Bogo-Indian Defense', 'd4 Nf6 c4 e6 Nf3 Bb4+'], ['Catalan Opening', 'd4 Nf6 c4 e6 g3'],
    ['Benoni Defense', 'd4 Nf6 c4 c5'], ['Modern Benoni', 'd4 Nf6 c4 c5 d5 e6'], ['Benko Gambit', 'd4 Nf6 c4 c5 d5 b5'], ['Budapest Gambit', 'd4 Nf6 c4 e5'], ['Old Indian Defense', 'd4 Nf6 c4 d6'],
    ['Dutch Defense', 'd4 f5'], ['Dutch Defense: Leningrad Variation', 'd4 f5 g3 Nf6 Bg2 g6'], ['Dutch Defense: Stonewall Variation', 'd4 f5 c4 Nf6 g3 e6 Bg2 d5'], ['Englund Gambit', 'd4 e5'],
    // flank openings
    ['English Opening: Symmetrical Variation', 'c4 c5'], ['English Opening: King’s English Variation', 'c4 e5'], ['English Opening: Anglo-Indian Defense', 'c4 Nf6'],
    ['Réti Opening', 'Nf3 d5 c4'], ['King’s Indian Attack', 'Nf3 d5 g3'],
  ];
  const NAMES = new Map(), PREFIX = new Map();
  for (const [name, line] of LINES) {
    const moves = line.split(' ');
    NAMES.set(line, name);
    for (let i = 0; i < moves.length; i++) {
      const key = moves.slice(0, i).join(' ');
      if (!PREFIX.has(key)) PREFIX.set(key, new Set());
      PREFIX.get(key).add(moves[i]);
    }
  }
  const strip = s => String(s).replace(/[#!?]/g, '');
  /* name of the opening for a list of SAN moves (the longest known line it follows) */
  function name(sans) {
    const m = sans.map(strip);
    for (let n = Math.min(m.length, 20); n > 0; n--) { const k = m.slice(0, n).join(' '); if (NAMES.has(k)) return NAMES.get(k); }
    return '';
  }
  /* is move i still inside a known opening line? */
  function isBook(sans, i) { const m = sans.map(strip); const set = PREFIX.get(m.slice(0, i).join(' ')); return !!set && set.has(m[i]); }
  /* known next moves after these moves */
  function next(sans) { const set = PREFIX.get(sans.map(strip).join(' ')); return set ? [...set] : []; }
  return { LINES, name, isBook, next };
});
