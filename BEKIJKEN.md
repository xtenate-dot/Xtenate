# Startpagina bekijken

Branch: **`feature/fase7-stap3b-indeling`** — commit `364436f`
Niets gemerged naar `main`, niets gepusht.

---

## Snelste manier: `voorbeeld-home.html`

Dubbelklik op **`voorbeeld-home.html`**. Dat is een momentopname van de nieuwe
startpagina met de complete opmaak erin. Geen server nodig, geen inloggen.

De knoppen doen daar niets — het is bedoeld om de indeling, de sidebar en de
uitstraling te beoordelen, niet om te navigeren.

Ook meegeleverd: `home-desktop.png`, `home-mobiel.png` en `beheer-desktop.png`.

---

## De echte app draaien

Dubbelklikken op `index.html` werkt **niet**: de app gebruikt ES-modules, die
weigert de browser vanaf `file://`. Je hebt een lokale webserver nodig.

**Met Python** (zit standaard op macOS en Linux; op Windows via python.org):

```bash
cd Xtenate
python3 -m http.server 8000
```

Open daarna http://localhost:8000 en log in zoals gewoonlijk.

**Met Node:**

```bash
cd Xtenate
npx serve .
```

Let op: je logt in op je echte Supabase-project, dus je ziet je eigen gegevens.
Er verandert niets aan je boekingen — deze stap voegt alleen een startpagina en
lege pagina's toe.

---

## Wat je zou moeten zien

1. Na inloggen kom je op **Home**: "Welkom bij Xtenate Administratie" met zes
   tegels.
2. Zijbalk: **Start** (Home) → **Boekhouding** (Overzicht, Bank, Facturen,
   Grootboek, Belasting) → **Magazijn** → **Beheer** (Beheer, Controle en de
   losse acties).
3. **Overzicht** is je vertrouwde dashboard: kerncijfers, jaarkiezer, grafieken
   en recente mutaties. Ongewijzigd, alleen verhuisd naar een eigen pagina.
4. **Facturen** is één pagina met twee tabbladen: Debiteuren en Crediteuren.
   Beide tonen nog een lege staat; die schermen komen in stap 4 en 5.
5. **Beheer** is nu een echte pagina met elf acties in drie groepen. De acties
   doen precies hetzelfde als de zijbalk-items.
6. De tegels tonen echte cijfers uit jouw gegevens. Bij Facturen staat "Niets
   openstaand" zolang je nog geen facturen hebt — de voorbeeldbedragen in de
   schermafbeeldingen zijn verzonnen om te laten zien hoe het eruitziet als er
   wél iets staat.

---

## Waar ik graag feedback op wil

- Klopt "Facturen" als naam voor het samengevoegde onderdeel?
- De tegel **Boekhouding** opent nu Overzicht. Zou je liever op Bank uitkomen?
- Op de Beheer-tegel staat de controlestand ("Controle: 1 fout · 5
  waarschuwing"). Nuttig, of te veel detail voor de startpagina?
- Kloppen de cijfers per tegel, of wil je andere?
- Uitstraling: grootte, ruimte, kleuraccenten.

---

## Terugdraaien

Deze zip staat los van je live app. Er is niets gepusht, dus
https://xtenate-dot.github.io/Xtenate/ draait nog gewoon de versie met alleen
Fix #1 en #3.
