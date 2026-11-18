-- Gør arrangementets sted valgfrit, også når arrangøren bruger sit rettelink.
-- Kør efter 01_setup.sql.

create or replace function kk_ret_rens(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s timestamptz; sl timestamptz; titel text; ar text; lnk text; sid uuid; om text;
begin
  titel := trim(p->>'titel');
  if titel is null or char_length(titel) not between 3 and 120 then raise exception 'Titlen skal være 3-120 tegn'; end if;
  ar := trim(p->>'arrangoer');
  if ar is null or char_length(ar) not between 2 and 120 then raise exception 'Arrangør mangler'; end if;
  s := (p->>'start_ts')::timestamptz;
  sl := nullif(p->>'slut_ts','')::timestamptz;
  if s is null then raise exception 'Starttid mangler'; end if;
  if sl is not null and sl < s then raise exception 'Slut skal være efter start'; end if;
  if s > now() + interval '18 months' then raise exception 'Datoen ligger for langt ude i fremtiden'; end if;
  if not exists (select 1 from kk_kategorier where slug = p->>'kategori') then raise exception 'Ukendt kategori'; end if;
  if not exists (select 1 from kk_maalgrupper where slug = p->>'maalgruppe') then raise exception 'Ukendt målgruppe'; end if;
  om := nullif(p->>'omraade','');
  if om is not null and not exists (select 1 from kk_omraader where slug = om) then raise exception 'Ukendt område'; end if;
  sid := nullif(p->>'sted_id','')::uuid;
  if sid is not null and not exists (select 1 from kk_steder where id = sid) then raise exception 'Ukendt sted'; end if;
  lnk := nullif(trim(p->>'link_url'),'');
  if lnk is not null and lnk !~* '^https?://' then raise exception 'Ugyldigt link'; end if;
  if char_length(coalesce(p->>'beskrivelse','')) > 4000 or char_length(coalesce(p->>'pris_tekst','')) > 60
     or char_length(coalesce(p->>'sted_navn','')) > 120 or char_length(coalesce(p->>'adresse','')) > 200 then
    raise exception 'En tekst er for lang';
  end if;
  return jsonb_build_object(
    'titel', titel, 'beskrivelse', nullif(trim(p->>'beskrivelse'),''), 'start_ts', s, 'slut_ts', sl, 'sted_id', sid,
    'sted_navn', nullif(trim(p->>'sted_navn'),''), 'adresse', nullif(trim(p->>'adresse'),''), 'omraade', om,
    'kategori', p->>'kategori', 'maalgruppe', p->>'maalgruppe', 'pris_tekst', nullif(trim(p->>'pris_tekst'),''),
    'link_url', lnk, 'arrangoer', ar);
end $$;
revoke all on function kk_ret_rens(jsonb) from public, anon, authenticated;
