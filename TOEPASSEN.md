# Toepassen en pushen

Commit die je wilt publiceren: **`9a8dba16ffa414acb10810c731012eae161dde49`**

Deze map is een volledige kloon van de repo met de `.git`-historie erin.
De vijf commits staan klaar op `main`; er is alleen nog niet gepusht.

---

## Optie A — deze map gebruiken (eenvoudigst)

Uitpakken, erin gaan, en pushen:

```bash
cd Xtenate
git log --oneline -5        # controleer dat 9a8dba1 bovenaan staat
git push origin main
```

Git vraagt om je GitHub-gebruikersnaam en een **personal access token**
(niet je wachtwoord — dat accepteert GitHub niet meer voor https).
Token maken: GitHub → Settings → Developer settings → Personal access tokens.

Zodra de push slaagt, publiceert GitHub Pages `main` automatisch.
Meestal binnen een minuut live op https://xtenate-dot.github.io/Xtenate/

---

## Optie B — patch toepassen op je eigen kloon

Als je liever je bestaande lokale kloon gebruikt:

```bash
cd /pad/naar/jouw/Xtenate
git checkout main
git pull                              # zorg dat je bij origin/main staat
git am < /pad/naar/xtenate-fixes.patch
git log --oneline -5
git push origin main
```

Het bestand `xtenate-fixes.patch` zit in deze map en bevat dezelfde
wijzigingen als losse commits.

---

## Na de deploy: even zelf controleren

Open de live app en loop dit kort na (dit is de checklist die ik zelf
niet in een echte browsersessie heb kunnen afronden):

1. Open een bestaande 2026-boeking → staat er een rode **Verwijderen**-knop?
2. Klik **Nieuwe boeking** → is die knop nu weg?
3. Verwijder een testboeking → verschijnt de bevestiging, en klopt de tabel daarna?
4. Ververs de pagina → is de boeking nog steeds weg?
5. Kloppen de totalen op het dashboard?
6. Als je Supabase-sync gebruikt: verwijder iets en sync daarna — gaat de cloud mee?
   Dit is het enige onderdeel dat ik niet heb kunnen testen (het CDN was
   geblokkeerd in mijn omgeving).

---

## Terugdraaien als er iets niet klopt

```bash
git revert --no-commit 9a8dba1 1a3b3e2 13ff7d5
git commit -m "Revert Fix #1 en #3"
git push origin main
```

GitHub Pages publiceert de teruggedraaide staat dan opnieuw.

---

## Wat er in zit

| Bestand | Wijziging |
|---|---|
| `storage.js` | Fix #3 — `save()` vangt `QuotaExceededError` en andere opslagfouten af |
| `bank.js` | Fix #1 — `deleteTx()` met bevestiging; knop tonen/verbergen per modus |
| `index.html` | Fix #1 — de Verwijderen-knop in de transactiemodal |
| `app.js` | Fix #1 — `deleteTx` gekoppeld aan `window` (anders werkt de knop niet) |
| `components.css` | `btn-danger` styling + `flex-wrap` op `.modal-actions` (regressiefix 320px) |
| `test-fixes.mjs` | testbestand, wordt niet door de app geladen |
| `WIJZIGINGSRAPPORT.md` | documentatie |

De 634 standaardboekingen (473 historisch + 161 voor 2026) zijn byte-identiek
gebleven.

`TECHNISCHE-CONTROLE.md` zit los in de map en staat bewust **niet** in een
commit, zoals afgesproken.
