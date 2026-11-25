// "De sovande kungarnas värld" as a book of real pages, one under the other: scroll down to read.
// Text in bok.json; pictures listed in bilder.json and drawn with GPT by scripts/book-images.mjs.
// The text is laid out page by page in the browser, so it re-flows when the text size or width changes.
const [bok, { bilder }] = await Promise.all(['bok.json', 'bilder.json'].map((f) => fetch(f).then((r) => r.json())));

const bokEl = document.getElementById('bok');
const barTitel = document.getElementById('bar-titel');
const barSida = document.getElementById('bar-sida');
const framsteg = document.getElementById('framsteg');
const lasUppKnapp = document.getElementById('las-upp');
const panel = document.getElementById('installningar');
const ljuslada = document.getElementById('ljuslada');

// ---------------------------------------------------------------- saved settings
const lagrat = (k, d) => { try { return JSON.parse(localStorage.getItem('bok:' + k)) ?? d; } catch { return d; } };
const spara = (k, v) => { try { localStorage.setItem('bok:' + k, JSON.stringify(v)); } catch { /* private mode */ } };

const ljust = document.documentElement.dataset.theme === 'light'
  || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: light)').matches);
let tema = lagrat('tema', ljust ? 'dag' : 'natt');
let storlek = lagrat('sidstorlek', innerWidth < 520 ? 16 : 18);

function tillampaTema() {
  document.documentElement.dataset.tema = tema;
  document.documentElement.style.colorScheme = tema === 'natt' ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  panel.querySelectorAll('[data-tema]').forEach((b) => b.classList.toggle('vald', b.dataset.tema === tema));
}
tillampaTema();

// 'bladdra': turn pages one at a time (a spread of two on wide screens); 'scrolla': pages under each other.
let lage = lagrat('lage', 'bladdra');
let uppslag = false;
function markeraLage() {
  panel.querySelectorAll('[data-lage]').forEach((b) => b.classList.toggle('vald', b.dataset.lage === lage));
}
markeraLage();

document.getElementById('installningar-knapp').onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; };
document.addEventListener('click', (e) => { if (!panel.contains(e.target)) panel.hidden = true; });
panel.onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tema) { tema = b.dataset.tema; spara('tema', tema); tillampaTema(); }
  if (b.dataset.lage && b.dataset.lage !== lage) {
    const plats = platsNu();
    lage = b.dataset.lage;
    spara('lage', lage);
    markeraLage();
    paginera(plats);
  }
  if (b.dataset.storlek) {
    storlek = Math.min(26, Math.max(13, storlek + Number(b.dataset.storlek)));
    spara('sidstorlek', storlek);
    paginera(platsNu());
  }
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
const bildSrc = (b) => `bilder/${b.id}.jpg`;

function bild(b, attrs = {}) {
  const img = el('img', { src: bildSrc(b), alt: b.bildtext, decoding: 'async', ...attrs });
  img.addEventListener('click', () => { if (!nyssDrog) visa(b); });
  return img;
}
function visa(b) {
  ljuslada.querySelector('img').src = bildSrc(b);
  ljuslada.querySelector('p').textContent = b.bildtext;
  ljuslada.hidden = false;
}
ljuslada.onclick = () => { ljuslada.hidden = true; };

// Every block that starts a reading position gets an id (data-b), so a place in the book
// survives re-flowing the pages.
function block(id, node) { node.dataset.b = id; return node; }

// ---------------------------------------------------------------- pagination
let ankare = {};       // 'start', 'innehall', 'personer', 'kapitel-1' … → page element
let sidor = [];

function sidmatt() {
  const bredd = document.documentElement.clientWidth;
  uppslag = false;
  if (lage === 'scrolla') {
    const w = Math.min(bredd - 32, 600);
    return { w, h: Math.round(w * 1.5), marg: Math.round(w * 0.1) };
  }
  const topp = document.getElementById('bar').getBoundingClientRect().bottom;
  bokEl.style.setProperty('--topp', topp + 'px');
  const hojd = innerHeight - topp - 76; // room for the page controls under the book
  uppslag = bredd >= 900 && bredd > innerHeight;
  const w = Math.floor(Math.min(uppslag ? (bredd - 48) / 2 : bredd - 32, uppslag ? 560 : 600, hojd / 1.5));
  return { w, h: Math.round(w * 1.5), marg: Math.round(w * 0.1) };
}

function paginera(behall) {
  stoppaLasning();
  bokEl.classList.remove('bladdra', 'uppslag');
  document.body.classList.toggle('bladdrar', lage === 'bladdra');
  blad = [];
  vant = 0;
  const { w, h, marg } = sidmatt();
  bokEl.style.setProperty('--sw', w + 'px');
  bokEl.style.setProperty('--sh', h + 'px');
  bokEl.style.setProperty('--marg', marg + 'px');
  document.documentElement.style.setProperty('--storlek', storlek + 'px');
  bokEl.replaceChildren();
  ankare = {};
  sidor = [];

  let nr = 0;               // printed page number
  let kropp = null;         // text box of the current page
  let kapitel = null;       // chapter for the running head
  let vantande = [];        // pictures that did not fit and wait for the next page

  const sida = (klass = '', { naken = false, numrerad = true } = {}) => {
    if (numrerad) nr++;
    const s = el('section', { class: `sida ${klass} ${nr % 2 ? 'hoger' : 'vanster'}`.trim() });
    s.dataset.nr = numrerad ? nr : '';
    s.dataset.kapitel = kapitel ? `${ROMERSKA[kapitel.nummer]} · ${kapitel.titel}` : '';
    if (!naken) {
      if (kapitel) s.append(el('div', { class: 'huvud' }, nr % 2 ? kapitel.titel : bok.titel));
      kropp = el('div', { class: 'kropp' });
      s.append(kropp);
      if (numrerad) s.append(el('div', { class: 'fot' }, String(nr)));
    }
    bokEl.append(s);
    sidor.push(s);
    return s;
  };
  const ryms = () => kropp.scrollHeight <= kropp.clientHeight + 1;
  const ny = () => {
    sida();
    const v = vantande;
    vantande = [];
    v.forEach((f) => lagg(f));
  };
  const avsluta = () => { while (vantande.length) ny(); };

  // Put a block on the page; split a paragraph over two pages when it does not fit.
  function lagg(node, delbar = false) {
    kropp.append(node);
    if (ryms()) return;
    const ensam = kropp.childElementCount === 1;
    if (node.tagName === 'FIGURE' && !ensam) { node.remove(); vantande.push(node); return; }
    if (delbar) {
      const ord = node.textContent.split(' ');
      let lo = 0, hi = ord.length - 1;
      while (lo < hi) {
        const m = Math.ceil((lo + hi) / 2);
        node.textContent = ord.slice(0, m).join(' ');
        if (ryms()) lo = m; else hi = m - 1;
      }
      if (lo > 0) {
        node.textContent = ord.slice(0, lo).join(' ');
        node.classList.add('delad');
        const rest = el('p', { class: 'fortsatt' }, ord.slice(lo).join(' '));
        ny();
        lagg(rest, true);
        return;
      }
      node.textContent = ord.join(' ');
    }
    if (ensam) return; // taller than a whole page: let it be cut
    node.remove();
    // Do not leave a heading alone at the bottom of a page.
    const sist = kropp.lastElementChild;
    const rubrik = sist && /^H[23]$/.test(sist.tagName) ? sist : null;
    rubrik?.remove();
    ny();
    if (rubrik) kropp.append(rubrik);
    lagg(node, delbar);
  }

  // --- cover
  const omslag = bilder.find((b) => b.plats === 'omslag');
  const s0 = sida('omslag naken', { naken: true, numrerad: false });
  s0.dataset.b = 'start';
  ankare.start = s0;
  s0.append(
    bild(omslag, { loading: 'eager' }),
    el('div', { class: 'titel' }, el('h1', {}, bok.titel), el('p', { class: 'under' }, bok.undertitel)),
    el('div', { class: 'forf' }, bok.forfattare.toUpperCase()),
  );

  // --- title page
  sida('titelsida');
  kropp.append(
    el('h1', {}, bok.titel),
    el('p', { class: 'under' }, bok.undertitel),
    el('div', { class: 'ornament' }, '✦'),
    el('p', { class: 'forf' }, bok.forfattare),
    el('p', { class: 'utgava' }, `Kapitel 1–${bok.kapitel.length} av ${bok.kapitelplan.length}`),
  );

  // --- about the novel and its people
  sida();
  ankare.personer = sidor.at(-1);
  lagg(el('h2', { class: 'sektion' }, 'Om romanen'));
  lagg(block('om', el('p', { class: 'fortsatt' }, bok.sammanfattning)), true);
  lagg(el('h3', { class: 'sektion' }, 'Huvudpersoner'));
  bok.personer.forEach((p, i) => {
    const b = bilder.find((x) => x.plats === 'person' && x.person === p.namn);
    lagg(block('person-' + i, el('div', { class: 'person' },
      b ? bild(b) : el('div', { class: 'ingen-bild', 'aria-hidden': 'true' }, p.namn[0]),
      el('div', {}, el('b', {}, p.namn), el('span', {}, p.om)),
    )));
  });

  // --- contents (page numbers are filled in as the chapters are laid out)
  sida();
  ankare.innehall = sidor.at(-1);
  lagg(el('h2', { class: 'sektion' }, 'Innehåll'));
  const sidnummer = {};
  lagg(el('ol', { class: 'innehall-lista' }, bok.kapitelplan.map((k, i) => {
    const n = i + 1;
    const finns = bok.kapitel.some((c) => c.nummer === n);
    const sid = el('span', { class: 'sid' }, finns ? '' : 'kommer');
    sidnummer[n] = sid;
    return el('li', { class: finns ? undefined : 'kommer' },
      el('span', { class: 'nr' }, ROMERSKA[n]),
      finns ? el('a', { href: `#kapitel-${n}` }, k.titel) : el('span', { class: 't' }, k.titel),
      el('span', { class: 'prickar' }),
      sid,
    );
  })));

  // --- chapters
  for (const k of bok.kapitel) {
    avsluta();
    kapitel = k;
    sida('kapitelstart');
    ankare['kapitel-' + k.nummer] = sidor.at(-1);
    sidnummer[k.nummer].textContent = nr;
    kropp.append(block(`k${k.nummer}`, el('header', { class: 'kapitelhuvud' },
      el('div', { class: 'kapnr' }, `Kapitel ${ORD[k.nummer] || k.nummer}`),
      el('h2', {}, k.titel),
      el('p', { class: 'plats' }, k.plats),
      el('div', { class: 'ornament' }, '✦ ✦ ✦'),
    )));
    const figurer = bilder.filter((b) => b.plats === 'kapitel' && b.kapitel === k.nummer);
    k.stycken.forEach((s, i) => {
      const replik = s.startsWith('–');
      const klass = i === 0 ? 'forsta' : replik ? 'replik' : s.length < 60 ? 'kort' : undefined;
      lagg(block(`k${k.nummer}-${i}`, el('p', { class: klass }, s)), true);
      for (const b of figurer.filter((f) => s.startsWith(f.efter))) {
        lagg(el('figure', { class: 'illustration' }, bild(b, { loading: 'lazy' }), el('figcaption', {}, b.bildtext)));
      }
    });
    const nasta = bok.kapitel.find((c) => c.nummer === k.nummer + 1);
    const kommande = bok.kapitelplan[k.nummer];
    lagg(el('div', { class: 'slut' }, el('div', { class: 'ornament' }, '✦'),
      el('p', {}, nasta ? `Slut på kapitel ${ORD[k.nummer]}.` : kommande ? `Fortsättning följer i kapitel ${ORD[k.nummer + 1]}: ${kommande.titel}.` : 'Slut.')));
  }
  avsluta();

  if (lage === 'bladdra') byggBlad();
  if (behall) gaTill(behall, false);
  uppdateraBar();
}

// ---------------------------------------------------------------- turning pages
// The laid-out pages become leaves: a page on the front and the next page (or blank paper,
// one page at a time on a phone) on the back. A leaf turns around its left edge.
let blad = [];          // { el, fram, bak }
let vant = 0;           // leaves turned so far
let animerar = false;
let nyssDrog = false;
const lugn = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scen = el('div', { class: 'scen' });
const forraKnapp = el('button', { class: 'vand-knapp', 'aria-label': 'Förra sidan' }, '‹');
const nastaKnapp = el('button', { class: 'vand-knapp', 'aria-label': 'Nästa sida' }, '›');
const reglage = el('input', { type: 'range', id: 'reglage', min: '0', value: '0', step: '1', 'aria-label': 'Gå till sida' });
const kontroller = el('div', { class: 'kontroller' }, forraKnapp, reglage, nastaKnapp);
forraKnapp.onclick = () => vand(-1);
nastaKnapp.onclick = () => vand(1);
reglage.oninput = () => { vant = Number(reglage.value); placera(); efterVandning(); };

const maxVant = () => (uppslag ? blad.length : blad.length - 1);
const skuggaFor = (v) => Math.sin((Math.abs(v) * Math.PI) / 180) * 0.5;

function byggBlad() {
  bokEl.classList.add('bladdra');
  bokEl.classList.toggle('uppslag', uppslag);
  const par = [];
  if (uppslag) for (let i = 0; i < sidor.length; i += 2) par.push([sidor[i], sidor[i + 1] || el('section', { class: 'sida tom' })]);
  else for (const s of sidor) par.push([s, el('section', { class: 'sida tom' })]);
  blad = par.map(([fram, bak]) => {
    fram.classList.add('fram');
    bak.classList.add('bak');
    fram.append(el('div', { class: 'skugga' }));
    bak.append(el('div', { class: 'skugga' }));
    return { el: el('div', { class: 'blad' }, fram, bak), fram, bak };
  });
  scen.replaceChildren(...blad.map((b) => b.el));
  bokEl.replaceChildren(scen, kontroller);
  reglage.max = String(maxVant());
  placera();
}

function placera() {
  blad.forEach((b, j) => {
    const vandt = j < vant;
    // Only the leaves around the open page are drawn, so far-off pictures load later.
    const nara = j >= vant - 2 && j <= vant + 1 && (uppslag || !vandt);
    b.el.style.display = nara ? '' : 'none';
    b.el.style.transform = `rotateY(${vandt ? -180 : 0}deg)`;
    b.el.style.zIndex = vandt ? j + 1 : blad.length * 2 - j;
    b.el.querySelectorAll(':scope > .sida > .skugga').forEach((s) => { s.style.opacity = 0; });
  });
  forraKnapp.disabled = vant <= 0;
  nastaKnapp.disabled = vant >= maxVant();
}

function snurra(b, start, slut) {
  animerar = true;
  b.el.style.display = '';
  b.el.style.zIndex = 9999;
  const tid = lugn ? 1 : 90 + (650 * Math.abs(slut - start)) / 180;
  const opt = { duration: tid, easing: 'cubic-bezier(.3,.1,.25,1)', fill: 'forwards' };
  const a = b.el.animate([{ transform: `rotateY(${start}deg)` }, { transform: `rotateY(${slut}deg)` }], opt);
  const steg = [start, (start + slut) / 2, slut].map((v) => ({ opacity: skuggaFor(v) }));
  b.el.querySelectorAll(':scope > .sida > .skugga').forEach((s) => s.animate(steg, opt));
  return a.finished.then(() => {
    b.el.style.transform = `rotateY(${slut}deg)`;
    b.el.getAnimations({ subtree: true }).forEach((x) => x.cancel());
    animerar = false;
  });
}

function vand(riktning, fran) {
  if (animerar || !blad.length) return Promise.resolve();
  const j = riktning > 0 ? vant : vant - 1;
  if (j < 0 || (riktning > 0 && vant >= maxVant())) return Promise.resolve();
  const start = fran ?? (riktning > 0 ? 0 : -180);
  return snurra(blad[j], start, riktning > 0 ? -180 : 0).then(() => {
    vant += riktning;
    placera();
    efterVandning();
  });
}

function efterVandning() {
  reglage.value = String(vant);
  uppdateraBar();
  spara('plats', platsNu());
}

const bladIndex = (sidEl) => blad.findIndex((b) => b.fram === sidEl || b.bak === sidEl);
function oppnatVid(sidEl) {
  const j = bladIndex(sidEl);
  if (j < 0) return vant;
  return Math.min(uppslag && blad[j].bak === sidEl ? j + 1 : j, maxVant());
}
function synligaSidor() {
  return [uppslag ? blad[vant - 1]?.bak : null, blad[vant]?.fram].filter(Boolean);
}

// Drag a page with a finger or the mouse; a tap on the edge turns it.
let drag = null;
scen.addEventListener('pointerdown', (e) => {
  if (animerar || e.button > 0) return;
  drag = { x: e.clientX, id: e.pointerId, dir: 0, b: null, v: 0 };
});
scen.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  if (!drag.dir) {
    if (Math.abs(dx) < 10) return;
    drag.dir = dx < 0 ? 1 : -1;
    const j = drag.dir > 0 ? vant : vant - 1;
    if (j < 0 || (drag.dir > 0 && vant >= maxVant())) { drag = null; return; }
    drag.b = blad[j];
    drag.b.el.style.display = '';
    drag.b.el.style.zIndex = 9999;
    scen.setPointerCapture(e.pointerId);
  }
  const w = scen.clientWidth / (uppslag ? 2 : 1);
  const v = Math.max(-180, Math.min(0, (drag.dir > 0 ? 0 : -180) + (dx / w) * 180));
  drag.v = v;
  drag.b.el.style.transform = `rotateY(${v}deg)`;
  drag.b.el.querySelectorAll(':scope > .sida > .skugga').forEach((s) => { s.style.opacity = skuggaFor(v); });
});
function slappa(e, avbruten) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!d.dir) {
    if (avbruten || e.target.closest('a, img, button, input')) return;
    const r = scen.getBoundingClientRect();
    vand((e.clientX - r.left) / r.width < (uppslag ? 0.5 : 0.3) ? -1 : 1);
    return;
  }
  nyssDrog = true;
  setTimeout(() => { nyssDrog = false; }, 80);
  const klar = !avbruten && (d.dir > 0 ? d.v < -60 : d.v > -120);
  if (klar) vand(d.dir, d.v);
  else snurra(d.b, d.v, d.dir > 0 ? 0 : -180).then(placera);
}
scen.addEventListener('pointerup', (e) => slappa(e, false));
scen.addEventListener('pointercancel', (e) => slappa(e, true));

// ---------------------------------------------------------------- where am I
function synligSida() {
  if (lage === 'bladdra') return synligaSidor().at(-1) || sidor[0];
  const linje = innerHeight * 0.35;
  return sidor.find((s) => s.getBoundingClientRect().bottom > linje) || sidor[0];
}
function platsNu() {
  const s = synligSida();
  if (!s) return null;
  const b = s.dataset.b ? s : s.querySelector('[data-b]');
  return b?.dataset.b || null;
}
function gaTill(namn, mjukt = true) {
  const mal = ankare[namn] || bokEl.querySelector(`[data-b="${CSS.escape(namn)}"]`)?.closest('.sida');
  if (!mal) return false;
  if (lage === 'bladdra') {
    vant = oppnatVid(mal);
    placera();
    efterVandning();
    return true;
  }
  mal.scrollIntoView({ behavior: mjukt ? 'smooth' : 'instant', block: 'start' });
  return true;
}

let sparaTimer;
function uppdateraBar() {
  const s = synligSida();
  if (!s) return;
  barTitel.textContent = s.dataset.kapitel || bok.titel;
  barSida.textContent = s.dataset.nr ? `s. ${s.dataset.nr}` : '';
  const max = lage === 'bladdra' ? maxVant() : document.documentElement.scrollHeight - innerHeight;
  const nu = lage === 'bladdra' ? vant : scrollY;
  framsteg.style.width = (max > 0 ? Math.min(100, (nu / max) * 100) : 0).toFixed(1) + '%';
  lasUppKnapp.hidden = !(tal && s.dataset.kapitel);
}
addEventListener('scroll', () => {
  uppdateraBar();
  clearTimeout(sparaTimer);
  sparaTimer = setTimeout(() => spara('plats', platsNu()), 300);
}, { passive: true });

// ---------------------------------------------------------------- read aloud (Swedish voice)
const tal = 'speechSynthesis' in window ? speechSynthesis : null;
let laser = false;
function stoppaLasning() {
  laser = false;
  tal?.cancel();
  lasUppKnapp.textContent = '▶';
  lasUppKnapp.setAttribute('aria-pressed', 'false');
  document.querySelectorAll('p.laser').forEach((p) => p.classList.remove('laser'));
}
function visaStycke(p) {
  if (lage !== 'bladdra') return p.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const mal = oppnatVid(p.closest('.sida'));
  if (mal === vant + 1) vand(1);
  else if (mal !== vant) { vant = mal; placera(); efterVandning(); }
}
const allaStycken = () => [...bokEl.querySelectorAll('.kropp p:not(.plats)')];
function lasFran(i) {
  const st = allaStycken();
  if (!laser || i >= st.length) return stoppaLasning();
  // A paragraph split over two pages is read as one.
  const delar = [st[i]];
  while (st[i + delar.length]?.classList.contains('fortsatt')) delar.push(st[i + delar.length]);
  document.querySelectorAll('p.laser').forEach((x) => x.classList.remove('laser'));
  delar.forEach((p) => p.classList.add('laser'));
  visaStycke(delar[0]);
  const u = new SpeechSynthesisUtterance(delar.map((p) => p.textContent).join(' ').replace(/^–\s*/, ''));
  u.lang = 'sv-SE';
  const r = tal.getVoices();
  const rost = r.find((v) => v.lang === 'sv-SE') || r.find((v) => v.lang?.startsWith('sv'));
  if (rost) u.voice = rost;
  u.rate = 0.95;
  u.onend = () => lasFran(i + delar.length);
  tal.speak(u);
}
lasUppKnapp.onclick = () => {
  if (laser) return stoppaLasning();
  laser = true;
  lasUppKnapp.textContent = '■';
  lasUppKnapp.setAttribute('aria-pressed', 'true');
  const st = allaStycken();
  const synliga = lage === 'bladdra' ? synligaSidor() : null;
  const i = st.findIndex((p) => !p.classList.contains('fortsatt')
    && (synliga ? synliga.includes(p.closest('.sida')) : p.getBoundingClientRect().top > 70));
  lasFran(Math.max(0, i));
};

// ---------------------------------------------------------------- start
addEventListener('hashchange', () => gaTill(location.hash.slice(1)));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { ljuslada.hidden = true; panel.hidden = true; }
  if (lage !== 'bladdra' || e.target.closest?.('input, button') || !ljuslada.hidden) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); vand(1); }
  if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); vand(-1); }
});
let bredd = document.documentElement.clientWidth;
let hojd = innerHeight;
let flodTimer;
addEventListener('resize', () => {
  const b = document.documentElement.clientWidth;
  // Phones change height while scrolling, so in scroll mode only a new width re-flows.
  const nyHojd = lage === 'bladdra' && Math.abs(innerHeight - hojd) > 60;
  if (b === bredd && !nyHojd) return;
  bredd = b;
  hojd = innerHeight;
  const plats = platsNu();
  clearTimeout(flodTimer);
  flodTimer = setTimeout(() => paginera(plats), 200);
});

// Load the book's faces before measuring pages; a face arriving later would change line breaks.
const typsnitt = ['18px "EB Garamond"', 'italic 18px "EB Garamond"', '500 18px Cinzel', '700 18px Cinzel'];
await Promise.race([
  Promise.all(typsnitt.map((f) => document.fonts?.load(f).catch(() => null))),
  new Promise((r) => setTimeout(r, 3000)),
]);
paginera();
const fran = location.hash.slice(1);
if (!(fran && gaTill(fran, false))) {
  const sparad = lagrat('plats', null);
  if (sparad && sparad !== 'start') gaTill(sparad, false);
}
uppdateraBar();
