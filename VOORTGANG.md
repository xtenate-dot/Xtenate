# Voortgang

## BTW-project — af

Fase 1 t/m 5b volledig gebouwd, getest en gecommit: de `BTW_INSTELLINGEN`/`isBtwPlichtig()`-instelling in Beheer, het BTW-blok in het boekingformulier (inclusief het gat voor privé-boekingen gerepareerd), een eigen BTW-pagina met kwartaaloverzicht en expliciete afhandeling van het overgangskwartaal, een pdf-aangifte die rechtstreeks op `btwRelevant()`/`isOvergangskwartaal()`/`totalenVan()` uit `btw.js` leunt, en een BTW-kolom in de Excel-export (`bankBlad()`) die dezelfde functies hergebruikt en veilig buiten het bereik van de import-logica staat.

## Facturenmodule — fase 1-3 af, fase 4-6 nog niet gestart

**Af:** fase 1 (factuur aanmaken/bewerken/verwijderen, pdf per factuur, dedup-validatie op factuurnummer), fase 2 (koppelen aan een boeking via `koppelBetaling()`/`ontkoppelBetaling()`, bedragverschil-waarschuwing, status-select uitgeschakeld zodra gekoppeld; de navigatie is hierbij ontward — `partijen.js`'s pagina's heten nu "Klanten"/"Leveranciers", "Debiteuren"/"Crediteuren" verwijst overal ondubbelzinnig naar de facturenmodule), fase 3 (ouderdomsanalyse-blokje onder de bestaande kaarten, "Te laat" nu gebaseerd op `ouderdomsanalyse()` in plaats van een eigen telling).

**Nog niet gestart:** fase 4 (relaties als eigen entiteit, nu nog tekst), fase 5 (facturen echt aansluiten op de Supabase-tabellen/`faktura_id`/`relatie_id`, die nu ongebruikt in het schema staan), fase 6 (verzendbare documenten met eigen bedrijfsgegevens — nu is de pdf bewust alleen een interne kopie).

## Zelfregistratie — fase 0-3 af, fase 4-5 optioneel en niet gestart

**Af:** fase 0 (beveiligingsgat in `zet_stamgegevens_klaar()` gedicht — eigenaarscontrole + `EXECUTE` ingetrokken bij `anon`/`PUBLIC`, op zowel test- als echt project), fase 1 (grootboek/rekeningen dynamisch gemaakt via `state.GROOTBOEK`/`REKENINGEN`, met een eigen beheerscherm op de Grootboek-pagina; jouw eigen 25 grootboekrekeningen en 5 bankrekeningen zijn overgenomen, niets verloren), fase 2 (`zet_stamgegevens_klaar()` herschreven: vult niet langer de ongebruikte SQL-tabellen maar rechtstreeks `app_data` met een generieke starterset — ook doorgevoerd op het echte project), fase 3 (registratiescherm + `signUp()`, met de vlag-aanpak `xtenate_net_geregistreerd` en correcte afhandeling van zowel wel-als-geen e-mailbevestiging).

**Optioneel, niet gestart:** fase 4 (korte vragenlijst in plaats van het vaste startschema), fase 5 (eigen bedrijfsgegevens per gebruiker, bijv. voor op een verzendklare factuur).

## Verder nog open

- **GBNM/REKNM in `helpers.js` opschonen** — bewust uitgesteld tot de overgang naar `state.GROOTBOEK`/`REKENINGEN` zich in de echte app heeft bewezen.
- **GitHub Support-antwoord** over restcache van de oude commits (vóór de geschiedenis-herschrijving) — mail is eerder deze sessie voorbereid, wachten op reactie/bevestiging van verzending.
- **`C:\Users\casdo\Xtenate` gelijktrekken** met de herschreven geschiedenis in deze map — bewust uitgesteld, gebeurt pas als jij daar weer in wilt werken.
- **Oude maandsaldi 2022-2025** — eventueel terugzetten, nog niet besloten/gedaan.
