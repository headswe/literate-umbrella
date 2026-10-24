// Saves worlds in this browser. Storage can be missing (private mode), so every call is guarded.
const INDEX = 'myson.worlds';
const PREFIX = 'myson.world.';
const PROFILE = 'myson.profile';

function read(k, fallback) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function write(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function listWorlds() {
  return read(INDEX, []).sort((a, b) => (b.saved || 0) - (a.saved || 0));
}

export function loadSave(id) {
  return read(PREFIX + id, null);
}

export function storeSave(save) {
  const ok = write(PREFIX + save.id, save);
  const idx = read(INDEX, []).filter((w) => w.id !== save.id);
  idx.push({ id: save.id, name: save.name, saved: save.saved || Date.now() });
  write(INDEX, idx);
  return ok;
}

export function deleteSave(id) {
  try { localStorage.removeItem(PREFIX + id); } catch { /* ignore */ }
  write(INDEX, read(INDEX, []).filter((w) => w.id !== id));
}

export function loadProfile() {
  return read(PROFILE, { avatar: '🦄', name: '' });
}

export function storeProfile(p) {
  write(PROFILE, p);
}
