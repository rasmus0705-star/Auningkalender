// Personlig liste over arrangementer, som brugeren har gemt med stjernen.
import { h, clear } from './util.js';
import { S, sikrData, filtrer } from './state.js';
import { eventKort, skeletter, tomtState } from './ui.js';

export async function visMine(root) {
  const liste = h('div', { class: 'liste', 'aria-live': 'polite' }, skeletter(3));
  root.append(h('section', { class: 'intro' }, h('h1', null, 'Mine arrangementer'), h('p', null, 'Arrangementer, du har gemt med stjernen. Listen gemmes på denne enhed.')), liste);
  try {
    await sikrData();
  } catch {
    clear(liste).append(tomtState('Kunne ikke hente arrangementer', 'Prøv igen om lidt.'));
    return;
  }

  const mine = filtrer(S.events, { ...S.filter, periode: 'alle', kat: new Set(), maalgruppe: '', omraade: '', gratis: false, mine: true, q: '' });
  clear(liste);
  if (!mine.length) {
    liste.append(tomtState('Du har ikke gemt nogen arrangementer endnu', 'Tryk på stjernen på et arrangement for at finde det her.', h('a', { class: 'knap primær', href: '#/' }, 'Find arrangementer')));
    return;
  }
  liste.append(h('div', { class: 'kort-grid' }, mine.map((e) => eventKort(e))));
}
