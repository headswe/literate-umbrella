// Reader for "De sovande kungarnas värld". Text in bok.json, pictures listed in bilder.json
// and drawn with GPT by scripts/book-images.mjs into bilder/<id>.webp.
const [bok, { bilder }] = await Promise.all(['bok.json', 'bilder.json'].map((f) => fetch(f).then((r) => r.json())));

const app = document.getElementById('app');
const barTitel = document.getElementById('bar-titel');
const framsteg = document.getElementById('framsteg');
const lasUppKnapp = document.getElementById('las-upp');
const panel = document.getElementById('installningar');
const ljuslada = document.getElementById('ljuslada');

// ---------------------------------------------------------------- saved settings
const lagrat = (k, d) => { try { return JSON.parse(localStorage.getItem('bok:' + k)) ?? d; } catch { return d; } };
const spara = (k, v) => { try { localStorage.setItem('bok:' + k, JSON.stringify(v)); } catch { /* private mode */ } };

let storlek = lagrat('storlek', 20);
let tema = lagrat('tema', 'natt');
function tillampa() {
  document.documentElement.style.setProperty('--storlek', storlek + 'px');
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name=theme-color]').content = getComputedStyle(document.body).backgroundColor;
  panel.querySelectorAll('[data-tema]').forEach((b) => b.classList.toggle('vald', b.dataset.tema === tema));
}
tillampa();

document.getElementById('installningar-knapp').onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; };
document.addEventListener('click', (e) => { if (!panel.contains(e.target)) panel.hidden = true; });
panel.onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.storlek) storlek = Math.min(30, Math.max(15, storlek + Number(b.dataset.storlek) * 2));
  if (b.dataset.tema) tema = b.dataset.tema;
  spara('storlek', storlek); spara('tema', tema); tillampa();
};

// ---------------------------------------------------------------- helpers
const el = (tag, attrs = {}, ...barn) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...barn.flat().filter((b) => b != null));
  return n;
};

const ROMERSKA = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const ORD = ['noll', 'ett', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv'];

// A GPT picture, or a quiet placeholder until scripts/book-images.mjs has drawn it.
function bild(b, klass = 'bild') {
  const ph = () => el('div', { class: 'platshallare', role: 'img', 'aria-label': b.bildtext },
    el('div', {}, el('b', {}, '◬'), el('span', {}, b.plats === 'kapitel' ? 'Bilden är inte ritad än' : b.bildtext)));
  const img = el('img', { class: klass, src: `bilder/${b.id}.webp`, alt: b.bildtext, loading: b.plats === 'omslag' ? 'eager' : 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(ph()));
  img.addEventListener('click', () => visa(b));
  return img;
}
function visa(b) {
  ljuslada.querySelector('img').src = `bilder/${b.id}.webp`;
  ljuslada.querySelector('p').textContent = b.bildtext;
  ljuslada.hidden = false;
}
ljuslada.onclick = () => { ljuslada.hidden = true; };

const senast = () => lagrat('senast', null);

// ---------------------------------------------------------------- views
function omslag() {
  const s = senast();
  const omslagsbild = bilder.find((b) => b.plats === 'omslag');
  barTitel.textContent = '';
  return el('section', { class: 'omslag' },
    el('div', { class: 'omslag-bild' }, bild(omslagsbild)),
    el('div', { class: 'omslag-titel' },
      el('h1', {}, bok.titel),
      el('p', { class: 'under' }, bok.undertitel),
      el('p', { class: 'forfattare' }, bok.forfattare),
      el('div', { class: 'knappar' },
        s && s.kapitel
          ? el('a', { class: 'knapp primar', href: `#/kapitel/${s.kapitel}` }, `Fortsätt · kapitel ${s.kapitel}`)
          : el('a', { class: 'knapp primar', href: '#/kapitel/1' }, 'Börja läsa'),
        el('a', { class: 'knapp', href: '#/innehall' }, 'Innehåll'),
        el('a', { class: 'knapp', href: '#/personer' }, 'Personer'),
      ),
    ),
    el('p', { class: 'sammanfattning' }, bok.sammanfattning),
  );
}

function innehall() {
  barTitel.textContent = 'Innehåll';
  const lasta = lagrat('lasta', {});
  return el('section', { class: 'sida' },
    el('h2', {}, 'Innehåll'),
    el('ol', { class: 'innehall' }, bok.kapitelplan.map((k, i) => {
      const n = i + 1;
      const finns = bok.kapitel.some((c) => c.nummer === n);
      const delar = [
        el('span', { class: 'nr' }, ROMERSKA[n] || n),
        el('span', { class: 't' }, k.titel),
        el('span', { class: 'etikett' + (lasta[n] ? ' last' : '') }, finns ? (lasta[n] ? 'Läst ✓' : '') : 'Kommer'),
        el('span', { class: 'om' }, k.om),
      ];
      return el('li', {}, finns ? el('a', { href: `#/kapitel/${n}` }, delar) : el('div', { class: 'kommer' }, delar));
    })),
    el('nav', { class: 'bottenmeny' }, el('a', { href: '#/' }, 'Omslaget'), el('a', { href: '#/personer' }, 'Personer')),
  );
}

function personer() {
  barTitel.textContent = 'Personer';
  return el('section', { class: 'sida' },
    el('h2', {}, 'Huvudpersoner'),
    el('div', { class: 'personer' }, bok.personer.map((p) => {
      const b = bilder.find((x) => x.plats === 'person' && x.person === p.namn);
      return el('article', { class: 'person' }, b && bild(b), el('h3', {}, p.namn), el('p', {}, p.om));
    })),
    el('nav', { class: 'bottenmeny' }, el('a', { href: '#/' }, 'Omslaget'), el('a', { href: '#/innehall' }, 'Innehåll')),
  );
}

function kapitel(n) {
  const k = bok.kapitel.find((c) => c.nummer === n);
  if (!k) return innehall();
  barTitel.textContent = `${ROMERSKA[n]} · ${k.titel}`;
  const figurer = bilder.filter((b) => b.plats === 'kapitel' && b.kapitel === n);
  const text = el('div', { class: 'text' });
  k.stycken.forEach((s, i) => {
    const replik = s.startsWith('–');
    const klass = i === 0 ? 'forsta' : replik ? 'replik' : s.length < 60 && !replik ? 'kort' : '';
    text.append(el('p', { class: klass || undefined, 'data-i': i }, s));
    for (const b of figurer.filter((f) => s.startsWith(f.efter))) {
      text.append(el('figure', { class: 'illustration' }, bild(b), el('figcaption', {}, b.bildtext)));
    }
  });
  const forra = bok.kapitel.find((c) => c.nummer === n - 1);
  const nasta = bok.kapitel.find((c) => c.nummer === n + 1);
  const kommande = bok.kapitelplan[n];
  return el('div', {},
    el('article', { class: 'kapitel' },
      el('header', {},
        el('div', { class: 'kapnr' }, `Kapitel ${ORD[n] || n}`),
        el('h1', {}, k.titel),
        el('p', { class: 'plats' }, k.plats),
        el('div', { class: 'ornament' }, '✦ ✦ ✦'),
      ),
      text,
      el('div', { class: 'slut' }, el('div', { class: 'ornament' }, '✦'),
        el('p', {}, nasta ? `Slut på kapitel ${ORD[n] || n}.` : kommande ? `Fortsättning följer: ${kommande.titel}.` : 'Slut.')),
    ),
    el('nav', { class: 'nav-kapitel' },
      forra ? el('a', { href: `#/kapitel/${forra.nummer}` }, el('small', {}, '← Förra'), forra.titel) : el('a', { href: '#/' }, el('small', {}, '←'), 'Omslaget'),
      nasta ? el('a', { class: 'nasta', href: `#/kapitel/${nasta.nummer}` }, el('small', {}, 'Nästa →'), nasta.titel)
        : el('a', { class: 'nasta', href: '#/innehall' }, el('small', {}, '→'), 'Innehåll'),
    ),
  );
}

// ---------------------------------------------------------------- reading position
let aktuelltKapitel = null;
let sparaTimer;
function pagaendeProcent() {
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? Math.min(1, scrollY / max) : 0;
}
addEventListener('scroll', () => {
  if (!aktuelltKapitel) return;
  const p = pagaendeProcent();
  framsteg.style.width = (p * 100).toFixed(1) + '%';
  clearTimeout(sparaTimer);
  sparaTimer = setTimeout(() => {
    spara('senast', { kapitel: aktuelltKapitel, procent: p });
    if (p > 0.97) spara('lasta', { ...lagrat('lasta', {}), [aktuelltKapitel]: true });
  }, 250);
}, { passive: true });

// ---------------------------------------------------------------- read aloud (Swedish voice)
const tal = 'speechSynthesis' in window ? speechSynthesis : null;
let laser = false;
function svenskRost() {
  const r = tal.getVoices();
  return r.find((v) => v.lang === 'sv-SE') || r.find((v) => v.lang?.startsWith('sv'));
}
function stoppaLasning() {
  laser = false;
  tal?.cancel();
  lasUppKnapp.textContent = '▶';
  lasUppKnapp.setAttribute('aria-pressed', 'false');
  document.querySelectorAll('p.laser').forEach((p) => p.classList.remove('laser'));
}
function lasFran(p) {
  if (!p || !laser) return stoppaLasning();
  document.querySelectorAll('p.laser').forEach((x) => x.classList.remove('laser'));
  p.classList.add('laser');
  p.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const u = new SpeechSynthesisUtterance(p.textContent.replace(/^–\s*/, ''));
  u.lang = 'sv-SE';
  const rost = svenskRost();
  if (rost) u.voice = rost;
  u.rate = 0.95;
  u.onend = () => {
    let n = p.nextElementSibling;
    while (n && n.tagName !== 'P') n = n.nextElementSibling;
    lasFran(n);
  };
  tal.speak(u);
}
lasUppKnapp.onclick = () => {
  if (laser) return stoppaLasning();
  laser = true;
  lasUppKnapp.textContent = '■';
  lasUppKnapp.setAttribute('aria-pressed', 'true');
  // Start at the first paragraph on screen.
  const stycken = [...document.querySelectorAll('.text p')];
  lasFran(stycken.find((p) => p.getBoundingClientRect().bottom > 80) || stycken[0]);
};

// ---------------------------------------------------------------- router
function route() {
  stoppaLasning();
  const [, vy, arg] = location.hash.split('/');
  aktuelltKapitel = vy === 'kapitel' ? Number(arg) : null;
  lasUppKnapp.hidden = !(aktuelltKapitel && tal);
  framsteg.style.width = '0';
  const vyn = vy === 'kapitel' ? kapitel(Number(arg)) : vy === 'innehall' ? innehall() : vy === 'personer' ? personer() : omslag();
  app.replaceChildren(vyn);
  const s = senast();
  if (aktuelltKapitel && s && s.kapitel === aktuelltKapitel && s.procent > 0.02) {
    requestAnimationFrame(() => scrollTo(0, s.procent * (document.documentElement.scrollHeight - innerHeight)));
  } else {
    scrollTo(0, 0);
  }
  if (aktuelltKapitel) spara('senast', { kapitel: aktuelltKapitel, procent: s?.kapitel === aktuelltKapitel ? s.procent : 0 });
  app.focus({ preventScroll: true });
}
addEventListener('hashchange', route);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { ljuslada.hidden = true; panel.hidden = true; }
});
route();
