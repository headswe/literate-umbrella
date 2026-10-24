// Reads text aloud in Swedish, for kids who can't read yet. Quietly does nothing where speech is missing.
let voice = null;

function pickVoice() {
  try {
    const voices = speechSynthesis.getVoices();
    voice = voices.find((v) => v.lang?.toLowerCase().startsWith('sv')) || null;
  } catch { voice = null; }
}

try {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
} catch { /* no speech */ }

export function speak(text) {
  try {
    if (localStorage.getItem('myson.muted') === '1') return;
  } catch { /* ignore */ }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, ''));
    u.lang = 'sv-SE';
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.pitch = 1.15;
    speechSynthesis.speak(u);
  } catch { /* no speech */ }
}

export function stopSpeaking() {
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
}
