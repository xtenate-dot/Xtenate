# Tests

Draaien met `node tests/<bestand>.mjs`, met `jsdom` en `xlsx` geïnstalleerd. De
tests zoeken hun bestanden vanuit hun eigen map, dus de werkmap maakt niet uit.

Alle vier draaien, in vier tijdzones:

```
for tz in Europe/Amsterdam UTC America/New_York Pacific/Auckland; do
  for t in import-test saldi-2026-test herherstel-test regressie; do
    TZ=$tz node tests/$t.mjs || echo "MISLUKT: $t in $tz"
  done
done
```

- **import-test.mjs** — `excelDate` op Date-cellen, Excel-serienummers en tekst;
  de importpreview; de tekenbepaling op de creditcard; gb 600/601; dat lezen en
  annuleren niets wegschrijven, ook niet met een `HNVI Loten`-tabblad; dat een
  bevestigde import voltooit en de jaartotalen toepast; en dat de herstelde
  gegevens intact blijven.
- **saldi-2026-test.mjs** — de 2026-tak: begin- en eindsaldo worden persistent
  opgeslagen en zijn er na een verse module-start nog.
- **herherstel-test.mjs** — voorkomt dat het herstel een tweede keer draait op al
  herstelde gegevens.
- **regressie.mjs** — controleert dat de detectie op de onherstelde stand nog
  steeds 473 datums en 2 soorten vindt.

Alle tests werken op een eigen, verzonnen dataset in een jsdom-omgeving. Ze raken
geen echte browseropslag aan.
