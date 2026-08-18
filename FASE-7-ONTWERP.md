# Fase 7 — Ontwerpvoorstel

Nieuwe homepagina met de secties **Administratie** en **Beheer**, en twee nieuwe
onderdelen binnen Boekhouding: **Debiteuren** en **Crediteuren**.

Dit is een ontwerp. Er is geen code gewijzigd en er zijn geen commits gemaakt.
Uitgangspunt is `main` op commit `9a8dba1`.

---

# 1. Analyse van de bestaande code

## 1.1 Modules en omvang

De app is een statische ES-module-applicatie zonder buildstap. Alles draait in de
browser, `index.html` laadt `app.js` als module en die trekt de rest binnen.

| Laag | Bestanden |
|---|---|
| State en opslag | `storage.js` (defaults, `state`, `load`/`save`) |
| Routing | `ui.js` (61 regels, `nav()` / `gaNaar()` / `hertekenHuidigePagina()`) |
| Bootstrap | `app.js` (177 regels, imports + koppeling aan `window`) |
| Pagina's | `dashboard.js`, `bank.js`, `grootboek.js`, `belasting.js`, `controle.js`, `voorraad.js`, `hnvi.js` |
| Beheer | `migratie.js`, `herstel.js`, `gegevenscontrole.js`, `opslagdiagnose.js`, `uitvoeren.js`, `zelftest.js`, `export.js`, `excel-ui.js` |
| Ondersteunend | `helpers.js`, `modals.js`, `charts.js`, `drawer.js`, `auth.js`, `config.js`, `duplicaten.js` |

Totaal ongeveer 8.900 regels JavaScript over 30 modules.

## 1.2 Hoe navigatie nu werkt

`ui.js` is opvallend klein en schoon. De hele router is één tabel plus één functie:

```js
const RENDERS = { home, bank, grootboek, belasting, controle, voorraad, hnvi };
const TITELS  = { home: 'Overzicht', bank: 'Bank', ... };

export function nav(p, btn) {
  if (!RENDERS[p]) return;
  huidigePagina = p;
  // .page verbergen, #p-<naam> tonen, .nav-item markeren, titel zetten
  RENDERS[p]();
}
```

Drie eigenschappen die het ontwerp hieronder bepalen:

1. **De router is uitbreidbaar zonder herschrijven.** Een pagina toevoegen is een
   regel in `RENDERS`, een regel in `TITELS`, een `<div id="p-…" class="page">`
   en een `.nav-item`. Meer niet.
2. **Er is geen hash- of history-routing.** Geen `location.hash`, geen
   `pushState`. De actieve pagina overleeft een refresh niet; je begint altijd op
   Home. Dat is nu geen probleem met zeven pagina's, maar wordt het bij twaalf.
3. **Elke `onclick` in de HTML roept een globale functie aan.** `app.js` hangt ze
   op `window`. Dat is precies het patroon waar Fix #1 op stukliep toen
   `deleteTx` niet aan `window` hing. Elk nieuw scherm moet die koppeling
   expliciet meenemen.

## 1.3 De sidebar heeft al secties

Dit is belangrijk voor de opdracht. `index.html` bevat al `.nav-section`-kopjes:

```
Overzicht     → Home
Boekhouding   → Bank, Grootboek, Belasting, (Controle, zonder eigen kopje)
Magazijn      → Voorraad, HNVI / Xtenate
Beheer        → 9 acties, allemaal modals
```

De gevraagde indeling — Administratie met daaronder Overzicht, Boekhouding en
Magazijn, naast Beheer — is dus geen breuk maar het **expliciet maken van een
hiërarchie die al impliciet aanwezig is**. Er komt één niveau boven de bestaande
kopjes. Dat maakt de wijziging klein.

Twee dingen vallen op in de huidige indeling:

- **Controle hangt los.** Het staat onder Boekhouding maar zonder eigen kopje,
  visueel losgekoppeld door een lege regel. Het is onduidelijk of het bij
  Boekhouding hoort of een eigen ding is.
- **Beheer is geen sectie maar een gereedschapslade.** Alle negen items openen
  een modal; geen enkele is een pagina. Ze delen alleen dat ze "niet
  boekhouden" zijn.

## 1.4 Datamodel zoals het nu is

**Kern-entiteiten in `state`:**

| Sleutel | Inhoud | Aantal (default) |
|---|---|---|
| `TX` | boekingen huidig jaar (2026) | 161 |
| `HIST_TX` | boekingen 2022–2025 | 473 |
| `COVERS` | voorraadartikelen | 21 |
| `HNVI_LOTS` | inkooploten | variabel |

**Vorm van een boeking** — dit is de spil van de hele applicatie:

```js
{
  id: 29,                    // number voor TX, string "h2025_52" voor HIST_TX
  datum: "2026-01-30",       // ISO, altijd YYYY-MM-DD
  bedrag: 218.00,            // altijd positief; richting zit in `type`
  naam: "SumUp *Pokefanz",   // tegenpartij, soms een IBAN
  omschr: "",                // vrije toelichting
  rek: "1010",               // 1009/1010/1020/1030/1090
  gb: "601",                 // grootboekcode
  type: "prive_opname"       // inkomst | uitgave | prive_opname | prive_storting
}
```

**Rekeningschema** (`helpers.js`, `GBNM`): 16 grootboekrekeningen in vijf
rubrieken — omzet (8000/8010/8020), inkoop (7xxx), kosten (4xxx), privé
(600/601), overig.

**Opslag:** 13 localStorage-sleutels. Het patroon is consequent
`<DEFAULT> → load('xtenate_…_override', kopie) → save()`. Historische data heeft
een aparte override-sleutel zodat een herstelactie terug kan naar de standaard.

**Supabase:** vijf tabellen in gebruik (`voorraadartikelen`, `voorraadstanden`,
`productgroepen`, `controle_negeer`, `instellingen`). Boekingen staan nog niet in
Supabase; de migratie daarvan is niet af.

**Excel-export:** acht werkbladtypen, waaronder per maand een bankblad,
Creditkaart Privé, Per Periode, Voorraad, HNVI en Jaartotalen. De import leest
dezelfde structuur terug.

## 1.5 Wat dit betekent voor Debiteuren en Crediteuren

Hier zit het echte ontwerpvraagstuk, en het is groter dan het lijkt.

**De administratie is nu volledig kasstelsel.** Een boeking bestaat pas als het
geld is gegaan. Er is geen enkel veld voor "verschuldigd maar nog niet betaald":
geen factuurnummer, geen vervaldatum, geen openstaand saldo, geen relatie-entiteit.
`naam` is een vrij tekstveld, geen verwijzing naar een debiteur of crediteur.

Debiteuren en crediteuren zijn per definitie **vorderingen en schulden** — het
tegenovergestelde. Ze vereisen een tweede tijdstip (factuurdatum naast
betaaldatum) en een koppeling tussen factuur en betaling.

Dat botst op drie plekken met bestaande logica:

1. **`belasting.js`** berekent box 1 op basis van kasstromen. Zodra facturen
   meetellen die nog niet betaald zijn, verandert het fiscale resultaat — tenzij
   we expliciet vastleggen dat facturen daar níét in meetellen.
2. **`controle.js`** heeft een aansluitingscontrole op kruisposten en saldi. Een
   factuur zonder betaling is voor die logica nu een gat.
3. **`export.js`** en de Excel-import kennen alleen bankbladen. Facturen passen
   in geen enkel bestaand werkblad.

**De aanbeveling is daarom: facturen als een aparte, additieve laag.** Geen
wijziging aan de boekingenstructuur, geen wijziging aan de fiscale berekening in
deze fase. Een factuur mag verwijzen naar een boeking (de betaling), maar een
boeking blijft zelfstandig geldig zonder factuur. Dat houdt alle bestaande
functionaliteit intact en maakt de nieuwe laag optioneel.

---

# 2. Architectuurvoorstel

## 2.1 Uitgangspunten

1. **Additief, nooit destructief.** Nieuwe modules naast bestaande. Bestaande
   modules alleen aanraken waar het onvermijdelijk is (`ui.js`, `app.js`,
   `index.html`, `storage.js`).
2. **Kasstelsel blijft de waarheid.** De boekingen blijven de basis van
   dashboard, grootboek en belasting. Facturen zijn een administratieve laag
   erbovenop.
3. **Eén pagina per module.** Het patroon `render<Pagina>()` uit een eigen
   bestand aanhouden, precies zoals de zeven bestaande pagina's.
4. **Elke nieuwe globale functie in dezelfde stap aan `window` koppelen.** Dit
   staat expliciet in het implementatieplan als aparte controlestap, na wat er
   met `deleteTx` gebeurde.

## 2.2 Nieuwe modulestructuur

```
debiteuren.js       renderDebiteuren()  — openstaande verkoopfacturen
crediteuren.js      renderCrediteuren() — openstaande inkoopfacturen
facturen.js         gedeelde logica: status, ouderdom, koppeling, opslag
relaties.js         relatiebeheer (klanten/leveranciers) + naam-normalisatie
home.js             de nieuwe sectie-homepagina
```

`facturen.js` bevat wat Debiteuren en Crediteuren delen — dat is bijna alles
behalve de richting. Twee dunne pagina-modules op één gedeelde kern, in plaats
van dezelfde logica twee keer.

## 2.3 Relaties: aparte entiteit of afgeleid?

Twee opties, met een duidelijke voorkeur.

**Optie A — relatie als volwaardige entiteit.** Een `RELATIES`-array; facturen
verwijzen via `relatieId`. Netjes genormaliseerd, maar het vraagt om een
relatiebeheerscherm, een koppelproces voor 634 bestaande boekingen, en dedupe van
namen als "Koninklijke PostNL B.V." tegenover "PostNL Pakketten Benelux B.V.".

**Optie B — relatie afgeleid uit de naam.** Facturen bevatten gewoon een
`relatie`-tekstveld. Groeperen gebeurt op genormaliseerde naam.

**Voorkeur: B in Fase 7, met A als expliciete uitbreiding later.** De reden is
`weergaveNaam()` in `helpers.js`: die functie bestaat omdat `naam` regelmatig een
IBAN is en de echte naam in `omschr` verstopt zit. De datakwaliteit van namen is
op dit moment niet goed genoeg om er meteen een sleutelrelatie op te bouwen.
Beginnen met tekst, en pas normaliseren als er genoeg facturen zijn om te zien
welke varianten echt voorkomen.

## 2.4 Koppeling factuur ↔ betaling

Drie niveaus, oplopend in complexiteit. Fase 7 doet niveau 1 en 2.

| Niveau | Wat | Fase |
|---|---|---|
| 1 | Factuur staat los, status handmatig op "betaald" | 7 |
| 2 | Factuur verwijst naar één boeking via `txId` | 7 |
| 3 | Deelbetalingen: meerdere boekingen per factuur | later |

Een factuur krijgt `txIds: []`. In Fase 7 zit daar nul of één id in, maar de
array-vorm ligt er al zodat deelbetalingen later geen datamigratie vergen.

## 2.5 Wat we bewust níét doen in Fase 7

- Geen wijziging aan `belasting.js`. Facturen tellen niet mee in de fiscale
  berekening. Dat is een bewuste keuze die zichtbaar in de interface moet staan,
  anders wekt het scherm een verwachting die de cijfers niet waarmaken.
- Geen btw-administratie op factuurregels. Dat is een fase op zich.
- Geen automatische matching van betalingen aan facturen. Handmatig koppelen
  eerst; automatisch pas als duidelijk is welke patronen betrouwbaar zijn.
- Geen wijziging aan de Excel-export. Facturen komen er in een latere fase bij.

---

# 3. Navigatiestructuur

## 3.1 Voorgestelde boom

```
Administratie
├── Overzicht
│   └── Home
├── Boekhouding
│   ├── Bank
│   ├── Debiteuren        ← nieuw
│   ├── Crediteuren       ← nieuw
│   ├── Grootboek
│   ├── Belasting
│   └── Controle
└── Magazijn
    ├── Voorraad
    └── HNVI / Xtenate

Beheer
├── Gegevens
│   ├── Importeer Excel
│   ├── Exporteer Excel
│   └── Cloud sync
├── Onderhoud
│   ├── Gegevenscontrole
│   ├── Herstel uitvoeren
│   └── Migratie
└── Systeem
    ├── Opslagdiagnose
    ├── Supabase testen
    ├── API sleutel
    └── Data wissen
```

Twee dingen zijn hier bewust rechtgezet:

- **Controle staat nu expliciet onder Boekhouding.** Het zweefde daar al, maar
  zonder kopje.
- **Beheer krijgt drie subgroepen.** Negen ongeordende items is te veel om te
  scannen. De indeling gegevens / onderhoud / systeem maakt "Data wissen"
  bovendien beter vindbaar én beter afgeschermd tussen de systeemitems.

## 3.2 Sidebar: inklapbare secties

De sidebar wordt met twaalf items te lang voor kleine schermen. Voorstel:
`.nav-group` met een inklapbare kop per hoofdsectie.

```html
<div class="nav-group" data-groep="administratie">
  <button class="nav-group-kop" onclick="wisselNavGroep('administratie')">
    <span>Administratie</span>
    <svg class="chevron">…</svg>
  </button>
  <div class="nav-group-inhoud">
    <div class="nav-section">Overzicht</div>
    <div class="nav-item" data-page="home" …>Home</div>
    <div class="nav-section">Boekhouding</div>
    …
  </div>
</div>
```

De open/dicht-stand hoort in localStorage onder `xtenate_nav_groepen`, naast de
bestaande `xtenate_menu_ingeklapt`. Standaard: Administratie open, Beheer dicht —
dat is de dagelijkse verhouding.

**Aandachtspunt uit ervaring:** de inklapknop moet toetsenbordbereikbaar zijn en
de sidebar moet blijven werken op 320px breed. Bij Fix #1 bleek dat die breedte
als eerste breekt. In het testplan staat 320px daarom expliciet.

## 3.3 De nieuwe homepagina

De opdracht vraagt om een homepagina met de secties Administratie en Beheer. Twee
mogelijke invullingen:

**A. Portaal** — Home wordt een keuzescherm met tegels; de huidige dashboard-
grafieken verhuizen naar een aparte pagina "Dashboard".

**B. Dashboard met sectieblokken** — Home houdt de kerncijfers bovenaan en krijgt
daaronder twee blokken met snelkoppelingen.

**Voorkeur: B.** Reden: `dashboard.js` levert nu de kerncijfers, drie grafieken en
twee recente-mutatietabellen. Dat is de meest bekeken informatie in de app. Die
achter een extra klik zetten is een verslechtering voor de dagelijkse gebruiker,
in ruil voor een indeling die vooral bij het eerste bezoek helpt.

Voorgestelde opbouw van Home:

```
┌─ Kerncijfers (bestaand, ongewijzigd) ───────────────┐
│  omzet · kosten · winst · privé                     │
├─ Aandacht (nieuw) ──────────────────────────────────┤
│  3 openstaande debiteuren · 1 factuur te laat       │
│  2 artikelen bijna op · 4 controlepunten            │
├─ Administratie (nieuw) ─────────────────────────────┤
│  Boekhouding: Bank · Debiteuren · Crediteuren ·     │
│               Grootboek · Belasting · Controle      │
│  Magazijn:    Voorraad · HNVI                       │
├─ Beheer (nieuw) ────────────────────────────────────┤
│  Gegevens · Onderhoud · Systeem                     │
├─ Grafieken + recente mutaties (bestaand) ───────────┤
└─────────────────────────────────────────────────────┘
```

Het blok **Aandacht** is de eigenlijke winst van deze fase. Het maakt van Home
een startpunt in plaats van een samenvatting: de cijfers die er staan zijn ook de
plek waar je op klikt om er iets aan te doen.

## 3.4 Routing: hash toevoegen

Met twaalf pagina's is "je begint altijd op Home na een refresh" hinderlijk.
Voorstel: `location.hash` als bron van waarheid.

```js
export function nav(p, btn) {
  if (!RENDERS[p]) return;
  if (location.hash !== '#' + p) location.hash = p;   // nieuw
  …
}
window.addEventListener('hashchange', () => gaNaar(location.hash.slice(1)));
```

Levert op: refresh behoudt de pagina, de browserknop terug werkt, en een pagina
is deelbaar als link. Risico is klein en beperkt tot `ui.js`, mits `nav()` geen
oneindige lus maakt — vandaar de gelijkheidscontrole hierboven. Dit is een
losstaande wijziging die apart getest en apart teruggedraaid kan worden.

---

# 4. Datamodel

## 4.1 Nieuwe entiteit: factuur

Eén structuur voor beide richtingen. `soort` bepaalt of het een debiteur of
crediteur betreft.

```js
{
  id: "f2026_001",           // string, prefix f + jaar + volgnummer
  soort: "debiteur",         // debiteur (wij ontvangen) | crediteur (wij betalen)

  relatie: "Bol.com",        // tekst; genormaliseerd via relatieSleutel()
  factuurnummer: "2026-014", // vrij veld, mag leeg
  datum: "2026-07-01",       // factuurdatum
  vervaldatum: "2026-07-31", // afgeleid van datum + betaaltermijn, aanpasbaar
  bedrag: 250.00,            // altijd positief, net als bij boekingen
  omschrijving: "",

  status: "open",            // open | betaald | vervallen | oninbaar
  txIds: [],                 // gekoppelde boeking(en); leeg = nog niet betaald
  gb: "8000",                // voorgestelde grootboekrekening
  aangemaakt: "2026-07-01T10:23:00Z"
}
```

**Ontwerpkeuzes en waarom:**

| Keuze | Reden |
|---|---|
| `bedrag` altijd positief | consistent met boekingen; richting zit in `soort` |
| `status` opgeslagen, niet afgeleid | "oninbaar" is een besluit, geen berekening |
| `vervallen` afgeleid bij weergave | anders wordt data stil oud in de opslag |
| `txIds` als array | deelbetalingen later zonder migratie |
| `id` als string met prefix | zelfde patroon als `h2025_52`; geen botsing met `TX`-ids |
| `relatie` als tekst | zie 2.3 — naamkwaliteit is nog te wisselend |

**Statusregels, expliciet:**

```
open       txIds is leeg en vervaldatum ligt in de toekomst
vervallen  txIds is leeg en vervaldatum ligt in het verleden   ← afgeleid, niet opgeslagen
betaald    txIds bevat minstens één id
oninbaar   handmatig gezet, telt niet mee in openstaand saldo
```

De opgeslagen `status` kent dus alleen `open`, `betaald` en `oninbaar`.
`vervallen` wordt bij het renderen berekend uit `vervaldatum`. Zo kan een factuur
niet "vergeten worden om te vervallen".

## 4.2 Opslag

```js
// storage.js — state uitbreiden
export const state = {
  TX: [], COVERS: [], HNVI_LOTS: [], HIST_TX: [],   // ongewijzigd
  FACTUREN: [],                                     // nieuw
  nxtFactuur: 1,                                    // nieuw
  editFactuurId: null,                              // nieuw
  …
};

export function saveFacturen() {
  save('xtenate_facturen', state.FACTUREN);
  save('xtenate_nxt_factuur', state.nxtFactuur);
}
```

Twee nieuwe sleutels: `xtenate_facturen` en `xtenate_nxt_factuur`. Beide volgen
het bestaande patroon. Er is **geen** `_DEFAULT`-constante: facturen beginnen leeg,
er is geen historische set om terug te zetten.

**Gevolg voor `save()`:** de foutafhandeling uit Fix #3 dekt dit automatisch af.
Wel groeit het opslagverbruik, dus de QuotaExceededError-tak wordt relevanter dan
hij nu is. Waard om te meten in Opslagdiagnose.

## 4.3 Instellingen

```js
{
  betaaltermijnDebiteur: 30,   // dagen, voor de voorgestelde vervaldatum
  betaaltermijnCrediteur: 14,
  waarschuwDagen: 7            // vanaf wanneer "bijna vervallen" tonen
}
```

Onder een nieuwe sleutel `xtenate_factuur_instellingen`, of als extra veld in de
bestaande `instellingen`-tabel bij Supabase-synchronisatie.

## 4.4 Supabase

Twee nieuwe tabellen, in lijn met de vijf bestaande:

```sql
create table facturen (
  id text primary key,
  gebruiker_id uuid references auth.users not null,
  soort text not null check (soort in ('debiteur','crediteur')),
  relatie text,
  factuurnummer text,
  datum date not null,
  vervaldatum date,
  bedrag numeric(12,2) not null,
  omschrijving text,
  status text not null default 'open',
  gb text,
  aangemaakt timestamptz default now()
);

create table factuur_betalingen (   -- koppeltabel, vervangt txIds bij sync
  factuur_id text references facturen(id) on delete cascade,
  tx_id text not null,
  primary key (factuur_id, tx_id)
);
```

Met Row Level Security op `gebruiker_id`, net als de bestaande tabellen.

**Let op:** boekingen staan zelf nog niet in Supabase. `factuur_betalingen.tx_id`
is dus voorlopig een losse verwijzing zonder foreign key. Dat is acceptabel
zolang de koppeling in de browser wordt gelegd, maar het is een schuld die
opgelost hoort te worden zodra boekingen wél gesynchroniseerd worden.

## 4.5 Wat er níét verandert

Expliciet, omdat "behoud alle bestaande data" de opdracht is:

| Structuur | Wijziging |
|---|---|
| `TX` (161 boekingen) | **geen** |
| `HIST_TX` (473 boekingen) | **geen** |
| `COVERS` (21 artikelen) | **geen** |
| `HNVI_LOTS` | **geen** |
| `HOME_TOTALS` | **geen** |
| `MAAND_SALDOS` | **geen** |
| `GBNM` / `REKNM` | **geen** |
| Alle 13 bestaande localStorage-sleutels | **geen** |
| Berekening in `belasting.js` | **geen** |
| Excel-export en -import | **geen** |

De 634 boekingen blijven byte-identiek. Een gebruiker die Debiteuren en
Crediteuren nooit opent, ziet buiten de navigatie geen enkel verschil.

---

# 5. Implementatieplan

Zes stappen, elk met een eigen branch, eigen test en eigen go/no-go. In dezelfde
gefaseerde opzet als Fix #1 en #3, omdat die aanpak twee bugs opleverde die
anders live waren gegaan.

## Stap 1 — Routing uitbreiden (fundament)

*Branch: `feature/fase7-routing`*

- `ui.js`: `RENDERS` en `TITELS` uitbreiden met `debiteuren` en `crediteuren`
- Hash-routing toevoegen (3.4)
- Lege pagina-containers `#p-debiteuren` en `#p-crediteuren` in `index.html`
- Placeholder-renderfuncties die "Nog niet ingericht" tonen

**Test:** de zeven bestaande pagina's blijven werken; refresh behoudt de pagina;
browserknop terug werkt; alle vijf regressiesuites groen.

**Waarom eerst:** hierna is elke volgende stap een losse pagina die niets
kapotmaakt. Als hash-routing tegenvalt, kan die hier terug zonder dat er
functionaliteit aan hangt.

## Stap 2 — Datalaag

*Branch: `feature/fase7-datalaag`*

- `state.FACTUREN`, `nxtFactuur`, `editFactuurId` in `storage.js`
- `saveFacturen()` volgens bestaand patroon
- `facturen.js`: `maakFactuur()`, `factuurStatus()`, `openstaandSaldo()`,
  `ouderdomsgroep()`, `koppelBetaling()`, `ontkoppelBetaling()`
- Nog geen interface

**Test:** unit-tests op de statuslogica, inclusief de randgevallen — vervaldatum
precies vandaag, factuur zonder vervaldatum, oninbaar met gekoppelde betaling.
Controleren dat `TX` en `HIST_TX` op 161 en 473 blijven en dat de bestaande
localStorage-sleutels ongemoeid blijven.

## Stap 3 — Debiteuren

*Branch: `feature/fase7-debiteuren`*

- `debiteuren.js` met `renderDebiteuren()`
- Tabel met filters (status, jaar, relatie), kerncijfers, ouderdomsanalyse
  (0–30 / 31–60 / 61–90 / 90+ dagen)
- Modal toevoegen/bewerken/**verwijderen** — met dezelfde bevestiging als bij
  boekingen
- Koppelen aan een bestaande boeking

**Expliciete controlestap:** elke nieuwe functie die in een `onclick` staat, moet
in `app.js` geïmporteerd **en** aan `window` gekoppeld zijn. Verifiëren door de
knop daadwerkelijk in een browser aan te klikken, niet door de module-export te
testen. Dit is precies de fout die bij `deleteTx` optrad.

## Stap 4 — Crediteuren

*Branch: `feature/fase7-crediteuren`*

- `crediteuren.js`, hergebruikt `facturen.js`
- Zelfde opzet, richting omgekeerd, plus een "te betalen deze week"-blok

**Test:** debiteuren en crediteuren raken elkaars data niet; filteren op `soort`
klopt in beide richtingen.

## Stap 5 — Nieuwe homepagina

*Branch: `feature/fase7-home`*

- `home.js` met de sectieblokken; `dashboard.js` blijft de kerncijfers en
  grafieken leveren
- Blok **Aandacht** met tellers uit `controle.js`, `voorraad.js` en `facturen.js`
- Tegels als snelkoppelingen naar `gaNaar()`

**Test:** grafieken blijven werken (Chart.js wordt in `charts.js` geïnitialiseerd
en is gevoelig voor herrenderen); alle tegels navigeren naar de juiste pagina;
tellers kloppen bij nul facturen, bij alleen betaalde facturen, en bij vervallen
facturen.

## Stap 6 — Sidebar herindelen

*Branch: `feature/fase7-navigatie`*

- Inklapbare `.nav-group` voor Administratie en Beheer
- Beheer in drie subgroepen
- Stand onthouden in `xtenate_nav_groepen`

**Test:** 320, 344, 360, 375, 768 en 1280px in echte Chromium; toetsenbord-
navigatie; alle negen beheer-modals blijven bereikbaar; ingeklapte staat
overleeft een refresh.

**Waarom als laatste:** dit is de meest zichtbare wijziging en raakt elke pagina.
Als de rest al werkt, is een probleem hier makkelijk te isoleren.

## Volgorde-afhankelijkheden

```
Stap 1 (routing)
   ├── Stap 2 (datalaag)
   │      ├── Stap 3 (debiteuren)
   │      └── Stap 4 (crediteuren)
   │             └── Stap 5 (home, heeft tellers nodig)
   └────────────────────  Stap 6 (navigatie, alleen routing nodig)
```

Stap 6 kan parallel aan 2–5, maar als laatste samenvoegen.

---

# 6. Risico's

| Risico | Kans | Gevolg | Beheersing |
|---|---|---|---|
| Nieuwe `onclick`-functies niet aan `window` | **hoog** | knop doet niets, stil | verplichte browsercontrole per knop in stap 3 en 4 |
| localStorage loopt vol bij veel facturen | midden | opslag mislukt | Fix #3 vangt het af; meten in Opslagdiagnose |
| Sidebar breekt op smalle schermen | midden | onbruikbaar op mobiel | 320px in het testplan van stap 6 |
| Hash-routing veroorzaakt renderlus | laag | pagina bevriest | gelijkheidscontrole in `nav()`; stap 1 apart testbaar |
| Verwachting dat facturen fiscaal meetellen | **hoog** | verkeerde aangifte | zichtbare melding op beide pagina's |
| Chart.js hertekent niet na herindeling home | midden | lege grafieken | expliciet in test stap 5 |
| Relatienamen lopen uiteen | midden | versnipperd overzicht | tekstveld nu, normaliseren later (2.3) |

Het eerste en het vijfde risico verdienen extra aandacht. Het eerste omdat het al
één keer is gebeurd. Het vijfde omdat het geen technisch probleem is maar een
verwachtingsprobleem: een scherm dat "openstaand: € 1.240" toont, wekt de indruk
dat dat bedrag ergens in de winstberekening zit. Dat is niet zo, en dat moet op
het scherm zelf staan — niet alleen in dit document.

---

# 7. Open vragen

Deze bepalen het ontwerp maar kan ik niet voor jou beslissen:

1. **Heb je nu al openstaande facturen?** Zo ja, hoeveel ongeveer, en over hoeveel
   verschillende relaties? Bij minder dan vijf is een eenvoudige lijst genoeg en
   is de ouderdomsanalyse overbodige complexiteit.

2. **Moet Home het dashboard blijven, of een portaal worden?** Ik stel B voor
   (3.3), maar als je vooral vanaf je telefoon werkt en dan gericht één ding wilt
   doen, is A misschien beter.

3. **Facturen fiscaal meetellen — nu of later?** Nu niet, is mijn voorstel. Maar
   als je administratie op factuurstelsel hoort te draaien, is dat een gesprek
   met je boekhouder waard vóórdat we bouwen, niet erna.

4. **Btw op factuurregels?** Nu buiten scope. Als je die wél nodig hebt, verandert
   het factuurmodel wezenlijk (regels in plaats van één bedrag) en kan dat beter
   meteen goed dan later omgebouwd.

5. **Hoort HNVI onder Magazijn of onder Boekhouding?** Het staat nu onder
   Magazijn, maar het is grotendeels een inkoop-/margeadministratie. Met
   Crediteuren erbij kan die grens verschuiven.

---

# 8. Samenvatting

| | |
|---|---|
| Nieuwe modules | 5 (`debiteuren`, `crediteuren`, `facturen`, `relaties`, `home`) |
| Gewijzigde bestaande modules | 4 (`ui.js`, `app.js`, `storage.js`, `index.html`) + `components.css` |
| Nieuwe localStorage-sleutels | 3 |
| Nieuwe Supabase-tabellen | 2 |
| Gewijzigde bestaande datastructuren | **0** |
| Boekingen geraakt | **0** van 634 |
| Stappen in het plan | 6, elk met eigen branch en go/no-go |

De kern van het voorstel: **de navigatie-herindeling is klein** omdat de
hiërarchie al bestaat, en **Debiteuren/Crediteuren zijn additief** omdat ze naast
het kasstelsel staan in plaats van erin.

Geen code gewijzigd, geen commits gemaakt. `main` staat onveranderd op `9a8dba1`.
