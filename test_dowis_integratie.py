from playwright.sync_api import sync_playwright
import json

FOUT = []
def check(cond, naam, detail=''):
    print(('  ok   ' if cond else '  FOUT ') + naam + (f'  {detail}' if detail and not cond else ''))
    if not cond: FOUT.append(naam)

def basis_boekingen():
    rijen = []; i = 1
    for jaar, azn in [(None, 3), (2025, 2), (2024, 2)]:
        for _ in range(azn):
            rijen.append({'id': i, 'user_id': 'user-A', 'archief_jaar': jaar}); i += 1
    return rijen

def basis_voorraad():
    return [{'id': i, 'user_id': 'user-A'} for i in range(1, 5)]

def vink_alleen(pg, jaren):
    for j in ['2026','2025','2024','2023','2022']:
        pg.evaluate("(a) => { const el = document.getElementById('wis-'+a[0]); if (el) el.checked = a[1]; }", [j, j in jaren])

with sync_playwright() as p:
    b = p.chromium.launch()

    # ── Scenario A: cloudfout -> lokale staat blijft exact ongewijzigd ─────
    print('=== A. Cloudfout tijdens boekingen: lokale staat mag niet veranderen ===')
    pg = b.new_page()
    logs = []
    pg.on('console', lambda m: logs.append(m.text))
    pg.on('dialog', lambda d: (logs.append(f'DIALOG[{d.type}]: {d.message}'), d.accept()))
    pg.goto('http://127.0.0.1:8899/_test-dowis.html', wait_until='load')
    pg.wait_for_function('window.__testenGereed === true')

    tx = [{'id': 1, 'datum': '2026-03-01', 'bedrag': 10, 'type': 'inkomst'}]
    hist = [{'id': 'h2025_1', 'datum': '2025-01-01', 'bedrag': 5, 'type': 'uitgave'}]
    covers = [{'id': 'c1', 'artikel': 'Test'}]
    pg.evaluate("(a) => window.__seed(a[0], a[1], a[2], a[3], a[4])",
                [tx, hist, covers, {'2026': {'omzet': 1}}, {'2026-01': {'eind': 100}}])
    pg.evaluate("(a) => { window.__wisData = { boekingen: a[0], voorraadartikelen: a[1] }; window.__wisFout = { tabel: 'boekingen', bericht: 'gesimuleerde netwerkfout' }; window.__wisAanroepen = []; }",
                [basis_boekingen(), basis_voorraad()])
    voor = pg.evaluate("() => window.__snapshot()")

    vink_alleen(pg, ['2026'])
    pg.evaluate("async () => { await window.__wisApi.doWis(); }")
    pg.wait_for_timeout(300)
    na = pg.evaluate("() => window.__snapshot()")

    check(voor == na, 'state exact gelijk vóór en na een mislukte cloudstap')
    check(any('DIALOG[alert]' in l and 'gesimuleerde netwerkfout' in l for l in logs),
          'foutmelding met de echte reden getoond aan de gebruiker')
    knop_status = pg.evaluate("() => { const k = document.getElementById('wis-bevestig'); return { disabled: k.disabled, tekst: k.textContent }; }")
    check(knop_status['disabled'] is False, 'knop weer bruikbaar ná de mislukking', str(knop_status))
    check('Wis geselecteerd' in knop_status['tekst'], 'knoptekst hersteld', knop_status['tekst'])
    pg.close()

    # ── Scenario B: dubbel klikken tijdens de operatie ──────────────────────
    print('\n=== B. Dubbel klikken tijdens het wissen ===')
    pg = b.new_page()
    pg.on('dialog', lambda d: d.accept())
    pg.goto('http://127.0.0.1:8899/_test-dowis.html', wait_until='load')
    pg.wait_for_function('window.__testenGereed === true')
    pg.evaluate("(a) => window.__seed(a[0], a[1], a[2], a[3], a[4])", [[], [], [], {}, {}])
    pg.evaluate("(a) => { window.__wisData = { boekingen: a[0], voorraadartikelen: a[1] }; window.__wisFout = null; window.__wisAanroepen = []; }",
                [basis_boekingen(), basis_voorraad()])
    # Kunstmatige vertraging in de gesimuleerde select(), zodat er een venster
    # is waarin een tweede klik zou kunnen binnenkomen terwijl de eerste nog
    # loopt.
    pg.evaluate("""() => {
      const orig = window.supabase.createClient;
      window.__tweedeAanroepTerwijlBezig = null;
    }""")
    vink_alleen(pg, ['2026'])
    pg.evaluate("() => { window.__wisVertragingMs = 500; }")  # realistisch trage verbinding

    # Roep doWis() twee keer bijna gelijktijdig aan, zoals een dubbele klik zou
    # doen, en controleer of de knop na de EERSTE aanroep synchroon al
    # vergrendeld is voordat de async operatie klaar is.
    # Echte klikken op de echte knop, met de echte confirm()-dialoog van de
    # browser -- dat is de enige manier om de vergrendeling te testen zoals
    # een gebruiker hem raakt, in plaats van doWis() los aan te roepen.
    knop = pg.locator('#wis-bevestig')
    knop.click()
    # De confirm()-dialoog gaat via een CDP-omloop; even wachten tot die
    # daadwerkelijk is afgehandeld voordat de knopstatus wordt gelezen.
    pg.wait_for_function("document.getElementById('wis-bevestig').disabled === true", timeout=2000)
    status_tijdens = pg.evaluate("() => { const k = document.getElementById('wis-bevestig'); return { disabled: k.disabled, tekst: k.textContent }; }")
    check(status_tijdens['disabled'] is True, 'knop is vergrendeld zodra de operatie loopt', str(status_tijdens))
    # Nu de tweede klik, terwijl de knop al disabled is -- de browser laat een
    # klik op een disabled element sowieso niet door, dus dit test tegelijk
    # het echte gedrag.
    knop.click(force=True, timeout=500)
    pg.wait_for_timeout(2500)
    aanroepen = pg.evaluate("() => window.__wisAanroepen.filter(a => a.actie === 'delete').length")
    # Eén volledige wis van 2026 doet twee deletes (boekingen + voorraad).
    # Een dubbele uitvoering zou dat verdubbelen; in de UI is de knop
    # vergrendeld, dus dat hoort hier bij 2 te blijven, niet 4.
    check(aanroepen == 2, 'geen dubbele uitvoering: precies 2 delete-aanroepen (boekingen + voorraad)', str(aanroepen))
    pg.close()

    # ── Scenario C: volledig succesvol, lokale staat klopt na afloop ────────
    print('\n=== C. Succesvolle wis: lokale staat na afloop ===')
    pg = b.new_page()
    pg.on('dialog', lambda d: d.accept())
    pg.goto('http://127.0.0.1:8899/_test-dowis.html', wait_until='load')
    pg.wait_for_function('window.__testenGereed === true')
    tx = [{'id': 1, 'datum': '2026-03-01', 'bedrag': 10, 'type': 'inkomst'}]
    hist = [{'id': 'h2025_1', 'datum': '2025-01-01', 'bedrag': 5, 'type': 'uitgave'},
            {'id': 'h2024_1', 'datum': '2024-01-01', 'bedrag': 5, 'type': 'uitgave'}]
    covers = [{'id': 'c1', 'artikel': 'Test'}]
    pg.evaluate("(a) => window.__seed(a[0], a[1], a[2], a[3], a[4])",
                [tx, hist, covers, {'2026': {'omzet': 1}, '2025': {'omzet': 2}}, {'2025-01': {'eind': 50}}])
    pg.evaluate("(a) => { window.__wisData = { boekingen: a[0], voorraadartikelen: a[1] }; window.__wisFout = null; window.__wisAanroepen = []; }",
                [basis_boekingen(), basis_voorraad()])

    vink_alleen(pg, ['2026', '2025'])
    pg.evaluate("async () => { await window.__wisApi.doWis(); }")
    pg.wait_for_timeout(300)
    na = pg.evaluate("() => window.__snapshot()")
    check(na['TX'] == [], 'state.TX leeg')
    check(na['COVERS'] == [], 'state.COVERS leeg')
    check(all(not t['datum'].startswith('2025') for t in na['HIST_TX']), 'geen 2025-boekingen meer in HIST_TX')
    check(any(t['datum'].startswith('2024') for t in na['HIST_TX']), '2024 blijft in HIST_TX (niet aangevinkt)')
    check('2026' not in na['HOME_TOTALS'] and '2025' not in na['HOME_TOTALS'], '2026 en 2025 weg uit HOME_TOTALS')
    d = pg.evaluate("() => window.__wisData")
    resterend_userA = [x for x in d['boekingen'] if x['user_id'] == 'user-A']
    check(all(x['archief_jaar'] == 2024 for x in resterend_userA) and len(resterend_userA) == 2,
          'in de (gesimuleerde) cloud: van user-A resteert alleen 2024 (2 rijen), 2026+2025 zijn weg',
          str(resterend_userA))
    check(all(x['user_id'] != 'user-A' for x in d['voorraadartikelen']), 'user-A-voorraad ook echt weg in de (gesimuleerde) cloud')
    pg.close()

    b.close()

print('\n' + '='*50)
if FOUT:
    print(f'{len(FOUT)} controle(s) mislukt:')
    for f in FOUT: print('  -', f)
else:
    print('alle controles geslaagd')
