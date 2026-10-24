// Reads text aloud in Swedish, for kids who can't read yet. Quietly does nothing where speech is missing.
// Each creature passes its own pitch and speed so they sound different with the same built-in voice.
let voice = null;
let unlocked = false;

function pickVoice() {
  try {
    const sv = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('sv'));
    // Prefer a voice that lives on the device: they start faster and work offline.
    voice = sv.find((v) => v.localService) || sv[0] || null;
  } catch { voice = null; }
}

try {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
} catch { /* no speech */ }

const muted = () => { try { return localStorage.getItem('myson.muted') === '1'; } catch { return false; } };

// iPad and iPhone Safari only speak after speech has been started from a tap; call this from one.
export function unlockSpeech() {
  if (unlocked) return;
  unlocked = true;
  try {
    if (!voice) pickVoice();
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch { /* no speech */ }
}

export function isSpeaking() {
  try { return speechSynthesis.speaking; } catch { return false; }
}

// `how` is { pitch, rate }. `polite` waits its turn instead of cutting off what is being said.
export function speak(text, how = {}, polite = false) {
  if (muted()) return;
  try {
    if (polite && speechSynthesis.speaking) return;
    if (!voice) pickVoice();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}☀-➿⭐❤️]/gu, '').trim());
    u.lang = 'sv-SE';
    if (voice) u.voice = voice;
    u.rate = how.rate ?? 0.95;
    u.pitch = how.pitch ?? 1.15;
    // Safari can drop an utterance queued in the same tick as cancel().
    setTimeout(() => { try { speechSynthesis.speak(u); } catch { /* ignore */ } }, 30);
  } catch { /* no speech */ }
}

export function stopSpeaking() {
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
}
