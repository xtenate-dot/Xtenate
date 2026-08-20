// modals.js — beheer-acties: Excel-import, cloud sync, API-sleutel, data wissen.

import { REKNM } from './helpers.js?v=20260820d';
import { renderHome } from './dashboard.js?v=20260820d';

/** Rekeningnummers die de app kent; gebruikt bij het inlezen van kolom G. */
const REKENINGEN = new Set(Object.keys(REKNM));

// De omzetrekeningen. Deze stond eerder binnen `reader.onload`, maar wordt ook
// door `bevestigImport` gebruikt — een andere functie, dus een ander bereik.
// Daardoor viel elke bevestigde import om met "OMZET_GB is not defined", ná het
// wegschrijven van de boekingen en vóór het toepassen van de jaartotalen.
const OMZET_GB = ['8000', '8010', '8020'];
import { HIST_TX_DEFAULT, HOME_TOTALS, HOME_TOTALS_DEFAULT, MAAND_SALDOS, normaliseerVoorraad, save, saveCoversData, saveHnviData, saveTxData, state } from './storage.js?v=20260820d';

// Leest het "Per Periode"-tabblad (indien aanwezig): een pivot-overzicht per grootboekrekening
// met een kolom "Totaal" voor het hele boekjaar. Dit is de brontabel van de boekhouding zelf,
// dus betrouwbaarder dan het optellen van losse boekingen (die kunnen ontbreken/verkeerd staan).
// Boekhoudkundige tekenconventie: omzet- en storting-rekeningen staan negatief bij toename,
// dus die draaien we om naar de positieve bedragen die de app elders gebruikt.
function parsePerPeriode(wb, fallback) {
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().replace(/[^a-z]/g, '') === 'perperiode');
  if (!sheetName) return null;
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  if (rows.length < 2) return null;
  const header = rows[0];
  const idxTotaal = header.indexOf('Totaal');
  if (idxTotaal === -1) return null;

  // byGb bevat alleen rekeningen waarvan de Totaal-cel een echt getal is. Cellen met een
  // formulefout (#N/A, #REF! etc — komt voor in oudere boekjaren) worden bewust NIET
  // opgeslagen, zodat hieronder per rekening teruggevallen kan worden op de losse boekingen
  // in plaats van zo'n fout stilzwijgend als €0 te lezen (dat was de eerdere bug).
  const byGb = {};
  rows.slice(1).forEach(row => {
    const nummer = row[0];
    if (nummer === null || nummer === undefined || nummer === '') return;
    const gbStr = String(Math.round(parseFloat(nummer)));
    if (gbStr === 'NaN') return;
    const totaal = row[idxTotaal];
    if (typeof totaal === 'number') byGb[gbStr] = totaal;
  });

  const heeft = gb => gb in byGb;
  const get = gb => byGb[gb];

  const omzXt = heeft('8000') ? -get('8000') : fallback.omzXt;
  const omzBol = heeft('8010') ? -get('8010') : fallback.omzBol;
  const omzHC = heeft('8020') ? -get('8020') : fallback.omzHC;
  const omzet = (heeft('8000') || heeft('8010') || heeft('8020')) ? (omzXt + omzBol + omzHC) : fallback.omzet;
  // Kosten normaal uit rekening 9990 ("Kosten"); anders rubriek 4 + inkopen; anders terugval.
  let kosten;
  if (heeft('9990')) kosten = get('9990');
  else if (heeft('4999') && heeft('7999')) kosten = get('4999') + get('7999');
  else kosten = fallback.kosten;

  return {
    omzet, kosten, omzXt, omzBol, omzHC,
    priveOp: heeft('601') ? get('601') : fallback.priveOp,
    priveSt: heeft('600') ? -get('600') : fallback.priveSt,
    hnviInv: heeft('7010') ? get('7010') : fallback.hnviInv
  };
}

export function importExcel(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  document.getElementById('import-title').textContent = 'Bezig met importeren...';
  document.getElementById('import-body').innerHTML = 'Excel bestand lezen...';
  document.getElementById('import-actions').style.display = 'none';
  document.getElementById('modal-import').classList.add('open');

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array', cellDates:true});
      let log = [];
      let newTx = [];
      let newCovers = [];
      let tid = 500;

      // Een boekhouddatum is een kalenderdatum, geen tijdstip. Eerder liep dit
      // via toISOString(), en dat rekent om naar UTC: middernacht in Amsterdam
      // is de avond ervoor in UTC, dus elke datumcel kwam er een dag te vroeg
      // uit. Dat gebeurde alleen bij een positieve UTC-afwijking, waardoor het
      // in een testomgeving op UTC nooit opviel.
      function excelDate(val) {
        if (val === 0 || !val) return null;
        // SheetJS levert met cellDates:true een Date in lokale tijd. We lezen
        // dag, maand en jaar zoals ze lokaal in de cel staan en rekenen niet om.
        if (val instanceof Date) {
          const j = val.getFullYear(), m = val.getMonth() + 1, d = val.getDate();
          return `${j}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        }
        // Excel telt dagen vanaf 30-12-1899. In hele dagen rekenen vanaf een
        // UTC-referentie, zodat zomertijd er niet tussen kan komen.
        if (typeof val === 'number') {
          const d = new Date(Date.UTC(1899, 11, 30));
          d.setUTCDate(d.getUTCDate() + Math.floor(val));
          return d.toISOString().slice(0,10);
        }
        if (typeof val === 'string' && val.match(/\d{4}-\d{2}-\d{2}/)) return val.slice(0,10);
        if (typeof val === 'string' && val.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
          const [m,d,y] = val.split('/');
          return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
        return null;
      }

      // Herken automatisch alle "Bank JJJJ-MM" tabs, welk jaar dan ook
      const bankSheets = wb.SheetNames.filter(n => /^Bank \d{4}-\d{2}$/.test(n));

      // Bepaal welk jaar (of jaren) dit bestand bevat, voor de importmelding
      const gevondenJaren = [...new Set(bankSheets.map(n => n.slice(5,9)))].sort();

      // Bank tabs
      let bankCount = 0;
      bankSheets.forEach(sheetName => {
        if (!wb.SheetNames.includes(sheetName)) return;
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
        rows.slice(1).forEach(row => {
          [0, 8].forEach(offset => {
            const datum = excelDate(row[offset+1]);
            const gb = row[offset+2];
            const bedrag = row[offset+3];
            const naam = row[offset+5];
            // Kolom G kan een rekeningnummer bevatten (staat in onze eigen export).
            // Alleen overnemen als het een rekening is die de app kent.
            const rekKolom = row[offset+6];
            const rek = REKENINGEN.has(String(rekKolom)) ? String(rekKolom) : '1010';
            if (!datum || bedrag === null || bedrag === undefined || gb === null || String(gb) === 'Onbekend') return;
            if (typeof bedrag !== 'number') return;
            const gbStr = String(Math.round(parseFloat(gb)));
            if (gbStr === 'NaN') return;
            const isPrive = ['600','601'].includes(gbStr);
            const isInk = OMZET_GB.includes(gbStr);
            let type;
            // Soort uit het grootboek: 600 is een storting, 601 een opname. Het
            // teken van het bedrag is hiervoor niet betrouwbaar gebleken.
            if (isPrive) type = gbStr === '600' ? 'prive_storting' : 'prive_opname';
            else if (isInk && bedrag > 0) type = 'inkomst';
            else if (bedrag > 0 && !isPrive) type = 'inkomst';
            else type = 'uitgave';
            newTx.push({id:tid++, datum, gb:gbStr, bedrag:Math.abs(bedrag),
              naam: naam ? String(naam) : '', omschr: row[offset+4] ? String(row[offset+4]) : '', rek, type});
            bankCount++;
          });
        });
      });

      // Creditkaart Prive
      let ccCount = 0;
      const ccProblemen = [];
      let ccConventie = null;
      const ccSheetName = wb.SheetNames.find(n => n.toLowerCase().replace(/[^a-z]/g, '').includes('creditkaartprive'));
      if (ccSheetName) {
        const ws = wb.Sheets[ccSheetName];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});

        // Eerst alles inlezen zonder te oordelen, want het teken had betekenis.
        // Math.abs gooide dat weg, waardoor een terugstorting als uitgave werd
        // geboekt en het jaartotaal er tweemaal het bedrag naast zat.
        const ruweRegels = [];
        rows.slice(2).forEach(row => {
          const datum = excelDate(row[7]);
          const gb = row[8];
          const bedrag = row[9];
          const omschr = row[10];
          if (!datum) return;
          if (typeof bedrag !== 'number') return;
          const gbStr = gb ? String(Math.round(parseFloat(gb))) : '7010';
          ruweRegels.push({ datum, gbStr, bedrag, omschr });
        });

        // Welk teken staat in dit bestand voor een uitgave? Dat leiden we af uit
        // de meerderheid, in plaats van het te veronderstellen. De uitkomst komt
        // in de preview te staan, zodat je het kunt nakijken.
        const gewoon = ruweRegels.filter(r => !['600','601'].includes(r.gbStr));
        const negatief = gewoon.filter(r => r.bedrag < 0).length;
        const positief = gewoon.filter(r => r.bedrag > 0).length;
        ccConventie = negatief > positief ? 'negatief' : 'positief';

        ruweRegels.forEach(r => {
          const isPrive = ['600','601'].includes(r.gbStr);
          let ccType;
          if (isPrive) {
            // De soort volgt uit het grootboek, niet uit het teken van het
            // bedrag. In de hele historie hoort 600 bij een storting en 601 bij
            // een opname, zonder uitzondering; het teken bleek onbetrouwbaar.
            ccType = r.gbStr === '600' ? 'prive_storting' : 'prive_opname';
          } else {
            const isUitgave = ccConventie === 'negatief' ? r.bedrag < 0 : r.bedrag > 0;
            ccType = isUitgave ? 'uitgave' : 'inkomst';
            if (!isUitgave) {
              ccProblemen.push({
                datum: r.datum, bedrag: r.bedrag, gb: r.gbStr,
                omschr: r.omschr ? String(r.omschr) : '',
                uitleg: 'tegengesteld teken — gelezen als terugstorting, niet als uitgave'
              });
            }
          }
          newTx.push({id:tid++, datum: r.datum, gb:r.gbStr, bedrag:Math.abs(r.bedrag),
            naam: r.omschr ? String(r.omschr) : 'Creditkaart Privé',
            omschr: r.omschr ? String(r.omschr) : '', rek:'1030', type:ccType});
          ccCount++;
          // Let op: er wordt HIER GEEN automatische gekoppelde privé-storting meer aangemaakt.
          // Dat bleek bij analyse van de echte boekhouding structureel niet te kloppen met de
          // "Per Periode"-ledger (soms te veel, soms te weinig privé storting). De betrouwbare
          // privé-totalen komen nu uit HOME_TOTALS (het Per Periode-tabblad), niet meer uit een
          // aanname per creditkaart-boeking.
        });
      }

      // Voorraad & Mutaties (Funny Covers)
      let coverCount = 0;
      if (wb.SheetNames.includes('Voorraad & Mutaties')) {
        const ws = wb.Sheets['Voorraad & Mutaties'];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
        let cid = 200;
        rows.slice(2).forEach(row => {
          const artikel = row[0];
          const voorraad = row[2];
          if (!artikel || typeof artikel !== 'string') return;
          // Kop- en totaalregels uit het werkblad zijn geen artikelen.
          const kop = String(artikel).trim().toLowerCase();
          if (kop.startsWith('totaal') || ['artikel', 'artikelen', 'omschrijving', 'product'].includes(kop)) return;
          const inkoop = row[7] || 0;
          const verkoop = row[8] || 0;
          const omzet2026 = row[15] || 0;
          const getal = v => (typeof v === 'number' ? v : null);
          
          // Zoek kolommen voor jaren.2026.eind en jaren.2026.verkocht
          // Deze staan meestal aan het eind als extra kolommen (na omzet2026)
          // Row format: [artikel, ..., voorraad, ..., verkoop, ..., omzet2026, ..., jaren.2026.eind?, jaren.2026.verkocht?]
          let jaren = {};
          // Check of there are any jaren-velden (deze zouden als extra kolommen staan)
          // Voor nu: als omzet2026 > 0, neem aan dat dit ook verkocht in 2026 is
          // (dit is een fallback totdat we de kolommen beter kunnen mappen)
          if (omzet2026 > 0 || verkoop > 0) {
            jaren['2026'] = {
              eind: getal(row[16]) || (getal(voorraad) || 0),  // Eindvoorraad = huidige voorraad
              verkocht: getal(row[17]) || (omzet2026 > 0 ? omzet2026 : null)  // Verkocht = omzet stuks
            };
          }
          
          newCovers.push({id:cid++, artikel:String(artikel),
            inkoopprijs: getal(row[3]), prijs: getal(row[4]), minVoorraad: getal(row[6]),
            voorraad: typeof voorraad === 'number' ? Math.round(voorraad) : 0,
            inkoop: typeof inkoop === 'number' ? Math.round(inkoop) : 0,
            verkoop: typeof verkoop === 'number' ? Math.round(verkoop) : 0,
            omzet2026: typeof omzet2026 === 'number' ? Math.round(omzet2026) : 0,
            jaren
          });
          coverCount++;
        });
      }

      // HNVI-loten uit onze eigen export terughalen, zodat het Excel-bestand een
      // volledige reservekopie is en niet alleen de bankmutaties bevat.
      let lotCount = 0;
      let nieuweLoten = [];
      const lotBlad = wb.SheetNames.find(n => n.toLowerCase().replace(/[^a-z]/g,'') === 'hnviloten');
      if (lotBlad) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[lotBlad], {header:1, defval:null});
        rows.slice(1).forEach(row => {
          const datum = excelDate(row[0]);
          const omschr = row[1];
          if (!datum && !omschr) return;
          const verkoop = typeof row[3] === 'number' ? row[3] : null;
          nieuweLoten.push({
            id: row[7] != null && row[7] !== '' ? row[7] : 'x' + (lotCount + 1),
            _key: String(row[7] ?? 'x' + (lotCount + 1)),
            datum: datum || '',
            omschr: omschr ? String(omschr) : '',
            inkoop: typeof row[2] === 'number' ? row[2] : 0,
            verkoop,
            status: String(row[5] || (verkoop ? 'verkocht' : 'voorraad')),
            noot: row[6] ? String(row[6]) : ''
          });
          lotCount++;
        });
        // Hier wordt bewust NIET geschreven. De loten werden eerder al bij het
        // lezen van het bestand opgeslagen, dus vóór de preview en zonder weg
        // te komen met Annuleren. Ze gaan nu mee in `wachtendeImport` en worden
        // pas in `bevestigImport` toegepast.
      }

      // Vastgelegde voorraadstanden per jaar
      const jaarBlad = wb.SheetNames.find(n => n.toLowerCase().replace(/[^a-z]/g,'') === 'voorraadperjaar');
      let jaarStanden = {};
      if (jaarBlad) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[jaarBlad], {header:1, defval:null});
        rows.slice(1).forEach(row => {
          const artikel = row[0], jaar = row[1];
          if (!artikel || !jaar) return;
          const sleutel = String(artikel).trim().toLowerCase();
          (jaarStanden[sleutel] ||= {})[String(jaar)] = {
            eind: typeof row[2] === 'number' ? row[2] : null,
            verkocht: typeof row[3] === 'number' ? row[3] : null
          };
        });
        if (newCovers.length) {
          newCovers.forEach(c => {
            const gevonden = jaarStanden[String(c.artikel).trim().toLowerCase()];
            if (gevonden) c.jaren = { ...(c.jaren || {}), ...gevonden };
          });
        }
      }

      // Lees begin/eindsaldo per maand
      let newSaldos = {};
      bankSheets.forEach(sheetName => {
        if (!wb.SheetNames.includes(sheetName)) return;
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
        const maand = sheetName.slice(-7); // bijv. 2026-01
        let begin = null, eind = null;
        rows.forEach(row => {
          if (row[8] === 'Beginsaldo' && typeof row[9] === 'number') begin = row[9];
          if (row[8] === 'Eindsaldo' && typeof row[9] === 'number') eind = row[9];
        });
        if (begin !== null || eind !== null) newSaldos[maand] = {begin, eind};
      });

      // Valideer: alleen opslaan als er transacties zijn
      if (newTx.length === 0) {
        document.getElementById('import-title').textContent = 'Niets gevonden';
        document.getElementById('import-body').innerHTML = '⚠️ Er zijn geen transacties gevonden in dit bestand.<br>Controleer of je het juiste Excel bestand hebt geselecteerd (bijv. Administratie_2026.xlsx).';
        document.getElementById('import-actions').style.display = 'flex';
        return;
      }

      // ---------------------------------------------------------------
      // Vanaf hier wordt er NIETS meer automatisch weggeschreven. Het gelezen
      // bestand gaat eerst als plan naar het scherm; pas na bevestiging wordt
      // het toegepast. Een import overschreef eerder ongemerkt hele jaren,
      // inclusief voorraad en HNVI-loten.
      wachtendeImport = {
        wb, newTx, newCovers, newSaldos, nieuweLoten, gevondenJaren, tid,
        bankCount, ccCount, lotCount, coverCount,
        ccProblemen, ccConventie, bestandsnaam: file.name
      };
      toonImportPreview();
    } catch(err) {
      document.getElementById('import-title').textContent = 'Fout bij importeren';
      document.getElementById('import-body').innerHTML = 'Er ging iets mis: ' + err.message + '<br><br>Controleer of je het juiste Excel bestand hebt geselecteerd.';
      document.getElementById('import-actions').style.display = 'flex';
    }
  };
  reader.readAsArrayBuffer(file);
}

// ------------------------------------------------- import: eerst tonen, dan pas schrijven

let wachtendeImport = null;

const _esc = t => String(t ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Wat de import zou doen, zonder het te doen. */
export function bouwImportPlan(p) {
  const is2026 = p.gevondenJaren.includes('2026');
  const jarenMetRegels = [...new Set(p.newTx.map(t => t.datum.slice(0,4)))].sort();
  const legeJaren = p.gevondenJaren.filter(j => !jarenMetRegels.includes(j));

  // Welke bestaande records verdwijnen? Bij een historische import worden de
  // jaren met regels volledig vervangen; bij 2026 de hele lijst.
  const bestaandHist = Array.isArray(state.HIST_TX) ? state.HIST_TX : [];
  const bestaandTx = Array.isArray(state.TX) ? state.TX : [];
  const vervangen = is2026
    ? bestaandTx.length
    : bestaandHist.filter(t => jarenMetRegels.some(j => String(t.datum).startsWith(j))).length;

  // Boekingen waarvan de datum buiten het tabblad valt waar ze vandaan komen:
  // dat wijst op een verschoven datum of een jaargrensprobleem.
  const buitenJaar = p.newTx.filter(t => !p.gevondenJaren.includes(t.datum.slice(0,4)));

  const covers = Array.isArray(state.COVERS) ? state.COVERS : [];
  const loten = Array.isArray(state.HNVI_LOTS) ? state.HNVI_LOTS : [];

  return {
    is2026, jarenMetRegels, legeJaren, vervangen, buitenJaar,
    nieuw: p.newTx.length,
    doelSleutel: is2026 ? 'xtenate_tx' : 'xtenate_hist_tx_override',
    voorraadVervangen: p.newCovers.length > 0 ? { van: covers.length, naar: p.newCovers.length } : null,
    lotenVervangen: p.lotCount > 0 ? { van: loten.length, naar: p.lotCount } : null,
    saldoMaanden: Object.keys(p.newSaldos || {}).length,
    ccProblemen: p.ccProblemen || [],
    ccConventie: p.ccConventie
  };
}

function toonImportPreview() {
  const p = wachtendeImport;
  const plan = bouwImportPlan(p);
  const waarschuwing = plan.buitenJaar.length || plan.ccProblemen.length
    || (plan.voorraadVervangen && plan.voorraadVervangen.naar < plan.voorraadVervangen.van);

  document.getElementById('import-title').textContent = 'Controleer de import';
  document.getElementById('import-body').innerHTML =
    `<div class="alert ${waarschuwing ? 'alert-error' : 'alert-info'}" style="margin-bottom:12px">
       <strong>Er is nog niets opgeslagen.</strong> Dit is wat de import zou doen met
       <code>${_esc(p.bestandsnaam || 'het bestand')}</code>.
     </div>
     <table class="tbl-compact" style="width:100%">
       <tbody>
         <tr><td class="muted" style="width:210px">Doelsleutel</td>
             <td><code>${_esc(plan.doelSleutel)}</code></td></tr>
         <tr><td class="muted">Jaren die worden geraakt</td>
             <td><strong>${_esc(plan.jarenMetRegels.join(', ') || 'geen')}</strong>
             ${plan.legeJaren.length ? `<br><span class="muted">tabbladen zonder boekingen, worden overgeslagen: ${_esc(plan.legeJaren.join(', '))}</span>` : ''}</td></tr>
         <tr><td class="muted">Bestaande records die verdwijnen</td>
             <td class="${plan.vervangen ? 'neg' : ''}"><strong>${plan.vervangen}</strong></td></tr>
         <tr><td class="muted">Nieuwe records die erbij komen</td>
             <td><strong>${plan.nieuw}</strong> — ${p.bankCount} bank, ${p.ccCount} creditcard</td></tr>
         <tr><td class="muted">Maandsaldi</td><td>${plan.saldoMaanden}</td></tr>
         ${plan.voorraadVervangen ? `<tr><td class="muted">Voorraad wordt vervangen</td>
             <td class="${plan.voorraadVervangen.naar < plan.voorraadVervangen.van ? 'neg' : ''}">
             ${plan.voorraadVervangen.van} → ${plan.voorraadVervangen.naar} artikelen</td></tr>` : ''}
         ${plan.lotenVervangen ? `<tr><td class="muted">HNVI-loten worden vervangen</td>
             <td>${plan.lotenVervangen.van} → ${plan.lotenVervangen.naar} loten</td></tr>` : ''}
         <tr><td class="muted">Datums buiten hun eigen jaar</td>
             <td class="${plan.buitenJaar.length ? 'neg' : 'pos'}">${plan.buitenJaar.length}
             ${plan.buitenJaar.length ? `<br><span class="muted">${_esc(plan.buitenJaar.slice(0,5).map(t => t.datum + ' ' + (t.naam||'')).join(' · '))}</span>` : ''}</td></tr>
         <tr><td class="muted">Tekens op de creditcard</td>
             <td>${plan.ccConventie ? `uitgaven staan ${_esc(plan.ccConventie)} in dit bestand` : 'geen creditcardblad'}
             ${plan.ccProblemen.length ? `<br><span class="neg">${plan.ccProblemen.length} regel(s) met een tegengesteld teken, gelezen als terugstorting:</span>
             <br><span class="muted">${_esc(plan.ccProblemen.slice(0,5).map(r => r.datum + ' ' + r.bedrag + ' ' + r.omschr).join(' · '))}</span>` : ''}</td></tr>
       </tbody>
     </table>
     <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
       <button class="btn" onclick="annuleerImport()">Annuleren</button>
       <button class="btn btn-primary" onclick="bevestigImport()">Importeren en opslaan</button>
     </div>`;
  document.getElementById('import-actions').style.display = 'none';
}

export function annuleerImport() {
  wachtendeImport = null;
  document.getElementById('modal-import').classList.remove('open');
}

/** Past de gelezen import toe. Dit is de enige plek die daarbij schrijft. */
export function bevestigImport() {
  const p = wachtendeImport;
  if (!p) return;
  wachtendeImport = null;
  try {
      const is2026 = p.gevondenJaren.includes('2026');
      const jaarLabel = p.gevondenJaren.join(', ') || 'onbekend jaar';

      // HNVI-loten: gelezen in de leesfase, maar pas hier toegepast.
      if (p.nieuweLoten && p.nieuweLoten.length) {
        state.HNVI_LOTS = p.nieuweLoten;
        saveHnviData();
      }

      if (is2026) {
        // Sla op als huidige (2026) data
        state.TX = p.newTx;
        state.nxtTx = p.tid;
        if (p.newCovers.length > 0) { state.COVERS = normaliseerVoorraad(p.newCovers, state.COVERS); state.nxtCover = 300; }
        Object.keys(MAAND_SALDOS).filter(m=>m.startsWith('2026')).forEach(m=>delete MAAND_SALDOS[m]);
        Object.assign(MAAND_SALDOS, p.newSaldos);
        saveTxData();
        saveCoversData();
        // De maandsaldi stonden hier alleen in het geheugen; na een herlaadbeurt
        // waren ze weg. De historische tak sloeg ze al wel op.
        save('xtenate_maand_saldos_override', MAAND_SALDOS);
      } else {
        // Sla op als historische data: vervang alleen de jaren die in dit bestand voorkomen
        // Alleen jaren vervangen waarvoor het bestand ook werkelijk boekingen
        // bevat. Een leeg tabblad "Bank 2023-05" maakte anders het hele jaar
        // 2023 leeg zonder dat er iets voor terugkwam.
        const jarenMetRegels = [...new Set(p.newTx.map(t => t.datum.slice(0,4)))];
        const legeJaren = p.gevondenJaren.filter(j => !jarenMetRegels.includes(j));
        state.HIST_TX = state.HIST_TX.filter(t => !jarenMetRegels.some(j => t.datum.startsWith(j)));
        state.HIST_TX = [...state.HIST_TX, ...p.newTx.map(t => ({...t, id: 'h' + jaarLabel.replace(/, /g,'_') + '_' + t.id}))];
        jarenMetRegels.forEach(j => {
          Object.keys(MAAND_SALDOS).filter(m=>m.startsWith(j)).forEach(m=>delete MAAND_SALDOS[m]);
        });
        if (legeJaren.length) console.warn('Overgeslagen: tabbladen zonder boekingen voor', legeJaren.join(', '));
        Object.assign(MAAND_SALDOS, p.newSaldos);
        save('xtenate_hist_tx_override', state.HIST_TX);
        save('xtenate_maand_saldos_override', MAAND_SALDOS);
      }

      // Jaartotalen uit "Per Periode" (indien aanwezig) — leidend voor de Home-cijfers.
      // Terugval per rekening: optellen uit de zojuist ingelezen losse boekingen (p.newTx),
      // voor het geval een deel van het "Per Periode"-tabblad #N/A-fouten bevat.
      const fallbackTotals = {
        omzXt: p.newTx.filter(t => t.type==='inkomst' && t.gb==='8000').reduce((s,t)=>s+t.bedrag,0),
        omzBol: p.newTx.filter(t => t.type==='inkomst' && t.gb==='8010').reduce((s,t)=>s+t.bedrag,0),
        omzHC: p.newTx.filter(t => t.type==='inkomst' && t.gb==='8020').reduce((s,t)=>s+t.bedrag,0),
        omzet: p.newTx.filter(t => t.type==='inkomst' && OMZET_GB.includes(t.gb)).reduce((s,t)=>s+t.bedrag,0),
        kosten: p.newTx.filter(t => t.type==='uitgave').reduce((s,t)=>s+t.bedrag,0),
        priveOp: p.newTx.filter(t => t.type==='prive_opname').reduce((s,t)=>s+t.bedrag,0),
        priveSt: p.newTx.filter(t => t.type==='prive_storting').reduce((s,t)=>s+t.bedrag,0),
        hnviInv: p.newTx.filter(t => t.gb==='7010').reduce((s,t)=>s+t.bedrag,0)
      };
      // Staat er een blad "Jaartotalen" in (dat schrijft onze eigen export weg),
      // dan zijn die cijfers per jaar leidend. Per Periode is een berekend
      // overzicht en levert voor kosten en prive-stortingen andere bedragen op.
      const jtBlad = p.wb.SheetNames.find(n => n.toLowerCase().replace(/[^a-z]/g,'') === 'jaartotalen');
      let uitJaartotalen = 0;
      if (jtBlad) {
        const rows = XLSX.utils.sheet_to_json(p.wb.Sheets[jtBlad], {header:1, defval:null});
        rows.slice(1).forEach(row => {
          const jaar = row[0];
          if (!jaar || typeof row[1] !== 'number') return;
          HOME_TOTALS[String(jaar)] = {
            omzet: row[1] || 0, kosten: row[2] || 0, omzXt: row[3] || 0, omzBol: row[4] || 0,
            omzHC: row[5] || 0, priveOp: row[6] || 0, priveSt: row[7] || 0, hnviInv: row[8] || 0
          };
          uitJaartotalen++;
        });
        if (uitJaartotalen) save('xtenate_home_totals_override', HOME_TOTALS);
      }

      const perPeriodeTotals = uitJaartotalen ? null : parsePerPeriode(p.wb, fallbackTotals);
      if (perPeriodeTotals) {
        p.gevondenJaren.forEach(j => { HOME_TOTALS[j] = perPeriodeTotals; });
        save('xtenate_home_totals_override', HOME_TOTALS);
      }

      const saldoCount = Object.keys(p.newSaldos).length;
      document.getElementById('import-title').textContent = 'Import geslaagd!';
      document.getElementById('import-body').innerHTML =
        `📅 Jaar: <strong>${jaarLabel}</strong><br>` +
        `✅ <strong>${p.bankCount}</strong> banktransacties ingelezen<br>` +
        `✅ <strong>${p.ccCount}</strong> creditkaart boekingen ingelezen<br>` +
        (saldoCount > 0 ? `✅ <strong>${saldoCount}</strong> maandsaldos ingelezen<br>` : '') +
        (p.lotCount > 0 ? `✅ <strong>${p.lotCount}</strong> HNVI-loten ingelezen<br>` : '') +
        (p.newCovers.length > 0 ? `✅ <strong>${p.coverCount}</strong> covers artikelen ingelezen<br>` : '') +
        (perPeriodeTotals ? `✅ Jaartotalen (omzet/kosten/privé) ingelezen uit "Per Periode" — dit is nu leidend voor de Home-cijfers van dit jaar<br>` : `⚠️ Geen "Per Periode" tabblad gevonden — Home-cijfers worden voor dit jaar nog berekend uit losse boekingen<br>`) +
        `<br>Je data is opgeslagen. HNVI-loten blijven bewaard.`;
      document.getElementById('import-actions').style.display = 'flex';


      renderHome();
  } catch (err) {
    document.getElementById('import-title').textContent = 'Fout bij importeren';
    document.getElementById('import-body').innerHTML = 'Er ging iets mis: ' + err.message;
    document.getElementById('import-actions').style.display = 'flex';
  }
}

export function herstelHistorischeData() {
  if (!window.confirm('Dit herstelt de historische jaren (2022 t/m 2025) naar de standaard/gecorrigeerde data uit de app zelf, en overschrijft eventuele lokale wijzigingen in je browser voor die jaren. 2026 blijft ongewijzigd. Doorgaan?')) {
    return;
  }
  try {
    state.HIST_TX = JSON.parse(JSON.stringify(HIST_TX_DEFAULT));
    save('xtenate_hist_tx_override', state.HIST_TX);
    localStorage.removeItem('xtenate_maand_saldos_override');

    // Ook de jaartotalen (omzet/kosten/privé) terugzetten — dit was eerder al eens
    // los gecachet in localStorage (bijv. als leeg object {} uit een oudere versie
    // van de app) en bleef daardoor de nieuwe, gecorrigeerde standaardwaarden overstemmen.
    Object.keys(HOME_TOTALS).forEach(k => delete HOME_TOTALS[k]);
    Object.assign(HOME_TOTALS, JSON.parse(JSON.stringify(HOME_TOTALS_DEFAULT)));
    save('xtenate_home_totals_override', HOME_TOTALS);

    document.getElementById('modal-wis').classList.remove('open');
    renderHome();
    window.alert('Klaar! Historische data (2022-2025) én de jaartotalen zijn hersteld naar de standaardwaarden uit de app.');
  } catch (err) {
    window.alert('Er ging iets mis: ' + err.message);
  }
}

export function openWisModal() {
  document.getElementById('wis-status').textContent = '';
  document.getElementById('modal-wis').classList.add('open');
}

export function doWis() {
  try {
    const jaren = ['2026','2025','2024','2023','2022'].filter(j => {
      const el = document.getElementById('wis-' + j);
      return el && el.checked;
    });

    if (jaren.length === 0) {
      document.getElementById('wis-status').textContent = 'Selecteer minimaal één jaar.';
      return;
    }

    if (!window.confirm('Weet je zeker dat je data van ' + jaren.join(', ') + ' wilt wissen? Dit kan niet ongedaan gemaakt worden.')) {
      return;
    }

    let wisLog = [];

    jaren.forEach(j => { delete HOME_TOTALS[j]; });
    save('xtenate_home_totals_override', HOME_TOTALS);

    if (jaren.includes('2026')) {
      state.TX = [];
      state.COVERS = [];
      state.nxtTx = 200; state.nxtCover = 100;
      saveTxData(); saveCoversData();
      wisLog.push('2026 gewist (HNVI/Xtenate-loten blijven bewaard)');
    }

    const histJaren = jaren.filter(j => j !== '2026');
    if (histJaren.length > 0) {
      state.HIST_TX = state.HIST_TX.filter(t => !histJaren.some(j => t.datum.startsWith(j)));
      histJaren.forEach(j => {
        Object.keys(MAAND_SALDOS).filter(m => m.startsWith(j)).forEach(m => delete MAAND_SALDOS[m]);
      });
      save('xtenate_hist_tx_override', state.HIST_TX);
      save('xtenate_maand_saldos_override', MAAND_SALDOS);
      wisLog.push(histJaren.join(', ') + ' gewist');
    }

    document.getElementById('modal-wis').classList.remove('open');
    renderHome();
    window.alert('Klaar! ' + wisLog.join(' / ') + '. Je kunt nu opnieuw importeren.');
  } catch (err) {
    document.getElementById('wis-status').textContent = 'Fout: ' + err.message;
    window.alert('Er ging iets mis: ' + err.message);
  }
}

export function openSyncModal() {
  const url = localStorage.getItem('xtenate_sync_url') || '';
  document.getElementById('sync-url-input').value = url;
  document.getElementById('sync-status').textContent = url ? 'Sync URL is ingesteld.' : 'Nog geen sync URL ingesteld.';
  document.getElementById('modal-sync').classList.add('open');
}

export function saveSyncUrl() {
  const url = document.getElementById('sync-url-input').value.trim();
  if (url) {
    localStorage.setItem('xtenate_sync_url', url);
    document.getElementById('sync-status').textContent = 'Opgeslagen!';
  } else {
    localStorage.removeItem('xtenate_sync_url');
  }
}

export function getSyncUrl() {
  return localStorage.getItem('xtenate_sync_url');
}

export async function syncUpload() {
  const url = getSyncUrl();
  if (!url) { document.getElementById('sync-status').textContent = 'Stel eerst een sync URL in.'; return; }
  document.getElementById('sync-status').textContent = 'Uploaden...';
  try {
    const payload = {
      TX: state.TX,
      Covers: state.COVERS,
      HnviLots: state.HNVI_LOTS,
      Inkoop: typeof INKOOP !== 'undefined' ? INKOOP : [],
      MaandSaldos: MAAND_SALDOS,
      _device: navigator.userAgent.includes('Mobile') ? 'telefoon' : 'computer'
    };
    const response = await fetch(url + '?action=save', {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    document.getElementById('sync-status').textContent = '✅ Geüpload! ' + new Date().toLocaleTimeString('nl-NL');
  } catch (err) {
    document.getElementById('sync-status').textContent = '❌ Fout: ' + err.message;
  }
}

export async function syncDownload() {
  const url = getSyncUrl();
  if (!url) { document.getElementById('sync-status').textContent = 'Stel eerst een sync URL in.'; return; }
  if (!window.confirm('Dit overschrijft je lokale data met de cloud data. Doorgaan?')) return;
  document.getElementById('sync-status').textContent = 'Downloaden...';
  try {
    const response = await fetch(url + '?action=load');
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    if (data.TX && data.TX.length) { state.TX = data.TX; saveTxData(); }
    if (data.Covers && data.Covers.length) { state.COVERS = normaliseerVoorraad(data.Covers, state.COVERS); saveCoversData(); }
    if (data.HnviLots) { state.HNVI_LOTS = data.HnviLots; saveHnviData(); }
    if (data.MaandSaldos) { Object.assign(MAAND_SALDOS, data.MaandSaldos); }

    document.getElementById('sync-status').textContent = '✅ Gedownload! ' + new Date().toLocaleTimeString('nl-NL');
    renderHome();
  } catch (err) {
    document.getElementById('sync-status').textContent = '❌ Fout: ' + err.message;
  }
}

export function openApiKeyModal() {
  const current = localStorage.getItem('xtenate_apikey') || '';
  document.getElementById('apikey-input').value = current;
  document.getElementById('modal-apikey').classList.add('open');
}

export function saveApiKey() {
  const key = document.getElementById('apikey-input').value.trim();
  if (key) localStorage.setItem('xtenate_apikey', key);
  else localStorage.removeItem('xtenate_apikey');
  document.getElementById('modal-apikey').classList.remove('open');
}
