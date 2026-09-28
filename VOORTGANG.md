# Voortgang

## BTW-project — af

Fase 1 t/m 5b volledig gebouwd, getest en gecommit: de `BTW_INSTELLINGEN`/`isBtwPlichtig()`-instelling in Beheer, het BTW-blok in het boekingformulier (inclusief het gat voor privé-boekingen gerepareerd), een eigen BTW-pagina met kwartaaloverzicht en expliciete afhandeling van het overgangskwartaal, een pdf-aangifte die rechtstreeks op `btwRelevant()`/`isOvergangskwartaal()`/`totalenVan()` uit `btw.js` leunt, en een BTW-kolom in de Excel-export (`bankBlad()`) die dezelfde functies hergebruikt en veilig buiten het bereik van de import-logica staat.

## Facturenmodule — fase 1-3 af, fase 4-6 nog niet gestart

**Af:** fase 1 (factuur aanmaken/bewerken/verwijderen, pdf per factuur, dedup-validatie op factuurnummer), fase 2 (koppelen aan een boeking via `koppelBetaling()`/`ontkoppelBetaling()`, bedragverschil-waarschuwing, status-select uitgeschakeld zodra gekoppeld; de navigatie is hierbij ontward — `partijen.js`'s pagina's heten nu "Klanten"/"Leveranciers", "Debiteuren"/"Crediteuren" verwijst overal ondubbelzinnig naar de facturenmodule), fase 3 (ouderdomsanalyse-blokje onder de bestaande kaarten, "Te laat" nu gebaseerd op `ouderdomsanalyse()` in plaats van een eigen telling).

**Nog niet gestart:** fase 4 (relaties als eigen entiteit, nu nog tekst), fase 5 (facturen echt aansluiten op de Supabase-tabellen/`faktura_id`/`relatie_id`, die nu ongebruikt in het schema staan), fase 6 (verzendbare documenten met eigen bedrijfsgegevens — nu is de pdf bewust alleen een interne kopie).

## Zelfregistratie — fase 0-3 af, fase 4-5 optioneel en niet gestart

**Af:** fase 0 (beveiligingsgat in `zet_stamgegevens_klaar()` gedicht — eigenaarscontrole + `EXECUTE` ingetrokken bij `anon`/`PUBLIC`, op zowel test- als echt project), fase 1 (grootboek/rekeningen dynamisch gemaakt via `state.GROOTBOEK`/`REKENINGEN`, met een eigen beheerscherm op de Grootboek-pagina; jouw eigen 25 grootboekrekeningen en 5 bankrekeningen zijn overgenomen, niets verloren), fase 2 (`zet_stamgegevens_klaar()` herschreven: vult niet langer de ongebruikte SQL-tabellen maar rechtstreeks `app_data` met een generieke starterset — ook doorgevoerd op het echte project), fase 3 (registratiescherm + `signUp()`, met de vlag-aanpak `xtenate_net_geregistreerd` en correcte afhandeling van zowel wel-als-geen e-mailbevestiging).

**Optioneel, niet gestart:** fase 4 (korte vragenlijst in plaats van het vaste startschema), fase 5 (eigen bedrijfsgegevens per gebruiker, bijv. voor op een verzendklare factuur).

## Bankkoppeling (Enable Banking) — fase 1 t/m 4b-2 af, fase 4b-3 t/m 4c nog niet gestart

**Af:** JWT-ondertekening (RS256) en het volledige autorisatie-rondje bewezen tegen de Enable Banking-sandbox (fase 1-3) — eigen sleutel, `/auth`, bank-login, `/sessions`, `/transactions` met paginering, allemaal empirisch getest tegen echte sandbox-data, niet alleen tegen documentatie.

Drie tabellen met RLS `TO authenticated` op zowel test- als echt project:
- `bank_inbox` — nog leeg, wacht op fase 4b-4.
- `bank_koppelingen` — `session_id`/`account_uid`/`geldig_tot` zijn kolomvergrendeld: de rol `authenticated` mag ze niet lezen én niet schrijven, ook niet de eigenaar zelf, ook niet via `INSERT ... ON CONFLICT DO UPDATE`. Alleen `rek` is gewoon bewerkbaar.
- `bank_koppeling_pogingen` — `state` (uuid) is de sleutel, 15 minuten geldig; een trigger ruimt bij elke nieuwe poging automatisch de verlopen pogingen van dezelfde gebruiker op en weigert een zesde gelijktijdige poging.

`koppel_bankrekening()` als SECURITY DEFINER-functie (zelfde patroon als `zet_stamgegevens_klaar()`, `search_path` vastgepind, `EXECUTE` alleen voor `authenticated`) — valideert dat `p_iban`/`p_session_id` niet leeg zijn en `p_geldig_tot` in de toekomst ligt maar niet verder dan 90 dagen vooruit, en is de enige plek die de drie beschermde kolommen mag zetten.

De Edge Function `bank-koppeling`, met alleen de auth-start-actie: de aanroeper komt uitsluitend uit `auth.getUser()` op de doorgegeven gebruikers-JWT (nooit een `user_id` uit de request-body), er wordt nergens de service-role-sleutel geladen (geverifieerd door alle `Deno.env.get()`-aanroepen na te lopen), en er komt nergens een secret in een antwoord of logregel terecht. Getest op zowel test- als echt project, inclusief een ingetrokken token en een token van een ander project (beide geweigerd).

**Nog niet gestart, in volgorde:**
1. Sessies-inwisselen in de Edge Function testen op het echte project (auth-start is daar wel getest, sessies-inwisselen nog niet).
2. Fase 4b-3: de app vangt `?code=` op (`history.replaceState` om de URL weer schoon te maken, controle dat de `state` overeenkomt met een lokaal onthouden waarde, de code zelf nooit tonen of loggen) + de knop "Bankrekening koppelen" in Beheer.
3. Fase 4b-4: transacties ophalen — paginering via `continuation_key`, datumvenster (90 dagen terug bij een eerste sync, `laatste_sync` met een overlap van enkele dagen bij een volgende), `entry_reference` als dedup-sleutel, foutafhandeling (verlopen consent, rate limits, een halve sync die veilig hervat kan worden).
4. Fase 4b-5: de knop "Nu ophalen" in de app zelf.
5. Fase 4c: het inboxscherm — bekijken, categoriseren (grootboekcode kiezen), omzetten naar echte boekingen.

**Harde eisen, blijven gelden bij elke volgende fase:**
- Banktekst (naam, omschrijving) altijd met `esc()` tonen bij het opbouwen van HTML — nooit ongefilterd. (Bij formulier-invulling via `.value =` is dat al veilig, geen aparte escaping nodig.)
- Een transactie is pas een boeking op het moment dat er een grootboekcode gekozen is en hij expliciet is omgezet — nooit stilzwijgend meetellen of wegvallen in de IB-berekening of het BTW-overzicht.
- Secrets (`ENABLE_BANKING_PRIVATE_KEY`/`APP_ID`, sessie-tokens, wachtwoorden) nooit in een antwoord of logregel, ook niet tijdens testen.
- De sandbox-toepassing bij Enable Banking is niet dezelfde registratie als productie — een echte bank vraagt later een nieuwe app-registratie en een nieuwe sleutel bij Enable Banking; dat moment komt dus nog terug.

**Twee praktijkbevindingen uit fase 3, tegen echte sandbox-data (niet alleen documentatie):**
- De dedup-sleutel bij het ophalen moet `entry_reference` zijn, niet `transaction_id` — dat laatste bleek in de praktijk vrijwel nooit gevuld.
- Bij een inkomende betaling (CRDT) is de tegenpartij-naam (`debtor.name`) vaak leeg — `remittance_information` is dan de gebruikelijke, niet de uitzonderlijke, terugval.

## Verder nog open

- **GBNM/REKNM in `helpers.js` opschonen** — bewust uitgesteld tot de overgang naar `state.GROOTBOEK`/`REKENINGEN` zich in de echte app heeft bewezen.
- **GitHub Support-antwoord** over restcache van de oude commits (vóór de geschiedenis-herschrijving) — mail is eerder deze sessie voorbereid, wachten op reactie/bevestiging van verzending.
- **`C:\Users\casdo\Xtenate` gelijktrekken** met de herschreven geschiedenis in deze map — bewust uitgesteld, gebeurt pas als jij daar weer in wilt werken.
- **Oude maandsaldi 2022-2025** — eventueel terugzetten, nog niet besloten/gedaan.
