// DEMO-tilstand: samme interface som api-supabase.js, men alt ligger i hukommelsen.
// Bruges kun, mens config.js stadig har "DIT-PROJEKT". Intet gemmes permanent.
import { addDays, cphToISO, dayKey, nyId, pad } from './util.js';
import { standardBilledeUrl } from './standard-billeder.js';

const KAT = [
  ['musik', 'Musik', '#7c3aed', '🎵'], ['foredrag', 'Foredrag', '#0369a1', '🎤'], ['boern-familie', 'Børn og familie', '#ea580c', '🧒'],
  ['sport', 'Sport og motion', '#15803d', '🏃'], ['marked-fest', 'Marked og fest', '#be123c', '🎪'], ['forening', 'Foreningsmøde', '#475569', '🤝'], ['andet', 'Andet', '#6b7280', '✨'],
].map(([slug, navn, farve, ikon], i) => ({ slug, navn, farve, ikon, sortering: (i + 1) * 10, aktiv: true }));

function billede(farve, emoji, seed) {
  const a = 20 + (seed * 37) % 60, b = 30 + (seed * 53) % 50;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${farve}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/><circle cx="${a * 10}" cy="${b * 5}" r="${120 + seed % 5 * 30}" fill="#fff" opacity=".08"/><circle cx="${800 - a * 6}" cy="${500 - b * 3}" r="${90 + seed % 4 * 25}" fill="#fff" opacity=".07"/><text x="400" y="300" font-size="150" text-anchor="middle">${emoji}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function createApi(C) {
  const idag = dayKey(new Date());
  const iso = (off, h, m = 0) => cphToISO(addDays(idag, off), `${pad(h)}:${pad(m)}`);
  const stam = {
    kategorier: KAT,
    maalgrupper: [['alle', 'Alle'], ['boern', 'Børn'], ['unge', 'Unge'], ['voksne', 'Voksne'], ['seniorer', 'Seniorer']].map(([slug, navn], i) => ({ slug, navn, sortering: i * 10 })),
    omraader: [['auning', 'Auning'], ['gammel-auning', 'Gammel Auning'], ['albaek', 'Albæk'], ['skoerring', 'Skørring'], ['omegn', 'Andet i omegnen']].map(([slug, navn], i) => ({ slug, navn, sortering: i * 10 })),
    steder: [
      { id: 's1', navn: 'Forsamlingshuset (demo)', adresse: 'Demovej 1, Auning', omraade: 'auning', lat: 56.4287, lon: 10.3795 },
      { id: 's2', navn: 'Idrætshallen (demo)', adresse: 'Hallevej 2, Auning', omraade: 'auning', lat: 56.4310, lon: 10.3850 },
      { id: 's3', navn: 'Biblioteket (demo)', adresse: 'Torvet 3, Auning', omraade: 'auning', lat: null, lon: null },
    ],
  };
  const afvisning = ['Kommerciel reklame eller tilbud uden et egentligt arrangement', 'Partipropaganda eller kampagne', 'Lukket privat arrangement', 'Uden for kalenderens område', 'Dublet af et eksisterende arrangement', 'Mangler oplysninger', 'Andet']
    .map((tekst, i) => ({ id: i + 1, tekst, aktiv: true }));
  const ordliste = [{ id: 1, ord: 'casino' }, { id: 2, ord: 'bitcoin' }];
  const roller = [{ user_id: 'u1', email: 'demo@eksempel.dk', rolle: 'admin' }];

  const mk = (titel, kat, mg, off, h, varH, sted, omr, pris, arr, beskr, opt = {}) => {
    const k = KAT.find((x) => x[0] === kat || x.slug === kat);
    const s = stam.steder.find((x) => x.navn.startsWith(sted));
    const startTs = iso(off, h);
    const slutTs = opt.slutOff != null ? iso(opt.slutOff, opt.slutH ?? 16) : (varH ? iso(off, h + varH) : null);
    return {
      id: nyId(), titel, beskrivelse: beskr, start_ts: startTs, slut_ts: slutTs,
      slut_eff: slutTs || new Date(new Date(startTs).getTime() + 2 * 3600e3).toISOString(),
      sted_id: s?.id || null, sted_navn: s ? s.navn : sted, adresse: s?.adresse || null, omraade: omr, kategori: kat, maalgruppe: mg,
      pris_tekst: pris, link_url: opt.link || null, billede_sti: null,
      billede_url: opt.billede === false ? null : billede(k.farve ?? k[2], k.ikon ?? k[3], off + h),
      arrangoer: arr, status: opt.status || 'godkendt', skjult: false, afvisningsaarsag: null, flag: opt.flag || [],
      af_moderator: false, serie_id: null, oprettet: new Date().toISOString(),
      kontakt: opt.kontakt || { navn: 'Demo Kontakt', email: 'kontakt@eksempel.dk', telefon: null },
    };
  };
  let events = [
    mk('Fællesspisning i forsamlingshuset', 'forening', 'alle', 0, 17, 3, 'Forsamlingshuset', 'auning', '60 kr.', 'Auning Fællesspisning (demo)', 'Hyggelig aften med trebindsmenu og snak ved langbordene. Tilmelding er ikke nødvendig, men det hjælper køkkenet, hvis I giver besked.\n\nMenu skifter fra gang til gang.'),
    mk('Børnenes juleværksted', 'boern-familie', 'boern', 2, 10, 3, 'Idrætshallen', 'auning', 'Gratis', 'Auning Børneforening (demo)', 'Kreativt værksted for børn i alle aldre. Vi klipper, klistrer og laver julepynt. Forældre er velkomne til at blive og hjælpe.'),
    mk('Koncert med lokalt band', 'musik', 'voksne', 3, 19, 3, 'Forsamlingshuset', 'auning', '100 kr.', 'Auning Musikforening (demo)', 'En aften med live musik fra egnens bedste. Dørene åbner kl. 18.30.', { link: 'https://eksempel.dk/billetter' }),
    mk('Foredrag: Egnens historie', 'foredrag', 'seniorer', 4, 14, 2, 'Biblioteket', 'auning', 'Gratis', 'Lokalhistorisk Forening (demo)', 'Et foredrag om, hvordan egnen har forandret sig gennem hundrede år, med gamle billeder fra arkivet.'),
    mk('Løbeklubbens morgentræning', 'sport', 'voksne', 1, 6, 1, 'Idrætshallen', 'auning', 'Gratis', 'Auning Løbeklub (demo)', 'Fælles løbetur i flere tempogrupper. Alle er velkomne.', { billede: false }),
    mk('Julemarked', 'marked-fest', 'alle', 6, 10, 0, 'Idrætshallen', 'auning', 'Gratis', 'Handelsstandsforeningen (demo)', 'Boder med håndværk, mad og varm kakao. Der er musik og besøg af julemanden lørdag kl. 13.\n\nMere info: https://eksempel.dk/julemarked', { slutOff: 8, slutH: 16 }),
    mk('Bestyrelsesmøde i grundejerforeningen', 'forening', 'voksne', 5, 19, 2, 'Biblioteket', 'auning', null, 'Grundejerforeningen (demo)', 'Åbent møde. Dagsorden udsendes til medlemmer.', { billede: false }),
    mk('Syng-sammen-aften', 'musik', 'alle', 9, 19, 2, 'Forsamlingshuset', 'auning', '30 kr.', 'Sangkoret (demo)', 'Vi synger de gode gamle sange. Sangbøger udleveres.'),
    mk('Børnebio: Familiefilm', 'boern-familie', 'boern', 10, 14, 2, 'Biblioteket', 'auning', 'Gratis', 'Biblioteket (demo)', 'Filmen vælges af børnene. Popcorn kan købes.'),
    mk('Fodboldturnering for ungdom', 'sport', 'unge', 11, 9, 7, 'Idrætshallen', 'auning', '20 kr.', 'Auning Boldklub (demo)', 'Hold fra hele området. Kiosken er åben hele dagen.'),
    mk('Vinsmagning', 'marked-fest', 'voksne', 13, 19, 3, 'Forsamlingshuset', 'auning', '250 kr.', 'Vinklubben (demo)', 'Seks vine og små retter. Begrænset antal pladser.'),
    mk('Generalforsamling', 'forening', 'voksne', 14, 19, 2, 'Forsamlingshuset', 'albaek', 'Gratis', 'Albæk Borgerforening (demo)', 'Ordinær generalforsamling med spisning efterfølgende.'),
    mk('Julekoncert i kirken', 'musik', 'alle', 16, 19, 2, 'Kirken (demo)', 'auning', 'Gratis', 'Menighedsrådet (demo)', 'Koret synger julen ind.', { billede: false }),
    mk('Dansk Folkedans', 'sport', 'seniorer', 7, 10, 2, 'Idrætshallen', 'auning', '20 kr.', 'Folkedanserne (demo)', 'Dans for alle, nybegyndere er velkomne.'),
    mk('Foredrag om fugle i haven', 'foredrag', 'alle', 21, 19, 2, 'Biblioteket', 'auning', 'Gratis', 'Naturklubben (demo)', 'Hvordan lokker man flere fugle til haven? Med lysbilleder og kaffe.'),
    mk('Nytårskur', 'marked-fest', 'voksne', 25, 14, 2, 'Forsamlingshuset', 'auning', 'Gratis', 'Handelsstandsforeningen (demo)', 'Et glas bobler og en kransekage.'),
    // Afventende (kun synlige for moderator)
    mk('Loppemarked i garagen', 'marked-fest', 'alle', 12, 10, 4, 'Privat adresse', 'gammel-auning', 'Gratis', 'Privatperson (demo)', 'Lopper, bøger og legetøj.', { status: 'afventer', billede: false, kontakt: { navn: 'Pia Privat', email: 'pia@eksempel.dk', telefon: '12 34 56 78' } }),
    mk('Gratis casino-aften!!!', 'andet', 'voksne', 15, 20, 3, 'Ukendt', 'omegn', 'Gratis', 'XYZ Reklame (demo)', 'Kom og spil. Mere info https://a.dk https://b.dk https://c.dk', { status: 'afventer', billede: false, flag: ['ordliste: casino', 'mange links'], kontakt: { navn: 'Ukendt', email: 'spam@eksempel.dk', telefon: null } }),
  ];
  const kopi = (x) => JSON.parse(JSON.stringify(x));
  const søgSlut = (e) => new Date(e.slut_eff);
  let bruger = null;
  let rolle = null;
  const lyttere = [];
  const meld = () => lyttere.forEach((f) => f(bruger));
  const vent = (v) => new Promise((r) => setTimeout(() => r(kopi(v)), 120));
  const tabeller = { kk_kategorier: ['slug', stam.kategorier], kk_maalgrupper: ['slug', stam.maalgrupper], kk_omraader: ['slug', stam.omraader], kk_steder: ['id', stam.steder], kk_afvisningsaarsager: ['id', afvisning], kk_ordliste: ['id', ordliste] };
  const offentlig = (e) => ['godkendt', 'aflyst'].includes(e.status) && !e.skjult;
  const start1jan = () => new Date(cphToISO(`${new Date().getFullYear()}-01-01`, '00:00'));

  return {
    async init() { return bruger; },
    onAuth(cb) { lyttere.push(cb); },
    async sikrSession() { if (!bruger) { bruger = { id: 'anon', email: null, anonym: true }; meld(); } return bruger; },
    async login(email, kode) {
      if (kode !== 'demo') throw new Error('Demo: brug koden "demo" og en vilkårlig e-mail.');
      bruger = { id: 'u1', email, anonym: false }; rolle = 'admin'; meld();
    },
    async opretKonto() { return { kraeverBekraeftelse: false }; },
    async logud() { bruger = null; rolle = null; meld(); },
    async minRolle() { return rolle; },
    async hentStamdata() { return vent(stam); },
    async hentEvents() { return vent(events.filter(offentlig).filter((e) => søgSlut(e) >= start1jan()).sort((a, b) => a.start_ts.localeCompare(b.start_ts)).map(({ kontakt, ...r }) => r)); },
    async hentEvent(id) { const e = events.find((x) => x.id === id); if (!e) return null; if (!offentlig(e) && !rolle) return null; const { kontakt, ...r } = e; return vent(r); },
    async konflikter(a) {
      const s = new Date(a.start), e = a.slut ? new Date(a.slut) : new Date(s.getTime() + 2 * 3600e3);
      const sd = dayKey(s), ed = dayKey(e);
      return vent(events.filter((x) => ['godkendt', 'afventer'].includes(x.status) && !x.skjult && x.id !== a.ekskluder)
        .filter((x) => dayKey(x.start_ts) <= ed && dayKey(new Date(new Date(x.slut_eff).getTime() - 60000)) >= sd)
        .map((x) => ({
          id: x.id, titel: x.status === 'godkendt' ? x.titel : null, start_ts: x.start_ts, slut_eff: x.slut_eff, sted_navn: x.sted_navn, maalgruppe: x.maalgruppe, kategori: x.kategori, status: x.status,
          tid_overlap: new Date(x.start_ts) < e && new Date(x.slut_eff) > s,
          sted_match: (!!a.sted_id && x.sted_id === a.sted_id) || (!!a.sted_navn && (x.sted_navn || '').trim().toLowerCase() === a.sted_navn.trim().toLowerCase()),
          maalgruppe_match: x.maalgruppe === a.maalgruppe || x.maalgruppe === 'alle' || a.maalgruppe === 'alle',
        })));
    },
    async uploadBillede(blob) { const sti = nyId() + '.jpg'; this._billeder = this._billeder || {}; this._billeder[sti] = URL.createObjectURL(blob); return sti; },
    async opret(ev, kontakt) {
      const ids = [];
      const serie = ev.perioder.length > 1 ? nyId() : null;
      for (const p of ev.perioder) {
        const { perioder, ...resten } = ev;
        const k = KAT.find((x) => x.slug === ev.kategori);
        const slut = p.slut || null;
        const nyE = {
          ...resten, id: nyId(), start_ts: p.start, slut_ts: slut,
          slut_eff: slut || new Date(new Date(p.start).getTime() + 2 * 3600e3).toISOString(),
          status: rolle ? (ev.status || 'afventer') : 'afventer', skjult: false, afvisningsaarsag: null, flag: [], serie_id: serie,
          billede_url: ev.billede_sti?.startsWith('standard:') ? standardBilledeUrl(ev.billede_sti.slice('standard:'.length)) : ev.billede_sti ? (this._billeder || {})[ev.billede_sti] : billede(k.farve, k.ikon, ids.length),
          kontakt: kontakt && kontakt.navn ? kontakt : null, oprettet: new Date().toISOString(),
        };
        events.push(nyE); ids.push(nyE.id);
      }
      return vent(ids);
    },
    async rettelink(id) { return 'demo-' + id; },
    async retHent(token) {
      const e = events.find((x) => 'demo-' + x.id === token);
      if (!e || e.status === 'afvist' || e.status === 'kladde') return null;
      const v = (this._aendr || []).find((a) => a.event_id === e.id && a.status === 'afventer');
      const { kontakt, billede_url, ...r } = e;
      return { ...r, ventende: v ? { forslag: v.forslag, kommentar: v.kommentar, aflys: v.aflys } : null };
    },
    async retSend(token, forslag, kommentar, aflys) {
      const e = events.find((x) => 'demo-' + x.id === token);
      if (!e) throw new Error('Linket virker ikke længere');
      if (e.status === 'afventer') { Object.assign(e, forslag); return 'direkte'; }
      this._aendr = (this._aendr || []).filter((a) => !(a.event_id === e.id && a.status === 'afventer'));
      this._aendr.push({ id: nyId(), event_id: e.id, forslag, kommentar: kommentar || null, aflys: !!aflys && e.status === 'godkendt', status: 'afventer', oprettet: new Date().toISOString() });
      return 'afventer';
    },
    async hentAendringer() { return vent((this._aendr || []).filter((a) => a.status === 'afventer')); },
    async godkendAendring(id) {
      const a = (this._aendr || []).find((x) => x.id === id); if (!a) return;
      const e = events.find((x) => x.id === a.event_id);
      Object.assign(e, a.forslag, { slut_eff: a.forslag.slut_ts || new Date(new Date(a.forslag.start_ts).getTime() + 2 * 3600e3).toISOString() });
      if (a.aflys) e.status = 'aflyst';
      a.status = 'godkendt';
    },
    async afvisAendring(id) { const a = (this._aendr || []).find((x) => x.id === id); if (a) a.status = 'afvist'; },
    async pushGem(a) { this._push = { ...a, foelger: this._push?.foelger || [] }; },
    async pushAfmeld() { this._push = null; },
    async pushFoelg(_e, ids) { if (this._push) this._push.foelger = ids; },
    async hentModEvents() { return vent(events.slice().sort((a, b) => a.start_ts.localeCompare(b.start_ts))); },
    async hentModEvent(id) { return vent(events.find((e) => e.id === id) || null); },
    async opdaterEvent(id, patch) {
      const e = events.find((x) => x.id === id); Object.assign(e, patch);
      if ('start_ts' in patch || 'slut_ts' in patch) e.slut_eff = e.slut_ts || new Date(new Date(e.start_ts).getTime() + 2 * 3600e3).toISOString();
      return vent(true);
    },
    async gemKontakt(id, k) { const e = events.find((x) => x.id === id); if (e && k?.navn) e.kontakt = k; },
    async skiftBillede(id, gammel, blob) { const sti = await this.uploadBillede(blob); const e = events.find((x) => x.id === id); e.billede_sti = sti; e.billede_url = this._billeder[sti]; return sti; },
    async skiftStandardBillede(id, _gammel, standardId) { const e = events.find((x) => x.id === id); e.billede_sti = `standard:${standardId}`; e.billede_url = standardBilledeUrl(standardId); },
    async fjernEventBillede(id) { const e = events.find((x) => x.id === id); e.billede_sti = null; e.billede_url = null; },
    async sletEvent(id) { events = events.filter((e) => e.id !== id); },
    async hentRoller() { return vent(roller); },
    async tildelRolle(email, r) { const i = roller.findIndex((x) => x.email === email); if (r === 'ingen') { if (i >= 0) roller.splice(i, 1); } else if (i >= 0) roller[i].rolle = r; else roller.push({ user_id: nyId(), email, rolle: r }); },
    async inviterModerator() { throw new Error('Rigtige invitationer kræver den tilkoblede Supabase-database.'); },
    async moderatorInvitationAfventer() { return false; },
    async accepterModeratorInvitation() { throw new Error('Moderatorinvitationer virker kun i den tilkoblede Supabase-database.'); },
    async hentTabel(t) { return vent(tabeller[t][1]); },
    async gemRække(t, r) {
      const [pk, liste] = tabeller[t]; const i = liste.findIndex((x) => x[pk] === r[pk]);
      if (i >= 0) liste[i] = { ...liste[i], ...r }; else liste.push({ ...r, id: r.id ?? (t === 'kk_steder' ? nyId() : liste.length + 100) });
    },
    async sletRække(t, pk, v) { const l = tabeller[t][1]; const i = l.findIndex((x) => x[pk] === v); if (i >= 0) l.splice(i, 1); },
    async hentAfvisningsaarsager() { return vent(afvisning); },
    async hentUbrugteBilleder() { return vent([]); },
    async sletBilleder() {},
    async hentGamle() { return vent([]); },
    async rydGamle() { return 0; },
  };
}
