# Scroll & Rij-game — ontwerp (spec)

*Datum: 2026-11-08 · Auteur: Tijn (met Claude) · Status: ter review*

## 1. Doel en succescriteria

**Wat:** een satirische 3D-browsergame waarin je vanuit de cockpit door een open stad rijdt terwijl je op je telefoon door een nep-socialmedia-feed scrolt, en onderweg biertjes kunt drinken. Falen is de grap.

**Doel:** vooral satire/humor, tegelijk een portfoliostuk dat technisch netjes in elkaar zit.

**Geslaagd als:**
- een nieuwe speler binnen 10 seconden snapt wat de bedoeling is;
- de eerste rit een lach oplevert en spelers "nog één keer" willen;
- de game op een gemiddelde laptop soepel draait (doel: 60 fps, minimaal 45 fps);
- de game statisch te hosten is (geen server) en gratis draait op Vercel.

**Niet in scope (eerste versies):** mobiele besturing, online leaderboard, echte Instagram/TikTok-content, politie, multiplayer, realistische graphics.

## 2. Gemaakte keuzes

| Onderwerp | Keuze |
|---|---|
| Platform | Desktop (toetsenbord + muis/touchpad) |
| Perspectief | 3D, cockpitview |
| Wereld | Kleine open Hollandse stad: centrum + ringweg (snelweg) + N-weg naar dorp |
| Graphics | Low-poly, CC0-modellen (bijv. Kenney), avond/schemering |
| Gameloop | Vrij rondrijden; punten via de telefoon (likes + opdrachten) |
| Dronken | Biertje pakken tijdens het rijden (cupholder), verhoogt multiplier én effecten |
| Game over | Schademeter (100%) of promillage boven 3,0‰ |
| Feed-content | Alleen eigen content in een parodie-app (werktitel "Swiep"), geen echte merken |
| Highscore | Lokaal; via een interface zodat online (Supabase) later kan |
| Techniek | Vite + TypeScript + Three.js + Rapier; telefoon als HTML/CSS-overlay |

## 3. Bediening

| Toets | Actie |
|---|---|
| W/A/S/D of pijltjes | gas, sturen, remmen |
| Q | telefoon omhoog/omlaag (toggle) |
| E (of klik op cupholder) | biertje drinken |
| Spatie | handrem |
| Muiswiel / touchpad | scrollen in de feed (alleen als telefoon omhoog) |
| Dubbelklik op post | liken |
| Klik | antwoordknoppen in chat-opdrachten |
| Esc | pauze |

## 4. Gameplay

### 4.1 Start
De speler zit in de auto op de parkeerplaats bij "het feestje" in het centrum. Geen tutorial: de eerste meldingen op de telefoon leggen de bediening uit in de toon van de game. Het startscherm toont één regel: *"Satire. Dit is precies waarom je dit nooit in het echt doet."*

### 4.2 Telefoon omlaag / omhoog
- **Omlaag:** klein rechtsonder; alleen meldingen zichtbaar; scrollen en liken uitgeschakeld.
- **Omhoog:** groot in beeld, bedekt ongeveer 40% van de voorruit; scrollen, liken en opdrachten beantwoorden mogelijk.

### 4.3 Punten
Alle punten komen uit de telefoon.

- **Like:** +10 basispunten per post (een post kan één keer geliket worden).
- **Combo:** een like binnen 2 seconden na de vorige verhoogt de combo met 0,25, tot maximaal ×3. Langer dan 2 seconden geen like → combo terug naar ×1.
- **Chat-/like-opdracht:** 50–200 basispunten (staat per opdracht in `tasks.json`).
- **Bestemmingsopdracht:** 300–500 basispunten bij op tijd aankomen.
- **Bijna-aanrijding voetganger:** −25 punten (niet vermenigvuldigd).
- **Mislukte opdracht:** 0 punten en een teleurgesteld bericht.

**Puntenformule:** `punten = basispunten × combo × bierMultiplier × zoneMultiplier` (combo alleen bij likes).

- **bierMultiplier** `= 1 + 0,5 × (promillage / 0,3)`, dus gebaseerd op het *huidige* promillage. Bij 0,3‰ is dat ×1,5, bij 0,9‰ ×2,5. Zakt het promillage, dan zakt ook de multiplier. Zo blijft de keuze "nog één?" terugkomen.
- **zoneMultiplier:** stad ×1, N-weg ×1,25, snelweg ×1,5. De zone volgt uit de weg waarop de auto rijdt. De bonus geldt alleen als je minstens de helft van de maximumsnelheid rijdt, anders ×1.

### 4.4 Opdrachten
Elke 45–60 seconden (willekeurig) komt er een opdracht binnen als melding. Er is maximaal één actieve opdracht tegelijk.

- **Chat:** bericht met 3 antwoordknoppen en een tijdslimiet (bijv. "Antwoord mama binnen 10 sec"). Een antwoord uit `correct` = geslaagd; een ander antwoord of te laat = mislukt.
- **Like:** like een specifieke post. De feed plaatst die post binnen de volgende 10 posts.
- **Bestemming:** ga naar een plek op de kaart (snackbar, supermarkt, tankstation, huis) binnen een tijdslimiet. Een pijl in beeld wijst de richting. Aankomen = binnen 15 meter van het punt met minder dan 20 km/u.

### 4.5 Drinken en promillage
- Drinken duurt 1,5 seconde. In die tijd werkt het sturen voor 50% ("een hand van het stuur").
- Elk biertje: +0,3‰.
- Afbouw: −0,005‰ per seconde (ongeveer 0,1‰ per 20 seconden).
- Boven **3,0‰**: game over ("Je bent in slaap gevallen achter het stuur").

### 4.6 Schade
- Botsing: `schade += clamp((botssnelheid_kmh − 5) × 0,8, 0, 60)` procentpunt.
- Barsten in de voorruit bij 25%, 50% en 75%.
- Bij 100%: game over.
- Voetgangers springen altijd cartoonesk opzij. Er zijn geen aanrijdingen met voetgangers, alleen bijna-aanrijdingen (binnen 2 meter).

*Alle getallen in hoofdstuk 4 zijn startwaarden; ze worden afgesteld in speeltests.*

### 4.7 Eindscherm
Satirische statistieken, bijvoorbeeld:
- tijd dat de telefoon omhoog was ("Je keek 47 seconden niet naar de weg");
- aantal biertjes, likes, voltooide opdrachten, bijna-aanrijdingen;
- gereden afstand en hoogste snelheid;
- eindscore en lokale highscore, met knop "Nog een rondje".

## 5. Telefoon en de feed-app ("Swiep")

- **Werktitel:** "Swiep". Naam en logo zijn een eigen parodie; geen echte merknamen of logo's. De definitieve naam kan op elk moment worden vervangen en blokkeert de bouw niet.
- **Opmaak:** stories-balk bovenaan, verticale posts (avatar, accountnaam, afbeelding of korte video, tekst, aantal likes), hartje-animatie bij liken.
- **Meldingen:** banner bovenaan, ook zichtbaar als de telefoon omlaag is (groepsapp "Feestje 🍻", mama, Tikkie, flitspaal-"boete" in fase 3).
- **Chat-scherm:** opent bij een chat-opdracht en toont het bericht met 3 antwoordknoppen.
- **Feed:** eindeloos. Posts worden gehusseld en een post komt pas terug als minstens 20 andere posts langs zijn geweest.
- **Scrollen:** echte browser-scroll binnen het telefoonscherm (overflow), zodat traagheid en touchpad natuurlijk aanvoelen. Als de telefoon omlaag is, wordt scrollen genegeerd.
- **Post-types:** foto, meme, korte loop-video (GIF/MP4, klein bestand), nep-advertentie van verzonnen merken.
- **Afbeeldingen:** rechtenvrij (bijv. Unsplash) of eigen materiaal.

### 5.1 Content-bestanden
`content/posts.json`, één object per post:
```json
{ "id": "p001", "account": "@SnelleSander", "avatar": "avatars/sander.png",
  "type": "photo", "media": "posts/p001.jpg", "caption": "...", "tags": ["auto"] }
```
`content/tasks.json`, één object per opdracht:
```json
{ "id": "t001", "type": "chat", "from": "Mama", "text": "Ben je al onderweg?",
  "answers": ["Ja bijna thuis", "Nee nog op feestje", "👍"], "correct": [0, 2],
  "timeLimitSec": 10, "reward": 100 }
```
Bestemmingsopdrachten bevatten `"type": "destination"` en een `"target"` (id van een plek in het wegennet). Like-opdrachten bevatten `"type": "like"` en een `"postId"`.

**Startdoel content fase 1:** minimaal 60 posts. Opdrachten volgen in fase 2.

## 6. Dronken effecten

Alle effecten worden berekend uit één getal: het huidige promillage.

| Promillage | Niveau | Beeld (3D) | Besturing | Telefoon |
|---|---|---|---|---|
| 0–0,5‰ | Aangeschoten | licht vignet | stuur iets trager | — |
| 0,5–1,3‰ | Lekker bezig | wazige randen, zachte camera-zwalk | 0,10 s vertraging, doorsturen | lichte blur |
| 1,3–2,5‰ | Ladderzat | dubbelzien (RGB-shift), nabeeld, sterke zwalk | 0,25 s vertraging, auto trekt een kant op | blur + dubbele tekst, scherm zwalkt |
| 2,5–3,0‰ | Kantje boord | korte black-outs (0,5 s zwart, willekeurig) | sterke willekeurige afwijking | sterk vervaagd |

- Effecten lopen vloeiend over tussen niveaus (geen harde sprongen).
- **Geluid:** low-pass-filter (Web Audio API) dat sterker wordt met het promillage.
- **Techniek:** Three.js EffectComposer (o.a. AfterimagePass, RGB-shift, blur, vignet); CSS-filters/transforms op de telefoon; een invoerbuffer met vertraging en ruis voor de besturing.

## 7. Wereld en verkeer

### 7.1 Kaart
- Het **wegennet** staat in `content/roads.json`: knooppunten (kruispunten), wegdelen (met rijstroken, maximumsnelheid en zone: stad/N-weg/snelweg) en benoemde plekken (feestje, snackbar, supermarkt, tankstation, huis).
- Gebouwen, bomen en lantaarnpalen worden automatisch langs de wegen geplaatst (met een vaste seed, zodat de stad elke keer hetzelfde is).
- **Omvang:** centrum ~600 × 600 m (6×6 blokken, 50 km/u); ringweg ~4 km met 3 op-/afritten (100–130 km/u); N-weg ~2 km naar dorp met tankstation (80 km/u).
- **Sfeer:** avond/schemering, straatverlichting, mist met zicht van ongeveer 300 m.
- **Prestaties:** instancing voor herhaalde objecten, eenvoudige modellen in de verte, alleen zichtbare objecten tekenen.

### 7.2 Speler-auto
- Arcade-rijgedrag: voorspelbaar optrekken, sturen en remmen; driften met de handrem.
- Botsingen via Rapier (physics-engine, WASM). Gebouwen, palen, vangrails en auto's zijn obstakels.
- **Cockpit:** dashboard met snelheid, schade, promillage en multiplier; cupholder met bier; meedraaiend stuur. Geen achteruitkijkspiegel in de eerste versie.

### 7.3 Verkeer
- Auto's volgen rijstroken uit het wegennet en kiezen bij kruispunten willekeurig een richting.
- Ze houden afstand tot hun voorligger en remmen voor obstakels (ook voor de speler).
- **Stoplichten** op grote kruispunten (vaste cyclus); op overige kruispunten een vereenvoudigde voorrangsregel.
- **Invoegen** op de ringweg: wachten op een gat in het verkeer.
- Alleen actief binnen ~300 m van de speler, maximaal ~30 auto's; buiten die straal verdwijnen auto's en verschijnen nieuwe.

### 7.4 Voetgangers
- Alleen bij zebrapaden en binnen ~150 m van de speler.
- Steken over; springen opzij als de speler binnen 2 m komt (telt als bijna-aanrijding).

## 8. Technische opbouw

**Stack:** Vite, TypeScript, Three.js, Rapier (`@dimforge/rapier3d-compat`), Vitest. Statische build, hosting op Vercel.

### 8.1 Modules

| Map | Verantwoordelijkheid | Hangt af van |
|---|---|---|
| `core/` | game-loop (vaste physics-stap, render per frame), pauze bij Esc of bij een inactief tabblad | — |
| `state/` | centrale spelstatus + event-bus | — |
| `input/` | toetsenbord/muis; `DrunkInputFilter` (vertraging + ruis) | `state` |
| `vehicle/` | speler-auto (arcade-model + Rapier-body), schade bij botsing | `input`, `state` |
| `world/` | wegennet laden, stad bouwen, zones opvragen | content |
| `traffic/` | verkeer, stoplichten, voetgangers | `world` |
| `drunk/` | promillage → effectwaarden (beeld, besturing, telefoon, geluid) | `state` |
| `render/` | renderer, camera, post-processing | `drunk` |
| `phone/` | Swiep-app (feed, meldingen, chat) in HTML/CSS | `state`, content |
| `tasks/` | opdrachten plannen, timers, bestemmingspijl, afronden | `state`, `world` |
| `scoring/` | likes, combo, multipliers, puntenformule | `state` |
| `ui/` | dashboard, start-, pauze- en eindscherm | `state` |
| `storage/` | `HighscoreStore`-interface; `LocalHighscoreStore` (localStorage, in try/catch) | — |

Pure rekenlogica (puntenformule, combo, promillage-afbouw, effectniveaus, opdrachttimers, routes in het wegennet) staat los van Three.js en de DOM, zodat die los te testen is.

### 8.2 Gegevensstroom
- **Rijden:** invoer → `DrunkInputFilter` → speler-auto → Rapier → botsing → schade → spelstatus.
- **Telefoon:** like / opdracht klaar → `scoring` (× combo × bier × zone) → spelstatus.
- **Weergave:** spelstatus → dashboard, post-processing, telefoon-effecten, geluid.

### 8.3 Foutafhandeling
- Laadscherm met voortgang tijdens het laden van modellen en content.
- Geen WebGL-ondersteuning → nette melding in plaats van een leeg scherm.
- Ontbrekend of kapot media-bestand in een post → post overslaan.
- localStorage niet beschikbaar → highscore alleen voor deze sessie, geen crash.

## 9. Testen
- **Automatisch (Vitest):** puntenformule en combo, bier- en zonemultiplier, promillage-afbouw en game over bij 3,0‰, effectniveaus en overgangen, schadeformule, opdrachttimers en aankomstcheck, routes/zones in het wegennet, `LocalHighscoreStore`.
- **Speeltests:** rijgevoel, zwaarte van de dronken effecten, of opdrachten en content grappig zijn. Na elke fase.
- **Prestaties:** FPS-teller in debugmodus (`?debug`); doel 60 fps, minimaal 45 fps op een gemiddelde laptop.

## 10. Fasering
Elke fase levert een speelbare versie op.

1. **Fase 1 (MVP):** centrum + ringweg (op-/afritten als simpele verbindingen zonder invoeglogica), rijden en botsen, simpel verkeer, telefoon met feed + liken + Q-toggle, bier + effecten (beeld, besturing, telefoon), schade, eindscherm, lokale highscore.
2. **Fase 2:** opdrachten (chat, like, bestemming), stoplichten, voetgangers, invoegen op de ringweg, geluid (inclusief dronken filter).
3. **Fase 3:** N-weg en dorp met tankstation, flitspalen met boete-melding op de telefoon, afwerking.
4. **Later (aparte specs):** online leaderboard (Supabase), mobiele versie, politie, reels.
