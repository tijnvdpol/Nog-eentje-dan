# Nog Eentje Dan — Fase 2: ontwerp (spec)

*Datum: 2026-11-08 · Auteur: Tijn (met Claude) · Status: ter review*

Deze spec bouwt voort op `2026-11-08-scroll-rij-game-design.md` (hierna: **hoofdspec**) en op de code van fase 1 (branch `claude/elegant-mayer-7wf4q2` met de verkeersfix `7dab2f3`, plus de vijf fixes van `claude/vijf-bugs-hud-feed-avatar-p5u8cg`). Waar deze spec iets anders zegt dan de hoofdspec, geldt deze spec.

## 1. Doel en scope

**Doel:** de stad levend en de rit doelgericht maken: opdrachten op de telefoon, een beperkte biervoorraad, stoplichten met een bonus voor door rood rijden, voetgangers, verkeer dat netjes wacht en invoegt, en geluid.

**In scope:** opdrachten (chat, like, bestemming), sixpack-biervoorraad met bijvullen, stoplichten + kruispunt-reservering, invoegen op de ring, veilige rijstrookwissel, vooruitkijken over kruispunten, zebrapaden + voetgangers, botsing met lantaarnpalen en bomen, gegenereerd geluid met optionele eigen bestanden.

**Niet in scope:** N-weg en dorp, flitspalen (fase 3), radio/muziek, linksaf-voorrang tegen tegenliggers, online leaderboard, mobiel.

**Geslaagd als:** de vijf minuten-stresstest (§9) zonder vastlopers en zonder door elkaar rijdend verkeer slaagt; opdrachten en bijvullen geven de speler een reden om door de stad te rijden; de game blijft ≥ 45 fps met 30 auto's en 12 voetgangers.

## 2. Gemaakte keuzes

| Onderwerp | Keuze |
|---|---|
| Door rood rijden | **Bonus**: +25 basispunten (× bier × zone) plus sarcastische melding |
| Geluid | Gegenereerd met de Web Audio API; een bestand in `public/sounds/` vervangt het gegenereerde geluid |
| Bier | **Sixpack**: start met 6, bijvullen bij supermarkt of feestje |
| Kruispunten | **Reservering**: stoplichten op 6 kruispunten, elders wie het eerst komt |

## 3. Opdrachten

### 3.1 Planning
- De eerste opdracht start 20 s nadat de laatste intro-melding is getoond.
- Daarna start een nieuwe opdracht 45–60 s (willekeurig) nadat de vorige is **afgerond** (geslaagd of mislukt).
- Maximaal één actieve opdracht. Een opdracht komt niet twee keer achter elkaar terug.
- Een bestemmingsopdracht kiest alleen een plek die ≥ 150 m van de speler ligt; als die er niet is, wordt een andere opdracht gekozen.

### 3.2 Types
Alle opdrachten komen binnen als melding (ook met telefoon omlaag) met een **tijdsbalk** in de telefoon.

- **Chat:** de telefoon (als die omhoog is) toont een chatscherm met het bericht en 3 antwoordknoppen. Een antwoord uit `correct` = geslaagd; ander antwoord of tijd op = mislukt. Antwoorden kan alleen met de telefoon omhoog.
- **Like:** like de post met `postId`. De feed plaatst die post binnen de volgende 10 posts. Geslaagd zodra die post geliket wordt (de gewone likepunten komen daar los bij). Als de post al eerder in deze rit geliket is, wordt die opdracht niet gekozen.
- **Bestemming:** een pijl bovenaan de voorruit wijst naar de plek, met de afstand in meters. Geslaagd = binnen 15 m van de plek én < 20 km/u, binnen de tijdslimiet.

### 3.3 Punten
`punten = Math.round(reward × bierMultiplier × zoneMultiplier)` op het moment van voltooien (geen combo). Mislukt = 0 punten. Na afloop stuurt de afzender een reactie (`onSuccess` / `onFail`, met een standaardtekst als die ontbreekt).

### 3.4 Content-formaat
`public/content/tasks.json` is een array. Gemeenschappelijke velden: `id`, `type`, `from` (afzender), `text`, `timeLimitSec`, `reward`, optioneel `onSuccess`, `onFail`.
- `chat`: `answers` (precies 3 strings), `correct` (indexen).
- `like`: `postId` (moet bestaan in `posts.json`).
- `destination`: `target` (een `Place.id`).

Startset: **30 opdrachten** — 15 chat (reward 50–200, tijdslimiet 8–15 s), 7 like (reward 50–100, 20–30 s), 8 bestemming (reward 300–500, 60–120 s). Nederlands, satirisch, verzonnen personen, geen echte merken.

## 4. Bier: de sixpack

- Start met **6** biertjes; maximum 6. De cupholder toont het aantal.
- Drinken (E of klik) met 0 biertjes doet niets en geeft de melding *"Bier op 😱 Haal een nieuwe sixpack bij de supermarkt of het feestje."* (hooguit eens per 10 s).
- **Bijvullen:** 2 s aaneengesloten < 5 km/u binnen 15 m van `supermarkt` of `feestje` → voorraad = 6, melding *"Sixpack gescoord 🍻"*. Een voortgangsring rond het bier-icoon toont de 2 s.
- Bij ≤ 2 biertjes zweeft er een bier-icoon boven `supermarkt` en `feestje` (DOM, geprojecteerd zoals de cupholder-knop).

## 5. Verkeer

### 5.1 Stoplichten
- Op 6 kruispunten: `g3_1` (0, −200), `g3_3` (0, 0), `g3_5` (0, 200), `g1_3` (−200, 0), `g5_3` (200, 0) en `g3_6` (0, 300, bij oprit `opr2`). Ze staan als `signals` in `roads.json` (zie §8.1).
- **As** van een wegdeel: `ow` als |Δx| ≥ |Δz|, anders `nz`.
- **Cyclus (22 s):** `nz` groen 8 s → `nz` oranje 2 s → allerood 1 s → `ow` groen 8 s → `ow` oranje 2 s → allerood 1 s. Elk stoplicht krijgt een vaste starttijd-verschuiving van `index × 4 s`, zodat ze niet tegelijk wisselen.
- **Beeld:** per arm een paal met rood/oranje/groen (emissief), stopstreep en zebrapad op de weg.

### 5.2 Stopstreep en reservering
- **Stopstreep:** op een stoplicht-arm 12,5 m vóór het midden van het kruispunt (vóór het zebrapad); op andere kruispunten 6 m vóór het midden.
- Een kruispunt is elke node met ≥ 3 wegdelen, behalve ring-nodes (die volgen §5.3).
- **Met stoplicht:** een auto mag de stopstreep passeren bij groen; bij oranje alleen als hij niet meer kan stoppen (`v² / (2 × 6 m/s²)` > afstand tot stopstreep); bij rood niet. Daarnaast wacht hij als er nog een auto van de andere as op het kruispunt staat.
- **Zonder stoplicht:** er is steeds één **actieve aanrijrichting** (wegdeel + richting). Auto's uit die richting mogen door. Een andere richting wordt pas actief als het kruispunt leeg is, en dan de richting die het langst wacht.
- Een auto "staat op het kruispunt" van het passeren van de stopstreep tot 8 m voorbij het midden op zijn volgende wegdeel.
- **Vereenvoudiging:** linksaf geeft geen voorrang aan tegenliggers met dezelfde as; verkeersauto's botsen onderling niet, dus overlap tijdens het afslaan is acceptabel.

### 5.3 Ring: invoegen, afslaan en rijstrook wisselen
- **Afslaan:** op een ring-node met een oprit kiest een auto op de rechterstrook (lane 0) met kans 0,25 de afrit. Auto's op lane 1 rijden altijd door.
- **Invoegen:** een auto aan het eind van een oprit (≤ 5 m tot de ring-node) wacht tot er op lane 0 van het ringdeel waarop hij invoegt geen auto is binnen `2,5 s × die auto's snelheid` erachter en 20 m ervoor. Ringverkeer gaat altijd voor.
- **Rijstrook wisselen:** op een ring-node kiest een auto met kans 0,2 de andere strook, alleen als die strook op het volgende wegdeel 25 m voor en achter vrij is; anders blijft hij op zijn strook. De wissel duurt 1,5 s: de zichtbare zijwaartse positie (`laneOffset`) schuift vloeiend; tijdens de wissel telt de auto als aanwezig op beide stroken.

### 5.4 Vooruitkijken
Een auto kijkt naar de dichtstbijzijnde van: zijn voorligger op dezelfde strook, de eerste auto op de strook van zijn volgende wegdeel (`next`), de speler (zoals nu), een stopstreep waar hij moet wachten, en een zebrapad met een overstekende voetganger. De bestaande remcurve en vooruitkijkafstand (`7dab2f3`) blijven gelden.

### 5.5 Toeter
Wacht een verkeersauto langer dan 2 s stil omdat de speler voor hem staat, dan toetert hij (hooguit eens per 10 s per auto).

## 6. Rood licht voor de speler

- Detectie: de speler komt binnen 8 m van het midden van een stoplichtkruispunt (|Δx| en |Δz| < 8 m), en het wegdeel waar hij net vandaan kwam heeft een as die op dat moment **rood** is (oranje telt niet).
- Beloning: `Math.round(25 × bierMultiplier × zoneMultiplier)` en een willekeurige melding uit een lijst van ≥ 6 teksten (bijv. *"Rood is ook maar een kleur 🔴"*).
- Eén keer per passage; de detector wordt pas weer actief als de speler > 15 m van dat kruispunt is.

## 7. Voetgangers

### 7.1 Zebrapaden
- Op elke stadsarm van de 6 stoplichtkruispunten (niet op de oprit), 3 m breed, met het midden 10 m van het kruispunt.
- Vier losse zebrapaden: `cv4_2` s = 70 en `cv4_3` s = 30 (bij de snackbar, `g4_3`), `ch1_5` s = 70 en `cv2_5` s = 30 (bij de supermarkt, `g2_5`). `s` is gemeten vanaf de `from`-node.
- Ze staan als `crossings` in `roads.json`.

### 7.2 Gedrag
- Alleen bij zebrapaden binnen 150 m van de speler; maximaal 12 tegelijk. Een voetganger wacht aan de stoeprand en verdwijnt na het oversteken.
- **Soorten:** `jogger` (2,5 m/s), `student` (1,0 m/s, kijkt op telefoon), `oma` (0,6 m/s, met rollator). Verdeling 40/40/20 %.
- **Oversteken:** start als er geen verkeersauto binnen 25 m naar het zebrapad rijdt (beide richtingen). De speler telt niet mee.
- Verkeersauto's stoppen voor een zebrapad met een overstekende voetganger (§5.4).

### 7.3 Opzij springen en bijna-aanrijding
- **Opzij springen:** als de speler binnen 1,0 s de positie van de voetganger zou bereiken (op basis van huidige snelheid en richting, met 1,5 m zijdelingse marge), springt die in 0,4 s 3 m opzij naar de dichtstbijzijnde stoep. Voetgangers hebben geen botsingsvorm; een aanrijding kan niet.
- **Bijna-aanrijding:** de speler komt binnen 2 m van een voetganger → −25 punten (niet vermenigvuldigd), telt in de statistieken per soort, één keer per voetganger. Melding per soort, bijv. *"Oma Truus: ZAG JE MIJ NIET?! 👵"*.

## 8. Wereld, geluid en statistieken

### 8.1 Wegennet
`RoadData` krijgt:
```ts
signals: { nodeId: string; offsetSec: number }[];
crossings: { id: string; edgeId: string; s: number }[];
```
`scripts/generate-roads.ts` genereert beide; `roads.json` wordt opnieuw gegenereerd en gecommit.

### 8.2 Botsingen
Lantaarnpalen (cilinder r 0,15 m) en boomstammen (cilinder r 0,3 m) krijgen statische Rapier-colliders; botsen geeft schade zoals bij een gebouw.

### 8.3 Geluid
- AudioContext start bij de klik op **Start**; wordt gepauzeerd bij pauze en eindscherm.
- **M** zet geluid aan/uit; opgeslagen in localStorage onder `nog-eentje-dan:muted` (in try/catch).
- Geluiden (naam → gebruik): `engine` (loop, altijd), `tires` (loop, handrem of slip boven 20 km/u), `crash` (botsing, volume ∝ schade), `ping` (melding/opdracht), `beer` (biertje openen), `kaching` (rood-bonus, opdracht geslaagd, sixpack), `horn` (§5.5).
- **Motor:** toonhoogte `55 + 4,5 × (v mod 30) + 10 × versnelling` Hz, met `versnelling = min(4, floor(v / 30))` en `v` in km/u.
- **Dronken filter:** alles loopt via één lowpass met cutoff `20000 × (800/20000)^(min(promille, 3) / 3)` Hz (0‰ → 20 kHz, 3‰ → 800 Hz). Vanaf 1,3‰ zwalkt de toonhoogte tot ±30 cent.
- **Eigen bestanden:** bestaat `public/sounds/<naam>.mp3`, dan wordt dat gebruikt in plaats van het gegenereerde geluid; ontbreekt het of faalt het laden, dan valt de game terug op het gegenereerde geluid.

### 8.4 Statistieken en eindscherm
`RunStats` krijgt `tasksCompleted`, `redLights` en `scared: { jogger; student; oma }`. Extra regels op het eindscherm:
- `${n} opdracht(en) voltooid, ${r} keer door rood.` (enkelvoud bij 1: "opdracht", "keer" blijft gelijk)
- als er iemand geschrokken is: bijv. `2 joggers, 1 student en 1 bejaarde laten schrikken.` (meervoud/enkelvoud per soort, `oma` → "bejaarde"/"bejaarden"); anders `Niemand laten schrikken. Knap.`

## 9. Techniek

### 9.1 Modules

| Bestand | Verantwoordelijkheid | Puur? |
|---|---|---|
| `traffic/signals.ts` | stoplichtcyclus, as van een wegdeel | ja |
| `traffic/intersections.ts` | reservering per kruispunt (§5.2) | ja |
| `traffic/lanes.ts` | voorligger (ook op volgend wegdeel), gat-controle voor invoegen en rijstrookwissel | ja |
| `traffic/trafficLogic.ts` | gebruikt bovenstaande; stopstrepen, invoegen, afslaan, `laneOffset`, toeter-signaal | ja |
| `pedestrians/pedestrianLogic.ts` | spawnen, oversteken, opzij springen, bijna-aanrijding | ja |
| `tasks/taskSystem.ts` | plannen, timers, afronden van opdrachten | ja |
| `beer/beerStock.ts` | voorraad en bijvullen | ja |
| `world/redLightDetector.ts` | rood-detectie (§6) | ja |
| `audio/soundParams.ts` | motortoon, cutoff, zwalk | ja |
| `audio/AudioEngine.ts` | Web Audio-synthese + bestandsvervanging | nee |
| `world/SignalView.ts`, `pedestrians/PedestrianView.ts`, `ui/DestinationArrow.ts` | 3D/DOM-weergave | nee |
| `game/Simulation.ts` | de per-stap-simulatie, verplaatst uit `main.ts` | nee |

Aangepast: `world/types.ts`, `scripts/generate-roads.ts`, `traffic/TrafficView.ts` (rendert `laneOffset`), `phone/Phone.ts` (chatscherm + tijdsbalk), `state/GameSession.ts` (opdrachten, rood-bonus, bijna-aanrijding, biervoorraad), `stats/runStats.ts`, `world/CityBuilder.ts` (colliders), `core/events.ts` (nieuwe events), `main.ts` (alleen nog opstarten en verbinden).

### 9.2 Foutafhandeling
- `tasks.json` met een onbekende `postId`/`target` of verkeerd aantal antwoorden: die opdracht wordt overgeslagen (met `console.warn`), de rest werkt.
- Ontbrekend of kapot geluidsbestand: terugval op gegenereerd geluid.
- Geen Web Audio beschikbaar: game draait zonder geluid.

### 9.3 Testen
- **Vitest** voor alle pure modules uit §9.1, met de waarden uit deze spec.
- **Stresstest:** 5 minuten gesimuleerde tijd op de echte kaart met 30 auto's en 12 voetgangers: geen twee auto's van kruisende assen tegelijk op een stoplichtkruispunt, geen auto die > 60 s stilstaat zonder dat er iets voor hem staat (geen deadlock), geen twee auto's op dezelfde strook binnen 2 m van elkaar.
- **Speeltest + FPS:** ≥ 45 fps met `?debug`.

### 9.4 Volgorde
Elke stap levert een speelbare versie op.
1. **Verkeer:** stoplichten, reservering, vooruitkijken over kruispunten, invoegen, afslaan, rijstrookwissel.
2. **Voetgangers en zebrapaden**, plus colliders voor lantaarnpalen en bomen.
3. **Opdrachten, biervoorraad en rood-bonus**, met pijl, bier-iconen en nieuwe eindschermregels.
4. **Geluid.**
