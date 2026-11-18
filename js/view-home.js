// Forside: fremhævet arrangement, filtre og dagsopdelt liste.
import { CONFIG } from './config.js';
import { h, icon, dayKey, hvornaar, clear } from './util.js';
import { S, sikrData, filtrer, kat } from './state.js';
import { eventKort, filterBar, skeletter, tomtState, dagOverskrift, katPille, media, nulstilFilter, filterAktivt } from './ui.js';

export async function visHjem(root) {
  const liste = h('div', { class: 'liste', 'aria-live': 'polite' }, skeletter(4));
  const heroBox = h('div');
  const advarsel = h('div');
  const bar = filterBar(tegn);
  root.append(
    h('section', { class: 'intro' }, h('h1', null, CONFIG.tagline), h('p', null, `Alle arrangementer i ${CONFIG.omraadeTekst} samlet ét sted.`)),
    advarsel, heroBox, bar, liste);

  try { await sikrData(); } catch (e) {
    clear(liste).append(tomtState('Kunne ikke hente arrangementer', 'Tjek din internetforbindelse og prøv igen.', h('button', { class: 'knap primær', onclick: () => location.reload() }, 'Prøv igen')));
    return;
  }
  tegn();

  function tegn() {
    if (S.offline) clear(advarsel).append(h('div', { class: 'banner', role: 'status' }, icon('alert', 16), 'Du er offline – viser sidst hentede arrangementer.'));
    else clear(advarsel);

    const alle = filtrer(S.events);
    clear(heroBox);
    if (!filterAktivt() && alle.length) heroBox.append(hero(alle));

    clear(liste);
    if (!alle.length) {
      liste.append(filterAktivt()
        ? tomtState('Ingen arrangementer matcher', 'Prøv at fjerne et filter eller søge på noget andet.', h('button', { class: 'knap sekundær', onclick: () => { nulstilFilter(); location.hash = '#/'; visIgen(); } }, 'Ryd filtre'))
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
  function visIgen() { root.replaceChildren(); visHjem(root); }
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
