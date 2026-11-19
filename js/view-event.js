// Detaljeside for ét arrangement.
import { CONFIG, DEMO } from './config.js';
import { h, icon, clear, hvornaar, linkify, toast, hentIcsFil, googleKalenderUrl, decorate, delUrl } from './util.js';
import { S, sikrData, kat, maalgruppeNavn, omraadeNavn, stedById, toggleFav, filtrer, hentRet } from './state.js';
import { pushMulig, tilstand as pushTilstand, visPushDialog } from './push.js';
import { media, katPiller, skeletter, tomtState, eventKort } from './ui.js';

export async function visEvent(root, id) {
  root.append(skeletter(2));
  let ev = null;
  try {
    await sikrData();
    ev = S.events.find((e) => e.id === id) || null;
    if (!ev) { const r = await S.api.hentEvent(id); if (r) ev = decorate(r); }
  } catch { /* vises som ikke fundet / offline */ }
  clear(root);
  if (!ev) {
    root.append(tomtState('Arrangementet blev ikke fundet', 'Det kan være afsluttet, aflyst eller fjernet.', h('a', { class: 'knap primær', href: '#/' }, 'Se alle arrangementer')));
    return;
  }

  const k = kat(ev.kategori);
  const url = location.origin + location.pathname + `#/event/${ev.id}`;
  document.title = `${ev.titel} – ${CONFIG.siteName}`;
  const aflyst = ev.status === 'aflyst';
  const venter = ev.status !== 'godkendt' && ev.status !== 'aflyst';
  const sted = ev.sted_id ? stedById(ev.sted_id) : null;
  const stedTekst = sted?.navn || ev.sted_navn;
  const adresse = sted?.adresse || ev.adresse;
  const pris = (ev.pris_tekst || '').trim();

  const favB = h('button', { type: 'button', class: 'knap sekundær', 'aria-pressed': S.favs.has(ev.id) ? 'true' : 'false' });
  const pushTip = h('p', { class: 'push-tip', hidden: true });
  const tegnTip = () => {
    const on = S.favs.has(ev.id);
    const t = pushTilstand();
    pushTip.replaceChildren();
    if (!on || !pushMulig() || ev.status !== 'godkendt') { pushTip.hidden = true; return; }
    pushTip.hidden = false;
    if (t === 'til') pushTip.append(icon('bell', 16), ' Du får en påmindelse dagen før og besked, hvis det aflyses.');
    else pushTip.append(icon('bell', 16), ' ', h('button', { type: 'button', class: 'linkknap', onclick: async () => { await visPushDialog(); tegnTip(); } }, 'Slå påmindelser til'), ' for at få besked dagen før.');
  };
  const tegnFav = () => { favB.replaceChildren(icon('star', 18, S.favs.has(ev.id)), S.favs.has(ev.id) ? ' Jeg deltager' : ' Jeg deltager?'); favB.setAttribute('aria-pressed', S.favs.has(ev.id) ? 'true' : 'false'); tegnTip(); };
  favB.addEventListener('click', () => { toggleFav(ev.id); tegnFav(); toast(S.favs.has(ev.id) ? 'Gemt under "Kun mine ★" på forsiden' : 'Fjernet fra dine arrangementer'); });
  tegnFav();

  const delLink = (DEMO || /^(localhost|127\.|\[::1\])/.test(location.hostname)) ? url : delUrl(ev.id);
  const del = h('button', { type: 'button', class: 'knap sekundær', onclick: async () => {
    try {
      if (navigator.share) await navigator.share({ title: ev.titel, text: `${ev.titel} – ${hvornaar(ev)}`, url: delLink });
      else { await navigator.clipboard.writeText(delLink); toast('Link kopieret'); }
    } catch (e) { if (e && e.name === 'AbortError') return; try { await navigator.clipboard.writeText(delLink); toast('Link kopieret'); } catch { toast('Kopiér linket fra adresselinjen', 'fejl'); } }
  } }, icon('share', 18), ' Del');

  const kalender = h('details', { class: 'drop' },
    h('summary', { class: 'knap sekundær' }, icon('cal', 18), ' Føj til kalender'),
    h('div', { class: 'drop-menu' },
      h('a', { href: googleKalenderUrl(ev, url), target: '_blank', rel: 'noopener' }, 'Google Kalender'),
      h('button', { type: 'button', onclick: () => hentIcsFil(ev, url) }, 'Apple / Outlook (.ics-fil)')));

  const moderatorKnapper = S.rolle ? h('div', { class: 'moderator-event-knapper' },
    h('a', { class: 'knap sekundær', href: `#/ret/${ev.id}` }, icon('edit', 18), ' Ret arrangement'),
    ev.status === 'godkendt' || ev.status === 'aflyst' ? h('button', { type: 'button', class: `knap ${aflyst ? 'sekundær' : 'fare-lys'}`, onclick: async () => {
      const nyStatus = aflyst ? 'godkendt' : 'aflyst';
      try {
        await S.api.opdaterEvent(ev.id, { status: nyStatus });
        S.hentetTid = 0;
        toast(aflyst ? 'Arrangementet er genåbnet' : 'Arrangementet er aflyst', 'ok');
        await visEvent(root, id);
      } catch (e) { toast(e.message || 'Kunne ikke ændre status', 'fejl'); }
    } }, icon(aflyst ? 'check' : 'alert', 18), aflyst ? ' Genåbn' : ' Aflys') : null) : null;

  const kort = (sted?.lat != null && sted?.lon != null) ? kortElement(sted) : null;
  const findVej = (stedTekst || adresse) ? h('a', { class: 'knap sekundær', target: '_blank', rel: 'noopener', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([stedTekst, adresse, 'Auning'].filter(Boolean).join(', ')) }, icon('pin', 18), ' Find vej') : null;

  root.append(
    h('a', { class: 'tilbage', href: '#/' }, icon('left', 18), ' Alle arrangementer'),
    h('article', { class: 'event', style: `--c:${k.farve}` },
      h('div', { class: 'event-hero' }, media(ev, 'event-media'), aflyst ? h('div', { class: 'aflyst-stor' }, 'AFLYST') : null),
      venter ? h('div', { class: 'banner', role: 'status' }, icon('eye', 16), ev.status === 'afventer' ? 'Dette arrangement afventer godkendelse og er ikke offentligt endnu.' : `Status: ${ev.status}`) : null,
      h('header', { class: 'event-hoved' }, h('div', { class: 'kort-meta' }, katPiller(ev)), h('h1', null, ev.titel), ev.arrangoer ? h('p', { class: 'arrangoer' }, 'Arrangør: ', h('b', null, ev.arrangoer)) : null),
      h('div', { class: 'event-knapper' }, favB, kalender, del, hentRet(ev.id) ? h('a', { class: 'knap sekundær', href: `#/rettelse/${hentRet(ev.id)}` }, icon('edit', 18), ' Foreslå rettelse') : null, ev.link_url ? h('a', { class: 'knap primær', href: ev.link_url, target: '_blank', rel: 'noopener noreferrer nofollow' }, icon('ext', 18), ' Mere info / tilmelding') : null),
      moderatorKnapper,
      pushTip,
      h('div', { class: 'event-krop' },
        h('div', { class: 'event-info' },
          info('clock', 'Hvornår', hvornaar(ev)),
          (stedTekst || adresse) ? info('pin', 'Hvor', [stedTekst, adresse].filter(Boolean).join(' · ') + (ev.omraade ? ` (${omraadeNavn(ev.omraade)})` : '')) : null,
          info('tag', 'Pris', pris || 'Ikke oplyst'),
          info('user', 'Målgruppe', maalgruppeNavn(ev.maalgruppe)),
          findVej ? h('div', { class: 'info-knap' }, findVej) : null),
        h('div', { class: 'event-tekst' },
          ev.beskrivelse ? h('div', { class: 'beskrivelse' }, ev.beskrivelse.split(/\n{2,}/).map((afs) => h('p', null, linkify(afs)))) : h('p', { class: 'dæmpet' }, 'Ingen beskrivelse.'),
          kort)),
      lignende(ev)));
}

function info(ik, label, tekst) {
  return h('div', { class: 'info-række' }, h('span', { class: 'info-ikon' }, icon(ik, 20)), h('div', null, h('small', null, label), h('div', null, tekst)));
}

function kortElement(sted) {
  const d = 0.006;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${sted.lon - d},${sted.lat - d / 2},${sted.lon + d},${sted.lat + d / 2}&layer=mapnik&marker=${sted.lat},${sted.lon}`;
  return h('div', { class: 'kortramme' }, h('iframe', { src, title: `Kort over ${sted.navn}`, loading: 'lazy', referrerpolicy: 'no-referrer' }),
    h('a', { href: `https://www.openstreetmap.org/?mlat=${sted.lat}&mlon=${sted.lon}#map=17/${sted.lat}/${sted.lon}`, target: '_blank', rel: 'noopener' }, 'Større kort'));
}

function lignende(ev) {
  const andre = filtrer(S.events, { ...S.filter, periode: 'alle', kat: new Set([ev.kategori, ...(ev.kategorier || [])]), maalgruppe: '', omraade: '', gratis: false, mine: false, q: '' })
    .filter((e) => e.id !== ev.id).slice(0, 3);
  if (!andre.length) return null;
  return h('section', { class: 'lignende' }, h('h2', null, `Mere inden for ${kat(ev.kategori).navn.toLowerCase()}`), h('div', { class: 'kort-grid' }, andre.map((e) => eventKort(e, { kompakt: true }))));
}
