# Mysön

Ett mysigt 3D-kubspel för barn (5–7 år). Hugg träd, plantera nya, bygg möbler och hus,
och få nya djurvänner som flyttar in och önskar sig saker. Spelas i webbläsaren på iPad,
mobil och dator, ensam eller tillsammans på samma wifi.

## Spela på telefonen

Spelet ligger på https://headswe.github.io/literate-umbrella/ (byggs från `main`
med GitHub Pages). Öarna sparas i webbläsaren på varje telefon eller iPad.

**Spela med en kompis utan dator:** den som har ön trycker på 👋 och läser upp koden,
till exempel `SOL-42`. Kompisen skriver koden under **Gå till en kompis ö** och trycker
**Gå med**. Telefonerna pratar direkt med varandra (WebRTC); PeerJS gratistjänst
används bara för att de ska hitta varandra. Ön och kompisens ryggsäck sparas hos den
som bjöd in. När värden går hem kommer kompisarna tillbaka till startsidan.

## Spela tillsammans på wifi:t med en dator

På en dator i hemmet:

```sh
npm install
npm start
```

Servern skriver ut en adress, till exempel `http://192.168.1.20:8080`. Öppna den på
alla iPads och telefoner som ska vara med. Under **Tillsammans på wifi:t** på
startsidan kan man göra en ny gemensam ö eller dela en ö man redan har (📡).
Gemensamma öar sparas i mappen `saves/` på datorn.

Spelet går också att spela ensam utan server; då sparas ön i webbläsaren.

## Styrning

- **Tryck** på marken för att gå dit. Tryck på träd, stenar, blommor och djur.
- **Håll fingret** på skärmen för att gå mot fingret.
- **Nyp** eller **+ / −** för att zooma. Vrid med två fingrar eller **↺ / ↻** (dator: Q / E).
- Dator: **WASD** eller piltangenterna.

## Vad man kan göra

- **Samla:** yxan fäller träd (de ger trä och frön), hackan bryter sten, handen plockar
  blommor, snäckor och äpplen. Rätt verktyg väljs av sig självt när man trycker.
- **Odla:** jordhackan gör jord i gräset, frön planteras i jorden och blir träd på en minut.
- **Bygga:** 🔨 öppnar byggmenyn. Klossar kan staplas och klättras på. ↻ vrider saken,
  ♻️ plockar upp den igen och ger tillbaka materialet.
- **Vänner:** Stjärna bor i ett tält från början. Bygg ett hus så flyttar en ny vän in.
  Tryck på en vän för att höra vad den önskar sig (läses upp på svenska). Uppfyllda
  önskningar ger hjärtan, stjärnor och presenter.

Lägg till `?low` i adressen för enklare grafik utan skuggor.

## Bygga en fristående sida

`npm run build:artifact` gör `dist/myson.html` med allt inbakat i en fil (three.js laddas från jsDelivr).

## Kod

- `public/js/sim.js` – spelregler; körs i webbläsaren när man spelar ensam och på servern på delade öar
- `public/js/data.js` – saker, byggen, vänner och deras önskningar
- `public/js/worldgen.js` – ön skapas från ett frö
- `public/js/render3d.js`, `models.js`, `characters.js`, `textures.js` – 3D-grafik med three.js
- `public/js/main.js` – spelloop, styrning, menyer och prat
- `public/js/net.js`, `server.js` – delade öar över wifi med WebSocket
- `public/js/p2p.js` – spela telefon till telefon med en kod (PeerJS/WebRTC); `?peer=värd:port` använder en egen PeerJS-server
