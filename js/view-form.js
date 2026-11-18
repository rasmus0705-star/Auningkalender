// Formular til at oprette (og som moderator: rette / gentage) arrangementer, med live konfliktcheck.
import { CONFIG } from './config.js';
import { h, icon, clear, cphToISO, dayKey, addDays, dowOf, dageIMaaned, pad, tidTekst, debounce, toast, formindskBillede, captcha, fmt, kapitaliser } from './util.js';
import { S, maalgruppeNavn, gemRet, rettelinkUrl } from './state.js';

const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const dageMellem = (a, b) => Math.round((Date.UTC(...b.split('-').map((x, i) => (i === 1 ? +x - 1 : +x))) - Date.UTC(...a.split('-').map((x, i) => (i === 1 ? +x - 1 : +x)))) / 864e5);

export async function visForm(root, { id, kopi, token } = {}) {
  const ret = !!token;                      // arrangøren retter via sit hemmelige link
  const mod = !!S.rolle && !ret;
  const redigér = !!id;
  let eks = null, ventende = null, retStatus = null;
  if (ret) {
    try { eks = await S.api.retHent(token); } catch { eks = null; }
    if (!eks) { root.append(h('div', { class: 'tom' }, h('h2', null, 'Linket virker ikke'), h('p', null, 'Arrangementet findes ikke længere, eller linket er forkert.'), h('a', { class: 'knap primær', href: '#/' }, 'Til forsiden'))); return; }
    ventende = eks.ventende; retStatus = eks.status;
    if (ventende) eks = { ...eks, ...ventende.forslag };
  } else if (id || kopi) {
    if (!mod) { location.hash = '#/mod'; return; }
    eks = await S.api.hentModEvent(id || kopi);
    if (!eks) { root.append(h('p', null, 'Arrangementet blev ikke fundet.')); return; }
  }
  const e0 = eks || {};
  const k0 = e0.kontakt || {};
  const form = h('form', { class: 'form', novalidate: true, autocomplete: 'off' });
  const g = (n) => (form.elements[n]?.value || '').trim();

  // ---------- byggeklodser ----------
  const felt = (label, input, { hint, krav, navn, bred } = {}) => h('div', { class: 'felt' + (bred ? ' bred' : ''), dataset: { felt: navn } },
    h('label', { for: input.id }, label, krav ? h('span', { class: 'krav', 'aria-hidden': 'true' }, ' *') : null),
    input, hint ? h('small', { class: 'hint' }, hint) : null, h('div', { class: 'fejl', id: `fejl-${navn}`, role: 'alert' }));
  const inp = (navn, type = 'text', props = {}) => h('input', { id: `f-${navn}`, name: navn, type, ...props });
  const sektion = (nr, titel, ...indhold) => h('fieldset', { class: 'sektion' }, h('legend', null, h('span', { class: 'nr' }, nr), titel), ...indhold);

  // ---------- 1. Hvad ----------
  const katRadios = h('div', { class: 'kat-valg', role: 'radiogroup', 'aria-label': 'Kategori' },
    S.stam.kategorier.map((k) => h('label', { class: 'kat-radio', style: `--c:${k.farve}` },
      h('input', { type: 'radio', name: 'kategori', value: k.slug, checked: e0.kategori === k.slug, onchange: konfliktCheck }), h('span', null, k.ikon, ' ', k.navn))));
  const ekstraKatValg = mod ? h('div', { class: 'kat-valg', role: 'group', 'aria-label': 'Ekstra kategorier' },
    S.stam.kategorier.map((k) => h('label', { class: 'kat-radio', style: `--c:${k.farve}` },
      h('input', { type: 'checkbox', name: 'ekstra_kategorier', value: k.slug, checked: (e0.kategorier || []).includes(k.slug) && e0.kategori !== k.slug }), h('span', null, k.ikon, ' ', k.navn)))) : null;
  const beskr = h('textarea', { id: 'f-beskrivelse', name: 'beskrivelse', rows: 5, maxlength: 4000, placeholder: 'Hvad skal der ske? Hvem er det for? Skal man tilmelde sig?' }, e0.beskrivelse || '');
  const billedeInput = inp('billede', 'file', { accept: 'image/*' });
  const preview = h('div', { class: 'preview' });
  let fjernBillede = false;
  if (e0.billede_url) preview.append(h('img', { src: e0.billede_url, alt: 'Nuværende billede' }), redigér ? h('button', { type: 'button', class: 'knap sekundær lille-knap', onclick: (ev) => { fjernBillede = true; clear(preview); ev.target.remove(); } }, 'Fjern billede') : null);
  billedeInput.addEventListener('change', () => {
    const f = billedeInput.files[0]; clear(preview); fjernBillede = false;
    if (f) preview.append(h('img', { src: URL.createObjectURL(f), alt: 'Forhåndsvisning' }));
  });

  // ---------- 2. Hvornår ----------
  const sd0 = e0.start_ts && !kopi ? dayKey(e0.start_ts) : '';
  const ed0 = e0.slut_ts && !kopi ? dayKey(e0.slut_ts) : '';
  const dato = (navn, v, min) => inp(navn, 'date', { value: v || '', min, onchange: konfliktCheck });
  const tid = (navn, v) => inp(navn, 'time', { value: v || '', onchange: konfliktCheck, step: 300 });
  const idag = dayKey(new Date());
  const gentagSel = h('select', { id: 'f-gentag', name: 'gentag', onchange: opdaterGentag },
    h('option', { value: 'ingen' }, 'Gentages ikke'), h('option', { value: 'uge' }, 'Hver uge (samme ugedag)'),
    h('option', { value: 'uge2' }, 'Hver 2. uge'), h('option', { value: 'md-ugedag' }, 'Hver måned, samme ugedag (fx 1. torsdag)'), h('option', { value: 'md-dato' }, 'Hver måned, samme dato'));
  const gentagTil = inp('gentagtil', 'date', { onchange: opdaterGentag });
  const gentagInfo = h('small', { class: 'hint' });
  const gentagBox = (mod && !redigér) ? h('div', { class: 'gentag' }, h('div', { class: 'felt' }, h('label', { for: 'f-gentag' }, icon('repeat', 16), ' Gentag'), gentagSel),
    h('div', { class: 'felt', id: 'gentag-til', hidden: true }, h('label', { for: 'f-gentagtil' }, 'Til og med'), gentagTil, gentagInfo)) : null;

  // ---------- 3. Hvor ----------
  const omrSel = h('select', { id: 'f-omraade', name: 'omraade' }, S.stam.omraader.map((o) => h('option', { value: o.slug, selected: (e0.omraade || CONFIG.defaultOmraade) === o.slug }, o.navn)));
  const harSted = e0.sted_id || !e0.sted_navn;
  const stedSel = h('select', { id: 'f-sted', name: 'sted', onchange: () => { toggelSted(); konfliktCheck(); } },
    h('option', { value: '' }, 'Vælg sted …'), S.stam.steder.map((s) => h('option', { value: s.id, selected: e0.sted_id === s.id }, s.navn)), h('option', { value: '__andet', selected: !!e0.sted_navn && !e0.sted_id }, 'Andet sted …'));
  const stedNavn = inp('stednavn', 'text', { value: e0.sted_id ? '' : (e0.sted_navn || ''), maxlength: 120, placeholder: 'Fx "Hos Hansen, Skovvej 3"', oninput: konfliktCheck });
  const stedAdr = inp('adresse', 'text', { value: e0.sted_id ? '' : (e0.adresse || ''), maxlength: 200, placeholder: 'Adresse (valgfrit)' });
  const andetBox = h('div', { class: 'andet-sted', hidden: harSted }, felt('Stedets navn', stedNavn, { navn: 'stednavn', krav: true }), felt('Adresse', stedAdr, { navn: 'adresse' }));
  function toggelSted() { andetBox.hidden = stedSel.value !== '__andet'; }

  // ---------- konfliktpanel ----------
  const konfBox = h('div', { class: 'konflikt', 'aria-live': 'polite' });

  // ---------- 4. Detaljer ----------
  const mgSel = h('select', { id: 'f-maalgruppe', name: 'maalgruppe', onchange: konfliktCheck }, S.stam.maalgrupper.map((m) => h('option', { value: m.slug, selected: (e0.maalgruppe || 'alle') === m.slug }, m.navn)));
  const gratisChk = h('input', { type: 'checkbox', id: 'f-gratis', checked: /^gratis$/i.test(e0.pris_tekst || ''), onchange: () => { prisInp.disabled = gratisChk.checked; if (gratisChk.checked) prisInp.value = ''; } });
  const prisInp = inp('pris', 'text', { value: /^gratis$/i.test(e0.pris_tekst || '') ? '' : (e0.pris_tekst || ''), maxlength: 60, placeholder: 'Fx "60 kr." eller "Voksne 80 / børn 40"', disabled: gratisChk.checked });
  const prisRække = h('div', { class: 'pris-række' }, prisInp, h('label', { class: 'check' }, gratisChk, 'Gratis'));

  // ---------- 5. Kontakt + indsend ----------
  const kontaktHint = mod ? 'Kun synlig for moderatorer.' : 'Vises aldrig offentligt – kun moderatorerne kan se den, så de kan kontakte dig, hvis noget er uklart.';
  const statusSel = mod ? h('select', { id: 'f-status', name: 'status' }, (redigér ? ['godkendt', 'afventer', 'kladde', 'afvist', 'aflyst'] : ['godkendt', 'kladde', 'afventer']).map((s) => h('option', { value: s, selected: (redigér ? e0.status : 'godkendt') === s }, kapitaliser(s === 'kladde' ? 'kladde (vises ikke)' : s === 'afventer' ? 'afventer godkendelse' : s)))) : null;
  const samtykke = !mod && !ret ? h('label', { class: 'check samtykke' }, h('input', { type: 'checkbox', name: 'samtykke', id: 'f-samtykke' }),
    h('span', null, 'Jeg har læst ', h('a', { href: '#/regler', target: '_blank' }, 'retningslinjerne'), ' og ', h('a', { href: '#/privatliv', target: '_blank' }, 'privatlivsteksten'), ', og jeg accepterer, at oplysningerne (undtagen kontakt) vises offentligt.')) : null;
  const honning = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'honning', 'aria-hidden': 'true' });
  const captchaBox = h('div', { class: 'captcha' });
  const knapTekst = ret ? (retStatus === 'afventer' ? 'Gem ændringer' : 'Send rettelse til godkendelse') : redigér ? 'Gem ændringer' : mod ? 'Opret' : 'Send til godkendelse';
  const knap = h('button', { type: 'submit', class: 'knap primær stor' }, knapTekst);
  const aflysChk = h('input', { type: 'checkbox', id: 'f-aflys', name: 'aflys' });
  const retSektion = ret ? sektion(5, 'Besked til moderatoren',
    felt('Hvad er rettet? (valgfrit)', h('textarea', { id: 'f-kommentar', name: 'kommentar', rows: 3, maxlength: 1000, placeholder: 'Fx "Starttidspunktet er flyttet fra 14 til 15"' }, ''), { navn: 'kommentar' }),
    retStatus === 'godkendt' ? h('label', { class: 'check' }, aflysChk, 'Arrangementet er aflyst') : null) : null;

  form.append(
    sektion(1, 'Hvad skal der ske?',
      felt('Titel', inp('titel', 'text', { id: 'f-titel', value: e0.titel || '', maxlength: 120, placeholder: 'Fx "Koncert med Auning Musikforening"', oninput: null }), { navn: 'titel', krav: true }),
      h('div', { class: 'felt', dataset: { felt: 'kategori' } }, h('label', null, 'Hovedkategori', h('span', { class: 'krav' }, ' *')), katRadios,
        ekstraKatValg ? h('div', { class: 'felt' }, h('label', null, 'Ekstra kategorier (valgfrit)'), ekstraKatValg) : null,
        h('div', { class: 'fejl', id: 'fejl-kategori', role: 'alert' })),
      felt('Beskrivelse', beskr, { navn: 'beskrivelse', hint: 'Skriv gerne hvem det er for, om der er tilmelding, og hvad man skal medbringe.' }),
      ...(ret ? [] : [felt('Billede', billedeInput, { navn: 'billede', hint: 'Valgfrit. Brug gerne et liggende billede. Det formindskes automatisk.' }), preview])),
    sektion(2, 'Hvornår?',
      h('div', { class: 'række' },
        felt('Startdato', dato('startdato', sd0, mod || ret ? undefined : idag), { navn: 'startdato', krav: true }), felt('Starttid', tid('starttid', e0.start_ts && !kopi ? tidTekst(e0.start_ts) : (kopi ? tidTekst(e0.start_ts) : '')), { navn: 'starttid', krav: true })),
      h('div', { class: 'række' },
        felt('Slutdato', dato('slutdato', ed0), { navn: 'slutdato', hint: 'Udfyld kun, hvis arrangementet varer flere dage.' }), felt('Sluttid', tid('sluttid', e0.slut_ts && !kopi ? tidTekst(e0.slut_ts) : (kopi && e0.slut_ts ? tidTekst(e0.slut_ts) : '')), { navn: 'sluttid' })),
      gentagBox),
    sektion(3, 'Hvor?',
      h('div', { class: 'række' }, felt('Område', omrSel, { navn: 'omraade' }), felt('Sted', stedSel, { navn: 'sted', krav: true })), andetBox, konfBox),
    sektion(4, 'Detaljer',
      h('div', { class: 'række' }, felt('Målgruppe', mgSel, { navn: 'maalgruppe', krav: true }), felt('Pris', prisRække, { navn: 'pris' })),
      felt('Arrangør', inp('arrangoer', 'text', { value: e0.arrangoer || '', maxlength: 120, placeholder: 'Forening, virksomhed eller navn' }), { navn: 'arrangoer', krav: true }),
      felt('Link (valgfrit)', inp('link', 'text', { value: e0.link_url || '', placeholder: 'https://… (tilmelding, hjemmeside eller Facebook-event)', inputmode: 'url' }), { navn: 'link' })),
    ret ? retSektion : sektion(5, mod ? 'Kontakt og udgivelse' : 'Din kontakt',
      h('div', { class: 'række' }, felt(mod ? 'Kontaktnavn' : 'Dit navn', inp('kontaktnavn', 'text', { value: k0.navn || '', maxlength: 120, autocomplete: 'name' }), { navn: 'kontaktnavn', krav: !mod }),
        felt('E-mail', inp('email', 'email', { value: k0.email || '', maxlength: 200, autocomplete: 'email' }), { navn: 'email' })),
      felt('Telefon', inp('telefon', 'tel', { value: k0.telefon || '', maxlength: 40, autocomplete: 'tel' }), { navn: 'telefon', hint: kontaktHint + (mod ? '' : ' Skriv enten e-mail eller telefon (eller begge).') }),
      statusSel ? felt('Status', statusSel, { navn: 'status' }) : null),
    samtykke, honning, captchaBox, h('div', { class: 'fejl samlet', id: 'fejl-samlet', role: 'alert' }),
    h('div', { class: 'form-knapper' }, knap, redigér ? h('a', { class: 'knap sekundær', href: '#/mod' }, 'Annuller') : null));

  const bredde = h('div', { class: 'form-side' },
    h('section', { class: 'intro lille' },
      h('h1', null, ret ? 'Ret dit arrangement' : redigér ? 'Ret arrangement' : mod ? 'Nyt arrangement' : 'Opret arrangement'),
      h('p', null, ret ? (retStatus === 'afventer' ? 'Dit arrangement er ikke godkendt endnu, så rettelser gemmes med det samme.' : ventende ? 'Du har allerede sendt en rettelse, som afventer godkendelse. Sender du en ny, erstatter den den gamle. Indtil en moderator har godkendt den, vises den nuværende version i kalenderen.' : 'Rettelser vises først i kalenderen, når en moderator har godkendt dem. Indtil da vises den nuværende version.') : mod ? 'Som moderator udgives arrangementet med det samme, hvis du vælger "godkendt".' : 'Alle arrangementer godkendes af en moderator, før de vises i kalenderen. Det plejer at gå hurtigt.')),
    form);
  root.append(bredde);

  // ryd en fejlmeddelelse, så snart feltet rettes
  const ryd = (ev) => {
    const felt = ev.target.closest?.('.felt');
    felt?.querySelector('.fejl')?.replaceChildren();
    ev.target.removeAttribute?.('aria-invalid');
    form.querySelector('#fejl-samlet')?.replaceChildren();
  };
  form.addEventListener('input', ryd);
  form.addEventListener('change', ryd);

  // captcha kun hvis der ikke allerede er en session
  let cap = { token: () => null, reset() {}, aktiv: false };
  if (!mod && !ret && !S.user) captcha(captchaBox).then((c) => { cap = c; }).catch(() => { captchaBox.append(h('small', { class: 'hint' }, 'Captcha kunne ikke indlæses.')); });
  // ---------- logik ----------
  function konfliktCheck() { opdaterGentag(); kcDebounced(); }
  function tider() {
    const sd = g('startdato'), st = g('starttid');
    if (!sd || !st) return null;
    let ed = g('slutdato'), et = g('sluttid'), slut = null;
    if (ed || et) { ed = ed || sd; et = et || '23:59'; slut = cphToISO(ed, et); }
    return { sd, st, ed: ed || sd, et, start: cphToISO(sd, st), slut };
  }
  function stedInfo() {
    const val = g('sted');
    if (val && val !== '__andet') { const s = S.stam.steder.find((x) => x.id === val); return { sted_id: s?.id || null, sted_navn: s?.navn || null, adresse: s?.adresse || null }; }
    return { sted_id: null, sted_navn: g('stednavn') || null, adresse: g('adresse') || null };
  }

  const kcDebounced = debounce(async () => {
    const t = tider();
    if (!t) { clear(konfBox).append(h('div', { class: 'konf-hint' }, icon('info', 16), 'Vælg dato og tid, så viser vi, om der allerede er andre arrangementer.')); return; }
    try {
      const sted = stedInfo();
      const rows = await S.api.konflikter({ start: t.start, slut: t.slut, ...sted, maalgruppe: g('maalgruppe') || 'alle', ekskluder: id || e0.id || null });
      clear(konfBox).append(...tegnKonflikt(rows));
    } catch { clear(konfBox); }
  }, 350);

  function tegnKonflikt(rows) {
    const række = (r) => {
      const tid = r.start_ts ? `${fmt.dagKort(new Date(r.start_ts))} ${tidTekst(r.start_ts)}–${tidTekst(r.slut_eff)}` : '';
      return h('li', null, h('b', null, r.titel || 'Et arrangement afventer godkendelse'), h('span', { class: 'dæmpet' }, ` · ${tid}${r.sted_navn ? ' · ' + r.sted_navn : ''}`),
        r.maalgruppe_match ? h('span', { class: 'mini-tag' }, 'samme målgruppe: ' + maalgruppeNavn(r.maalgruppe)) : null);
    };
    const hårde = rows.filter((r) => r.tid_overlap && r.sted_match);
    const tidsl = rows.filter((r) => r.tid_overlap && !r.sted_match);
    const dag = rows.filter((r) => !r.tid_overlap);
    const ud = [];
    if (hårde.length) ud.push(h('div', { class: 'konf rød' }, h('strong', null, icon('alert', 16), 'Samme sted og tidspunkt er allerede optaget'), h('ul', null, hårde.map(række))));
    if (tidsl.length) ud.push(h('div', { class: 'konf gul' }, h('strong', null, icon('alert', 16), 'Andre arrangementer samtidig'), h('ul', null, tidsl.map(række))));
    if (dag.length) ud.push(h('div', { class: 'konf blå' }, h('strong', null, icon('info', 16), 'Andre arrangementer samme dag'), h('ul', null, dag.map(række))));
    if (!rows.length) ud.push(h('div', { class: 'konf grøn' }, h('strong', null, icon('check', 16), 'Ingen andre arrangementer den dag.')));
    else ud.push(h('small', { class: 'hint' }, 'Du kan stadig sende det – en moderator vurderer det.'));
    return ud;
  }

  // ---------- gentagelser (kun moderator) ----------
  function perioder(t) {
    const gentag = g('gentag') || 'ingen';
    const lav = (dato) => ({ start: cphToISO(dato, t.st), slut: (g('slutdato') || g('sluttid')) ? cphToISO(addDays(dato, dageMellem(t.sd, t.ed)), g('sluttid') || '23:59') : null });
    if (gentag === 'ingen' || !gentagBox) return [{ start: t.start, slut: t.slut }];
    const til = g('gentagtil');
    if (!til) return [];
    const maks = addDays(t.sd, 366);
    const grænse = til > maks ? maks : til;
    const ud = [lav(t.sd)];
    let [y, m, d] = t.sd.split('-').map(Number);
    let cur = t.sd;
    const n = Math.ceil(d / 7), dow = dowOf(t.sd);
    while (ud.length < 60) {
      if (gentag === 'uge') cur = addDays(cur, 7);
      else if (gentag === 'uge2') cur = addDays(cur, 14);
      else {
        m += 1; if (m > 12) { m = 1; y++; }
        const antal = dageIMaaned(y, m);
        let dag;
        if (gentag === 'md-dato') dag = d;
        else { const første = dowOf(`${y}-${pad(m)}-01`); dag = 1 + ((dow - første + 7) % 7) + (n - 1) * 7; if (dag > antal && n === 5) dag -= 7; }
        if (dag > antal) { if (`${y}-${pad(m)}-01` > grænse) break; continue; }
        cur = `${y}-${pad(m)}-${pad(dag)}`;
      }
      if (cur > grænse) break;
      ud.push(lav(cur));
    }
    return ud;
  }
  function opdaterGentag() {
    if (!gentagBox) return;
    const aktiv = g('gentag') && g('gentag') !== 'ingen';
    gentagBox.querySelector('#gentag-til').hidden = !aktiv;
    const t = tider();
    if (!aktiv) return;
    if (!t) { gentagInfo.textContent = 'Udfyld først startdato og starttid.'; return; }
    const ps = perioder(t);
    gentagInfo.textContent = ps.length ? `Opretter ${ps.length} arrangementer${ps.length >= 60 ? ' (maks. 60)' : ''}: ${fmt.dagKort(new Date(ps[0].start))} … ${fmt.dagKort(new Date(ps[ps.length - 1].start))}` : 'Vælg slutdato for gentagelsen.';
  }

  // ---------- validering og indsendelse ----------
  function valider() {
    const fejl = {};
    const t = tider();
    if (g('titel').length < 3) fejl.titel = 'Skriv en titel på mindst 3 tegn.';
    if (!g('kategori')) fejl.kategori = 'Vælg en kategori.';
    if (!g('startdato')) fejl.startdato = 'Vælg en dato.';
    else if (!mod && !ret && g('startdato') < idag) fejl.startdato = 'Datoen ligger i fortiden.';
    else if (!mod && !ret && g('startdato') > addDays(idag, CONFIG.maxFremMaaneder * 30)) fejl.startdato = `Datoen ligger for langt ude i fremtiden (max ca. ${CONFIG.maxFremMaaneder} måneder).`;
    if (!g('starttid')) fejl.starttid = 'Vælg et tidspunkt.';
    if (t && t.slut && new Date(t.slut) < new Date(t.start)) fejl.sluttid = 'Slut skal være efter start.';
    const sted = stedInfo();
    if (!sted.sted_id && !sted.sted_navn) fejl[g('sted') === '__andet' ? 'stednavn' : 'sted'] = 'Vælg et sted, eller skriv hvor det foregår.';
    if (g('arrangoer').length < 2) fejl.arrangoer = 'Skriv hvem der arrangerer.';
    let link = g('link');
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    if (link && !/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(link)) fejl.link = 'Linket ser ikke rigtigt ud.';
    if (g('email') && !emailOk(g('email'))) fejl.email = 'E-mailadressen ser ikke rigtig ud.';
    if (!mod && !ret) {
      if (g('kontaktnavn').length < 2) fejl.kontaktnavn = 'Skriv dit navn.';
      if (!g('email') && !g('telefon')) fejl.email = 'Skriv enten e-mail eller telefon, så vi kan kontakte dig.';
      if (!form.elements.samtykke.checked) fejl.samtykke = 'Du skal acceptere retningslinjerne.';
    }
    return { fejl, t, sted, link };
  }
  function visFejl(fejl) {
    form.querySelectorAll('.fejl').forEach((el) => { el.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    let først = null;
    for (const [n, m] of Object.entries(fejl)) {
      const el = form.querySelector(`#fejl-${n}`) || form.querySelector('#fejl-samlet');
      el.textContent = m;
      const felt = form.elements[n]; if (felt?.setAttribute) felt.setAttribute('aria-invalid', 'true');
      først = først || el;
    }
    if (først) { først.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Ret de markerede felter', 'fejl'); }
  }
  toggelSted(); konfliktCheck();

  const venligFejl = (e) => {
    const m = String(e?.message || e);
    if (/row-level security|violates|policy/i.test(m)) return 'Det lykkedes ikke at gemme. Du har måske sendt for mange arrangementer på kort tid, eller datoen er ugyldig. Prøv igen senere.';
    if (/mange indsendelser/i.test(m)) return 'Kalenderen modtager mange indsendelser lige nu. Prøv igen om lidt.';
    if (/captcha/i.test(m)) return 'Captcha-kontrollen mislykkedes. Prøv igen.';
    if (/rate limit|too many/i.test(m)) return 'For mange forsøg. Vent lidt og prøv igen.';
    return 'Noget gik galt: ' + m;
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (g('website')) { visTak(root, { spam: true }); return; }
    const { fejl, t, sted, link } = valider();
    visFejl(fejl);
    if (Object.keys(fejl).length) return;

    knap.disabled = true; knap.textContent = 'Gemmer …';
    try {
      const kontakt = { navn: g('kontaktnavn'), email: g('email'), telefon: g('telefon') };
      const prisVal = gratisChk.checked ? 'Gratis' : g('pris');
      const fælles = {
        titel: g('titel'), beskrivelse: g('beskrivelse'), kategori: g('kategori'),
        kategorier: [...new Set([g('kategori'), ...[...form.querySelectorAll('input[name="ekstra_kategorier"]:checked')].map((x) => x.value)])],
        maalgruppe: g('maalgruppe'), omraade: g('omraade') || null,
        ...sted, pris_tekst: prisVal || null, link_url: link || null, arrangoer: g('arrangoer'),
      };
      const fil = billedeInput.files[0];
      let blob = null;
      if (fil) blob = await formindskBillede(fil, CONFIG.maxBilledeBredde);

      if (redigér) {
        await S.api.opdaterEvent(id, { ...fælles, start_ts: t.start, slut_ts: t.slut, status: g('status') || e0.status });
        await S.api.gemKontakt(id, kontakt);
        if (blob) await S.api.skiftBillede(id, e0.billede_sti, blob); else if (fjernBillede) await S.api.fjernEventBillede(id, e0.billede_sti);
        toast('Ændringer gemt', 'ok');
        S.hentetTid = 0;
        location.hash = '#/mod';
        return;
      }

      if (ret) {
        const res = await S.api.retSend(token, { ...fælles, start_ts: t.start, slut_ts: t.slut }, g('kommentar'), aflysChk.checked);
        S.hentetTid = 0;
        visTak(root, { ret: res, titel: g('titel') });
        return;
      }
      if (!mod) {
        const tok = cap.token();
        if (cap.aktiv && !S.user && !tok) throw new Error('Gennemfør captcha-kontrollen først.');
        await S.api.sikrSession(tok);
      }
      const ps = perioder(t);
      if (!ps.length) { visFejl({ gentagtil: 'Vælg slutdato for gentagelsen.' }); knap.disabled = false; knap.textContent = 'Opret'; return; }
      const billede_sti = blob ? await S.api.uploadBillede(blob) : null;
      const ids = await S.api.opret({ ...fælles, billede_sti, status: mod ? (g('status') || 'godkendt') : 'afventer', perioder: ps }, kontakt);
      S.hentetTid = 0;
      let retUrl = null;
      if (!mod && ids && ids[0]) {
        try { const tok = await S.api.rettelink(ids[0]); if (tok) { gemRet(ids[0], tok); retUrl = rettelinkUrl(tok); } } catch (e) { console.warn('Rettelink kunne ikke oprettes', e); }
      }
      visTak(root, { antal: ps.length, mod, status: mod ? g('status') : 'afventer', titel: g('titel'), email: g('email'), link: retUrl });
    } catch (e) {
      console.error(e);
      form.querySelector('#fejl-samlet').textContent = venligFejl(e);
      cap.reset?.();
      knap.disabled = false; knap.textContent = knapTekst;
    }
  });
}

function visTak(root, { antal = 1, mod, status, titel, spam, ret, link }) {
  const kopierLink = link ? h('div', { class: 'ret-boks' },
    h('h2', null, 'Skal noget rettes senere?'),
    h('p', null, 'Gem dette link. Med det kan du selv foreslå rettelser til tid, sted og tekst. Rettelser vises først, når en moderator har godkendt dem. Linket er personligt – del det kun med dem, der må rette.'),
    h('div', { class: 'række-inline' },
      h('input', { type: 'text', readonly: true, class: 'fuld', value: link, 'aria-label': 'Rettelink', onfocus: (e) => e.target.select() }),
      h('button', { type: 'button', class: 'knap sekundær', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Linket er kopieret', 'ok'); } catch { toast('Markér linket og kopiér det', 'fejl'); } } }, icon('copy', 16), ' Kopiér')),
    h('p', { class: 'dæmpet' }, 'Linket gemmes også i din browser på denne enhed.')) : null;
  clear(root).append(h('div', { class: 'tak' },
    h('div', { class: 'tak-ikon' }, icon('check', 40)),
    h('h1', null, ret ? (ret === 'direkte' ? 'Dine ændringer er gemt' : 'Tak! Din rettelse er sendt til godkendelse') : spam ? 'Tak' : mod ? (antal > 1 ? `${antal} arrangementer oprettet` : 'Arrangementet er oprettet') : 'Tak! Dit arrangement er sendt til godkendelse'),
    h('p', null, ret ? (ret === 'direkte' ? `«${titel}» er opdateret.` : 'Indtil en moderator har godkendt den, vises den nuværende version i kalenderen. Du kan sende en ny rettelse med det samme link.')
      : spam ? '' : mod ? (status === 'godkendt' ? 'Det vises nu i kalenderen.' : `Status: ${status}.`) : `«${titel}» bliver gennemset af en moderator. Når det er godkendt, vises det i kalenderen. Vi kontakter dig, hvis der er noget, vi skal have afklaret.`),
    kopierLink,
    h('div', { class: 'tak-knapper' },
      h('a', { class: 'knap primær', href: '#/' }, 'Se kalenderen'),
      ret ? null : h('button', { class: 'knap sekundær', onclick: () => { clear(root); visForm(root, {}); } }, 'Opret endnu et'),
      mod ? h('a', { class: 'knap sekundær', href: '#/mod' }, 'Til moderator') : null)));
}
