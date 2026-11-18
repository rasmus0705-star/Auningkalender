#!/usr/bin/env python3
"""Engangsimport: læser Kulturkalender.docx (tabel med titel | dato | tid | sted | genre)
og skriver sql/04_import_fra_dokument.sql.  Brug:  python3 scripts/docx_til_sql.py Kulturkalender.docx
Kræver:  pip install python-docx
Rækker uden dato springes over og skrives ud, så de kan lægges ind i hånden."""
import re, sys, uuid, datetime as dt
import docx

MAANED = {'jan': 1, 'januar': 1, 'feb': 2, 'februar': 2, 'mar': 3, 'marts': 3, 'apr': 4, 'april': 4, 'maj': 5, 'jun': 6, 'juni': 6,
          'jul': 7, 'juli': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'okt': 10, 'nov': 11, 'dec': 12}
NS = uuid.UUID('6f1c2f5e-0a4e-4b8e-9c55-4b0f2a6a1e11')

# kanonisk stednavn -> (match-tekst i dokumentet, i kk_steder?)
STEDER = [
    ('kulturperronen', 'Kulturperronen'), ('sognehuset', 'Sognehuset'), ('aik', 'Auning Idræts- & Kulturcenter (AIK)'),
    ('apetit', 'Apetit'), ('3f', '3F Huset'), ('herregårdsmuseet', 'Herregårdsmuseet (Gl. Estrup)'), ('herregaardsmuseet', 'Herregårdsmuseet (Gl. Estrup)'),
    ('gl. estrup herregaard', 'Herregårdsmuseet (Gl. Estrup)'), ('det grønne museum', 'Det Grønne Museum'), ('auning kirke', 'Auning Kirke'),
    ('auning kro', 'Auning Kro'), ('det gamle hospital', 'Det Gamle Hospital'), ('galleri marxen', 'Galleri Marxen'),
    ('nature by hjort', 'Nature by Hjort'), ('nørgaard teknik', 'Nørgaard Teknik'), ('madens hus', "Madens Hus"),
]
SOM_ARRANGOER = {'Apetit', 'Galleri Marxen', 'Nature by Hjort', 'Nørgaard Teknik', 'Auning Kirke', 'Herregårdsmuseet (Gl. Estrup)', 'Det Grønne Museum', 'Auning Kro'}
RETTELSER = {'Forfatterbeøg': 'Forfatterbesøg', 'nybegyndere': 'nybegynder', 'lækker med og fed': 'lækker mad og fed', 'Herregaardskøkkent': 'Herregårdskøkkenet'}

MANUELLE = [
    dict(titel='Kyndelmissegudstjeneste Auning Kirke', beskr='Vi hilser den lyse tid velkommen med pandekager og vintersange.', s='2027-01-31 14:00', e='2027-01-31 15:00',
         sted='Auning Kirke', fri=None, adresse='Kirkevej 2, 8963 Auning', kat='andet', mg='alle', pris=None, arr='Auning Kirke'),
]

def rens(t): return re.sub(r'\s+', ' ', (t or '').replace('\xa0', ' ')).strip()
def sql(s): return 'null' if s is None else "'" + str(s).replace("'", "''") + "'"

def maaned(tekst):
    m = re.search(r'([a-zæøå]+)\.?\s*$', tekst.lower())
    return MAANED.get(m.group(1)) if m else None

def parse_dato(t, aar):
    """-> (start_date, slut_date) eller None"""
    t = rens(t).lower()
    m = re.fullmatch(r'(\d{1,2})\.(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})', t)               # 28.11-30.12
    if m:
        d1, m1, d2, m2 = map(int, m.groups())
        s = dt.date(aar, m1, d1); e = dt.date(aar + (1 if m2 < m1 else 0), m2, d2); return s, e
    mnd = maaned(t)
    if not mnd: return None
    dage = [int(x) for x in re.findall(r'\d{1,2}(?=\.)', t)]                                 # 20. 21. 22. nov. / 28.-29. nov. / 5.- 6. dec.
    if not dage: return None
    return dt.date(aar, mnd, min(dage)), dt.date(aar, mnd, max(dage))

def parse_tid(t):
    """-> (start 'HH:MM'|None, slut 'HH:MM'|None)"""
    t = rens(t)
    m = re.match(r'^(\d{1,2})[.:](\d{2})(?:\s*[-–]\s*(\d{1,2})[.:\-](\d{2}))?', t)
    if not m: return None, None
    a = f'{int(m.group(1)):02d}:{m.group(2)}'
    b = f'{int(m.group(3)):02d}:{m.group(4)}' if m.group(3) else None
    return a, b

def kategori_og_maalgruppe(titel, genre):
    t, g = titel.lower(), genre.lower()
    if t.startswith('pensionist'):
        if any(x in t for x in ('julefrokost', 'bal ', 'afslutningsfest')): return 'marked-fest', 'seniorer'
        if 'musik' in g or 'sang' in g: return 'musik', 'seniorer'
        if any(x in g for x in ('foredrag', 'formidling')): return 'foredrag', 'seniorer'
        return 'forening', 'seniorer'
    if 'børneteater' in t: return 'boern-familie', 'boern'
    if any(x in t for x in ('marked', 'pop up pub', 'julebal', 'mgp fest', 'banko')): return 'marked-fest', 'alle'
    if any(x in t for x in ('cup', 'løbet', 'march', 'ladywalk', 'håndbold')) or g.strip() == 'sport': return 'sport', 'alle'
    if 'musik' in g or 'sang' in g or 'koncert' in t: return 'musik', 'alle'
    if any(x in g for x in ('foredrag', 'formidling')): return 'foredrag', 'alle'
    if 'brystkræft' in t: return 'forening', 'alle'
    return 'andet', 'alle'

def main(sti):
    d = docx.Document(sti)
    tabel = max(d.tables, key=lambda t: len(t.rows))
    aar = 2026
    rækker, sprunget = [], []
    for r in tabel.rows:
        c = [rens(x.text) for x in r.cells]
        if re.fullmatch(r'20\d\d', c[0]):
            aar = int(c[0]); continue
        if not c[0]: continue
        titel_raa, dato, tid, sted_raa, genre = (c + [''] * 5)[:5]
        if not dato:
            sprunget.append(titel_raa); continue
        p = parse_dato(dato, aar)
        if not p:
            sprunget.append(f'{titel_raa}  (dato: "{dato}")'); continue
        start, slut = p
        titel = titel_raa
        for a, b in RETTELSER.items(): titel = titel.replace(a, b)
        titel = re.sub(r'^Pensionist\s*(?:og)?\s*seniorfore(?:ning)?\.?\s*', 'Pensionist- og seniorforening: ', titel).strip(' /.')
        titel = rens(titel)
        beskr = []
        if len(titel) > 120:
            cut = titel[:117].rsplit(' ', 1)[0] + '…'; beskr.append(titel_raa); titel = cut
        pris = None
        if re.search(r'gratis', titel_raa, re.I): pris = 'Gratis'
        if re.search(r'særskilt billet', titel_raa, re.I): pris = 'Særskilt billet'
        t0, t1 = parse_tid(tid)
        if not t0:
            if tid: beskr.append(f'Tidspunkt: {tid}.')
            else: beskr.append('Tidspunkt endnu ikke oplyst.')
        kl = sted_raa.lower().strip()
        sted_kanon = next((k for n, k in STEDER if n in kl), None)
        if 'kirken og sognehuset' in kl or 'kirke og sognehuset' in kl: sted_kanon = None
        sted_fri = None if sted_kanon else re.sub(r'(?i)østervangsalle', 'Østervangs Allé', sted_raa).strip(' .') or None
        if sted_raa.lower().startswith('gl. estrup riddersalen'): sted_kanon, sted_fri = None, 'Gl. Estrup, Riddersalen'
        kat, mg = kategori_og_maalgruppe(titel, genre)
        arr = ('Pensionist- og seniorforeningen' if titel.startswith('Pensionist-') else 'Brystkræftforeningen' if 'Brystkræftforeningen' in titel_raa
               else 'Lions Gl. Estrup' if 'Lions' in titel_raa else 'Osteoporoseforeningen Djursland' if 'Osteoporoseforeningen' in titel_raa
               else sted_kanon if sted_kanon in SOM_ARRANGOER else 'Ikke oplyst')
        s_ts = f'{start} {t0 or "00:00"}'
        if t1: e_ts = f'{slut} {t1}'
        elif slut != start: e_ts = f'{slut} 23:59'      # flere dage uden sluttid
        else: e_ts = None
        id_ = uuid.uuid5(NS, f'{titel_raa}|{start}')
        rækker.append(dict(id=id_, titel=titel, beskr=' '.join(beskr) or None, s=s_ts, e=e_ts, sted=sted_kanon, fri=sted_fri, kat=kat, mg=mg, pris=pris, arr=arr, tid_ukendt=not t0, genre=genre))
    # Rækker, som dokumentet mangler dato på, og som er afklaret bagefter
    for m in MANUELLE:
        rækker.append({**m, 'id': uuid.uuid5(NS, f"{m['titel']}|{m['s'][:10]}"), 'tid_ukendt': False, 'genre': ''})
        sprunget = [x for x in sprunget if not x.lower().startswith(m['titel'].split()[0].lower())]
    return rækker, sprunget

def skriv(rækker, ud):
    steder = sorted({r['sted'] for r in rækker if r['sted']})
    L = ['-- Engangsimport fra Kulturkalender.docx (oprettet med scripts/docx_til_sql.py).',
         '-- Kan køres flere gange: arrangementer har faste id\'er og springes over, hvis de findes.',
         '-- Arrangementer uden kendt klokkeslæt gemmes kl. 00:00 og vises som "Tid følger".',
         'begin;', '',
         'insert into kk_steder (navn, omraade, sortering)',
         'select v.navn, \'auning\', 50 from (values ' + ', '.join(f'({sql(s)})' for s in steder) + ') v(navn)',
         'where not exists (select 1 from kk_steder s where s.navn = v.navn);', '',
         'insert into kk_events (id, titel, beskrivelse, start_ts, slut_ts, sted_id, sted_navn, adresse, omraade, kategori, maalgruppe, pris_tekst, arrangoer)', 'values']
    vals = []
    for r in rækker:
        ts = lambda x: 'null' if not x else f"(timestamp '{x}' at time zone 'Europe/Copenhagen')"
        sted_id = f"(select id from kk_steder where navn = {sql(r['sted'])} limit 1)" if r['sted'] else 'null'
        vals.append(f"  ({sql(str(r['id']))}, {sql(r['titel'])}, {sql(r['beskr'])}, {ts(r['s'])}, {ts(r['e'])}, {sted_id}, {sql(r['fri'])}, {sql(r.get('adresse'))}, 'auning', {sql(r['kat'])}, {sql(r['mg'])}, {sql(r['pris'])}, {sql(r['arr'])})")
    L.append(',\n'.join(vals)); L.append('on conflict (id) do nothing;'); L.append('')
    L += ['-- Triggeren sætter nye rækker til "afventer"; her udgives de, og automatiske flag ryddes.',
          'update kk_events set status = \'godkendt\', af_moderator = true, flag = \'{}\'',
          'where status = \'afventer\' and id in (' + ', '.join(sql(str(r['id'])) for r in rækker) + ');', '', 'commit;', '']
    open(ud, 'w', encoding='utf-8').write('\n'.join(L))

if __name__ == '__main__':
    r, s = main(sys.argv[1])
    skriv(r, sys.argv[2] if len(sys.argv) > 2 else 'sql/04_import_fra_dokument.sql')
    print(f'{len(r)} arrangementer skrevet. Sprunget over (ingen dato): {len(s)}')
    for x in s: print('  -', x)
