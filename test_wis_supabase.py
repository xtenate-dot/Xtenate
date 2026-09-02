from playwright.sync_api import sync_playwright
import json

FOUT = []
def check(cond, naam, detail=''):
    print(('  ok   ' if cond else '  FOUT ') + naam + (f'  {detail}' if detail and not cond else ''))
    if not cond: FOUT.append(naam)

def zet_data(pg, boekingen, voorraad):
    pg.evaluate("""(d) => {
      window.__wisData = { boekingen: d.boekingen, voorraadartikelen: d.voorraad };
      window.__wisAanroepen = [];
      window.__wisFout = null;
      window.__geenSessie = false;
    }""", {'boekingen': boekingen, 'voorraad': voorraad})

def basis_boekingen():
    # user-A: 2026 (archief_jaar null), 2025, 2024. user-B: 2026 en 2025, om te
    # controleren dat de query nooit een andere gebruiker raakt.
    rijen = []
    i = 1
    for jaar, azn in [(None, 3), (2025, 2), (2024, 2)]:
        for _ in range(azn):
            rijen.append({'id': i, 'user_id': 'user-A', 'archief_jaar': jaar}); i += 1
    for jaar, azn in [(None, 2), (2025, 2)]:
        for _ in range(azn):
            rijen.append({'id': i, 'user_id': 'user-B', 'archief_jaar': jaar}); i += 1
    return rijen

def basis_voorraad():
    return ([{'id': i, 'user_id': 'user-A'} for i in range(1, 5)] +
            [{'id': i, 'user_id': 'user-B'} for i in range(101, 104)])

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto('http://127.0.0.1:8899/_test-wis.html', wait_until='load')
    pg.wait_for_function('window.__testenGereed === true')
    pg.evaluate("() => window.__getClient()")  # client-cache vullen, zoals na inloggen

    # ── Scenario 1: cloudfout vóór verwijderen van boekingen ──────────────
    print('\n=== 1. Cloudfout vóór boekingen ===')
    zet_data(pg, basis_boekingen(), basis_voorraad())
    pg.evaluate("() => { window.__wisFout = { tabel: 'boekingen', bericht: 'netwerk weg' }; }")
    r = pg.evaluate("(j) => window.__wisJarenInSupabase(j)", ['2026'])
    check(r['ok'] is False, 'resultaat ok=false')
    check(r['stap'] == 'boekingen', 'stap = boekingen', r['stap'])
    check(r['boekingenVerwijderd'] == 0, 'boekingenVerwijderd = 0', r['boekingenVerwijderd'])
    d = pg.evaluate("() => window.__wisData")
    check(len(d['boekingen']) == len(basis_boekingen()), 'boekingen-tabel volledig ongewijzigd')
    check(len(d['voorraadartikelen']) == len(basis_voorraad()), 'voorraad-tabel ongewijzigd (stap niet bereikt)')

    # ── Scenario 2: fout tijdens verwijderen van voorraadartikelen ────────
    print('\n=== 2. Fout tijdens voorraad, ná geslaagde boekingen ===')
    zet_data(pg, basis_boekingen(), basis_voorraad())
    pg.evaluate("() => { window.__wisFout = { tabel: 'voorraadartikelen', bericht: 'uniek-constraint' }; }")
    r = pg.evaluate("(j) => window.__wisJarenInSupabase(j)", ['2026'])
    check(r['ok'] is False, 'resultaat ok=false')
    check(r['stap'] == 'voorraad', 'stap = voorraad', r['stap'])
    check(r['boekingenVerwijderd'] == 3, 'boekingenVerwijderd = 3 (die van user-A, archief_jaar null)', r['boekingenVerwijderd'])
    d = pg.evaluate("() => window.__wisData")
    check(len([x for x in d['boekingen'] if x['user_id']=='user-A' and x['archief_jaar'] is None]) == 0,
          'boekingen 2026 van user-A wél weg (stap 1 was al gelukt)')
    check(len(d['voorraadartikelen']) == len(basis_voorraad()), 'voorraadartikelen NIET weg (stap 2 mislukte)')

    # ── Scenario 3: volledige succesvolle verwijdering ─────────────────────
    print('\n=== 3. Volledig succesvol, 2026 ===')
    zet_data(pg, basis_boekingen(), basis_voorraad())
    r = pg.evaluate("(j) => window.__wisJarenInSupabase(j)", ['2026'])
    check(r['ok'] is True, 'resultaat ok=true')
    check(r['boekingenVerwijderd'] == 3, 'boekingenVerwijderd = 3', r['boekingenVerwijderd'])
    check(r['voorraadVerwijderd'] == 4, 'voorraadVerwijderd = 4 (alle user-A artikelen)', r['voorraadVerwijderd'])
    d = pg.evaluate("() => window.__wisData")
    check(all(x['user_id'] != 'user-A' for x in d['voorraadartikelen']), 'geen enkel user-A-artikel resteert')
    check(any(x['user_id'] == 'user-B' for x in d['voorraadartikelen']), 'user-B-artikelen bestaan nog')

    # ── Scenario 5: alleen historisch jaar wissen ──────────────────────────
    print('\n=== 5. Alleen 2025 (historisch) ===')
    zet_data(pg, basis_boekingen(), basis_voorraad())
    r = pg.evaluate("(j) => window.__wisJarenInSupabase(j)", ['2025'])
    check(r['ok'] is True, 'resultaat ok=true')
    check(r['boekingenVerwijderd'] == 2, 'boekingenVerwijderd = 2 (user-A, 2025)', r['boekingenVerwijderd'])
    check(r['voorraadVerwijderd'] is None, 'voorraadVerwijderd = None (2026 niet aangevinkt)', r['voorraadVerwijderd'])
    d = pg.evaluate("() => window.__wisData")
    check(len(d['voorraadartikelen']) == len(basis_voorraad()), 'voorraadartikelen volledig ongewijzigd')
    check(any(x['user_id']=='user-A' and x['archief_jaar'] is None for x in d['boekingen']), '2026 van user-A blijft staan')
    check(any(x['user_id']=='user-A' and x['archief_jaar']==2024 for x in d['boekingen']), '2024 van user-A blijft staan')

    # ── Scenario 7: meerdere jaren tegelijk ────────────────────────────────
    print('\n=== 7. 2026 + 2025 + 2024 tegelijk ===')
    zet_data(pg, basis_boekingen(), basis_voorraad())
    r = pg.evaluate("(j) => window.__wisJarenInSupabase(j)", ['2026','2025','2024'])
    check(r['ok'] is True, 'resultaat ok=true')
    check(r['boekingenVerwijderd'] == 7, 'boekingenVerwijderd = 7 (alle user-A rijen)', r['boekingenVerwijderd'])
    d = pg.evaluate("() => window.__wisData")
    check(all(x['user_id'] != 'user-A' for x in d['boekingen']), 'geen enkele user-A-boeking resteert')
    check(len([x for x in d['boekingen'] if x['user_id']=='user-B']) == 4, 'alle 4 user-B-boekingen blijven ongemoeid')

    # ── Scenario 8/9/11: user-scoping en hnvi_loten expliciet ─────────────
    print('\n=== 8/9/11. Scope-check: andere gebruiker, hnvi_loten, filters ===')
    zet_data(pg, basis_boekingen(), basis_voorraad())
    r = pg.evaluate("(j) => window.__wisJarenInSupabase(j)", ['2026','2025'])
    aanroepen = pg.evaluate("() => window.__wisAanroepen")
    check(all('hnvi_loten' != a['tabel'] for a in aanroepen), 'hnvi_loten wordt in geen enkele aanroep genoemd')
    check(all(a['filters'].get('user_id',{}).get('waarde') == 'user-A' for a in aanroepen if a.get('actie')=='delete'),
          'elke delete-aanroep is gefilterd op user_id = user-A')
    check(any(a['tabel']=='boekingen' and 'archief_jaar' in a['filters'] and a['filters']['archief_jaar']['op']=='is'
              for a in aanroepen), 'er is een aanroep met archief_jaar IS NULL (2026)')
    check(any(a['tabel']=='boekingen' and 'archief_jaar' in a['filters'] and a['filters']['archief_jaar']['op']=='in'
              for a in aanroepen), 'er is een aanroep met archief_jaar IN (...) (historisch)')
    d = pg.evaluate("() => window.__wisData")
    check(len([x for x in d['boekingen'] if x['user_id']=='user-B']) == 4, 'user-B volledig ongemoeid gebleven')

    # ── Geen sessie / geen verbinding ──────────────────────────────────────
    print('\n=== extra: geen sessie ===')
    zet_data(pg, basis_boekingen(), basis_voorraad())
    pg.evaluate("() => { window.__geenSessie = true; }")
    r = pg.evaluate("(j) => window.__wisJarenInSupabase(j)", ['2026'])
    check(r['ok'] is False, 'resultaat ok=false zonder sessie')
    check('ingelogd' in r['fout'].lower(), 'foutmelding noemt inloggen', r['fout'])
    d = pg.evaluate("() => window.__wisData")
    check(len(d['boekingen']) == len(basis_boekingen()), 'niets gewijzigd zonder sessie')
    pg.evaluate("() => { window.__geenSessie = false; }")

    b.close()

print('\n' + '='*50)
if FOUT:
    print(f'{len(FOUT)} controle(s) mislukt:')
    for f in FOUT: print('  -', f)
else:
    print('alle controles geslaagd')
