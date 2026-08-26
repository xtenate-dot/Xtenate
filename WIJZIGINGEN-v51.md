# Xtenate Administratie — v51

Alleen opmaak en indeling. Er is niets veranderd aan hoe bedragen worden
berekend, opgeslagen of gesynchroniseerd. Je administratie ziet er anders uit,
maar bevat dezelfde cijfers.

---

## Wat er is aangepast

### Designtokens (`style.css`)

- **Contrast omhoog.** `--text-muted` en `--text-hint` waren te licht op witte
  vlakken. Ze zijn donkerder gemaakt zodat labels en subteksten ook op een
  telefoon buiten leesbaar blijven.
- **Extra vlakniveau** `--surface-3` voor tabelkoppen en totaalrijen, zodat die
  zich onderscheiden zonder een eigen kleur nodig te hebben.
- **Statuskleuren kregen een randvariant** (`--green-rand`, `--red-rand`, enz.).
  Voorheen berekende elk component zijn eigen rand met `color-mix`; dat gaf per
  plek een net iets andere lijn.
- **Bewegingsvariabelen** (`--duur-snel`, `--duur-basis`, `--soepel`) op één
  plek, zodat alle overgangen even snel aanvoelen.

### App-shell (`layout.css`)

- **Het merk blijft staan bij scrollen.** De menu-items zitten nu in een eigen
  scrollzone (`.nav-scroll`). Bij drie uitgeklapte groepen verdween "Xtenate"
  eerst uit beeld.
- **Actieve pagina krijgt een streepje links**, naast de accentkleur. Dat blijft
  ook zichtbaar als het menu is ingeklapt en de tekst weg is.
- **Telbadge in het menu** (`.nav-badge`). Op "Controle" staat nu het aantal
  punten dat aandacht vraagt — rood bij echte fouten, grijs bij aandachtspunten,
  leeg als alles in orde is. Ingeklapt wordt het een stip.
- **Actiezone in de paginakop** (`.page-head-acties`), zodat knoppen rechts naast
  de titel kunnen staan in plaats van los boven een tabel.
- **Bovenbalk valt terug op een dichte achtergrond** als de browser geen
  `backdrop-filter` ondersteunt. Anders werd tekst onleesbaar tijdens scrollen.

### Componenten (`components.css`)

- **KPI-hiërarchie in drie niveaus.** Er is nu een hoofdkaart (`.kpi--hoofd`)
  die over de volle breedte staat, op een accentvlak, met een cijfer van 34px.
  Daaronder de gewone kaarten, en `.kpi--secondary` voor ondersteunende cijfers.
  Het raster schakelt naar zes kolommen zodra er een hoofdkaart in staat, zodat
  de drie kaarten eronder de rij precies vullen.
- **Kleurstreepje op KPI-kaarten** (`.kpi--pos` / `.kpi--neg` / `.kpi--let-op`):
  een dunne streep bovenaan vertelt het teken zonder dat de hele kaart kleurt.
- **Zebra-strepen in tabellen.** Om de rij een fractie donkerder. Scheelt bij
  brede tabellen echt in het volgen van een regel van links naar rechts.
- **Rij-acties bij hover** (`.rij-acties`): knoppen per rij verschijnen pas bij
  hover of toetsenbordfocus. Op een touchscreen staan ze altijd aan, want daar
  bestaat hover niet.
- **Totaalrijen** (`.tbl-totaalrij`) krijgen een eigen vlak en een dikkere
  bovenlijn, en worden niet meer meegestreept door de zebra.
- **Badges kregen een rand** in dezelfde kleurfamilie. Zonder rand waren ze
  vormeloos op een gekleurde of donkere achtergrond.
- **Knoppen op vaste minimumhoogte** (32px), zodat ze uitlijnen met de selects
  en invoervelden ernaast in dezelfde werkbalk.
- **Selects krijgen een eigen pijltje.** Het standaardpijltje van de browser
  klopte in donkere modus niet met de tekstkleur.
- **Modals: kop en knoppenbalk blijven staan** bij een lang formulier. Alleen
  waar dat veilig kan — zie "Twee valkuilen" hieronder.
- **Stappenopmaak voor formulieren** (`.stap-balk`, `.stap-paneel`). Dit is
  voorbereiding; zie "Wat er nog niet in zit".

### Crediteuren en debiteuren

- **Aandeelbalkje per partij.** Onder elke regel een dun balkje dat laat zien
  hoe groot die partij is ten opzichte van de grootste. Je ziet in één blik waar
  het geld heen gaat zonder bedragen te vergelijken.
- **Details-knop is rustiger.** Was een blauw blok per regel; bij twintig
  partijen onder elkaar schreeuwde dat het hele scherm vol. Nu een secundaire
  knop die pas bij hover accentkleur krijgt.
- **Op een telefoon wordt de regel een kaart**: naam boven, bedrag groot rechts,
  aantal en knop op de regel eronder.

### Mobiel (`responsive.css`)

Dit was de grootste verbouwing — van 84 naar ongeveer 375 regels.

- **Kaartweergave voor alle brede tabellen.** Voorheen alleen voorraad; nu ook
  bank, grootboek, HNVI en de laatste boekingen op het overzicht. Elke cel met
  een `data-label` toont het label links en de waarde rechts.
- **Aanraakdoelen van 38px** voor knoppen en invoervelden.
- **Invoervelden op 16px** op een telefoon. Bij een kleinere maat zoomt iOS
  automatisch in zodra je een veld aantikt.
- **Vensters schuiven van onderen omhoog** en zijn schermvullend, met respect
  voor de veilige zone onderaan (`env(safe-area-inset-bottom)`).
- **Streepje boven de actieve tab** in de balk onderaan, duidelijker dan kleur
  alleen.
- **De hoofd-KPI pakt de volle breedte** op smalle schermen.

---

## Twee valkuilen die onderweg zijn opgelost

**De sticky knoppenbalk in modals.** Het venster "Data wissen" heeft twee
knoppenbalken, met een streep en uitleg ertussen. De eerste balk vastzetten zou
de tekst eronder overlappen. Sticky geldt daarom alleen voor
`.modal-actions:last-child`. Hetzelfde voor de titel: alleen een `h3` die het
eerste directe kind van `.modal` is, want "Voorraad importeren" zet zijn titel
in een eigen `.modal-header`.

**De zebra over de totaalrij.** De rubriektotalen in het grootboek zetten hun
achtergrond op de `<tr>`, maar de zebra zet die op de `<td>` — die wint. De
totaalrij zou dus gewoon meegestreept worden. Opgelost met een eigen klasse.

---

## Bug die er al in zat

De rubriektotaalrij in `grootboek.js` gebruikte `var(--pos)` en `var(--neg)`
voor de kleur van het bedrag. Dat zijn geen variabelen maar klassen (`.pos` en
`.neg`), dus de kleur deed niets — het totaal stond altijd in de standaard
tekstkleur, ook bij een negatief saldo. Nu vervangen door de klassen.

---

## Bestanden die zijn aangepast

| Bestand | Wat |
| --- | --- |
| `style.css` | Herschreven — tokens |
| `layout.css` | Herschreven — shell |
| `components.css` | Gerichte aanpassingen: KPI, tabellen, badges, knoppen, formulieren, modals, meldingen, partijen |
| `responsive.css` | Herschreven — mobiel |
| `index.html` | Scrollzone in het menu, telbadge, `.form-hint`, CSS-cacheversie naar `v=20260826a` |
| `dashboard.js` | Hoofd-KPI, kleurstreepjes, `data-label` op de boekingentabel |
| `bank.js` | `data-label` en celklassen |
| `grootboek.js` | `data-label`, totaalrij-klasse, kleurbug |
| `hnvi.js` | `data-label`, celklassen, acties in hover-balk |
| `partijen.js` | Aandeelbalkje |
| `controle.js` | Vult de telbadge in het menu |

De overige 42 bestanden zijn niet aangeraakt.

---

## Wat er nog niet in zit

**De stapsgewijze formulieren.** De opmaak staat er (`.stap-balk`,
`.stap-paneel`), maar de vensters "Artikel toevoegen" en "Transactie toevoegen"
zijn nog één lang formulier. Het opsplitsen vraagt aanpassingen in `modals.js`
en `voorraad.js`, inclusief de validatie per stap. Dat is een aparte klus.

**`.toolbar-scheiding` en `.page-head-acties`** zijn beschikbaar maar nog nergens
toegepast. Ze staan klaar voor het moment dat je de werkbalken opruimt.

---

## Belangrijk om te weten

**Dit is niet in een browser getest.** Wat wél is gecontroleerd: alle 53
JS-bestanden zijn syntactisch schoon, de accolades in alle vier de
CSS-bestanden zijn in balans, en alle HTML-tags zijn netjes gesloten. Maar dat
zegt niets over hoe het er daadwerkelijk uitziet.

Twee dingen die ik als eerste zelf zou nakijken:

1. **Het KPI-raster op het Overzicht.** Dit leunt op de `:has()`-selector.
   Werkt in alle browsers van na 2023, maar controleer of de hoofdkaart en de
   drie kaarten eronder netjes uitlijnen.
2. **De kaartweergave op een telefoon** voor bank, grootboek en HNVI. Die
   `data-label`-attributen zijn nieuw; als een label ontbreekt of verkeerd staat,
   zie je dat meteen.

Verder: de oude versie staat nog ongewijzigd in `xtenate-test-v50.zip`. Als
er iets niet bevalt, kun je altijd terug.
