# Nog Eentje Dan 🍺

Satirische rij-game: scroll op Swiep, drink een biertje, rij door. **Dit is precies waarom je dit nooit in het echt doet.**

**Speel het:** https://nog-eentje-dan.vercel.app

<!--
Tijn: zet hier de media neer en haal dit commentaarblok weg.
  docs/media/gameplay.gif          (max. 10 s, max. 8 MB, opnemen met een schermopname-tool, 1280 px breed)
  docs/media/screenshot-stad.png
  docs/media/screenshot-dorp.png
  docs/media/screenshot-boete.png
Daarna hieronder per bestand:  ![omschrijving](docs/media/<bestand>)
-->

## Wat je doet

- **Rijden** door een nachtelijke stad, over de ringweg, de N-weg en door een dorp met kerk en café. Je auto kan schade oplopen en total loss gaan.
- **Swiep:** pak met `Q` je telefoon en scroll door de feed. Dubbelklik om te liken; combo's en bier verhogen je punten, maar je kijkt dan niet naar de weg.
- **Bier:** drink uit je sixpack met `E`. Meer promille, meer punten, en meer zwalk, wazig beeld en black-outs. Een nieuwe sixpack haal je bij de supermarkt, het feestje of het tankstation.
- **Opdrachten** op je telefoon: chatten met mama, een post liken of ergens naartoe rijden voordat de tijd om is.
- **Rood licht:** door rood rijden levert punten op. Voetgangers laten schrikken kost er juist.
- **Flitspalen:** te hard langs een flitspaal en het Centraal Boete Bureau stuurt je een boete. Betalen of niet? Binnen 12 seconden, op je telefoon.
- Instellingen (volume, "minder zwalk") en `M` voor geluid aan/uit.

## Techniek

Vite, TypeScript (strict), Three.js, Rapier (physics), Web Audio (alle geluid wordt gegenereerd) en Vitest.

## Hoe het in elkaar zit

- **Pure spelregels, los van Three.js en de DOM**, met tests: scoring, promille, schade, verkeer, stoplichten, voetgangers, flitsdetectie, boete, instellingen.
- **Alle afstelling in één bestand:** `src/config.ts`.
- **Het wegennet is gegenereerde data:** `scripts/generate-roads.ts` schrijft `public/content/roads.json`; verkeer, zones, opdrachten en flitspalen werken daardoor vanzelf op nieuwe wegen.
- **Modulekaart:**
  - `src/world/`: wegennet, stad, dorp, N-weg, tankstation, flitspalen, instanced objecten per vak
  - `src/traffic/`, `src/pedestrians/`: verkeer en voetgangers
  - `src/game/Simulation.ts`: één vaste simulatiestap
  - `src/tasks/`, `src/beer/`, `src/state/`, `src/scoring/`: opdrachten, boete, sixpack, score
  - `src/phone/`, `src/ui/`: telefoon en schermen
  - `src/render/`, `src/audio/`: beeld en geluid
  - `src/main.ts`: verbindt alles

## Gebouwd in fases

1. **Fase 1:** [hoofdspec](docs/superpowers/specs/2026-11-08-scroll-rij-game-design.md): stad, ringweg, verkeer, telefoon-feed, bier, schade, highscore.
2. **Fase 2:** [spec](docs/superpowers/specs/2026-11-08-fase-2-design.md): opdrachten, sixpack, stoplichten, voetgangers, geluid.
3. **Fase 3:** [spec](docs/superpowers/specs/2026-11-08-fase-3-design.md): N-weg, dorp, tankstation, flitspalen, startscherm en instellingen, online.

## Lokaal draaien

```bash
npm install
npm run dev      # ontwikkelen; voeg ?debug toe voor fps, draw calls en toetsen 1-4 voor promillage
npm test         # unit tests (Vitest)
npm run build    # statische build in dist/
npm run gen:roads   # wegennet opnieuw genereren
npm run gen:og      # deelvoorbeeld (public/og.png) opnieuw genereren
```

Eigen geluiden: zie `public/sounds/README.txt`.

---
Alle namen in de game ("Centraal Boete Bureau", "Café De Gouden Karper", Swiep, …) zijn verzonnen.
