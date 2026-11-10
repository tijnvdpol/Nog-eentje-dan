# Nog Eentje Dan — Fase 4: ontwerp (spec)

*Datum: 2026-11-10 · Auteur: Tijn (met Claude) · Status: ter review*

Deze spec bouwt voort op de hoofdspec (`2026-11-08-scroll-rij-game-design.md`), de spec van fase 2 en de spec van fase 3. Waar deze spec iets anders zegt, geldt deze spec.

**Voorwaarde:** fase 3 is af en staat op `main` (commit `26c5539`). Fase 4 wordt gebouwd op een nieuwe branch vanaf `main`. Wijkt de echte code af van de namen in deze spec, dan volgt het bouwplan de echte code.

## 1. Doel en scope

**Doel:** de game er laten uitzien als een echte game in plaats van een prototype, zonder iets aan de spelregels te veranderen. Fase 4 is een grafische fase.

**In scope:**
- een pipeline voor CC0-modellen van Kenney (script, lijstje, laden, terugvalvorm);
- verkeer met echte automodellen;
- stadsgebouwen met gevels uit code (ramen, plint, dak), plus stoepen en straatmeubilair;
- dorpshuizen van Kenney, plus een kerk, café en tankstation in dezelfde stijl;
- bomen, vangrails, lantaarns, stoplichten en flitspalen in een nieuw uiterlijk;
- een nieuwe cockpit (in code);
- avondlicht: verlichte ramen, lichtvlekken van lantaarns en bloom (uit te zetten);
- een prestatie-check, nieuwe beelden voor de README en een Kenney-vermelding.

**Niet in scope:** voetgangers (eigen fase, want die hebben animatie nodig), politie, radio, online leaderboard, mobiele besturing, een dag/nacht-wissel, en wijzigingen aan het wegennet, de stadsindeling, het verkeer of de spelregels.

**Geslaagd als:**
- een screenshot of GIF uit de game er in de README uitziet als een echte game;
- Tijn de gevels uit code bij het proefblok (§4.4) minstens zo goed vindt als de Kenney-gebouwen (anders volgt §4.5);
- Tijn de dorpshuizen met de kerk (§5.3) en de cockpit (§6) goedkeurt op screenshots;
- de game op de testroute uit fase 3 minstens 45 fps haalt (§8);
- alle bestaande tests blijven slagen en het botsen precies zo voelt als nu.

## 2. Gemaakte keuzes

| Onderwerp | Keuze |
|---|---|
| Doel fase 4 | **Mooier**: echte low-poly modellen, eerst wereld en cockpit |
| Onderdelen | Verkeer, gebouwen in de stad en het dorp, bomen en straatspullen, cockpit. **Voetgangers later.** |
| Aanpak | **Mix (B)**: Kenney voor alles met een vaste maat; stadsgevels en cockpit in code, in de Kenney-stijl |
| Kwaliteitsborging | **Proefblok met screenshots**, Tijn beslist; bij "Kenney beter" gaat de stad over op Kenney (§4.5) |
| Botsen | Botsvormen (Rapier-colliders) blijven **exact** zoals nu; alleen het uiterlijk verandert |
| Stoepen | Ja, stoep met stoeprand langs stadsstraten |

## 3. Model-pipeline

### 3.1 Bronnen (handwerk van Tijn)

Tijn downloadt deze gratis CC0-packs van kenney.nl en pakt ze uit. Alleen de modellen die we gebruiken komen in `assets-src/kenney/<packmap>/`, met hetzelfde pad als in het pack. Deze map staat in `.gitignore`.

| Pack | Gebruikt voor |
|---|---|
| Car Kit | verkeersauto's |
| City Kit (Suburban) | dorpshuizen, hekjes, struiken |
| City Kit (Commercial) | luifels, winkelborden, dakdelen; gebouwen voor het proefblok |
| City Kit (Roads) | lantaarns, verkeerslichten, vangrails, bankjes, prullenbakken |
| Nature Kit | bomen, struiken |

De omgeving van Claude kan kenney.nl niet bereiken. Daarom is het downloaden het enige handwerk. Het bouwplan begint met een stap waarin Tijn dit doet, met een lijstje en de exacte bestandsnamen.

### 3.2 Script: `npm run gen:models` (`scripts/generate-models.ts`)

- Leest `scripts/models.manifest.ts`: per **rol** (bijv. `car.hatchback`, `house.a`, `tree.oak`, `prop.bench`) het pack, het pad in de zip en de afstelwaarden (zie §3.3).
- Leest die bestanden uit de uitgepakte packmappen, maakt ze kleiner met `@gltf-transform` (dedup, prune, weld; **geen Draco**, dan is er ook geen decoder nodig) en schrijft per rol één `.glb` naar `public/models/`. Gedeelde textures (de Kenney-`colormap`) worden één keer opgenomen.
- Schrijft `public/models/index.json`: rol → bestand, plus de maat van de bounding box.
- **Stopt met een duidelijke melding** als een packmap of bestand uit het manifest ontbreekt (welke rol, welk pack, welk pad).
- **Budget:** `public/models/` samen ≤ 5 MB; het script meldt de totale grootte en faalt als het budget wordt overschreden.
- `public/models/` gaat wel mee naar GitHub, zodat Vercel het script niet hoeft te draaien.

### 3.3 Manifest (puur en getest: `scripts/models.manifest.ts`)

Per rol: `{ pack, path, targetSize?: { w?, d?, h? }, yawOffset?, bodyMaterial?, glassColors? }`.
- `targetSize`: de maat in meters waarop de game het model schaalt, zodat het past bij de bestaande maten en botsvormen (een auto blijft 1,8 × 4,4 m).
- `yawOffset`: corrigeert de richting waarin een model "vooruit" kijkt.
- `bodyMaterial`: naam van het carrosseriemateriaal, als het model dat apart heeft (§5.1).
- `glassColors`: de kleurvakken van glas in de colormap, voor verlichte ramen (§7.1).

Een test controleert dat elke rol die de game gebruikt in het manifest staat en dat er geen dubbele rollen zijn.

### 3.4 Laden in de game (`src/models/modelLibrary.ts`)

- Bij het opstarten laadt de game `index.json` en alle modellen tegelijk met `GLTFLoader`, vóór de wereld wordt opgebouwd. Het startscherm toont een laadbalk ("Wereld laden… 12/34").
- Per model worden alle meshes met hetzelfde materiaal samengevoegd tot één geometrie, met de schaal en draaiing uit het manifest al toegepast. Het resultaat is een `ModelParts`: een lijst van `{ geometry, material }`.
- **Terugval:** mislukt het laden van een model, dan levert de bibliotheek de oude vorm (doos, kegel of cilinder met de oude kleur), met `console.warn` welke rol ontbreekt. De game crasht niet. Een test controleert dat elke rol een terugvalvorm heeft.

### 3.5 Tekenen (`src/world/instancedChunks.ts`)

`addInstancedChunks` wordt uitgebreid zodat het een `ModelParts` accepteert: per vak van 250 m en per onderdeel één `InstancedMesh`. De bestaande aanroepen met één geometrie blijven werken. Het principe van fase 3 blijft: één tekenopdracht per soort per vak, en hele vakken vallen buiten beeld weg.

## 4. Stad

### 4.1 Gevels uit code (puur: `world/facadeLayout.ts`; beeld: `world/facadeGeometry.ts`)

De bestaande `BuildingSpec`s (plek, maat, hoogte) blijven ongewijzigd. Per gebouw:

- **Type** (vast via de seed), met een eigen kleur uit een palet dat past bij de Kenney-colormap:
  - `kantoor`: lange horizontale glasstroken;
  - `baksteen`: losse staande ramen met vensterbanken en een sierlijst onder het dak;
  - `flat`: ramen met balkons om de verdieping.
- **Raster:** verdiepingshoogte 3 m, raambreedte en tussenruimte in meters. Het aantal verdiepingen en kolommen volgt uit de maat. Er wordt niets uitgerekt; overgebleven ruimte gaat naar de randen.
- **Diepte:** ruiten liggen 0,15 m terug in de muur; vensterbanken, lijsten en dakranden steken 0,1–0,2 m uit.
- **Plint:** de begane grond (4 m) heeft grote etalageramen. Ongeveer 40% van de panden aan een straat krijgt een Kenney-luifel en een **verzonnen** winkelbord (lijst in `public/content/shops.json`, bijv. "Snackbar De Vette Hap", "Kapsalon Knip & Klaar", "Avondwinkel Nog Open"). Er komen geen echte merken in.
- **Dak:** een dakrand van 0,5 m, plus 0–3 dakdelen per gebouw (installatiekast, liftopbouw, watertank) uit City Kit Commercial.

`facadeLayout(spec, seed)` is puur en levert de verdiepingen, kolommen, plintdelen, het bord en de lijst met welke ramen branden (§7.1). Dat wordt getest: geen ramen buiten de muur, een vast resultaat bij dezelfde seed, en geen ramen in de plint als daar een deur zit.

`facadeGeometry` bouwt per vak **samengevoegde** geometrie: één mesh per materiaal (muur, kozijn, donker glas en verlicht glas) per vak.

**Twee detailniveaus per vak (`THREE.LOD`):**
- *dichtbij* (< 120 m): 3D-ramen, vensterbanken en dakdelen;
- *ver*: een vlakke gevel met het raampatroon als textuur, gemaakt in een `CanvasTexture` met dezelfde verlichte ramen.

### 4.2 Stoepen

- Langs elke `stad`-weg aan beide kanten een stoep van 2,5 m breed en 0,15 m hoog, met een stoeprand.
- Bij kruispunten en zebrapaden een verlaging, dus geen stoeprand over de zebra.
- De stoep heeft **geen** collider. Het rijden verandert dus niet; de auto rijdt er gewoon overheen zoals nu over het gras.

### 4.3 Straatmeubilair

- Lantaarns op de bestaande plekken (`lampPositions`), als Kenney-model met dezelfde cilinder als collider.
- Bankjes en prullenbakken aan de **gebouwkant** van de stoep, met een vaste plaatsing via de seed. Ze komen niet op kruispunten, bij zebrapaden of voor het feestje en de andere plekken (`places`).
- **Botsen:** het straatmeubilair krijgt geen colliders, want er komen geen nieuwe schadebronnen bij. Omdat ze aan de gebouwkant staan, rijd je er zelden doorheen. Boompjes op de stoep komen er daarom niet: door een boomstam heen rijden zou nep ogen, en een stamcollider zou het spel veranderen.

### 4.4 Proefblok (controlemoment ⛔)

1. Eén stadsblok direct naast het feestje krijgt de gevels uit code (§4.1), de stoepen en het straatmeubilair.
2. Het blok ernaast krijgt tijdelijk Kenney-gebouwen uit City Kit Commercial (achter een debug-vlag `?proefblok`), in hetzelfde licht.
3. Er worden screenshots gemaakt vanuit de cockpit, op 0‰ en in het avondlicht van dat moment:
   - drie vaste camerastanden op het proefblok;
   - dezelfde drie standen op het Kenney-blok;
   - één screenshot van dezelfde plek op `main`, als "voor".
4. **Tijn beslist:**
   - "code-gevels goed": door naar §4.1 voor de hele stad; het Kenney-blok en de vlag gaan weg;
   - "Kenney beter": §4.5.
5. Aanpassingen op Tijns feedback ("ramen te klein", "te donker") mogen eerst, waarna er opnieuw screenshots komen.

### 4.5 Terugvaloptie: stad van Kenney

Kiest Tijn bij het proefblok voor Kenney, dan stopt de uitvoering na het proefblok. Er wordt een aanvulling op deze spec geschreven: hoe de stadsindeling (`cityLayout.ts`) vaste kavelmaten krijgt die passen bij de Kenney-gebouwen, en hoe verlichte ramen dan werken (via `glassColors`, §7.1). Daarna volgt een aangepast bouwplan. De delen 5 t/m 8 van deze spec gelden dan nog steeds.

## 5. Verkeer, dorp en de weg

### 5.1 Verkeer (`traffic/TrafficView.ts`, puur: `traffic/carLooks.ts`)

- Vier tot zes rollen uit de Car Kit: `car.hatchback`, `car.sedan`, `car.van`, `car.delivery`, `car.taxi`, `car.suv`. Politie-, ambulance- en racemodellen gebruiken we niet.
- `carLook(id)`: puur en getest. Het model én de kleur liggen vast via het auto-nummer, met een vaste verdeling (bijv. 30% hatchback, 25% sedan, 15% SUV, 10% busje, 10% bestelwagen, 10% taxi, in `config.ts`).
- Per model een eigen `InstancedMesh`-pool ter grootte van `traffic.maxCars`.
- **Kleur:** heeft het model een apart carrosseriemateriaal (`bodyMaterial`), dan kleurt de game alleen dat bij per auto. Anders blijft de kleur van het model zelf.
- Taxi's krijgen een verzonnen daklicht ("TAXI"); geen merk.
- De kinematische botsdoos (`cuboid(0.9, 0.7, 2.2)`) blijft ongewijzigd voor alle modellen.

### 5.2 Dorpshuizen (`world/VillageBuilder.ts`, puur: `world/houseLooks.ts`)

- Alle kavels zijn nu 8 × 9 m. `houseLook(house, seed)` kiest per kavel één van 4–6 Suburban-modellen, plus een gevelkleur in Hollandse tinten (rode en bruine baksteen, wit stucwerk), en of het huis een voortuinhek of struiken krijgt. Puur en getest.
- De collider blijft de bestaande doos om het hele huis (`houseBox`). Hekjes en struiken krijgen geen collider. Ze staan in de voortuin, tussen het huis en de straat, en nooit op de weg.
- **Let op:** Suburban is een Amerikaanse stijl. Daarom kiezen we modellen met een zadeldak en kleuren we de muren als baksteen. Of het Hollands genoeg oogt, valt onder de check van §5.3.

### 5.3 Kerk en café (in code, controlemoment ⛔)

- **Kerk:** een schip met spitsboogramen (verlicht glas-in-lood in warme kleuren), een toren met galmgaten, een klok (wijzerplaat als `CanvasTexture`) en een spits. Het rode baken bovenop blijft. De colliders blijven gelijk.
- **Café De Gouden Karper:** een Kenney-luifel, twee of drie terrastafels met stoelen, het verlichte bord en verlichte ramen.
- **Check:** screenshots van de dorpsstraat met huizen, de kerk en het café; Tijn keurt goed of geeft feedback. Pas daarna gaat de bouw verder.

### 5.4 Tankstation

- Een overkapping met de rode rand, vier palen, twee pompeilanden met pompen, en een winkeltje met verlichte ramen en een verzonnen naam op de gevel ("Tank & Snack").
- We gebruiken Kenney-delen waar die passen, en anders code.
- De plek, de bestaande colliders en het `PointLight` blijven.

### 5.5 Langs de weg

- **Bomen:** twee of drie soorten uit de Nature Kit, op de bestaande plekken (rond de ring en langs de N-weg), met dezelfde schaalvariatie. Stamcolliders blijven gelijk.
- **Vangrails:** een Kenney-onderdeel als dat in City Kit Roads zit; anders een vangrail in code met palen en een golfprofiel. De colliders blijven gelijk.
- **Reflectorpaaltjes:** een paaltje in code met een zwarte band en een reflector.
- **Stoplichten (`world/SignalView.ts`):** een paal met een kast met drie lampen en een kap boven elke lamp. Het aan/uit-mechanisme van de lampen (het instanced lampjes-patroon) blijft gelijk.
- **Flitspalen (`world/SpeedCameraView.ts`):** een grijze kast op een paal met een donker venster. De flits blijft werken zoals nu.

## 6. Cockpit (`src/render/Cockpit.ts`, controlemoment ⛔)

Alles in code, in vlakke kleuren die passen bij de Kenney-auto's. De **plekken** van de camera, het stuur (`wheel`), de bekerhouder en het blikje (`canRest`, `canMouth`) blijven gelijk. Daardoor blijven het drinken, de telefoonoverlay en het klikpunt op het blikje (`canWorldPosition`) precies zo werken.

- **Dashboard:** een vorm met rondingen (`ExtrudeGeometry` met afronding), een kap boven de meters, twee ventilatieroosters en een middenconsole met de bekerhouder.
- **Meters:**
  - een snelheidsmeter met een wijzer die de echte snelheid volgt;
  - een toerenteller die de versnellingslogica van het motorgeluid volgt (`audio.gearBandKmh`, `audio.maxGear`).
  De wijzerplaten zijn een `CanvasTexture`; 's avonds zijn de meters zacht verlicht.
- **Waarschuwingslampjes:**
  - het motorlampje gaat aan als de schade boven `cockpit.engineLightAt` komt (50);
  - het gordellampje knippert altijd.
- **Stuur:** drie spaken, een claxonknop en een dikkere rand. Het draait mee zoals nu.
- **Interieur:** A-stijlen met een vorm, het begin van de portieren links en rechts, een binnenspiegel (donker spiegelglas, geen echt spiegelbeeld) en een zonneklep.
- **Blikje:** een etiket met een verzonnen merk ("Gouden Karper Pils") als `CanvasTexture`, met een lipje bovenop.
- **Luchtverfrisser:** een flesvormig hangertje aan de binnenspiegel, geen echte merkvorm. Het slingert als een slinger mee met het sturen en de snelheidsverandering, met een grotere uitslag bij meer promille. De slingerformule is puur en getest (`render/pendulum.ts`).
- `Cockpit.update` krijgt er invoer bij: `{ steer, drinkProgress, speedKmh, damage, promille, dt }`.
- **Check:** screenshots vóór (`main`) en ná, op dezelfde plek, op 0‰ en 1,5‰. Tijn keurt goed of geeft feedback.

## 7. Avondlicht

### 7.1 Verlichte ramen

- **Stad:** `facadeLayout` bepaalt per raam of het brandt: `light.windowLitShare` (0,35) van de ramen, vast via de seed, met kleur warm geel (80%) of tv-blauw (20%). Verlichte ramen hebben een emissive materiaal. Er is geen flikkering en er verandert niets tijdens het spelen.
- **Kenney-huizen:** per huismodel twee materiaalvarianten, "licht aan" en "licht uit". Bij "aan" is het glas emissive, via een emissive-kaart die uit de colormap wordt gemaakt (alleen de vakken uit `glassColors`). Per huis kiest de seed aan of uit (`light.houseLitShare`, 0,6).

### 7.2 Lantaarns en koplampen

- Elke lantaarn krijgt een nep-lichtvlek: een plaatje op de grond met een zachte cirkel, additief, instanced per vak. Er komen geen echte lampen per lantaarn.
- Verkeersauto's krijgen emissive koplampen en achterlichten als onderdeel van het model of als kleine instanced vlakjes.

### 7.3 Bloom (`render/PostFX.ts`)

- Een `UnrealBloomPass` op halve resolutie, afgesteld op felle lichten (ramen, lantaarns, koplampen en het kerkbaken).
- **Let op:** nu slaat `PostFX` de composer over als je nuchter bent (`bypass`). Met bloom aan draait de composer altijd, en de dronken passes staan uit als ze niet nodig zijn. Met bloom uit blijft het gedrag van nu.
- **Instelling:** een nieuw veld `bloom: boolean` in `Settings` (standaard `true`), met een schakelaar "Gloed" in het instellingenscherm. `loadSettings` valt bij een ontbrekende of rare waarde terug op `true`. Er komt een test bij in de bestaande settings-tests.

## 8. Prestaties

- **Eis:** dezelfde als in fase 3: minstens 45 fps (liefst 60) op de testroute feestje → ring → afrit `opr3` → N-weg → dorp → tankstation → terug, bij 0‰ en bij 1,5‰, op Tijns laptop met `?debug`.
- **Budget in beeld:** ≤ 400 draw calls en ≤ 1,5 miljoen driehoeken op elk punt van de testroute; modellen samen ≤ 5 MB.
- **Meten:** de debug-overlay toont het al. Het bouwplan noteert per stap de waarden (zoals in fase 3: stad, ring, N-weg, dorp).
- **Als het niet haalt, in deze volgorde:**
  1. minder details dichtbij (bankjes, dakdelen, terrastafels: dichtheid in `config.ts`);
  2. de grens voor het detailniveau "dichtbij" omlaag (`facade.lodNearM`);
  3. bloom standaard uit;
  4. pas daarna code herschrijven.

## 9. Techniek

### 9.1 Modules

**Nieuw:**
- `scripts/generate-models.ts`, `scripts/models.manifest.ts`
- `src/models/modelLibrary.ts` (laden, samenvoegen, terugval)
- `src/world/facadeLayout.ts` (puur), `src/world/facadeGeometry.ts`, `src/world/sidewalks.ts` (puur: stoepdelen uit het wegennet), `src/world/streetProps.ts` (puur: plaatsing van het straatmeubilair)
- `src/traffic/carLooks.ts` (puur), `src/world/houseLooks.ts` (puur)
- `src/render/pendulum.ts` (puur)
- `public/content/shops.json`

**Aangepast:** `instancedChunks.ts`, `CityBuilder.ts`, `VillageBuilder.ts`, `TankstationView.ts`, `SignalView.ts`, `SpeedCameraView.ts`, `TrafficView.ts`, `Cockpit.ts`, `PostFX.ts`, `settings.ts`, `SettingsScreen.ts`, `Screens.ts` (laadbalk), `main.ts` (eerst laden, dan bouwen), `config.ts`, `README.md`, `.gitignore`, `package.json` (script `gen:models`, dev-dependency `@gltf-transform/core` en `@gltf-transform/functions`).

**Niet aangepast:** alle spelregels, `cityLayout.ts`, `villageLayout.ts`, `nwegDecor.ts`, het wegennet, `PlayerCar.ts`, het verkeer, de voetgangers, de telefoon en de opdrachten.

### 9.2 Afstelwaarden in `config.ts`

```ts
models: { budgetMB: 5 },
facade: { floorH: 3, plinthH: 4, windowW: 1.4, windowGap: 1.2, recessM: 0.15, lodNearM: 120,
          typeMix: { kantoor: 0.3, baksteen: 0.45, flat: 0.25 }, awningShare: 0.4, roofPartsMax: 3 },
sidewalk: { widthM: 2.5, kerbH: 0.15 },
props: { benchEveryM: 60, binEveryM: 45 },
carLooks: { mix: { hatchback: 0.3, sedan: 0.25, suv: 0.15, van: 0.1, delivery: 0.1, taxi: 0.1 } },
light: { windowLitShare: 0.35, windowWarmShare: 0.8, houseLitShare: 0.6, bloomStrength: 0.6, bloomRadius: 0.4, bloomThreshold: 0.85 },
cockpit: { engineLightAt: 50, pendulumLen: 0.12, pendulumDamping: 1.5, pendulumPromilleGain: 1.5 },
```

### 9.3 Foutafhandeling

- Een ontbrekend of kapot model geeft een terugvalvorm plus `console.warn`; het spel blijft speelbaar.
- Een ontbrekend `index.json` betekent: alles valt terug op de oude vormen, en de laadbalk is meteen vol.
- Een ontbrekend `shops.json` betekent: luifels zonder bord.
- `gen:models` faalt met een duidelijke melding bij een ontbrekende packmap of een ontbrekend bestand, en bij een overschreden budget.

### 9.4 Testen

**Automatisch (Vitest):**
- alle bestaande tests blijven groen;
- nieuwe tests voor `facadeLayout`, `sidewalks`, `streetProps`, `carLooks`, `houseLooks`, `pendulum`, het manifest (volledig, geen dubbele rollen, elke rol een terugvalvorm) en de nieuwe instelling `bloom`.

**Met het oog:**
- de controlemomenten ⛔: proefblok (§4.4), dorp (§5.3), cockpit (§6);
- daarna een speeltest van de testroute.

**Review:** na de uitvoering een frisse code-review, zoals in fase 1 t/m 3.

### 9.5 Volgorde

1. Tijn downloadt de Kenney-packs (§3.1).
2. Model-pipeline: script, manifest, `modelLibrary`, laadbalk, terugval, en `instancedChunks` met `ModelParts`.
3. **Proefblok** (§4.4) → ⛔ Tijns oordeel.
4. Gevels voor de hele stad, stoepen en straatmeubilair.
5. Verkeer met Kenney-auto's.
6. Dorp: huizen, kerk en café → ⛔ Tijns oordeel; daarna het tankstation.
7. Bomen, vangrails, reflectorpaaltjes, stoplichten en flitspalen.
8. Cockpit → ⛔ Tijns oordeel.
9. Avondlicht en bloom, plus de instelling "Gloed".
10. Prestatie-check op de testroute, nieuwe screenshots en GIF voor de README, Kenney-vermelding in de README ("3D-modellen: Kenney.nl, CC0"), en een frisse review.

⛔ = de uitvoering stopt tot Tijn akkoord geeft.
