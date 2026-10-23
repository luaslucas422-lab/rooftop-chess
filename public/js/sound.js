/* Rooftop Chess – sounds, made on the fly with Web Audio (no files to download) */
(function (root) {
  'use strict';
  let ctx = null, on = true, noise = null;
  const ac = () => {
    if (!ctx) { try { ctx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  function noiseBuf(c) { if (noise) return noise; noise = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return noise; }
  /* a wooden "tock": filtered noise plus a short low thump */
  function tock(c, t, gain, freq, body) {
    const n = c.createBufferSource(); n.buffer = noiseBuf(c);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.4;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    n.connect(bp).connect(g).connect(c.destination); n.start(t); n.stop(t + 0.09);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(body, t); o.frequency.exponentialRampToValueAtTime(body * 0.6, t + 0.08);
    const g2 = c.createGain(); g2.gain.setValueAtTime(gain * 0.9, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g2).connect(c.destination); o.start(t); o.stop(t + 0.12);
  }
  function tone(c, t, f, dur, gain, type) {
    const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.value = f;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const SOUNDS = {
    move: (c, t) => tock(c, t, 0.5, 1900, 190),
    capture: (c, t) => { tock(c, t, 0.75, 1300, 150); tock(c, t + 0.035, 0.35, 2400, 260); },
    castle: (c, t) => { tock(c, t, 0.5, 1900, 190); tock(c, t + 0.09, 0.45, 1700, 170); },
    check: (c, t) => { tock(c, t, 0.45, 1900, 190); tone(c, t + 0.02, 880, 0.16, 0.12, 'triangle'); },
    promote: (c, t) => { tock(c, t, 0.45, 1900, 190); tone(c, t + 0.03, 660, 0.1, 0.1); tone(c, t + 0.1, 990, 0.16, 0.1); },
    start: (c, t) => { tone(c, t, 523, 0.18, 0.12); tone(c, t + 0.12, 784, 0.28, 0.12); },
    end: (c, t) => { tone(c, t, 784, 0.2, 0.12); tone(c, t + 0.14, 659, 0.2, 0.12); tone(c, t + 0.28, 523, 0.4, 0.12); },
    win: (c, t) => { tone(c, t, 523, 0.15, 0.12); tone(c, t + 0.1, 659, 0.15, 0.12); tone(c, t + 0.2, 784, 0.15, 0.12); tone(c, t + 0.3, 1047, 0.45, 0.12); },
    correct: (c, t) => { tone(c, t, 880, 0.12, 0.12); tone(c, t + 0.08, 1320, 0.25, 0.12); },
    wrong: (c, t) => { tone(c, t, 196, 0.22, 0.12, 'square'); },
    illegal: (c, t) => { tone(c, t, 150, 0.08, 0.08, 'square'); },
    tick: (c, t) => { tone(c, t, 1600, 0.04, 0.06, 'square'); },
    notify: (c, t) => { tone(c, t, 988, 0.12, 0.1); tone(c, t + 0.09, 1319, 0.18, 0.1); },
  };
  root.Sound = {
    set enabled(v) { on = !!v; }, get enabled() { return on; },
    unlock() { ac(); },
    play(name) { if (!on) return; const c = ac(); if (!c || !SOUNDS[name]) return; try { SOUNDS[name](c, c.currentTime + 0.005); } catch (e) {} },
    vibrate: true,
    /* a short buzz for a move in a live game (phones that support it) */
    buzz(rec) { if (this.vibrate && navigator.vibrate) try { navigator.vibrate(rec && rec.capture ? 28 : 14); } catch (e) {} },
    /* the right sound for a move record from Chess.Game */
    forMove(rec) { if (!rec) return; this.play(/#|\+/.test(rec.san) ? 'check' : rec.promo ? 'promote' : rec.castle ? 'castle' : rec.capture ? 'capture' : 'move'); },
  };
})(typeof self !== 'undefined' ? self : this);
