// hnvi.js — HNVI/Xtenate voorraadbeheer, inclusief AI-factuurimport.

import { ddmm, fmt } from './helpers.js';
import { openApiKeyModal } from './modals.js';
import { saveHnviData, state } from './storage.js';

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
  const avg = vktJaar.length ? Math.round(vktJaar.reduce((s,i)=>s+((Number(i.verkoop)||0)-(Number(i.inkoop)||0))/(Number(i.inkoop)||1)*100,0)/vktJaar.length) : 0;
  const periodeLabel = jaar ? jaar : 'alle jaren';
  document.getElementById('hnvi-metrics').innerHTML = `
    <div class="metric"><div class="lbl">In voorraad</div><div class="val">${vrd.length} loten</div></div>
    <div class="metric"><div class="lbl">Totaal inkoop</div><div class="val neg">${fmt(totInkoop)}</div><div class="sub">${periodeLabel}</div></div>
    <div class="metric"><div class="lbl">Totaal verkoop</div><div class="val pos">${fmt(totVerkoop)}</div><div class="sub">${vktJaar.length} loten · ${periodeLabel}</div></div>
    <div class="metric"><div class="lbl">Winst / verlies</div><div class="val ${winst>=0?'pos':'neg'}">${winst>=0?'+':''}${fmt(winst)}</div></div>
    <div class="metric"><div class="lbl">Gem. marge</div><div class="val ${avg>=0?'pos':'neg'}">${avg}%</div></div>`;

  // Reset checkboxes
  const deleteBtn = document.getElementById('hnvi-delete-btn');
  if (deleteBtn) deleteBtn.style.display = 'none';
  const checkAll = document.getElementById('hnvi-check-all');
  if (checkAll) { checkAll.checked = false; checkAll.indeterminate = false; }

  document.getElementById('hnvi-body').innerHTML = list.length ? list.map(i => {
    const w = i.verkoop!=null ? i.verkoop-i.inkoop : null;
    const pct = w!=null&&i.inkoop ? Math.round(w/i.inkoop*100) : null;
    return `<tr>
      <td style="padding-left:14px"><input type="checkbox" class="hnvi-check" data-key="${i._key||i.id}" onchange="updateHNVIDeleteBtn()"></td>
      <td style="color:var(--text-muted)">${ddmm(i.datum)}</td>
      <td class="td-trunc">${i.omschr}${i.noot?`<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${i.noot}</div>`:''}</td>
      <td style="text-align:right">${fmt(i.inkoop)}</td>
      <td style="text-align:right">${i.verkoop!=null&&i.verkoop>0?fmt(i.verkoop):'—'}</td>
      <td style="text-align:right">${w!=null&&i.verkoop>0?`<span class="${w>=0?'pos':'neg'}">${w>=0?'+':''}${fmt(w)}</span><div style="font-size:10px;color:var(--text-muted)">${pct}%</div>`:'—'}</td>
      <td><span class="${i.status==='verkocht'?'stock-ok':'stock-uit'}">${i.status}</span></td>
      <td style="white-space:nowrap">
        <span class="sell-link" onclick="openHNVISell(${i.id})">${i.status==='voorraad'?'Verkoop':'Wijzig'}</span>
        ${i.status==='verkocht'?`<span class="sell-link" style="color:var(--text-muted)" onclick="wisHNVIVerkoop(${i.id})">Wis</span>`:''}
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" style="padding:2rem;text-align:center;color:var(--text-muted)">Nog geen loten toegevoegd. Klik op "+ Lot toevoegen".</td></tr>';
}

export function berekenHNVIInkoop() {
  const bod = parseFloat(document.getElementById('hn-bod').value) || 0;
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
  const i = state.HNVI_LOTS.find(x=>x.id===id);
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

export function saveHNVI() {
  if (state.hnviSellId) {
    const vk = parseFloat(document.getElementById('hn-vk').value)||0;
    const noot = document.getElementById('hn-noot').value;
    const nieuweStatus = vk > 0 ? 'verkocht' : 'voorraad';
    const nieuweInkoop = parseFloat(document.getElementById('hn-ik').value)||0;
    state.HNVI_LOTS = state.HNVI_LOTS.map(i => i.id===state.hnviSellId ? {
      ...i,
      datum: document.getElementById('hn-d').value,
      omschr: document.getElementById('hn-o').value,
      inkoop: nieuweInkoop,
      verkoop: vk > 0 ? vk : null,
      status: nieuweStatus,
      noot
    } : i);
  } else {
    const newId = state.nxtHnvi++;
    state.hnviLaatsteDatum = document.getElementById('hn-d').value;
    state.HNVI_LOTS.push({id:newId, _key:String(newId), datum:state.hnviLaatsteDatum, omschr:document.getElementById('hn-o').value, inkoop:parseFloat(document.getElementById('hn-ik').value)||0, verkoop:null, status:'voorraad', noot:document.getElementById('hn-noot').value});
  }
  saveHnviData();
  closeHNVIModal();
  renderHNVI();
}

export function wisHNVIVerkoop(id) {
  if (!confirm('Verkoopbedrag verwijderen en lot terug op voorraad zetten?')) return;
  state.HNVI_LOTS = state.HNVI_LOTS.map(i => i.id===id ? {...i, verkoop:null, status:'voorraad'} : i);
  saveHnviData();
  renderHNVI();
}

export function verwijderHNVIItem(key) {
  if (!confirm('Dit lot verwijderen?')) return;
  state.HNVI_LOTS = state.HNVI_LOTS.filter(i => String(i._key||i.id) !== String(key));
  saveHnviData();
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

export function verwijderGeselecteerdeHNVI() {
  const checked = [...document.querySelectorAll('.hnvi-check:checked')];
  if (checked.length === 0) return;
  if (!confirm(`Weet je zeker dat je ${checked.length} item(s) wilt verwijderen?`)) return;
  const teVerwijderen = new Set(checked.map(c => c.dataset.key));
  state.HNVI_LOTS = state.HNVI_LOTS.filter(i => !teVerwijderen.has(String(i._key||i.id)));
  saveHnviData();
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
