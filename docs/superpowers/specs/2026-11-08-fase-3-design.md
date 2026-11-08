# Nog Eentje Dan — Fase 3: ontwerp (spec)

*Datum: 2026-11-08 · Auteur: Tijn (met Claude) · Status: ter review*

Deze spec bouwt voort op `2026-11-08-scroll-rij-game-design.md` (**hoofdspec**) en `2026-11-08-fase-2-design.md`. Waar deze spec iets anders zegt, geldt deze spec.

## 1. Doel en scope

**Doel:** de wereld uitbreiden met een lichtgebogen N-weg naar een dorp met tankstation, en flitspalen die te hard rijden bestraffen met een satirische boete op de telefoon.

**In scope:** N-weg (~2 km, 80 km/u, zone `nweg`), dorp, tankstation (bestemming en bijvulpunt), drie flitspalen, flits-effect, boetemelding, puntenaftrek, statistiekregel.

**Niet in scope:** visuele polish, balans, menu's of tutorial ("afwerking" blijft klein), stoplichten of voetgangers in het dorp, flitspalen in de stad of op de ringweg, politie, online leaderboard, mobiel.

**Geslaagd als:** de speler van de ring over de N-weg naar het dorp kan rijden en terug; verkeer op de N-weg en in het dorp blijft in de vijf-minuten-stresstest zonder vastlopers; een flitspaal geeft precies één boete per passage; ≥ 45 fps blijft gelden.

## 2. Gemaakte keuzes

| Onderwerp | Keuze |
|---|---|
| N-weg | Lichte S-bocht als keten van korte edges, geen aparte stuurlogica |
| Dorp | Rooster van 3×3 knooppunten, zone `city`, geen lichten of zebrapaden |
| Tankstation | Nieuwe plek in het dorp: bestemming én bierbijvulpunt |
| Flitspalen | Alleen N-weg en dorpsingang; straf is puntenaftrek + melding |
| Afwerking | Alleen wat de N-weg en flitspalen nodig hebben |

## 3. Wereld

### 3.1 N-weg
- Knooppunten `n1…n10` van `r0` (640, 0) naar het dorp, 200 m per stuk (~2 km totaal). Het pad is een sinus met zijdelingse uitwijking ≤ ~150 m. Elke knik tussen opeenvolgende edges blijft **≤ 8°** (de ring heeft 11,25° per knik), zodat de bestaande rijlijn- en lane-offset-berekening ongewijzigd werkt.
- Edges `nweg0…nweg9`: `lanesPerDir: 1`, `speedLimitKmh: 80`, `zone: 'nweg'`.
- `r0` is vrij: de ramps liggen op `r8`, `r20` en `r28`. De aansluiting op de ring gebruikt dezelfde invoeg- en afslaglogica als de ramps; N-weg wordt een extra afslag-optie in de bestaande `exitProb`-keuze.

### 3.2 Dorp
- Knooppunten `v{i}_{j}` (3×3, spacing 100 m, dus een dorp van 200 × 200 m) achter het einde van de N-weg; de N-weg komt aan op de west-middenknoop. Edges zone `city`, 50 km/u, 1 rijstrook per richting. Geen doodlopende stukken.
- Gebouwen via `generateCityLayout`; de hard-gecodeerde `startsWith('g')` wordt een parameter (`prefix`), zodat stad en dorp dezelfde generator gebruiken.
- `CityBuilder` slaat nu alles over dat niet zone `city` is. De N-weg krijgt zijn eigen weergave (asfalt, middenstreep), bomen en lantaarnpalen via de bestaande autoplaatsing.

### 3.3 Tankstation
- Plek `tankstation` in het dorp, met een klein model (overkapping en pompen) naast de weg.
- Nieuwe bestemming: 2 extra opdrachten in `public/content/tasks.json` (Nederlands, satirisch, met `onSuccess`/`onFail`). Opdrachten naar het tankstation zijn pas geldig als `destMinDistM` het toelaat (ze zijn dus nooit "al aangekomen").
- Bijvulpunt voor bier met dezelfde regels als supermarkt en feestje (`CONFIG.beer.refillRadiusM`, `refillMaxKmh`, `refillHoldSec`).

## 4. Flitspalen

### 4.1 Data
`roads.json` krijgt `cameras: { id: string; edgeId: string; s: number; limitKmh: number }[]`. Drie stuks:
- twee op de N-weg (limiet 80), op verschillende edges;
- één vlak vóór de dorpsingang (limiet 50): de klassieke snelheidsval na 80 km/u.

### 4.2 Detectie (`src/world/speedCameraDetector.ts`, puur)
- Invoer per stap: positie, snelheid (km/u) en `nearestEdge`; geen `three`, Rapier of DOM.
- De passage telt als de speler op `edgeId` de positie `s` voorbijgaat, in beide richtingen.
- Boven `limitKmh + CONFIG.camera.toleranceKmh` geeft de detector één `cameraFlash`-event per passage. Her-armen na `CONFIG.camera.rearmM` verwijdering of na `CONFIG.camera.cooldownSec`.
- Willekeur is niet nodig; de boete is deterministisch uit de overschrijding.

### 4.3 Gevolgen
- Event `cameraFlash { cameraId, speedKmh, limitKmh, fineEur }` in `src/core/events.ts`.
- Puntenaftrek: `CONFIG.camera.penaltyPoints`. Geen nieuw game-over-pad, geen aanpassing van de zonemultiplier.
- Boete: `fineEur = CONFIG.camera.baseFineEur + CONFIG.camera.perKmhEur × (speedKmh − limitKmh)`, afgerond, alleen voor weergave.
- UI: witte flits in beeld (`Hud`), banner "Boete €…" op de telefoon (ook zichtbaar met telefoon omlaag), flits-geluid in `soundParams`/`AudioEngine`.
- `RunStats`: regel "Flitsboetes" (aantal en totaal bedrag) op het eindscherm.

### 4.4 Config
`CONFIG.camera = { toleranceKmh: 3, penaltyPoints: 50, baseFineEur: 30, perKmhEur: 5, rearmM: 100, cooldownSec: 10 }`; startwaarden, bij te stellen na speeltest.

## 5. Techniek en testen

- Nieuwe/aangepaste modules: `scripts/generate-roads.ts` (N-weg, dorp, tankstation, camera's), `src/world/types.ts` (`Camera`, `RoadData.cameras`), `src/world/roadGraph.ts`, `src/world/cityLayout.ts` (prefix), `src/world/CityBuilder.ts` (N-weg en dorp), `src/world/speedCameraDetector.ts`, `src/game/Simulation.ts` (koppeling), `src/config.ts`, `src/core/events.ts`, `src/ui/Hud.ts`, `src/audio/*`, `src/stats/runStats.ts`, `public/content/tasks.json`.
- **Tests (Vitest, pure):**
  - Generator: aansluiting op `r0`, elke knik ≤ 8°, N-weg en dorp bereikbaar vanaf de ring en terug, `roads.json` gelijk aan generatoroutput.
  - `speedCameraDetector`: geen flits onder limiet + marge; één flits per passage; beide rijrichtingen; her-armen; geen flits op andere wegdelen.
  - Verkeer: de stresstest (5 minuten, spelers stil) bevat ook auto's op N-weg en dorp zonder vastlopers.
  - Boetebedrag en `RunStats`-regel.
- **Handmatig:** `npm run dev`: rijd naar het dorp; flits bij 100 km/u op de N-weg en bij 70 km/u op de dorpsingang; geen flits bij 80 of 50 km/u; tankstation vult bier bij; ≥ 45 fps.

## 6. Open punten voor de speeltest

De waarden in `CONFIG.camera` en de plaatsing van de camera's langs de N-weg worden na speeltesten bijgesteld. Daarna volgt eventueel een aparte afwerkingsfase.
