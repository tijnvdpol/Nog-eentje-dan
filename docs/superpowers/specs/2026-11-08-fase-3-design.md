# Nog Eentje Dan — Fase 3: ontwerp (spec)

*Datum: 2026-11-08 · Auteur: Tijn (met Claude) · Status: ter review*

Deze spec bouwt voort op `2026-11-08-scroll-rij-game-design.md` (hierna: **hoofdspec**) en `2026-11-08-fase-2-design.md` (hierna: **spec fase 2**). Waar deze spec iets anders zegt, geldt deze spec.

**Voorwaarde:** fase 3 wordt pas gebouwd als fase 2 af, gereviewd en samengevoegd is. Fase 3 gebruikt onderdelen uit fase 2: `game/Simulation.ts`, het opdrachtensysteem met chatscherm en tijdsbalk, de sixpack, de ring-logica voor op- en afritten, de colliders voor bomen en het geluid. Wijkt de echte fase 2-code af van de spec van fase 2, dan volgt het bouwplan van fase 3 de echte code.

## 1. Doel en scope

**Doel:** de wereld afmaken met een N-weg naar een dorp met tankstation, flitspalen toevoegen waarvan de boete via de telefoon binnenkomt, en de game zo afwerken dat hij online kan als portfoliostuk.

**In scope:**
- expliciete wegsoorten in het wegennet;
- de N-weg, het dorp, het tankstation en het dorpscafé;
- een extra bijvulpunt en nieuwe bestemmingsopdrachten;
- flitspalen en de boete-opdracht;
- een prestatie-check;
- een nieuw startscherm met instellingen;
- een melding op mobiel;
- online zetten op Vercel, met een deelvoorbeeld en een README als portfoliopagina.

**Niet in scope:** echte 3D-modellen (Kenney e.d., aparte fase later), brandstof, eten bij het tankstation, radio, politie, online leaderboard, mobiele besturing.

**Geslaagd als:**
- je zonder vastlopers van het feestje via de ring en de N-weg naar het dorp en terug kunt rijden;
- de flitspaal met de boete op de telefoon minstens zo grappig is als de rood-bonus;
- de game op de testroute (§6.2) minstens 45 fps haalt;
- de game live staat op een Vercel-link die er netjes uitziet als je hem deelt.

## 2. Gemaakte keuzes

| Onderwerp | Keuze |
|---|---|
| Flitspaal | **Boete als opdracht**: betaalverzoek op de telefoon met tijdsbalk; niet betalen kost punten |
| Tankstation | **Bijvulpunt + bestemming** (nachtshop); geen brandstofmeter |
| Wereldopbouw | **Bestaand wegennet uitbreiden** in `scripts/generate-roads.ts`; één wegennet |
| Afwerking | Online zetten + README, startscherm + instellingen, melding op mobiel, prestatie-check |

## 3. Wereld: wegsoorten, N-weg en dorp

### 3.1 Wegsoorten
De huidige code leidt de soort weg af uit de maximumsnelheid (`speedLimitKmh === 80` → oprit, `=== 130` → ring), uit de zone of uit het voorvoegsel van een id. De N-weg rijdt ook 80 km/u en zou dan als oprit worden gezien. Daarom krijgt `RoadEdge` een verplicht veld:

```ts
type RoadKind = 'stad' | 'ring' | 'oprit' | 'nweg' | 'dorp';
interface RoadEdge { /* bestaande velden */ kind: RoadKind }
```

- Alle code die nu een wegsoort afleidt uit snelheid, zone of id-voorvoegsel gebruikt voortaan `kind`. Dat geldt voor `CityBuilder.ts` (lantaarns, bomen, vangrails), `cityLayout.ts`, en voor wat fase 2 heeft toegevoegd (bijv. ring-nodes en opritten in de verkeerslogica). Het bouwplan begint met een zoekactie naar deze plekken.
- `zone` blijft bestaan voor de puntenmultiplier: `stad` en `dorp` → `city`, `nweg` → `nweg`, `ring` → `snelweg`. Een `oprit` houdt de zone van de weg waar hij naartoe leidt: de bestaande opritten `snelweg`, de nieuwe afrit naar de N-weg `nweg`.

### 3.2 N-weg
- **Afrit:** nieuw wegdeel `opr3` (`kind: 'oprit'`, 1 strook, 80 km/u, zone `nweg`) van `n0` (700, 0) naar ringknooppunt `r0` (640, 0). Voor de verkeerslogica uit fase 2 is dit gewoon een oprit (invoegen, afslaan met kans 0,25).
- **Knooppunten:** `n0` (700, 0), `n1` (950, 0), `n2` (1200, 40), `n3` (1450, 90), `n4` (1700, 90), `n5` (1950, 40), `n6` (2200, 0), `n7` (2450, 0). Wegdelen `nw0`…`nw6` verbinden ze op volgorde, en `nw7` loopt van `n7` naar `d0` (2500, 0). Totaal ongeveer 1,8 km, met bochten van hooguit 12°.
- **Eigenschappen:** `kind: 'nweg'`, 1 strook per richting, 80 km/u, zone `nweg`.
- **Aankleding:**
  - geen lantaarns;
  - aan beide kanten een bomenrij op 9 m uit het midden van de weg, om de 15 m (boomstammen met colliders zoals in fase 2);
  - reflectorpaaltjes om de 50 m aan beide kanten, op 4,5 m uit het midden. Dat zijn instanced paaltjes met een witte, zelflichtende kop en zonder collider.

### 3.3 Dorp
- **Hoofdstraat:** `d0` (2500, 0) → `d1` (2600, 0) → `d2` (2700, 0) → `d3` (2800, 0), met wegdelen `dh0` (`d0`–`d1`), `dh1` (`d1`–`d2`) en `dh2` (`d2`–`d3`).
- **Zijstraten (doodlopend):** `dz0` van `d1` naar `d4` (2600, 80), `dz1` van `d2` naar `d5` (2700, −80) en `dz2` van `d3` naar `d6` (2800, 80).
- **Eigenschappen:** `kind: 'dorp'`, 1 strook per richting, 30 km/u, zone `city`.
- Kruispunten volgen de regel "wie het eerst komt" uit spec fase 2 §5.2. Er zijn geen stoplichten of zebrapaden.
- Op een doodlopend eind keert verkeer om, zoals de huidige `nextOf` al doet als er geen ander wegdeel is.
- **Bebouwing:** nieuwe pure functie `generateVillageLayout(graph, seed)` in `world/villageLayout.ts`.
  - Huisjes langs beide kanten van elk `dorp`-wegdeel, om de 14 m (met 30% kans op een gat).
  - Grondvlak 8 × 9 m, 7 m van het midden van de weg, gevelhoogte 3–5 m plus een zadeldak van 2,5 m (instanced prisma).
  - Botsingsvorm: een kubus om het hele huis.
  - Geen huis binnen 20 m van een knooppunt, zodat de kruispunten vrij blijven.
- **Kerk:** een vast gebouw op (2850, 0), 14 × 24 m, met een toren van 30 m en een spits. Op de spits brandt een rood lampje (zelflichtend), als herkenningspunt.
- **Lantaarns:** langs `dorp`-wegdelen om de 40 m, op één kant.

### 3.4 Nieuwe plekken
`Place.id` krijgt er `'tankstation'` en `'dorpscafe'` bij.

| id | Naam | Plek | Functie |
|---|---|---|---|
| `tankstation` | Tankstation | (2460, 12) | bijvulpunt sixpack + bestemming |
| `dorpscafe` | Café De Gouden Karper | (2700, 12) | bestemming |

- **Dorpscafé:** een vast gebouw van 12 × 10 m met het midden op (2700, 18), met een verlicht uithangbord. Het staat op de plek die bij `d2` vrij blijft, aan de kant zonder zijstraat. `generateVillageLayout` zet daar geen huis.

- **Tankstation:**
  - Een open voorterrein van 30 × 20 m naast de N-weg, met het midden op (2460, 18).
  - Een overkapping op vier dunne palen met colliders, en een felverlichte nachtshop (een kubus met lichtgevend raam) aan de achterkant.
  - Op het voorterrein komt geen bomenrij of reflectorpaal.
  - Het puntje van de plek ligt zo dat stilstaan op het voorterrein binnen 15 m valt.
- **Bijvullen:** de regel uit spec fase 2 §4 geldt nu voor `supermarkt`, `feestje` en `tankstation`. De lijst bijvulplekken staat in `config.ts`. Het zwevende bier-icoon bij ≤ 2 biertjes verschijnt ook boven het tankstation.
- **Opdrachten:** `tasks.json` krijgt 4 bestemmingsopdrachten erbij: 2 naar `tankstation` en 2 naar `dorpscafe`, reward 400–500, tijdslimiet 120–150 s, satirisch en met verzonnen personen. Voorbeeld: *"Opa: neem je nog een zak drop mee van de pomp?"*

## 4. Flitspalen

### 4.1 Plaatsing
`RoadData` krijgt:
```ts
speedCameras: { id: string; edgeId: string; s: number; dir: 1 | -1 }[];
```
`s` is gemeten vanaf de `from`-node. `dir: 1` meet verkeer in de richting `from → to`.

| id | Wegdeel | s | dir | Limiet |
|---|---|---|---|---|
| `fl_ring` | `ring4` | midden | 1 | 130 |
| `fl_nweg_heen` | `nw2` | midden | 1 (richting dorp) | 80 |
| `fl_nweg_terug` | `nw5` | midden | −1 (richting stad) | 80 |
| `fl_dorp` | `dh1` | 50 | 1 | 30 |

`scripts/generate-roads.ts` genereert ze en `roads.json` wordt opnieuw gegenereerd en gecommit.

**Beeld:**
- Een grijze kast (0,6 × 1,0 × 0,6 m) op een paal van 3 m, rechts van de gemeten rijrichting, 2 m buiten de rand van de weg.
- Op de kast reflecterende gele strepen, zodat hij vanaf ongeveer 100 m te zien is.
- De paal heeft een collider (cilinder r 0,15 m).

### 4.2 Detectie (puur: `world/speedCameraDetector.ts`)
Een flitspaal flitst als in één simulatiestap alles hieronder geldt:
- de speler passeert de lijn dwars op het wegdeel bij `s`, dus het teken van (s_speler − s) wisselt;
- de speler staat zijdelings binnen `breedte van de weg / 2 + 2 m` van het midden van dat wegdeel;
- de rijrichting van de speler wijkt minder dan 60° af van de gemeten richting;
- de snelheid is hoger dan `speedLimitKmh + 4` km/u.

Daarna geldt:
- één flits per passage; de paal doet weer mee als de speler meer dan 50 m van de paal is;
- `kmhOver = round(snelheid − speedLimitKmh)` (dus zonder de marge van 4).

**Effect bij een flits:**
- een wit DOM-vlak over het beeld, met dekking van 0,8 naar 0 in 0,3 s;
- nieuw geluid `flits` (gegenereerd, te vervangen door `public/sounds/flits.mp3` zoals in spec fase 2 §8.3);
- start of verhoging van de boete (§4.3).

### 4.3 De boete (puur: `tasks/fineSystem.ts`)
De boete heeft een **eigen plek**, los van de ene actieve opdracht uit spec fase 2 §3.1. De lopende opdracht en haar timer gaan gewoon door.

**Bij een flits zonder open boete** wordt een boete geopend:
- `bedragEur = 50 + 8 × kmhOver`
- `strafPunten = 50 + 5 × kmhOver`
- tijdslimiet 12 s

**Bij een flits met een open boete:** het nieuwe bedrag en de nieuwe strafpunten gaan erbij, en de tijd begint weer bij 12 s.

**Melding en scherm:**
- Melding (ook met de telefoon omlaag) van afzender **"Centraal Boete Bureau"** (verzonnen, avatar 🏛️):
  *"U reed {snelheid} km/u waar {limiet} km/u geldt. Boete: €{bedrag}. Betaal binnen 12 sec."*
  Bij een verhoging: *"Nóg een overtreding. Openstaand: €{bedrag}."*
- Met de telefoon omhoog toont de telefoon het chatscherm uit fase 2, in een "officiële" stijl (grijze kop, zakelijk lettertype), met een tijdsbalk en drie knoppen:
  - **Betalen**
  - **Bezwaar maken**
  - **Ik was het niet**

  De volgorde van de knoppen wordt per boete gehusseld.
- **Voorrang:** zolang er een boete openstaat, toont de telefoon de boete vóór de lopende opdracht. Na de reactie op de boete gaat de telefoon terug naar de opdracht, als die nog loopt.

**Afloop:**
- **Betalen:** geen punten eraf. Er volgt een willekeurige reactie uit ≥ 4 bedankjes, bijv. *"Bedankt voor uw bijdrage aan de staatskas 🙏"*. Het bedrag telt mee als betaald.
- **Bezwaar maken, "Ik was het niet" of tijd op:** `score = max(0, score − strafPunten)` (niet vermenigvuldigd). Er volgt een willekeurige aanmaning uit ≥ 4 teksten, bijv. *"Bezwaar afgewezen. Verhoging: €50 😤"*. Het openstaande bedrag + €50 telt mee als niet betaald.

De teksten staan op dezelfde plek als de rood-teksten uit fase 2.

**Score niet onder 0:** ook de strafpunten voor een bijna-aanrijding (spec fase 2 §7.3) laten de score voortaan niet onder 0 zakken.

### 4.4 Statistieken en eindscherm
`RunStats` krijgt `flitsen`, `fineTotalEur` (inclusief verhogingen) en `finePaidEur`. Extra regel op het eindscherm:
- bij ≥ 1 flits: `${n} keer geflitst. €${totaal} aan boetes, waarvan je €${betaald} hebt betaald.` ("1 keer" blijft gelijk);
- anders: `Geen enkele keer geflitst. Saai.`

## 5. Startscherm, instellingen en mobiel

### 5.1 Startscherm
`Screens.showStart` wordt een titelscherm met:
- een tekstlogo "Nog Eentje Dan" in CSS, met 🍺;
- de satire-disclaimer *"Satire. Dit is precies waarom je dit nooit in het echt doet."*;
- een kaartje met de bediening: de bestaande `CONTROLS` plus `M` (geluid aan/uit);
- de lokale highscore;
- de knoppen **Start** en **Instellingen**.

**Achtergrond:** de 3D-stad 's avonds. Een camera zweeft langzaam rond het centrum (straal 250 m, hoogte 60 m, één rondje per 90 s). Het canvas krijgt achter het startscherm een CSS-blur van 4 px. Er rijdt geen speler-auto, en de verkeerssimulatie staat stil.

### 5.2 Instellingen (puur: `settings/settings.ts`)
| Instelling | Waarden | Standaard | Werking |
|---|---|---|---|
| Volume | 0–100 | 80 | hoofdvolume van de `AudioEngine` |
| Minder zwalk | aan/uit | uit | camera-zwalk, RGB-shift en dubbele tekst op de telefoon × 0,5 |

- Opgeslagen in localStorage onder `nog-eentje-dan:settings`, als JSON en in try/catch. Bij ontbrekende of kapotte data gelden de standaardwaarden.
- Te openen vanaf het startscherm en vanaf het pauzescherm. Veranderingen werken meteen.
- `nog-eentje-dan:muted` (M-toets) blijft los bestaan.
- "Minder zwalk" schaalt de uitvoer van `drunk/effects.ts`. Besturing, black-outs en punten veranderen niet.

### 5.3 Melding op mobiel (puur: `ui/deviceCheck.ts`)
- `isTouchOnly(mm)`: `mm('(pointer: coarse)')` is waar én `mm('(any-pointer: fine)')` is onwaar. `mm` is een meegegeven `matchMedia`, zodat de functie te testen is.
- De controle gebeurt vóór het laden van de wereld, zodat een telefoon niets zwaars hoeft te laden.
- Bij `true` verschijnt het scherm *"Nog Eentje Dan speel je op een laptop. Je hebt een toetsenbord nodig 🍻"*, met de disclaimer en een link **Toch proberen**. Die link laadt de game gewoon.

## 6. Prestaties

### 6.1 Ingrepen
- **Instanced objecten per vak:** gebouwen, huisjes, daken, lantaarns, bomen en reflectorpaaltjes worden niet langer als één groep over de hele kaart getekend. Ze worden verdeeld in vakken van 250 × 250 m, met één instanced mesh per soort per vak en een eigen bounding sphere. Daardoor slaat frustum culling hele vakken buiten beeld over.
- **Debug (`?debug`):** naast de FPS ook het aantal draw calls en driehoeken (`renderer.info.render`).
- Het verkeer blijft binnen 300 m en maximaal 30 auto's.

### 6.2 Testroute
Feestje → snelste weg naar de ring → afrit `opr3` → N-weg → dorp → tankstation → terug naar het feestje, bij 0‰ en bij 1,5‰. Doel: ≥ 45 fps op de laagste meting, liefst 60 fps. Wordt dat niet gehaald, dan worden eerst de afstelwaarden verlaagd (aantal auto's, bomendichtheid) voordat er code verandert.

## 7. Online zetten

### 7.1 Branch en Vercel
- De repo krijgt een **`main`**-branch, vanaf de samengevoegde stand na fase 3, en die wordt de standaardbranch op GitHub. De tijdelijke `claude/…`-branches blijven voor werk in uitvoering.
- Er komt een Vercel-project, gekoppeld aan de GitHub-repo: framework Vite, build `npm run build`, uitvoer `dist`, productiebranch `main`. Andere branches krijgen automatisch een preview-link.
- Er is geen `vercel.json` nodig, tenzij de build daarom vraagt.

### 7.2 Deelvoorbeeld en favicon
- In `index.html`: `<title>`, `meta description`, Open Graph (`og:title`, `og:description`, `og:image`, `og:url`) en `twitter:card = summary_large_image`.
- `public/og.png` (1200 × 630): eerst een eenvoudige titelkaart (logo + disclaimer op een donkere avondachtergrond), gemaakt met een script. Tijn vervangt die later door een echte screenshot.
- `public/favicon.svg`: een 🍺 in SVG.

### 7.3 README als portfoliopagina
`README.md` krijgt de volgende onderdelen:
1. Titel, één zin uitleg en de satire-disclaimer.
2. De live link (Vercel).
3. Screenshots en een korte GIF uit `docs/media/`. Die maakt Tijn met een schermopname-tool. De README noemt de bestandsnamen en een korte instructie in een commentaarblok.
4. Wat je doet in de game: rijden, Swiep, bier, opdrachten, rood licht, flitspalen.
5. Techniek: Vite, TypeScript, Three.js, Rapier, Web Audio, Vitest.
6. Hoe het in elkaar zit:
   - pure spelregels los van Three.js en de DOM, met tests;
   - alle afstelling in `src/config.ts`;
   - het wegennet als gegenereerde data;
   - een korte modulekaart.
7. Gebouwd in fases, met verwijzingen naar de specs in `docs/superpowers/specs/`.
8. Lokaal draaien (`npm install`, `npm run dev`, `?debug`, `npm test`).

## 8. Techniek

### 8.1 Modules

| Bestand | Verantwoordelijkheid | Puur? |
|---|---|---|
| `world/types.ts` | `RoadKind`, `kind` op `RoadEdge`, `speedCameras`, nieuwe `Place.id`'s | ja |
| `world/villageLayout.ts` | huisjes en kerk van het dorp | ja |
| `world/speedCameraDetector.ts` | flitsdetectie (§4.2) | ja |
| `tasks/fineSystem.ts` | boete openen, verhogen, afronden (§4.3) | ja |
| `settings/settings.ts` | instellingen lezen, schrijven, standaardwaarden | ja |
| `ui/deviceCheck.ts` | `isTouchOnly` | ja |
| `world/chunking.ts` | objecten verdelen over vakken van 250 m | ja |
| `world/VillageBuilder.ts`, `world/SpeedCameraView.ts`, `world/TankstationView.ts` | 3D-weergave | nee |
| `ui/Flash.ts`, `ui/SettingsScreen.ts` | DOM-weergave | nee |

**Aangepast:**
- `scripts/generate-roads.ts`
- `public/content/roads.json` (opnieuw gegenereerd)
- `public/content/tasks.json`
- `world/CityBuilder.ts` (`kind` in plaats van snelheid, vakken)
- `world/cityLayout.ts`
- de verkeerslogica (`kind`)
- `state/GameSession.ts` (boete, score ≥ 0)
- `stats/runStats.ts`
- `phone/Phone.ts` (boetescherm en voorrang)
- `audio/AudioEngine.ts` (geluid `flits`, hoofdvolume)
- `drunk/effects.ts` (schaal voor "minder zwalk")
- `ui/Screens.ts`
- `ui/Hud.ts` of de debug-overlay
- `game/Simulation.ts`
- `main.ts`
- `index.html`
- `README.md`
- `config.ts`

### 8.2 Afstelwaarden in `config.ts`
```ts
speedCamera: { toleranceKmh: 4, rearmDistM: 50, maxHeadingDeg: 60, lateralMarginM: 2, flashSec: 0.3 },
fine: { baseEur: 50, eurPerKmh: 8, basePenalty: 50, penaltyPerKmh: 5, timeLimitSec: 12, surchargeEur: 50 },
beer: { /* bestaand */ refillPlaces: ['supermarkt', 'feestje', 'tankstation'] },
world: { /* bestaand */ chunkSizeM: 250 },
settings: { defaultVolume: 80, reducedMotionFactor: 0.5 },
```

### 8.3 Foutafhandeling
- Een flitspaal met een onbekend `edgeId` of een `s` buiten het wegdeel wordt overgeslagen, met `console.warn`.
- Instellingen niet leesbaar of localStorage niet beschikbaar: standaardwaarden, geen crash.
- `matchMedia` niet beschikbaar: `isTouchOnly` geeft `false` (de game laadt gewoon).
- Ontbrekend `flits.mp3`: terugval op het gegenereerde geluid.

### 8.4 Testen
**Vitest:**
- **Wegennet:**
  - elk wegdeel heeft een `kind`;
  - de N-weg en het dorp zijn bereikbaar vanaf `feestje`;
  - `opr3` sluit aan op `r0`;
  - elke flitspaal staat op een bestaand wegdeel met `0 < s < lengte`;
  - elke plek ligt binnen 15 m van een wegdeel;
  - geen bocht op de N-weg is scherper dan 12°.
- **Dorp:** geen huis binnen weg-halfbreedte + 1 m van een wegdeel en geen huis binnen 20 m van een knooppunt; dezelfde seed geeft dezelfde uitkomst.
- **Flitsdetectie:**
  - flitst niet bij precies limiet + 4;
  - flitst niet in de andere rijrichting en niet naast de weg;
  - één keer per passage;
  - weer actief na 50 m.
- **Boete:**
  - bedrag en strafpunten volgens de formules;
  - optellen en nieuwe tijd bij een tweede flits;
  - betalen, bezwaar, "Ik was het niet" en tijd op;
  - de score zakt niet onder 0.
- **Instellingen:** standaardwaarden, opslaan en lezen, kapotte JSON.
- **`isTouchOnly`:** alle combinaties van de twee media-queries.
- **Vakken:** elk object komt in precies één vak.
- **Eindscherm:** de regels uit §4.4.

**Stresstest:** de stresstest uit spec fase 2 §9.3 draait ook met verkeer op de N-weg en in het dorp, inclusief omkeren op doodlopende straten. Daarbij geen deadlock en geen twee auto's op dezelfde strook binnen 2 m van elkaar.

**Speeltest + FPS:** de testroute uit §6.2.

### 8.5 Volgorde
Elke stap levert een speelbare versie op.
1. **Wegsoorten** (`kind`) en alle afleidingen omzetten, zonder zichtbare verandering.
2. **N-weg en dorp:** wegennet, aankleding, huisjes, kerk.
3. **Tankstation en dorpscafé:** bijvullen, bier-icoon, nieuwe opdrachten.
4. **Flitspalen en de boete:** detectie, flits, boetescherm, statistieken.
5. **Prestaties:** vakken, debug-overlay, testroute meten.
6. **Startscherm, instellingen en de melding op mobiel.**
7. **Online zetten:** `main`, Vercel, deelvoorbeeld, favicon, README.
