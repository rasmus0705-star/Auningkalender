// Moderator- og adminområde: login, godkendelseskø, redigering, roller, indhold og oprydning.
import { CONFIG } from './config.js';
import { h, icon, clear, hvornaar, kortTid, decorate, toast, dialog, bekraeft, captcha, fmt, dayKey, tidTekst } from './util.js';
import { S, kat, opdaterRolle, indlaesStamdata, maalgruppeNavn, omraadeNavn, rettelinkUrl } from './state.js';
import { skeletter, tomtState, katPille, media } from './ui.js';

// =========================== LOGIN ===========================
export async function visMod(root) {
  if (!S.rolle) {
    if (!S.demo && S.user && !S.user.anonym) {
      try { if (await S.api.moderatorInvitationAfventer()) return visModeratorInvitation(root); } catch { /* almindeligt login */ }
    }
    return visLogin(root);
  }
  return visDashboard(root);
}

function visModeratorInvitation(root) {
  const adgangskode = h('input', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password', placeholder: 'Mindst 8 tegn' });
  const gentag = h('input', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password', placeholder: 'Gentag adgangskoden' });
  const fejl = h('div', { class: 'fejl samlet', role: 'alert' });
  const knap = h('button', { class: 'knap primær stor', type: 'submit' }, 'Accepter invitation');
  const form = h('form', { class: 'form', onsubmit: async (ev) => {
    ev.preventDefault(); fejl.textContent = '';
    if (adgangskode.value !== gentag.value) { fejl.textContent = 'Adgangskoderne er ikke ens.'; return; }
    knap.disabled = true;
    try {
      await S.api.accepterModeratorInvitation(adgangskode.value);
      await opdaterRolle();
      toast('Invitation accepteret. Du er nu moderator.', 'ok');
      root.replaceChildren(); await visMod(root);
    } catch (e) { fejl.textContent = e.message; knap.disabled = false; }
  } },
  h('div', { class: 'felt' }, h('label', null, 'Vælg adgangskode'), adgangskode),
  h('div', { class: 'felt' }, h('label', null, 'Gentag adgangskode'), gentag),
  fejl, knap);
  clear(root).append(h('div', { class: 'login' },
    h('h1', null, icon('lock', 26), ' Moderatorinvitation'),
    h('p', { class: 'dæmpet' }, `Invitationen er sendt til ${S.user?.email || 'din e-mail'}. Vælg en adgangskode for at acceptere den.`),
    form));
}

function visLogin(root) {
  let opret = false;
  const boks = h('div', { class: 'login' });
  const capBox = h('div', { class: 'captcha' });
  let cap = { token: () => null, reset() {}, aktiv: false };
  captcha(capBox).then((c) => { cap = c; }).catch(() => {});

  const tegn = () => {
    const email = h('input', { type: 'email', id: 'l-email', required: true, autocomplete: 'email', placeholder: 'din@mail.dk' });
    const kode = h('input', { type: 'password', id: 'l-kode', required: true, autocomplete: opret ? 'new-password' : 'current-password', minlength: opret ? 8 : null, placeholder: opret ? 'Mindst 8 tegn' : '' });
    const fejl = h('div', { class: 'fejl samlet', role: 'alert' });
    const knap = h('button', { class: 'knap primær stor', type: 'submit' }, opret ? 'Opret konto' : 'Log ind');
    const form = h('form', { class: 'form', onsubmit: async (ev) => {
      ev.preventDefault(); fejl.textContent = ''; knap.disabled = true;
      try {
        if (opret) {
          const r = await S.api.opretKonto(email.value.trim(), kode.value, cap.token());
          toast(r.kraeverBekraeftelse ? 'Konto oprettet – tjek din e-mail for bekræftelseslink.' : 'Konto oprettet.', 'ok');
          if (r.kraeverBekraeftelse) { opret = false; tegn(); return; }
        } else await S.api.login(email.value.trim(), kode.value, cap.token());
        S.user = (await (S.api.init?.())) || S.user;
        await opdaterRolle();
        root.replaceChildren(); await visMod(root);
      } catch (e) { fejl.textContent = /invalid login/i.test(e.message) ? 'Forkert e-mail eller adgangskode.' : e.message; cap.reset(); knap.disabled = false; }
    } },
    h('div', { class: 'felt' }, h('label', { for: 'l-email' }, 'E-mail'), email),
    h('div', { class: 'felt' }, h('label', { for: 'l-kode' }, 'Adgangskode'), kode),
    capBox, fejl, knap);
    clear(boks).append(
      h('h1', null, icon('lock', 26), ' Moderator'),
      h('p', { class: 'dæmpet' }, opret ? 'Opret en konto. En admin skal bagefter give dig moderator-rettigheder, før du kan godkende arrangementer.' : 'Log ind for at godkende og redigere arrangementer.'),
      S.demo ? h('div', { class: 'banner' }, icon('info', 16), 'DEMO: skriv en vilkårlig e-mail og koden «demo».') : null,
      form,
      h('button', { class: 'knap sekundær', type: 'button', onclick: () => { opret = !opret; tegn(); } }, opret ? 'Jeg har allerede en konto' : 'Ny moderator? Opret konto'),
      S.user && !S.user.anonym && !S.rolle ? h('div', { class: 'banner' }, icon('alert', 16), `Du er logget ind som ${S.user.email}, men har endnu ikke rettigheder. Bed en admin om at tildele dem. `,
        h('button', { class: 'knap sekundær lille-knap', onclick: async () => { await S.api.logud(); S.user = null; tegn(); } }, 'Log ud')) : null);
  };
  tegn();
  root.append(boks);
}

// =========================== DASHBOARD ===========================
// Forskelle på rettelsesforslag
const tidFmt = (x) => (x ? `${fmt.dagKort(new Date(x))} ${tidTekst(x)}` : '–');
const FELTER = [
  ['titel', 'Titel'], ['beskrivelse', 'Beskrivelse'], ['start_ts', 'Start', tidFmt], ['slut_ts', 'Slut', tidFmt],
  ['sted', 'Sted', (v) => v || '–'], ['kategori', 'Kategori', (v) => kat(v).navn], ['maalgruppe', 'Målgruppe', maalgruppeNavn], ['omraade', 'Område', (v) => omraadeNavn(v) || '–'],
  ['pris_tekst', 'Pris'], ['link_url', 'Link'], ['arrangoer', 'Arrangør'],
];
const stedTekst = (o) => [o.sted_navn, o.adresse].filter(Boolean).join(', ');

const FANER = [['afventer', 'Afventer'], ['kommende', 'Kommende'], ['kladde', 'Kladder'], ['lukket', 'Afvist / aflyst'], ['arkiv', 'Arkiv']];
const ADMIN_FANER = [['steder', 'Steder'], ['roller', 'Roller'], ['indhold', 'Indhold'], ['oprydning', 'Oprydning']];

async function visDashboard(root) {
  const admin = S.rolle === 'admin';
  S.modFane = S.modFane || 'afventer';
  const indhold = h('div', { class: 'mod-indhold' }, skeletter(3));
  const faneRække = h('nav', { class: 'faner', 'aria-label': 'Moderator' });
  let events = [];
  let aendringer = [];
  let q = '';

  root.append(
    h('div', { class: 'mod-top' },
      h('div', null, h('h1', null, 'Moderator'), h('p', { class: 'dæmpet' }, `${S.user?.email || ''} · `, h('span', { class: 'rolle-badge' }, admin ? 'Admin' : 'Moderator'))),
      h('div', { class: 'mod-top-knapper' },
        h('a', { class: 'knap primær', href: '#/opret' }, icon('plus', 18), ' Nyt arrangement'),
        h('button', { class: 'knap sekundær', onclick: async () => { await S.api.logud(); S.user = null; S.rolle = null; location.hash = '#/'; } }, 'Log ud'))),
    faneRække, indhold);

  async function hentAlt() {
    events = (await S.api.hentModEvents()).map(decorate);
    try { aendringer = await S.api.hentAendringer(); } catch { aendringer = []; }
  }
  try { await hentAlt(); } catch (e) { clear(indhold).append(tomtState('Kunne ikke hente arrangementer', e.message)); return; }
  tegnFaner(); tegnFane();

  function antal(f) { return events.filter((e) => passer(e, f)).length + (f === 'afventer' ? aendringer.length : 0); }
  function passer(e, f) {
    const nu = new Date();
    switch (f) {
      case 'afventer': return e.status === 'afventer';
      case 'kommende': return e.status === 'godkendt' && e._slutEff >= nu;
      case 'kladde': return e.status === 'kladde';
      case 'lukket': return (e.status === 'afvist' || e.status === 'aflyst') && e._slutEff >= nu;
      case 'arkiv': return e._slutEff < nu;
      default: return true;
    }
  }
  function tegnFaner() {
    const alle = [...FANER, ...(admin ? ADMIN_FANER : [ADMIN_FANER[0]])];
    clear(faneRække).append(...alle.map(([k, t]) => h('button', { type: 'button', class: 'fane' + (S.modFane === k ? ' på' : ''), onclick: () => { S.modFane = k; tegnFaner(); tegnFane(); } },
      t, FANER.some((x) => x[0] === k) ? h('span', { class: 'tæller' + (k === 'afventer' && antal(k) ? ' alarm' : '') }, antal(k)) : null)));
  }

  async function tegnFane() {
    const f = S.modFane;
    if (f === 'steder') return redigerTabel(indhold, 'kk_steder');
    if (f === 'roller') return visRoller(indhold);
    if (f === 'indhold') return visIndhold(indhold);
    if (f === 'oprydning') return visOprydning(indhold);

    const søg = h('input', { type: 'search', placeholder: 'Søg i titel, arrangør, kontakt …', value: q, class: 'søg-input', 'aria-label': 'Søg' });
    const liste = h('div', { class: 'mod-liste' });
    const tegnListe = () => {
      const ql = q.trim().toLowerCase();
      let rows = events.filter((e) => passer(e, f)).filter((e) => !ql || `${e.titel} ${e.arrangoer} ${e.kontakt?.navn || ''} ${e.kontakt?.email || ''} ${e.sted_navn || ''}`.toLowerCase().includes(ql));
      rows = rows.sort((a, b) => (f === 'arkiv' ? b._start - a._start : a._start - b._start));
      clear(liste);
      if (!rows.length) { liste.append(tomtState(f === 'afventer' ? 'Ingen afventer godkendelse 🎉' : 'Ingen arrangementer her', null)); return; }
      rows.forEach((e) => liste.append(række(e)));
    };
    søg.addEventListener('input', () => { q = søg.value; tegnListe(); });
    const bulk = f === 'afventer' && events.some((e) => e.status === 'afventer' && !e.flag?.length)
      ? h('button', { class: 'knap sekundær', onclick: async () => {
        const gode = events.filter((e) => e.status === 'afventer' && !e.flag?.length);
        if (!(await bekraeft('Godkend alle uden advarsler?', `${gode.length} arrangementer uden advarsler godkendes og vises med det samme.`, 'Godkend alle'))) return;
        await handling(async () => { for (const e of gode) await S.api.opdaterEvent(e.id, { status: 'godkendt', afvisningsaarsag: null }); }, `${gode.length} godkendt`);
      } }, icon('check', 18), ' Godkend alle uden advarsler') : null;
    clear(indhold).append(f === 'afventer' ? aendringBox() : null, h('div', { class: 'mod-værktøj' }, søg, bulk), liste);
    tegnListe();
  }

  async function handling(fn, besked) {
    try { await fn(); S.hentetTid = 0; await hentAlt(); tegnFaner(); tegnFane(); if (besked) toast(besked, 'ok'); }
    catch (e) { console.error(e); toast(e.message || 'Noget gik galt', 'fejl'); }
  }

  function række(e) {
    const st = e.status;
    const patch = (p, msg) => () => handling(() => S.api.opdaterEvent(e.id, p), msg);
    const knapper = [];
    const kn = (tekst, ik, fn, klasse = 'sekundær') => h('button', { type: 'button', class: `knap ${klasse} lille-knap`, onclick: fn }, icon(ik, 16), ' ', tekst);
    if (st === 'afventer' || st === 'afvist') knapper.push(kn('Godkend', 'check', patch({ status: 'godkendt', afvisningsaarsag: null }, 'Godkendt'), 'primær'));
    if (st === 'kladde') knapper.push(kn('Udgiv', 'check', patch({ status: 'godkendt' }, 'Udgivet'), 'primær'));
    if (st === 'aflyst') knapper.push(kn('Genåbn', 'check', patch({ status: 'godkendt' }, 'Genåbnet'), 'primær'));
    if (st === 'afventer') knapper.push(kn('Afvis', 'x', () => afvis(e), 'fare-lys'));
    knapper.push(h('a', { class: 'knap sekundær lille-knap', href: `#/ret/${e.id}` }, icon('edit', 16), ' Ret'));
    if (st === 'godkendt') knapper.push(kn('Aflys', 'alert', patch({ status: 'aflyst' }, 'Aflyst')));
    if (st === 'godkendt' || st === 'aflyst') knapper.push(kn(e.skjult ? 'Vis' : 'Skjul', 'eye', patch({ skjult: !e.skjult }, e.skjult ? 'Vises igen' : 'Skjult')));
    knapper.push(h('a', { class: 'knap sekundær lille-knap', href: `#/kopi/${e.id}` }, icon('copy', 16), ' Dupliker'));
    if (st === 'godkendt' || st === 'afventer' || st === 'aflyst') knapper.push(kn('Rettelink', 'copy', async () => {
      try { const url = rettelinkUrl(await S.api.rettelink(e.id)); await navigator.clipboard.writeText(url); toast('Rettelink kopieret – send det til arrangøren', 'ok'); }
      catch (err) { toast(err.message || 'Kunne ikke lave rettelink', 'fejl'); }
    }));
    knapper.push(kn('Slet', 'trash', async () => {
      if (await bekraeft('Slet arrangement?', `«${e.titel}» slettes for altid, inkl. kontaktoplysninger og billede.`, 'Slet', true)) await handling(() => S.api.sletEvent(e.id, e.billede_sti), 'Slettet');
    }, 'fare-lys'));
    const serieAntal = e.serie_id ? events.filter((x) => x.serie_id === e.serie_id && x._start >= e._start).length : 0;
    if (serieAntal > 1) knapper.push(kn(`Slet serien herfra (${serieAntal})`, 'repeat', async () => {
      if (await bekraeft('Slet serie?', `Denne og de ${serieAntal - 1} efterfølgende gentagelser slettes.`, 'Slet serien', true))
        await handling(async () => { for (const x of events.filter((y) => y.serie_id === e.serie_id && y._start >= e._start)) await S.api.sletEvent(x.id, x.billede_sti); }, 'Serie slettet');
    }, 'fare-lys'));

    const k = e.kontakt;
    return h('article', { class: `mod-række s-${st}${e.skjult ? ' skjult' : ''}`, style: `--c:${kat(e.kategori).farve}` },
      h('div', { class: 'mr-media' }, media(e)),
      h('div', { class: 'mr-krop' },
        h('div', { class: 'mr-top' }, h('span', { class: `status-badge ${st}` }, st), e.skjult ? h('span', { class: 'status-badge skjult' }, 'skjult') : null, katPille(e.kategori), e.serie_id ? h('span', { class: 'mini-tag' }, 'serie') : null,
          ...(e.flag || []).map((f) => h('span', { class: 'flag' }, icon('alert', 13), f))),
        h('h3', null, h('a', { href: `#/event/${e.id}` }, e.titel)),
        h('p', { class: 'mr-linje' }, `${hvornaar(e)}`),
        h('p', { class: 'mr-linje dæmpet' }, [e.sted_navn, e.arrangoer && 'Arr.: ' + e.arrangoer].filter(Boolean).join(' · ')),
        k ? h('p', { class: 'mr-kontakt' }, icon('user', 14), k.navn, k.email ? [' · ', h('a', { href: `mailto:${k.email}` }, k.email)] : null, k.telefon ? [' · ', h('a', { href: `tel:${k.telefon.replace(/\s/g, '')}` }, k.telefon)] : null) : null,
        e.afvisningsaarsag ? h('p', { class: 'mr-afvist' }, 'Afvist: ', e.afvisningsaarsag) : null,
        e.beskrivelse && st === 'afventer' ? h('details', { class: 'mr-beskr' }, h('summary', null, 'Læs beskrivelse'), h('p', null, e.beskrivelse)) : null),
      h('div', { class: 'mr-knapper' }, knapper));
  }

  // ---------- foreslåede rettelser fra arrangører ----------
  function forskelle(e, f) {
    const gl = { ...e, sted: stedTekst(e) }, ny = { ...f, sted: stedTekst(f) };
    return FELTER.map(([k, navn, fmtFn]) => {
      const a = k.endsWith('_ts') ? (gl[k] ? new Date(gl[k]).getTime() : null) : (gl[k] || null);
      const b = k.endsWith('_ts') ? (ny[k] ? new Date(ny[k]).getTime() : null) : (ny[k] || null);
      if (a === b) return null;
      const vis = (v) => (fmtFn ? fmtFn(v) : v || '–');
      return { navn, fra: vis(gl[k]), til: vis(ny[k]) };
    }).filter(Boolean);
  }
  function aendringBox() {
    if (!aendringer.length) return null;
    return h('section', { class: 'aendringer' },
      h('h2', null, icon('edit', 20), ` Foreslåede rettelser (${aendringer.length})`),
      h('p', { class: 'dæmpet' }, 'Arrangører har foreslået ændringer via deres rettelink. Intet er ændret, før du godkender.'),
      ...aendringer.map((a) => {
        const e = events.find((x) => x.id === a.event_id);
        if (!e) return null;
        const diff = forskelle(e, a.forslag);
        const k = e.kontakt;
        return h('article', { class: 'aendring' },
          h('h3', null, h('a', { href: `#/event/${e.id}` }, e.titel)),
          a.aflys ? h('p', { class: 'flag' }, icon('alert', 13), 'Arrangøren oplyser, at arrangementet er aflyst') : null,
          a.kommentar ? h('p', { class: 'aendring-kommentar' }, `”${a.kommentar}”`) : null,
          diff.length ? h('table', { class: 'diff' }, h('tbody', null, diff.map((d) => h('tr', null, h('th', null, d.navn), h('td', { class: 'fra' }, d.fra), h('td', { class: 'pil' }, '→'), h('td', { class: 'til' }, d.til)))))
            : h('p', { class: 'dæmpet' }, 'Ingen ændringer i felterne.'),
          k ? h('p', { class: 'mr-kontakt' }, icon('user', 14), k.navn, k.email ? [' · ', h('a', { href: `mailto:${k.email}` }, k.email)] : null, k.telefon ? [' · ', h('a', { href: `tel:${k.telefon.replace(/\s/g, '')}` }, k.telefon)] : null) : null,
          h('div', { class: 'mr-knapper' },
            h('button', { type: 'button', class: 'knap primær lille-knap', onclick: () => handling(() => S.api.godkendAendring(a.id), a.aflys ? 'Rettelse godkendt – arrangementet er aflyst' : 'Rettelse godkendt') }, icon('check', 16), ' Godkend'),
            h('button', { type: 'button', class: 'knap sekundær lille-knap fare-lys', onclick: async () => { if (await bekraeft('Afvis rettelse?', 'Forslaget kasseres, og arrangementet forbliver uændret.', 'Afvis', true)) await handling(() => S.api.afvisAendring(a.id), 'Rettelse afvist'); } }, icon('x', 16), ' Afvis'),
            h('a', { class: 'knap sekundær lille-knap', href: `#/ret/${e.id}` }, icon('edit', 16), ' Ret selv')));
      }));
  }

  async function afvis(e) {
    let årsager = [];
    try { årsager = await S.api.hentAfvisningsaarsager(); } catch { /* ingen liste */ }
    const sel = h('select', { class: 'fuld' }, årsager.map((a) => h('option', { value: a.tekst }, a.tekst)));
    const note = h('input', { type: 'text', class: 'fuld', placeholder: 'Evt. egen note (valgfri)' });
    const svar = await dialog({ titel: 'Afvis arrangement', indhold: h('div', { class: 'form' }, h('p', null, `«${e.titel}»`), h('div', { class: 'felt' }, h('label', null, 'Årsag'), sel), h('div', { class: 'felt' }, h('label', null, 'Note'), note)),
      knapper: [{ tekst: 'Annuller', værdi: null }, { tekst: 'Afvis', fare: true, værdi: () => [sel.value, note.value.trim()] }] });
    if (!svar) return;
    await handling(() => S.api.opdaterEvent(e.id, { status: 'afvist', afvisningsaarsag: [svar[0], svar[1]].filter(Boolean).join(' – ') }), 'Afvist');
  }
}

// =========================== ROLLER ===========================
async function visRoller(root) {
  clear(root).append(skeletter(2));
  let roller = [];
  try { roller = await S.api.hentRoller(); } catch (e) { clear(root).append(tomtState('Kunne ikke hente roller', e.message)); return; }
  const tegn = () => {
    const nyEmail = h('input', { type: 'email', placeholder: 'e-mail på eksisterende konto', id: 'ny-rolle-email', class: 'fuld' });
    const nyRolle = h('select', { id: 'ny-rolle-valg' }, h('option', { value: 'moderator' }, 'Moderator'), h('option', { value: 'admin' }, 'Admin'));
    const inviteEmail = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'ny.moderator@example.dk', class: 'fuld' });
    const inviteError = h('div', { class: 'fejl samlet', role: 'alert' });
    const inviteButton = h('button', { class: 'knap primær', type: 'submit' }, 'Send invitation');
    const gem = async (email, rolle) => {
      try { await S.api.tildelRolle(email, rolle); toast('Rolle opdateret', 'ok'); roller = await S.api.hentRoller(); tegn(); }
      catch (e) { toast(e.message, 'fejl'); }
    };
    const inviteForm = h('form', { class: 'række-inline', onsubmit: async (ev) => {
      ev.preventDefault(); inviteError.textContent = ''; inviteButton.disabled = true;
      try {
        await S.api.inviterModerator(inviteEmail.value.trim());
        toast(`Moderatorinvitation sendt til ${inviteEmail.value.trim()}.`, 'ok');
        inviteEmail.value = '';
      } catch (e) { inviteError.textContent = e.message; }
      inviteButton.disabled = false;
    } }, inviteEmail, inviteButton);
    clear(root).append(
      h('div', { class: 'panel' },
        h('h2', null, 'Roller'),
        h('p', { class: 'dæmpet' }, 'Moderatorer kan godkende, rette og slette arrangementer og redigere steder. Admins kan derudover tildele roller, ændre kalenderindhold og invitere nye moderatorer.'),
        h('ul', { class: 'rolle-liste' }, roller.map((r) => h('li', null,
          h('span', { class: 'rolle-email' }, r.email),
          h('select', { 'aria-label': `Rolle for ${r.email}`, onchange: (ev) => gem(r.email, ev.target.value), value: r.rolle },
            h('option', { value: 'moderator' }, 'Moderator'), h('option', { value: 'admin' }, 'Admin'), h('option', { value: 'ingen' }, 'Fjern rolle'))))),
        h('h3', null, 'Tildel rolle til eksisterende konto'),
        h('div', { class: 'række-inline' }, nyEmail, nyRolle, h('button', { class: 'knap primær', onclick: () => { if (nyEmail.value.trim()) gem(nyEmail.value.trim(), nyRolle.value); } }, 'Tildel'))),
      h('div', { class: 'panel' },
        h('h2', null, 'Invitér ny moderator'),
        h('p', { class: 'dæmpet' }, 'Send en Supabase-invitation til e-mailadressen. Modtageren følger linket, vælger en adgangskode og får moderatorrollen, når invitationen accepteres.'),
        inviteForm, inviteError));
  };
  tegn();
}

// =========================== INDHOLD (opslagstabeller) ===========================
const TABELLER = {
  kk_kategorier: { titel: 'Kategorier', pk: 'slug', felter: [['slug', 'Kode', 'kode'], ['navn', 'Navn', 'text'], ['ikon', 'Ikon', 'emoji'], ['farve', 'Farve', 'color'], ['sortering', 'Rækkefølge', 'number'], ['aktiv', 'Aktiv', 'bool']] },
  kk_maalgrupper: { titel: 'Målgrupper', pk: 'slug', felter: [['slug', 'Kode', 'kode'], ['navn', 'Navn', 'text'], ['sortering', 'Rækkefølge', 'number'], ['aktiv', 'Aktiv', 'bool']] },
  kk_omraader: { titel: 'Områder', pk: 'slug', felter: [['slug', 'Kode', 'kode'], ['navn', 'Navn', 'text'], ['sortering', 'Rækkefølge', 'number'], ['aktiv', 'Aktiv', 'bool']] },
  kk_steder: { titel: 'Steder', pk: 'id', felter: [['navn', 'Navn', 'text'], ['adresse', 'Adresse', 'text'], ['omraade', 'Område', 'omraade'], ['lat', 'Breddegrad', 'tal'], ['lon', 'Længdegrad', 'tal'], ['sortering', 'Rækkefølge', 'number'], ['aktiv', 'Aktiv', 'bool']] },
  kk_afvisningsaarsager: { titel: 'Afvisningsårsager', pk: 'id', felter: [['tekst', 'Tekst', 'text'], ['aktiv', 'Aktiv', 'bool']] },
  kk_ordliste: { titel: 'Ordliste (advarsler)', pk: 'id', felter: [['ord', 'Ord eller udtryk', 'text']] },
};

function visIndhold(root) {
  const valg = ['kk_kategorier', 'kk_maalgrupper', 'kk_omraader', 'kk_afvisningsaarsager', 'kk_ordliste'];
  let aktuel = S.modIndhold || valg[0];
  const bund = h('div');
  const knapper = h('div', { class: 'under-faner' });
  const tegn = () => {
    clear(knapper).append(...valg.map((t) => h('button', { class: 'chip' + (t === aktuel ? ' på' : ''), onclick: () => { aktuel = S.modIndhold = t; tegn(); } }, TABELLER[t].titel)));
    redigerTabel(bund, aktuel);
  };
  clear(root).append(knapper, bund);
  tegn();
}

async function redigerTabel(root, tabel) {
  const T = TABELLER[tabel];
  clear(root).append(skeletter(2));
  let rows = [];
  try { rows = await S.api.hentTabel(tabel); } catch (e) { clear(root).append(tomtState('Kunne ikke hente', e.message)); return; }
  const admin = S.rolle === 'admin';
  const nyRække = {};

  const inputFor = (f, række, ny) => {
    const [k, , type] = f;
    const v = række[k];
    if (type === 'bool') return h('input', { type: 'checkbox', checked: v !== false && (v === true || ny), 'aria-label': f[1], onchange: (e) => { række[k] = e.target.checked; } });
    if (type === 'color') return h('input', { type: 'color', value: v || '#1f6f54', oninput: (e) => { række[k] = e.target.value; } });
    if (type === 'omraade') return h('select', { onchange: (e) => { række[k] = e.target.value || null; }, value: v || '' }, h('option', { value: '' }, '–'), S.stam.omraader.map((o) => h('option', { value: o.slug }, o.navn)));
    const readonly = type === 'kode' && !ny;
    const i = h('input', { type: type === 'number' || type === 'tal' ? 'number' : 'text', step: type === 'tal' ? 'any' : undefined, value: v ?? '', readonly, 'aria-label': f[1], placeholder: f[1],
      oninput: (e) => { const x = e.target.value; række[k] = type === 'number' ? (x === '' ? 100 : +x) : type === 'tal' ? (x === '' ? null : +x) : x; } });
    if (type === 'kode' && ny) i.placeholder = 'kode-uden-mellemrum';
    return i;
  };
  const gem = async (række, ny) => {
    try {
      const out = { ...række };
      if (ny) { for (const f of T.felter) if (f[2] === 'bool' && out[f[0]] === undefined) out[f[0]] = true; if (T.pk === 'slug') out.slug = (out.slug || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''); if (T.pk === 'slug' && !out.slug) throw new Error('Skriv en kode (små bogstaver og bindestreger).'); }
      await S.api.gemRække(tabel, out);
      toast('Gemt', 'ok');
      await indlaesStamdata();
      redigerTabel(root, tabel);
    } catch (e) { toast(e.message, 'fejl'); }
  };
  const slet = async (række) => {
    if (!(await bekraeft('Slet række?', 'Hvis den er i brug, kan den ikke slettes – sæt den i stedet til inaktiv.', 'Slet', true))) return;
    try { await S.api.sletRække(tabel, T.pk, række[T.pk]); await indlaesStamdata(); redigerTabel(root, tabel); }
    catch (e) { toast(/foreign key|violates/i.test(e.message) ? 'Rækken er i brug. Sæt den til inaktiv i stedet.' : e.message, 'fejl'); }
  };
  const gitter = (række, ny) => h('div', { class: 'tab-række' + (ny ? ' ny' : '') }, ...T.felter.map((f) => h('label', { class: 'tab-felt' }, h('small', null, f[1]), inputFor(f, række, ny))),
    h('div', { class: 'tab-knapper' }, h('button', { class: 'knap primær lille-knap', onclick: () => gem(række, ny) }, ny ? 'Tilføj' : 'Gem'), ny ? null : h('button', { class: 'knap fare-lys lille-knap', onclick: () => slet(række) }, icon('trash', 16))));

  clear(root).append(h('div', { class: 'panel' }, h('h2', null, T.titel),
    tabel === 'kk_steder' ? h('p', { class: 'dæmpet' }, 'Tip: find koordinater ved at højreklikke et sted på openstreetmap.org → "Vis adresse". Koordinater er valgfrie og giver et kort på arrangementssiden.') : null,
    h('h3', null, 'Ny'), gitter(nyRække, true), h('h3', null, 'Eksisterende'), ...rows.map((r) => gitter({ ...r }, false))));
}

// =========================== OPRYDNING ===========================
async function visOprydning(root) {
  clear(root).append(skeletter(1));
  let gamle = [];
  try { gamle = await S.api.hentGamle(); } catch (e) { clear(root).append(tomtState('Kun admin kan ryde op', e.message)); return; }
  clear(root).append(h('div', { class: 'panel' },
    h('h2', null, 'Årsoprydning'),
    h('p', null, 'Arrangementer gemmes højst til årsskiftet. I det nye år kan alle arrangementer fra tidligere år slettes her – inklusive kontaktoplysninger og billeder. De vises ikke offentligt i mellemtiden.'),
    gamle.length ? h('div', null, h('p', null, h('b', null, `${gamle.length}`), ` arrangementer fra tidligere år er klar til sletning.`),
      h('button', { class: 'knap fare', onclick: async () => {
        if (!(await bekraeft('Slet gamle arrangementer?', `${gamle.length} arrangementer og tilhørende billeder og kontaktdata slettes permanent.`, 'Slet alle', true))) return;
        try { const n = await S.api.rydGamle(gamle); toast(`${n ?? gamle.length} arrangementer slettet`, 'ok'); visOprydning(root); } catch (e) { toast(e.message, 'fejl'); }
      } }, icon('trash', 18), ' Slet gamle arrangementer'))
      : h('p', { class: 'dæmpet' }, `Ingen arrangementer fra tidligere år. (Næste oprydning: efter 1. januar ${new Date().getFullYear() + 1}.)`),
    h('p', { class: 'dæmpet' }, 'Tip: sæt en kalendererindring til 2. januar hvert år.')),
    ubrugteBilleder());
}

// Billeder, der ligger i lageret, men ikke bruges af noget arrangement (fx fra afbrudte eller afviste indsendelser)
function ubrugteBilleder() {
  const boks = h('div', { class: 'panel' }, h('h2', null, 'Ubrugte billeder'),
    h('p', null, 'Når en indsendelse afbrydes, kan billedet blive liggende i lageret (gratis lager er 1 GB). Her kan du finde og slette billeder, som ingen arrangementer bruger. Billeder, der er under 2 timer gamle, røres ikke.'));
  const resultat = h('div', null);
  boks.append(h('button', { class: 'knap sekundær', onclick: async (ev) => {
    ev.target.disabled = true;
    try {
      const ubrugte = await S.api.hentUbrugteBilleder();
      const mb = (ubrugte.reduce((s, x) => s + (x.bytes || 0), 0) / 1048576).toFixed(1);
      clear(resultat);
      if (!ubrugte.length) { resultat.append(h('p', { class: 'dæmpet' }, 'Ingen ubrugte billeder fundet. 🎉')); return; }
      resultat.append(h('p', null, h('b', null, `${ubrugte.length}`), ` ubrugte billeder (ca. ${mb} MB).`),
        h('button', { class: 'knap fare', onclick: async () => {
          if (!(await bekraeft('Slet ubrugte billeder?', `${ubrugte.length} billeder slettes permanent. Billeder, som arrangementer bruger, røres ikke.`, 'Slet', true))) return;
          try { await S.api.sletBilleder(ubrugte.map((x) => x.navn)); toast(`${ubrugte.length} billeder slettet`, 'ok'); clear(resultat); } catch (e) { toast(e.message, 'fejl'); }
        } }, icon('trash', 18), ' Slet dem'));
    } catch (e) { toast(e.message || 'Kunne ikke hente billederne', 'fejl'); } finally { ev.target.disabled = false; }
  } }, 'Find ubrugte billeder'), resultat);
  return boks;
}
