// Månedskalender med dagsliste.
import { h, icon, clear, dayKey, addDays, dowOf, dageIMaaned, fmt, pad } from './util.js';
import { S, sikrData, filtrer, kat } from './state.js';
import { eventKort, kategoriChips, skeletter, tomtState, dagOverskrift } from './ui.js';

const UGEDAGE = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

export async function visKalender(root) {
  const idag = dayKey(new Date());
  const [iy, im] = idag.split('-').map(Number);
  S.kal = S.kal || { y: iy, m: im, valgt: idag };

  const filtre = h('div', { class: 'filterbar kompakt-filter' }, kategoriChips(tegn));
  const hoved = h('div', { class: 'kal-hoved' });
  const gitter = h('div', { class: 'kal-gitter', role: 'grid' });
  const dagListe = h('div', { class: 'kal-dagliste' });
  root.append(h('section', { class: 'intro lille' }, h('h1', null, 'Kalender')), filtre, hoved, gitter, dagListe);
  gitter.append(skeletter(1));
  try { await sikrData(); } catch { clear(gitter).append(tomtState('Kunne ikke hente arrangementer', 'Prøv igen om lidt.')); return; }
  tegn();

  function skift(d) {
    let { y, m } = S.kal; m += d;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    S.kal.y = y; S.kal.m = m;
    S.kal.valgt = (y === iy && m === im) ? idag : `${y}-${pad(m)}-01`;
    tegn();
  }

  function tegn() {
    const { y, m } = S.kal;
    const evs = filtrer(S.events, S.filter, new Date(), true);
    const perDag = new Map();
    for (const e of evs) {
      let k = e._startDag, n = 0;
      while (k <= e._slutDag && n++ < 62) { if (!perDag.has(k)) perDag.set(k, []); perDag.get(k).push(e); k = addDays(k, 1); }
    }

    clear(hoved).append(
      h('button', { class: 'knap-ikon', 'aria-label': 'Forrige måned', onclick: () => skift(-1) }, icon('left', 22)),
      h('h2', null, fmt.maanedLang(y, m)),
      h('button', { class: 'knap-ikon', 'aria-label': 'Næste måned', onclick: () => skift(1) }, icon('right', 22)),
      h('button', { class: 'knap sekundær lille-knap', onclick: () => { S.kal = { y: iy, m: im, valgt: idag }; tegn(); } }, 'I dag'));

    const første = `${y}-${pad(m)}-01`;
    const forskydning = dowOf(første);
    const antal = dageIMaaned(y, m);
    const celler = [];
    UGEDAGE.forEach((d) => celler.push(h('div', { class: 'kal-ugedag', role: 'columnheader' }, d)));
    for (let i = 0; i < forskydning; i++) celler.push(h('div', { class: 'kal-celle tom', 'aria-hidden': 'true' }));
    for (let dag = 1; dag <= antal; dag++) {
      const key = `${y}-${pad(m)}-${pad(dag)}`;
      const dagens = perDag.get(key) || [];
      const travl = dagens.length >= 3;
      celler.push(h('button', {
        type: 'button', role: 'gridcell', class: 'kal-celle' + (key === idag ? ' idag' : '') + (key === S.kal.valgt ? ' valgt' : '') + (dagens.length ? ' har' : '') + (travl ? ' travl' : ''),
        'aria-label': `${dag}. ${fmt.maanedLang(y, m)}${dagens.length ? ', ' + dagens.length + ' arrangementer' : ''}`, 'aria-pressed': key === S.kal.valgt ? 'true' : 'false',
        onclick: () => { S.kal.valgt = key; tegn(); dagListe.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); },
      },
      h('span', { class: 'kal-nr' }, dag),
      h('span', { class: 'kal-prikker' }, dagens.slice(0, 4).map((e) => h('i', { style: `background:${kat(e.kategori).farve}` })), dagens.length > 4 ? h('em', null, '+') : null),
      h('span', { class: 'kal-titler' }, dagens.slice(0, 2).map((e) => h('span', { class: 'kal-tit', style: `--c:${kat(e.kategori).farve}` }, e.titel)), dagens.length > 2 ? h('span', { class: 'kal-mere' }, `+${dagens.length - 2}`) : null)));
    }
    clear(gitter).append(...celler);

    const valgte = (perDag.get(S.kal.valgt) || []).slice().sort((a, b) => a._start - b._start);
    clear(dagListe).append(h('h2', { class: 'dag-overskrift' }, dagOverskrift(S.kal.valgt)),
      valgte.length ? h('div', { class: 'kort-grid' }, valgte.map((e) => eventKort(e, { kompakt: true })))
        : h('div', { class: 'tom lille-tom' }, h('p', null, 'Ingen arrangementer denne dag.'), h('a', { class: 'knap sekundær', href: '#/opret' }, 'Opret arrangement')));
  }
}
