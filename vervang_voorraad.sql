-- ============================================================================
-- vervang_voorraad(p_artikelen jsonb)
--
-- NIET UITGEVOERD. Dit bestand is uitsluitend ter beoordeling, geschreven na
-- een reeks read-only onderzoeken naar het schema, de RLS-policies en de
-- kolomtypen van `voorraadartikelen`. Alle typen en DEFAULT-waarden hieronder
-- zijn de bevestigde, niet de afgeleide, waarden uit dat onderzoek.
--
-- Doel: de volledige voorraad van de ingelogde gebruiker in één PostgreSQL-
-- transactie vervangen door een nieuwe set, zodat een fout halverwege de
-- oorspronkelijke voorraad volledig en ongewijzigd laat — nooit een
-- gedeeltelijke cloudvoorraad.
-- ============================================================================


-- ─── 1. DE FUNCTIE ZELF ─────────────────────────────────────────────────────

create or replace function public.vervang_voorraad(p_artikelen jsonb)
returns table(ok integer, verwijderd integer, ingevoegd integer)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_verwijderd integer;
  v_ingevoegd  integer;
begin
  -- user_id komt NOOIT uit p_artikelen of uit een parameter. De enige bron
  -- is auth.uid(), bepaald door de sessie waarmee deze aanroep binnenkomt.
  -- Is er geen sessie, dan stopt de functie hier — zonder dit zou de DELETE
  -- hieronder met `user_id = null` stilzwijgend nul rijen raken (SQL: NULL
  -- is nooit "gelijk aan" iets, ook niet aan zichzelf), wat een verwarrende
  -- stille no-op zou zijn in plaats van een duidelijke weigering.
  if v_user_id is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;

  -- ── Stap 1: de bestaande voorraad van deze gebruiker weg ──────────────
  -- security invoker: dit loopt via de bestaande RLS-policy voor DELETE
  -- (`user_id = auth.uid()`), dus zelfs een fout in de regel hieronder zou
  -- door RLS worden tegengehouden. De WHERE-voorwaarde is de eerste,
  -- expliciete verdedigingslinie; RLS is de tweede.
  delete from public.voorraadartikelen
  where user_id = v_user_id;
  get diagnostics v_verwijderd = row_count;

  -- ── Stap 2: de volledige nieuwe set, in één set-gebaseerd statement ────
  -- Eén INSERT ... SELECT, geen lus. Faalt één rij (bijvoorbeeld op de
  -- CHECK-constraint van `artikel`, de foreign key van `productgroep_id`,
  -- of de unieke index op (user_id, legacy_id) doordat p_artikelen zelf een
  -- dubbele legacy_id bevat), dan faalt dit HELE statement — niet "de eerste
  -- 172 van de 250 rijen", maar nul van de 250. Faalt dit statement, dan
  -- rolt de omvattende functie-aanroep ook de DELETE hierboven terug: een
  -- PL/pgSQL-functie draait als één ondeelbaar geheel binnen de transactie
  -- van de aanroep, en een onbehandelde fout (er staat hieronder bewust geen
  -- EXCEPTION-blok dat dit zelf opvangt) laat Postgres alles terugdraaien
  -- tot vóór het begin van deze functie. Er is dus geen enkele regel nodig
  -- die expliciet "rollback" zegt — het is de afwezigheid van foutafhandeling
  -- die de garantie geeft, niet een aanwezige regel.
  --
  -- id, created_at en updated_at staan bewust niet in de kolomlijst: alle
  -- drie hebben een bevestigde DEFAULT (gen_random_uuid(), now(), now()) en
  -- de bestaande insert-paden laten dat nu ook al zo. deleted_at en
  -- gewijzigd_door worden hier evenmin gezet — deze functie doet een harde
  -- vervanging, geen zachte.
  insert into public.voorraadartikelen (
    user_id, legacy_id, artikel, productgroep_id, voorraad,
    inkoopprijs, verkoopprijs, min_voorraad, ingekocht, verkocht,
    zoekterm, inkooprekening, categorie, handelsvoorraad,
    jaren, prijsfactor
  )
  select
    v_user_id,             -- altijd auth.uid(), nooit uit x.*
    x.legacy_id,
    x.artikel,
    x.productgroep_id,
    coalesce(x.voorraad, 0),
    x.inkoopprijs,
    x.verkoopprijs,
    x.min_voorraad,
    coalesce(x.ingekocht, 0),
    coalesce(x.verkocht, 0),
    coalesce(x.zoekterm, ''),
    coalesce(x.inkooprekening, '7000'),
    coalesce(x.categorie, 'overig'),
    coalesce(x.handelsvoorraad, true),
    coalesce(x.jaren, '{}'::jsonb),
    coalesce(x.prijsfactor, 1)
  from jsonb_to_recordset(p_artikelen) as x(
    legacy_id       text,
    artikel         text,
    productgroep_id uuid,
    voorraad        integer,
    inkoopprijs     numeric,
    verkoopprijs    numeric,
    min_voorraad    integer,
    ingekocht       integer,
    verkocht        integer,
    zoekterm        text,
    inkooprekening  text,
    categorie       text,
    handelsvoorraad boolean,
    jaren           jsonb,
    prijsfactor     numeric
  );
  get diagnostics v_ingevoegd = row_count;

  return query select v_ingevoegd, v_verwijderd, v_ingevoegd;
end;
$$;

comment on function public.vervang_voorraad(jsonb) is
  'Vervangt de volledige voorraad van de ingelogde gebruiker (auth.uid()) '
  'atomisch: bestaande rijen weg, nieuwe set in één statement erin. Faalt '
  'een van beide stappen, dan blijft de oorspronkelijke voorraad volledig '
  'intact — er wordt hier bewust geen fout opgevangen, zodat Postgres de '
  'hele aanroep als één transactie terugdraait.';


-- ============================================================================
-- 2. DDL — GRANT/REVOKE
--
-- Dit is databasebeheer, geen onderdeel van de functie zelf. Voer dit pas uit
-- ná controle, samen met de CREATE FUNCTION hierboven. Zonder deze twee
-- regels is de functie ofwel voor niemand bruikbaar (revoke all), ofwel
-- per ongeluk ook door niet-ingelogde bezoekers aan te roepen als de
-- standaardrechten van het schema dat toestaan — vandaar dat beide regels
-- hier expliciet staan in plaats van op de standaardrechten te vertrouwen.
-- ============================================================================

revoke all on function public.vervang_voorraad(jsonb) from public;
grant execute on function public.vervang_voorraad(jsonb) to authenticated;
