// Sound effects are synthesized with Web Audio, so there are no audio files to license.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('muted') === '1'; } catch { /* storage blocked */ }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(c, { f, to, at = 0, dur = 0.12, type = 'sine', vol = 0.16 }) {
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  tap: [{ f: 620, to: 420, dur: 0.06, type: 'triangle', vol: 0.12 }],
  tick: [{ f: 1500, dur: 0.04, type: 'square', vol: 0.06 }],
  ok: [{ f: 660, dur: 0.1, type: 'triangle' }, { f: 990, at: 0.09, dur: 0.16, type: 'triangle' }],
  fail: [{ f: 260, to: 90, dur: 0.38, type: 'sawtooth', vol: 0.14 }],
  object: [0, 0.16, 0.32, 0.48].map((at, i) => ({ f: i % 2 ? 660 : 880, at, dur: 0.14, type: 'square', vol: 0.09 })),
  win: [523, 659, 784, 1047].map((f, i) => ({ f, at: i * 0.11, dur: 0.22, type: 'triangle' })),
};

export function play(name) {
  if (muted || !SOUNDS[name]) return;
  const c = audio();
  if (c) for (const n of SOUNDS[name]) tone(c, n);
}
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('muted', m ? '1' : '0'); } catch { /* storage blocked */ }
}
// Browsers only allow sound after a tap; call this from the first user gesture.
export const unlock = () => { audio(); };
