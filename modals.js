// modals.js — beheer-acties: Excel-import, cloud sync, API-sleutel, data wissen.

import { renderHome } from './dashboard.js';
import { HIST_TX_DEFAULT, HOME_TOTALS, HOME_TOTALS_DEFAULT, MAAND_SALDOS, save, saveCoversData, saveHnviData, saveTxData, state } from './storage.js';

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

      function excelDate(val) {
        if (!val) return null;
        if (val instanceof Date) return val.toISOString().split('T')[0];
        if (typeof val === 'number') {
          const d = new Date(Math.round((val - 25569) * 86400 * 1000));
          return d.toISOString().split('T')[0];
        }
        if (typeof val === 'string' && val.match(/\d{4}-\d{2}-\d{2}/)) return val.slice(0,10);
        if (typeof val === 'string' && val.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
          const [m,d,y] = val.split('/');
          return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
        return null;
      }

      const OMZET_GB = ['8000','8010','8020'];
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
            if (!datum || bedrag === null || bedrag === undefined || gb === null || String(gb) === 'Onbekend') return;
            if (typeof bedrag !== 'number') return;
            const gbStr = String(Math.round(parseFloat(gb)));
            if (gbStr === 'NaN') return;
            const isPrive = ['600','601'].includes(gbStr);
            const isInk = OMZET_GB.includes(gbStr);
            let type;
            if (isPrive) type = bedrag > 0 ? 'prive_storting' : 'prive_opname';
            else if (isInk && bedrag > 0) type = 'inkomst';
            else if (bedrag > 0 && !isPrive) type = 'inkomst';
            else type = 'uitgave';
            newTx.push({id:tid++, datum, gb:gbStr, bedrag:Math.abs(bedrag),
              naam: naam ? String(naam) : '', omschr:'', rek:'1010', type});
            bankCount++;
          });
        });
      });

      // Creditkaart Prive
      let ccCount = 0;
      const ccSheetName = wb.SheetNames.find(n => n.toLowerCase().replace(/[^a-z]/g, '').includes('creditkaartprive'));
      if (ccSheetName) {
        const ws = wb.Sheets[ccSheetName];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
        rows.slice(2).forEach(row => {
          const datum = excelDate(row[7]);
          const gb = row[8];
          const bedrag = row[9];
          const omschr = row[10];
          if (!datum) return;
          if (typeof bedrag !== 'number') return;
          const gbStr = gb ? String(Math.round(parseFloat(gb))) : '7010';
          const isPrive = ['600','601'].includes(gbStr);
          const ccType = isPrive ? (bedrag > 0 ? 'prive_storting' : 'prive_opname') : 'uitgave';
          newTx.push({id:tid++, datum, gb:gbStr, bedrag:Math.abs(bedrag),
            naam: omschr ? String(omschr) : 'Creditkaart Privé', omschr: omschr ? String(omschr) : '', rek:'1030', type:ccType});
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
          if (String(artikel).startsWith('TOTAAL')) return;
          const inkoop = row[7] || 0;
          const verkoop = row[8] || 0;
          const omzet2026 = row[15] || 0;
          newCovers.push({id:cid++, artikel:String(artikel),
            voorraad: typeof voorraad === 'number' ? Math.round(voorraad) : 0,
            inkoop: typeof inkoop === 'number' ? Math.round(inkoop) : 0,
            verkoop: typeof verkoop === 'number' ? Math.round(verkoop) : 0,
            omzet2026: typeof omzet2026 === 'number' ? Math.round(omzet2026) : 0});
          coverCount++;
        });
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

      const is2026 = gevondenJaren.includes('2026');
      const jaarLabel = gevondenJaren.join(', ') || 'onbekend jaar';

      if (is2026) {
        // Sla op als huidige (2026) data
        state.TX = newTx;
        state.nxtTx = tid;
        if (newCovers.length > 0) { state.COVERS = newCovers; state.nxtCover = 300; }
        Object.keys(MAAND_SALDOS).filter(m=>m.startsWith('2026')).forEach(m=>delete MAAND_SALDOS[m]);
        Object.assign(MAAND_SALDOS, newSaldos);
        saveTxData();
        saveCoversData();
      } else {
        // Sla op als historische data: vervang alleen de jaren die in dit bestand voorkomen
        state.HIST_TX = state.HIST_TX.filter(t => !gevondenJaren.some(j => t.datum.startsWith(j)));
        state.HIST_TX = [...state.HIST_TX, ...newTx.map(t => ({...t, id: 'h' + jaarLabel.replace(/, /g,'_') + '_' + t.id}))];
        gevondenJaren.forEach(j => {
          Object.keys(MAAND_SALDOS).filter(m=>m.startsWith(j)).forEach(m=>delete MAAND_SALDOS[m]);
        });
        Object.assign(MAAND_SALDOS, newSaldos);
        save('xtenate_hist_tx_override', state.HIST_TX);
        save('xtenate_maand_saldos_override', MAAND_SALDOS);
      }

      // Jaartotalen uit "Per Periode" (indien aanwezig) — leidend voor de Home-cijfers.
      // Terugval per rekening: optellen uit de zojuist ingelezen losse boekingen (newTx),
      // voor het geval een deel van het "Per Periode"-tabblad #N/A-fouten bevat.
      const fallbackTotals = {
        omzXt: newTx.filter(t => t.type==='inkomst' && t.gb==='8000').reduce((s,t)=>s+t.bedrag,0),
        omzBol: newTx.filter(t => t.type==='inkomst' && t.gb==='8010').reduce((s,t)=>s+t.bedrag,0),
        omzHC: newTx.filter(t => t.type==='inkomst' && t.gb==='8020').reduce((s,t)=>s+t.bedrag,0),
        omzet: newTx.filter(t => t.type==='inkomst' && OMZET_GB.includes(t.gb)).reduce((s,t)=>s+t.bedrag,0),
        kosten: newTx.filter(t => t.type==='uitgave').reduce((s,t)=>s+t.bedrag,0),
        priveOp: newTx.filter(t => t.type==='prive_opname').reduce((s,t)=>s+t.bedrag,0),
        priveSt: newTx.filter(t => t.type==='prive_storting').reduce((s,t)=>s+t.bedrag,0),
        hnviInv: newTx.filter(t => t.gb==='7010').reduce((s,t)=>s+t.bedrag,0)
      };
      const perPeriodeTotals = parsePerPeriode(wb, fallbackTotals);
      if (perPeriodeTotals) {
        gevondenJaren.forEach(j => { HOME_TOTALS[j] = perPeriodeTotals; });
        save('xtenate_home_totals_override', HOME_TOTALS);
      }

      const saldoCount = Object.keys(newSaldos).length;
      document.getElementById('import-title').textContent = 'Import geslaagd!';
      document.getElementById('import-body').innerHTML =
        `📅 Jaar: <strong>${jaarLabel}</strong><br>` +
        `✅ <strong>${bankCount}</strong> banktransacties ingelezen<br>` +
        `✅ <strong>${ccCount}</strong> creditkaart boekingen ingelezen<br>` +
        (saldoCount > 0 ? `✅ <strong>${saldoCount}</strong> maandsaldos ingelezen<br>` : '') +
        (newCovers.length > 0 ? `✅ <strong>${coverCount}</strong> covers artikelen ingelezen<br>` : '') +
        (perPeriodeTotals ? `✅ Jaartotalen (omzet/kosten/privé) ingelezen uit "Per Periode" — dit is nu leidend voor de Home-cijfers van dit jaar<br>` : `⚠️ Geen "Per Periode" tabblad gevonden — Home-cijfers worden voor dit jaar nog berekend uit losse boekingen<br>`) +
        `<br>Je data is opgeslagen. HNVI-loten blijven bewaard.`;
      document.getElementById('import-actions').style.display = 'flex';

      renderHome();
    } catch(err) {
      document.getElementById('import-title').textContent = 'Fout bij importeren';
      document.getElementById('import-body').innerHTML = 'Er ging iets mis: ' + err.message + '<br><br>Controleer of je het juiste Excel bestand hebt geselecteerd.';
      document.getElementById('import-actions').style.display = 'flex';
    }
  };
  reader.readAsArrayBuffer(file);
}

export function herstelHistorischeData() {
  if (!confirm('Dit herstelt de historische jaren (2022 t/m 2025) naar de standaard/gecorrigeerde data uit de app zelf, en overschrijft eventuele lokale wijzigingen in je browser voor die jaren. 2026 blijft ongewijzigd. Doorgaan?')) {
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
    alert('Klaar! Historische data (2022-2025) én de jaartotalen zijn hersteld naar de standaardwaarden uit de app.');
  } catch (err) {
    alert('Er ging iets mis: ' + err.message);
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

    if (!confirm('Weet je zeker dat je data van ' + jaren.join(', ') + ' wilt wissen? Dit kan niet ongedaan gemaakt worden.')) {
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
    alert('Klaar! ' + wisLog.join(' / ') + '. Je kunt nu opnieuw importeren.');
  } catch (err) {
    document.getElementById('wis-status').textContent = 'Fout: ' + err.message;
    alert('Er ging iets mis: ' + err.message);
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
  if (!confirm('Dit overschrijft je lokale data met de cloud data. Doorgaan?')) return;
  document.getElementById('sync-status').textContent = 'Downloaden...';
  try {
    const response = await fetch(url + '?action=load');
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    if (data.TX && data.TX.length) { state.TX = data.TX; saveTxData(); }
    if (data.Covers && data.Covers.length) { state.COVERS = data.Covers; saveCoversData(); }
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
