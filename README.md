# Mysön

Ett mysigt kubspel för barn (5–7 år). Samla trä, sten, äpplen, blommor och snäckor på din egen ö.
Spelas i webbläsaren på iPad, mobil och dator.

## Spela

```sh
npm install
npm start
```

Öppna adressen som skrivs ut. Andra enheter på samma wifi kan öppna `http://<datorns-ip>:8080`.

## Styrning

- **Tryck** på marken för att gå dit. Tryck på ett träd, en sten eller en blomma för att samla.
- **Håll fingret** på skärmen för att gå mot fingret.
- **Nyp** eller använd **+ / −** för att zooma.
- Dator: **WASD** eller piltangenterna.

## Bygga en fristående sida

`npm run build:artifact` gör `dist/myson.html` med allt inbakat i en fil.

## Kod

- `public/js/sim.js` – spelregler (körs i webbläsaren nu, på LAN-servern senare)
- `public/js/worldgen.js` – ön skapas från ett frö
- `public/js/render.js` – isometrisk kubgrafik på canvas
- `public/js/main.js` – spelloop, styrning och knappar
