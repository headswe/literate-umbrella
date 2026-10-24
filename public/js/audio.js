// Tiny synth sounds, so we need no audio files.
let ac = null;
let muted = false;

export function unlockAudio() {
  if (!ac) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (A) ac = new A();
  }
  if (ac && ac.state === 'suspended') ac.resume();
}

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function tone(freq, dur, type = 'sine', vol = 0.15, slide = 0, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  chop: () => { tone(180, 0.08, 'square', 0.08, -60); tone(120, 0.1, 'triangle', 0.12, -40, 0.01); },
  clink: () => { tone(900, 0.07, 'triangle', 0.1); tone(1300, 0.09, 'sine', 0.06, 0, 0.03); },
  pop: () => { tone(520, 0.08, 'sine', 0.12, 300); },
  gain: () => { tone(660, 0.07, 'sine', 0.1); tone(990, 0.1, 'sine', 0.08, 0, 0.06); },
  nope: () => { tone(220, 0.12, 'sine', 0.08, -80); },
  step: () => { tone(90 + Math.random() * 30, 0.04, 'triangle', 0.03); },
};
