// Forside: fremhævet arrangement, filtre og dagsopdelt liste.
import { CONFIG } from './config.js';
import { h, icon, dayKey, hvornaar, clear } from './util.js';
import { S, sikrData, filtrer, kat } from './state.js';
import { eventKort, filterBar, skeletter, tomtState, dagOverskrift, katPille, media, nulstilFilter, filterAktivt } from './ui.js';

export async function visHjem(root) {
  let hurtigvalg = 'alle';
  const liste = h('div', { class: 'liste', 'aria-live': 'polite' }, skeletter(4));
  const heroBox = h('div');
  const advarsel = h('div');
  const hurtigBar = h('section', { class: 'hurtigvalg', 'aria-label': 'Hurtige valg' });
  const hurtigKnapper = [['alle', 'Alle'], ['idag', 'I dag'], ['weekend', 'I weekenden'], ['boern', 'For børn'], ['gratis', 'Gratis']];
  const tegnHurtigvalg = () => hurtigBar.replaceChildren(
    h('span', { class: 'hurtigvalg-label' }, 'Find hurtigt'),
    h('div', { class: 'hurtigvalg-knapper', role: 'group', 'aria-label': 'Vis arrangementer' }, hurtigKnapper.map(([vaerdi, tekst]) => h('button', {
      type: 'button', class: 'hurtigvalg-knap', 'aria-pressed': hurtigvalg === vaerdi ? 'true' : 'false',
      onclick: () => { hurtigvalg = vaerdi; tegnHurtigvalg(); tegn(); },
    }, tekst))));
  tegnHurtigvalg();
  const bar = filterBar(tegn);
  root.append(
    h('section', { class: 'intro' }, h('h1', null, CONFIG.tagline), h('p', null, `Alle arrangementer i ${CONFIG.omraadeTekst} samlet ét sted.`)),
    hurtigBar, advarsel, heroBox, bar, liste);

  try { await sikrData(); } catch (e) {
    clear(liste).append(tomtState('Kunne ikke hente arrangementer', 'Tjek din internetforbindelse og prøv igen.', h('button', { class: 'knap primær', onclick: () => location.reload() }, 'Prøv igen')));
    return;
  }
  tegn();

  function tegn() {
    if (S.offline) clear(advarsel).append(h('div', { class: 'banner', role: 'status' }, icon('alert', 16), 'Du er offline – viser sidst hentede arrangementer.'));
    else clear(advarsel);

    const grundliste = filtrer(S.events);
    const alle = grundliste.filter((e) => {
      if (hurtigvalg === 'idag') return e._startDag <= dayKey(new Date()) && e._slutDag >= dayKey(new Date());
      if (hurtigvalg === 'weekend') return e._startDag <= weekendSlut() && e._slutDag >= weekendStart();
      if (hurtigvalg === 'boern') return e.maalgruppe === 'boern' || e.maalgruppe === 'alle' || [e.kategori, ...(e.kategorier || [])].includes('boern-familie');
      if (hurtigvalg === 'gratis') return /^(gratis|fri|0)/i.test(e.pris_tekst || '');
      return true;
    });
    clear(heroBox);
    if (alle.length) heroBox.append(hero(alle));

    clear(liste);
    if (!alle.length) {
      liste.append(filterAktivt() || hurtigvalg !== 'alle'
        ? tomtState('Ingen arrangementer matcher', 'Prøv et andet hurtigt valg, eller ryd dine filtre.', h('button', { class: 'knap sekundær', onclick: () => { nulstilFilter(); hurtigvalg = 'alle'; tegnHurtigvalg(); tegn(); } }, 'Vis alle arrangementer'))
        : tomtState('Ingen kommende arrangementer endnu', 'Vær den første til at oprette et arrangement.', h('a', { class: 'knap primær', href: '#/opret' }, 'Opret arrangement')));
      return;
    }
    const idag = dayKey(new Date());
    const grupper = new Map();
    for (const e of alle) {
      const nøgle = e._startDag < idag ? idag : e._startDag;
      if (!grupper.has(nøgle)) grupper.set(nøgle, []);
      grupper.get(nøgle).push(e);
    }
    // Ét sammenhængende gitter: dagsoverskrifter spænder over hele rækken, så kortene fylder bredden ud
    const gitter = h('div', { class: 'kort-grid' });
    for (const [nøgle, evs] of [...grupper.entries()].sort()) {
      gitter.append(h('h2', { class: 'dag-overskrift fuld-række' }, dagOverskrift(nøgle)), ...evs.map((e) => eventKort(e)));
    }
    liste.append(gitter);
  }
}

function weekendStart() {
  const idag = dayKey(new Date());
  const dow = (new Date(`${idag}T12:00:00Z`).getUTCDay() + 6) % 7;
  if (dow >= 5) return idag;
  const dageTilLoerdag = 5 - dow;
  const d = new Date(`${idag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dageTilLoerdag);
  return d.toISOString().slice(0, 10);
}

function weekendSlut() {
  const start = weekendStart();
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function hero(alle) {
  const nu = Date.now();
  const nær = alle.filter((e) => e._start.getTime() - nu < 14 * 864e5);
  const e = nær.find((x) => x.billede_url && x.status === 'godkendt') || alle.find((x) => x.status === 'godkendt') || alle[0];
  const k = kat(e.kategori);
  return h('a', { class: 'hero', href: `#/event/${e.id}`, style: `--c:${k.farve}` },
    media(e, 'hero-media'),
    h('div', { class: 'hero-skygge' }),
    h('div', { class: 'hero-tekst' },
      h('span', { class: 'hero-etiket' }, e._start <= new Date() ? 'Sker lige nu' : 'Næste arrangement'),
      h('h2', null, e.titel),
      h('p', null, icon('clock', 16), hvornaar(e)),
      (e.sted_navn || e.adresse) ? h('p', null, icon('pin', 16), e.sted_navn || e.adresse) : null,
      h('span', { class: 'knap primær hero-knap' }, 'Se detaljer', icon('right', 16))));
}
