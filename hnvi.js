// hnvi.js — HNVI/Xtenate voorraadbeheer, inclusief AI-factuurimport.

import { bedragUit, ddmm, esc, fmt, leegVlak } from './helpers.js?v=20260826c';
import { maakSorteerbaar } from './tables.js?v=20260826c';
import { openApiKeyModal, leesLotenBlad } from './modals.js?v=20260826c';
import { saveHnviData, state } from './storage.js?v=20260826c';
import { saveHnviToSupabase, deleteFromSupabase, addToPendingQueue } from './supabase-client-v2.js?v=20260826c';

export function renderHNVI() {
  const st = document.getElementById('f-hnvi-status').value;
  const jaar = document.getElementById('f-hnvi-jaar') ? document.getElementById('f-hnvi-jaar').value : '';
  const list = state.HNVI_LOTS.filter(i => {
    if (st && i.status !== st) return false;
    if (jaar && !i.datum.startsWith(jaar)) return false;
    return true;
  }).sort((a,b)=>b.datum.localeCompare(a.datum));

  const vrd = state.HNVI_LOTS.filter(i=>i.status==='voorraad');

  // Gefilterd op jaar voor inkoop/verkoop totalen
  const gefilterdOpJaar = jaar ? state.HNVI_LOTS.filter(i=>i.datum.startsWith(jaar)) : state.HNVI_LOTS;
  const totInkoop = gefilterdOpJaar.reduce((s,i)=>s+(Number(i.inkoop)||0),0);
  const vktJaar = gefilterdOpJaar.filter(i=>i.status==='verkocht');
  const totVerkoop = vktJaar.reduce((s,i)=>s+(Number(i.verkoop)||0),0);
  const winst = vktJaar.reduce((s,i)=>s+((Number(i.verkoop)||0)-(Number(i.inkoop)||0)),0);

  // Gemiddelde marge over alle verkochte loten (gefilterd)
  // Alleen loten met een echte inkoopprijs tellen mee; delen door nul (of door
  // een vervangende 1) leverde marges van duizenden procenten op.
  const metInkoop = vktJaar.filter(i => Number(i.inkoop) > 0);
  const avg = metInkoop.length
    ? Math.round(metInkoop.reduce((s,i)=>s+((Number(i.verkoop)||0)-Number(i.inkoop))/Number(i.inkoop)*100,0)/metInkoop.length)
    : null;
  const periodeLabel = jaar ? jaar : 'alle jaren';
  document.getElementById('hnvi-metrics').innerHTML = `
    <div class="metric"><div class="lbl">In voorraad</div><div class="val">${vrd.length} loten</div></div>
    <div class="metric"><div class="lbl">Totaal inkoop</div><div class="val neg">${fmt(totInkoop)}</div><div class="sub">${periodeLabel}</div></div>
    <div class="metric"><div class="lbl">Totaal verkoop</div><div class="val pos">${fmt(totVerkoop)}</div><div class="sub">${vktJaar.length} loten · ${periodeLabel}</div></div>
    <div class="metric"><div class="lbl">Winst / verlies</div><div class="val ${winst>=0?'pos':'neg'}">${winst>=0?'+':''}${fmt(winst)}</div></div>
    <div class="metric"><div class="lbl">Gem. marge</div><div class="val ${avg==null?'muted':avg>=0?'pos':'neg'}">${avg==null?'—':avg+'%'}</div><div class="sub">${metInkoop.length} loten met inkoopprijs</div></div>`;

  // Reset checkboxes
  const deleteBtn = document.getElementById('hnvi-delete-btn');
  if (deleteBtn) deleteBtn.style.display = 'none';
  const checkAll = document.getElementById('hnvi-check-all');
  if (checkAll) { checkAll.checked = false; checkAll.indeterminate = false; }

  document.getElementById('hnvi-body').innerHTML = list.length ? list.map(i => {
    const w = i.verkoop!=null ? i.verkoop-i.inkoop : null;
    const pct = w!=null&&i.inkoop ? Math.round(w/i.inkoop*100) : null;
    return `<tr>
      <td class="cel-kies" style="padding-left:16px"><input type="checkbox" class="hnvi-check" data-key="${esc(i._key||i.id)}" onchange="updateHNVIDeleteBtn()"></td>
      <td class="muted cel-datum" data-v="${esc(i.datum)}">${ddmm(i.datum)}</td>
      <td class="td-trunc cel-naam">${esc(i.omschr)}${i.noot?`<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${esc(i.noot)}</div>`:''}</td>
      <td data-label="Inkoop" style="text-align:right" data-v="${Number(i.inkoop)||0}">${fmt(i.inkoop)}</td>
      <td data-label="Verkoop" style="text-align:right" data-v="${Number(i.verkoop)||0}">${i.verkoop!=null&&i.verkoop>0?fmt(i.verkoop):'—'}</td>
      <td data-label="Winst" style="text-align:right" data-v="${w||0}">${w!=null&&i.verkoop>0?`<span class="${w>=0?'pos':'neg'}">${w>=0?'+':''}${fmt(w)}</span><div style="font-size:10px;color:var(--text-muted)">${pct}%</div>`:'—'}</td>
      <td class="cel-status" data-v="${esc(i.status)}">${i.status==='verkocht'?'<span class="badge badge-green">verkocht</span>':'<span class="badge badge-blue">op voorraad</span>'}</td>
      <td class="cel-acties" style="white-space:nowrap">
        <span class="rij-acties">
        <span class="sell-link" onclick="openHNVISell('${esc(i.id)}')">${i.status==='voorraad'?'Verkoop':'Wijzig'}</span>
        ${i.status==='verkocht'?`<span class="sell-link" style="color:var(--text-muted)" onclick="wisHNVIVerkoop('${esc(i.id)}')">Wis</span>`:''}
        <span class="sell-link" style="color:var(--red)" onclick="verwijderHNVIItem('${esc(i._key||i.id)}')">Verwijder</span>
        </span>
      </td>
    </tr>`;
  }).join('') : `<tr data-geen-sort="1"><td colspan="8">${leegVlak(
      state.HNVI_LOTS.length ? 'Geen loten binnen deze filters' : 'Nog geen loten toegevoegd',
      state.HNVI_LOTS.length ? 'Kies een ander jaar of een andere status.' : 'Voeg een lot toe of lees een HNVI-factuur in.',
      '<button class="btn" onclick="openHNVIModal()">Lot toevoegen</button>')}</td></tr>`;

  maakSorteerbaar(document.getElementById('tbl-hnvi'));
}

export function berekenHNVIInkoop() {
  const bod = bedragUit('hn-bod');
  if (bod > 0) {
    const inkoop = Math.round(bod * 1.17 * 1.21 * 100) / 100;
    document.getElementById('hn-ik').value = inkoop.toFixed(2);
  } else {
    document.getElementById('hn-ik').value = '';
  }
}

export function openHNVIModal() {
  state.hnviSellId = null;
  document.getElementById('hnvi-modal-title').textContent = 'Lot toevoegen';
  document.getElementById('hn-save-btn').textContent = 'Opslaan';
  document.getElementById('hn-d').value = state.hnviLaatsteDatum;
  document.getElementById('hn-bod').value = '';
  document.getElementById('hn-ik').value = '';
  document.getElementById('hn-o').value = '';
  document.getElementById('hn-noot').value = '';
  document.getElementById('hn-vk').value = '';
  document.getElementById('hn-vk-wrap').style.display = 'none';
  document.getElementById('modal-hnvi').classList.add('open');
}

export function openHNVISell(id) {
  state.hnviSellId = id;
  const i = state.HNVI_LOTS.find(x=>String(x.id)===String(id));
  document.getElementById('hnvi-modal-title').textContent = i.status==='verkocht' ? 'Verkoop wijzigen' : 'Verkoop registreren';
  document.getElementById('hn-save-btn').textContent = 'Opslaan';
  document.getElementById('hn-d').value = i.datum;
  document.getElementById('hn-bod').value = '';
  document.getElementById('hn-ik').value = i.inkoop;
  document.getElementById('hn-o').value = i.omschr;
  document.getElementById('hn-noot').value = i.noot || '';
  document.getElementById('hn-vk').value = i.verkoop || '';
  document.getElementById('hn-vk-wrap').style.display = '';
  document.getElementById('modal-hnvi').classList.add('open');
}

export function closeHNVIModal() { document.getElementById('modal-hnvi').classList.remove('open'); }

export async function saveHNVI() {
  let gewijzigdLot = null;
  
  if (state.hnviSellId) {
    const vk = bedragUit('hn-vk');
    const noot = document.getElementById('hn-noot').value;
    const nieuweStatus = vk > 0 ? 'verkocht' : 'voorraad';
    const nieuweInkoop = bedragUit('hn-ik');
    gewijzigdLot = {
      id: state.hnviSellId,
      datum: document.getElementById('hn-d').value,
      omschr: document.getElementById('hn-o').value,
      inkoop: nieuweInkoop,
      verkoop: vk > 0 ? vk : null,
      status: nieuweStatus,
      noot
    };
    state.HNVI_LOTS = state.HNVI_LOTS.map(i => String(i.id)===String(state.hnviSellId) ? gewijzigdLot : i);
  } else {
    const newId = state.nxtHnvi++;
    state.hnviLaatsteDatum = document.getElementById('hn-d').value;
    gewijzigdLot = {
      id: newId,
      _key: String(newId),
      datum: state.hnviLaatsteDatum,
      omschr: document.getElementById('hn-o').value,
      inkoop: bedragUit('hn-ik'),
      verkoop: null,
      status: 'voorraad',
      noot: document.getElementById('hn-noot').value
    };
    state.HNVI_LOTS.push(gewijzigdLot);
  }
  
  saveHnviData();
  
  // Naar Supabase sturen (of wachtrij als offline)
  try {
    const ok = await saveHnviToSupabase(gewijzigdLot);
    if (!ok) addToPendingQueue(gewijzigdLot, 'hnvi', false);
  } catch (err) {
    console.warn('Supabase niet bereikbaar, in wachtrij gezet:', err);
    addToPendingQueue(gewijzigdLot, 'hnvi', false);
  }
  
  closeHNVIModal();
  renderHNVI();
}

export async function wisHNVIVerkoop(id) {
  if (!window.confirm('Verkoopbedrag verwijderen en lot terug op voorraad zetten?')) return;
  const gewijzigd = state.HNVI_LOTS.find(i => String(i.id)===String(id));
  if (!gewijzigd) return;
  
  const bijgewerkt = {...gewijzigd, verkoop:null, status:'voorraad'};
  state.HNVI_LOTS = state.HNVI_LOTS.map(i => String(i.id)===String(id) ? bijgewerkt : i);
  saveHnviData();
  
  try {
    const ok = await saveHnviToSupabase(bijgewerkt);
    if (!ok) addToPendingQueue(bijgewerkt, 'hnvi', false);
  } catch (err) {
    console.warn('Supabase niet bereikbaar, in wachtrij gezet:', err);
    addToPendingQueue(bijgewerkt, 'hnvi', false);
  }
  
  renderHNVI();
}

export async function verwijderHNVIItem(key) {
  console.log(`🗑️  verwijderHNVIItem called: key=${key}`);
  
  if (!window.confirm('Dit lot verwijderen?')) {
    console.log('Verwijdering geannuleerd');
    return;
  }
  
  const teVerwijderen = state.HNVI_LOTS.find(i => String(i._key||i.id) === String(key));
  console.log(`Found lot to delete:`, teVerwijderen);
  
  if (!teVerwijderen) {
    console.warn('Lot niet gevonden!');
    return;
  }
  
  state.HNVI_LOTS = state.HNVI_LOTS.filter(i => String(i._key||i.id) !== String(key));
  saveHnviData();
  console.log(`Removed from state, calling deleteFromSupabase...`);
  
  try {
    const ok = await deleteFromSupabase(teVerwijderen.id, 'hnvi');
    console.log(`deleteFromSupabase returned:`, ok);
    if (!ok) {
      console.log(`Delete failed, adding to pending queue`);
      addToPendingQueue(teVerwijderen, 'delete', false);
    }
  } catch (err) {
    console.error('Exception in verwijderHNVIItem:', err);
    addToPendingQueue(teVerwijderen, 'delete', false);
  }
  
  renderHNVI();
}

export function toggleAllHNVI(cb) {
  document.querySelectorAll('.hnvi-check').forEach(c => c.checked = cb.checked);
  updateHNVIDeleteBtn();
}

export function updateHNVIDeleteBtn() {
  const aantal = document.querySelectorAll('.hnvi-check:checked').length;
  const btn = document.getElementById('hnvi-delete-btn');
  if (btn) {
    btn.style.display = aantal > 0 ? '' : 'none';
    btn.textContent = `🗑 Verwijder (${aantal})`;
  }
  const allCb = document.getElementById('hnvi-check-all');
  if (allCb) {
    const all = document.querySelectorAll('.hnvi-check');
    allCb.indeterminate = aantal > 0 && aantal < all.length;
    allCb.checked = aantal === all.length && all.length > 0;
  }
}

export async function verwijderGeselecteerdeHNVI() {
  console.log('🗑️  verwijderGeselecteerdeHNVI called');
  
  const checked = [...document.querySelectorAll('.hnvi-check:checked')];
  if (checked.length === 0) {
    console.log('Geen items geselecteerd');
    return;
  }
  
  if (!window.confirm(`Weet je zeker dat je ${checked.length} item(s) wilt verwijderen?`)) {
    console.log('Verwijdering geannuleerd');
    return;
  }
  
  const teVerwijderen = new Set(checked.map(c => c.dataset.key));
  const lotsToDel = state.HNVI_LOTS.filter(i => teVerwijderen.has(String(i._key||i.id)));
  
  console.log(`Verwijdert ${lotsToDel.length} loten:`, lotsToDel.map(l => l.id));
  
  // Verwijder uit state
  state.HNVI_LOTS = state.HNVI_LOTS.filter(i => !teVerwijderen.has(String(i._key||i.id)));
  saveHnviData();
  
  // Stuur ELKE deletion naar Supabase
  for (const lot of lotsToDel) {
    try {
      console.log(`Deleting lot ${lot.id} from Supabase...`);
      const ok = await deleteFromSupabase(lot.id, 'hnvi');
      if (!ok) {
        console.warn(`Delete van lot ${lot.id} faalde, in wachtrij`);
        addToPendingQueue(lot, 'delete', false);
      }
    } catch (err) {
      console.error(`Exception deleting lot ${lot.id}:`, err);
      addToPendingQueue(lot, 'delete', false);
    }
  }
  
  renderHNVI();
}

export async function importHNVIFactuur(input) {
  const files = [...input.files];
  if (!files.length) return;
  input.value = '';

  state.hnviImportItems = [];
  document.getElementById('hnvi-factuur-status').textContent = `0 / ${files.length} facturen uitgelezen...`;
  document.getElementById('hnvi-factuur-preview').innerHTML = '';
  document.getElementById('hnvi-factuur-btn').style.display = 'none';
  document.getElementById('modal-hnvi-factuur').classList.add('open');

  const prompt = `Dit is een HNVI veilingfactuur. Lees alle gekochte items uit en bereken de inkoopprijs per item inclusief veilinggeld en BTW naar rato.

Bereken zo:
- Totaal biedingen = som van alle biedprijzen
- Extra kosten = veilinggeld + BTW over veilinggeld + BTW over biedingen (alles wat bovenop de biedingen komt)
- Per item: inkoopprijs incl = biedprijs + (biedprijs / totaal biedingen) * extra kosten
- Rond af op 2 decimalen

Geef een JSON array terug, ALLEEN JSON, geen uitleg:
[{"omschrijving":"C087 MacBook Air 15 inch M3","datum":"2026-05-27","inkoop":672.46},...]

Factuurnummer en datum staan bovenaan. Gebruik de factuurdatum als datum (formaat YYYY-MM-DD).
Als er meerdere identieke items zijn (bijv 4x iPhone SE) maak dan voor elk een aparte regel.`;

  const fmt2 = n => '€ ' + Number(n).toLocaleString('nl-NL', {minimumFractionDigits:2, maximumFractionDigits:2});

  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    document.getElementById('hnvi-factuur-status').textContent = `${f + 1} / ${files.length} — ${file.name} uitgelezen...`;
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      const apiKey = localStorage.getItem('xtenate_apikey');
      if (!apiKey) {
        document.getElementById('hnvi-factuur-status').textContent = 'Geen API sleutel ingesteld. Klik op "API sleutel" in het menu.';
        openApiKeyModal();
        return;
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{role:'user', content:[
            {type:'document', source:{type:'base64', media_type:'application/pdf', data:base64}},
            {type:'text', text:prompt}
          ]}]
        })
      });

      const data = await response.json();
      const text = data.content.map(c => c.text || '').join('');
      const clean = text.replace(/```json|```/g, '').trim();
      const items = JSON.parse(clean);
      state.hnviImportItems.push(...items);

    } catch(err) {
      document.getElementById('hnvi-factuur-status').textContent = `Fout bij ${file.name}: ${err.message}`;
    }
  }

  // Sorteer op datum
  state.hnviImportItems.sort((a,b) => a.datum.localeCompare(b.datum));

  document.getElementById('hnvi-factuur-status').textContent = `${state.hnviImportItems.length} items gevonden uit ${files.length} facturen — controleer en importeer:`;
  document.getElementById('hnvi-factuur-preview').innerHTML = `
    <table style="width:100%;font-size:12.5px;border-collapse:collapse">
      <thead><tr>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-muted);font-weight:500">Omschrijving</th>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-muted);font-weight:500">Datum</th>
        <th style="text-align:right;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-muted);font-weight:500">Inkoop incl.</th>
      </tr></thead>
      <tbody>${state.hnviImportItems.map(i => `<tr>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border)">${i.omschrijving}</td>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);color:var(--text-muted)">${i.datum.slice(8,10)}-${i.datum.slice(5,7)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:right;font-weight:500">${fmt2(i.inkoop)}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr>
        <td colspan="2" style="padding:8px 8px 0;font-weight:600">Totaal ${files.length} facturen</td>
        <td style="padding:8px 8px 0;text-align:right;font-weight:600">${fmt2(state.hnviImportItems.reduce((s,i)=>s+(Number(i.inkoop)||0),0))}</td>
      </tr></tfoot>
    </table>`;
  document.getElementById('hnvi-factuur-btn').style.display = '';
}

export function bevestigHNVIImport() {
  state.hnviImportItems.forEach(item => {
    const impId = state.nxtHnvi++;
    state.HNVI_LOTS.push({
      id: impId,
      _key: String(impId),
      datum: item.datum,
      omschr: item.omschrijving,
      inkoop: item.inkoop,
      verkoop: null,
      status: 'voorraad'
    });
  });
  saveHnviData();
  document.getElementById('modal-hnvi-factuur').classList.remove('open');
  renderHNVI();
  state.hnviImportItems = [];
}

// ---------------------------------------------------------------------------
// Loten inlezen uit Excel
//
// Dit staat los van de grote import onder Beheer. Die leest een hele
// administratie en vervangt daarbij de boekingen van een jaar; wie alleen
// loten wil bijwerken, moest dus veel meer overhoop halen dan nodig. Hier
// wordt uitsluitend het lotenblad gelezen, en je kiest zelf of de bestaande
// loten blijven staan.
// ---------------------------------------------------------------------------

let wachtendeLoten = null;

export function openImportModalHnvi() {
  wachtendeLoten = null;
  const status = document.getElementById('hnvi-import-status');
  if (status) status.innerHTML = '';
  const acties = document.getElementById('hnvi-import-acties');
  if (acties) acties.style.display = 'none';
  document.getElementById('modal-import-hnvi').classList.add('open');
}

export function sluitImportModalHnvi() {
  wachtendeLoten = null;
  document.getElementById('modal-import-hnvi').classList.remove('open');
}

export async function handleImportHnvi(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  const status = document.getElementById('hnvi-import-status');
  const acties = document.getElementById('hnvi-import-acties');
  status.innerHTML = 'Bestand lezen...';
  acties.style.display = 'none';

  try {
    const data = await file.arrayBuffer();
    const wb = window.XLSX.read(data, { type: 'array', cellDates: true });

    // Het jaar van het bestand, voor loten zonder eigen datum.
    const jaren = [...new Set(
      wb.SheetNames.filter(n => /^Bank \d{4}-\d{2}$/.test(n)).map(n => n.slice(5, 9))
    )].sort();

    const uitkomst = leesLotenBlad(wb, jaren);

    if (!uitkomst || !uitkomst.loten.length) {
      status.innerHTML = `<div class="alert alert-warn">Geen loten gevonden in <strong>${esc(file.name)}</strong>.
        Er is gezocht naar een blad met de naam "HNVI Loten" of "Veiling inkopenVerkopen",
        met daarin kolommen voor product en inkoop.</div>`;
      return;
    }

    wachtendeLoten = uitkomst.loten;

    const verkocht = uitkomst.loten.filter(l => l.status === 'verkocht').length;
    const opVoorraad = uitkomst.loten.length - verkocht;
    const totInkoop = uitkomst.loten.reduce((s, l) => s + (Number(l.inkoop) || 0), 0);

    const voorbeeld = uitkomst.loten.slice(0, 5).map(l => `
      <tr>
        <td class="muted">${ddmm(l.datum)}</td>
        <td>${esc(l.omschr)}</td>
        <td style="text-align:right">${fmt(l.inkoop)}</td>
        <td style="text-align:right">${l.verkoop != null ? fmt(l.verkoop) : '—'}</td>
      </tr>`).join('');

    status.innerHTML = `
      <div class="alert alert-info">
        <strong>${uitkomst.loten.length}</strong> loten gevonden op blad
        "<strong>${esc(uitkomst.bladNaam)}</strong>"·
        ${verkocht} verkocht, ${opVoorraad} op voorraad · samen ${fmt(totInkoop)} inkoop
      </div>
      ${uitkomst.zonderDatum > 0 ? `<div class="alert alert-warn">
        ${uitkomst.zonderDatum} ${uitkomst.zonderDatum === 1 ? 'lot heeft' : 'loten hebben'} geen datum in het bestand.
        ${uitkomst.zonderDatum === 1 ? 'Dat lot krijgt' : 'Die krijgen'} 1 januari ${(jaren[jaren.length - 1] || '')} als datum,
        anders ${uitkomst.zonderDatum === 1 ? 'valt het' : 'vallen ze'} buiten het jaarfilter en zie je ${uitkomst.zonderDatum === 1 ? 'het' : 'ze'} niet staan.
      </div>` : ''}
      <table class="tbl" style="margin-top:10px">
        <thead><tr><th>Datum</th><th>Omschrijving</th><th style="text-align:right">Inkoop</th><th style="text-align:right">Verkoop</th></tr></thead>
        <tbody>${voorbeeld}</tbody>
      </table>
      ${uitkomst.loten.length > 5 ? `<div class="muted" style="font-size:11.5px;margin-top:6px">en nog ${uitkomst.loten.length - 5} andere</div>` : ''}
    `;
    acties.style.display = 'inline-flex';
  } catch (err) {
    status.innerHTML = `<div class="alert alert-error">Het bestand kon niet worden gelezen: ${esc(err.message)}</div>`;
  }
}

/**
 * Past de gelezen loten toe.
 *
 * Bij 'toevoegen' blijven de bestaande loten staan en komen alleen de regels
 * erbij die er nog niet zijn. Gelijk beschouwd worden loten met dezelfde
 * omschrijving, datum en inkoopprijs; dat voorkomt dubbelingen als je hetzelfde
 * bestand twee keer inleest, terwijl twee echt verschillende loten met dezelfde
 * naam (vier keer dezelfde telefoon voor een andere prijs) apart blijven staan.
 */
export function bevestigImportHnvi(modus) {
  if (!wachtendeLoten) return;

  const sleutel = l => `${l.omschr.trim().toLowerCase()}|${l.datum}|${Number(l.inkoop).toFixed(2)}`;
  const bestaand = state.HNVI_LOTS || [];
  let resultaat, toegevoegd, overgeslagen = 0;

  if (modus === 'vervangen') {
    resultaat = wachtendeLoten.slice();
    toegevoegd = resultaat.length;
  } else {
    const gezien = new Set(bestaand.map(sleutel));
    const nieuw = [];
    for (const lot of wachtendeLoten) {
      const s = sleutel(lot);
      if (gezien.has(s)) { overgeslagen++; continue; }
      gezien.add(s);
      nieuw.push(lot);
    }
    resultaat = [...bestaand, ...nieuw];
    toegevoegd = nieuw.length;
  }

  // Nummers opnieuw uitdelen, zodat elk lot er precies één heeft.
  let nr = 1;
  state.HNVI_LOTS = resultaat.map(lot => {
    const id = lot.id && modus !== 'vervangen' ? lot.id : 'x' + nr;
    nr++;
    return { ...lot, id, _key: String(id) };
  });
  state.nxtHnvi = nr;
  saveHnviData();

  wachtendeLoten = null;
  document.getElementById('hnvi-import-acties').style.display = 'none';
  document.getElementById('hnvi-import-status').innerHTML =
    `<div class="alert alert-info"><strong>${toegevoegd}</strong> loten ${modus === 'vervangen' ? 'ingelezen' : 'toegevoegd'}.` +
    (overgeslagen > 0 ? ` ${overgeslagen} stonden er al in en zijn overgeslagen.` : '') +
    ` De lijst is bijgewerkt.</div>`;

  renderHNVI();
}
