// Delte UI-bidder: kort, filtre, medie-visning, skeletter.
import { h, icon, fmt, kortTid, kapitaliser, dayKey, tidTekst } from './util.js';
import { S, kat, toggleFav, maalgruppeNavn, omraadeNavn } from './state.js';

export function media(ev, klasse = '') {
  const k = kat(ev.kategori);
  const stil = `--c:${k.farve}`;
  if (ev.billede_url) {
    return h('div', { class: 'media ' + klasse, style: stil }, h('img', { src: ev.billede_url, alt: '', loading: 'lazy', decoding: 'async' }));
  }
  return h('div', { class: 'media fallback ' + klasse, style: stil }, h('span', { class: 'fallback-ikon', 'aria-hidden': 'true' }, k.ikon));
}

export function katPille(slug) {
  const k = kat(slug);
  return h('span', { class: 'pille', style: `--c:${k.farve}` }, h('span', { 'aria-hidden': 'true' }, k.ikon), ' ', k.navn);
}

export function katPiller(ev) {
  return [...new Set([ev.kategori, ...(ev.kategorier || [])])].filter(Boolean).map(katPille);
}

export function prisTekst(ev) {
  const p = (ev.pris_tekst || '').trim();
  return p || null;
}

export function favKnap(ev) {
  const b = h('button', { type: 'button', class: 'fav', 'aria-label': 'Jeg deltager / husk dette arrangement', 'aria-pressed': S.favs.has(ev.id) ? 'true' : 'false', title: 'Husk dette arrangement' }, icon('star', 20, S.favs.has(ev.id)));
  b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const on = toggleFav(ev.id);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.replaceChildren(icon('star', 20, on));
  });
  return b;
}

export function eventKort(ev, { kompakt = false } = {}) {
  const k = kat(ev.kategori);
  const aflyst = ev.status === 'aflyst';
  const pris = prisTekst(ev);
  const sted = ev.sted_navn || ev.adresse;
  return h('article', { class: 'kort' + (kompakt ? ' kompakt' : '') + (aflyst ? ' aflyst' : ''), style: `--c:${k.farve}` },
    h('div', { class: 'kort-media' },
      media(ev),
      h('span', { class: 'datobadge' }, h('b', null, fmt.dagNr(ev._start)), h('i', null, fmt.maanedKort(ev._start)))),
    aflyst ? h('span', { class: 'aflyst-bånd', 'aria-label': 'Arrangementet er aflyst' }, 'AFLYST') : null,
    h('div', { class: 'kort-krop' },
      h('div', { class: 'kort-meta' }, katPiller(ev), pris ? h('span', { class: 'pris' }, pris) : null),
      h('h3', null, h('a', { class: 'kort-link', href: `#/event/${ev.id}` }, ev.titel)),
      h('p', { class: 'kort-linje' }, icon('clock', 15), kortTid(ev)),
      h('p', { class: 'kort-linje kort-sted' + (sted ? '' : ' sted-ukendt') }, icon('pin', 15), sted || 'Sted ikke oplyst')),
    favKnap(ev));
}

export function skeletter(n = 4) {
  return h('div', { class: 'skel-liste', 'aria-hidden': 'true' }, Array.from({ length: n }, () => h('div', { class: 'skel' })));
}

export function tomtState(titel, tekst, handling) {
  return h('div', { class: 'tom' }, h('div', { class: 'tom-ikon' }, icon('cal', 36)), h('h3', null, titel), tekst ? h('p', null, tekst) : null, handling || null);
}

export function dagOverskrift(key) {
  const idag = dayKey(new Date());
  const imorgen = dayKey(new Date(Date.now() + 864e5));
  if (key === idag) return 'I dag';
  if (key === imorgen) return 'I morgen';
  const d = new Date(`${key}T12:00:00Z`);
  const tekst = new Intl.DateTimeFormat('da-DK', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: key.slice(0, 4) !== idag.slice(0, 4) ? 'numeric' : undefined }).format(d);
  return kapitaliser(tekst);
}

// ---------- Filterbar ----------
const PERIODER = [['alle', 'Alle kommende'], ['idag', 'I dag'], ['weekend', 'Weekend'], ['uge', '7 dage'], ['maaned', 'Måned']];

export function kategoriChips(onChange) {
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-label': 'Kategorier' });
  const tegn = () => {
    wrap.replaceChildren(
      ...S.stam.kategorier.map((k) => h('button', {
        type: 'button', class: 'chip' + (S.filter.kat.has(k.slug) ? ' på' : ''), style: `--c:${k.farve}`, 'aria-pressed': S.filter.kat.has(k.slug) ? 'true' : 'false',
        onclick: () => { if (S.filter.kat.has(k.slug)) S.filter.kat.delete(k.slug); else S.filter.kat.add(k.slug); tegn(); onChange(); },
      }, h('span', { 'aria-hidden': 'true' }, k.ikon), ' ', k.navn)));
  };
  tegn();
  return wrap;
}

export function filterBar(onChange, { periode = true, ekstra = true } = {}) {
  const f = S.filter;
  const søg = h('input', { type: 'search', placeholder: 'Søg i arrangementer …', value: f.q, 'aria-label': 'Søg', class: 'søg-input' });
  const nulstil = h('button', { type: 'button', class: 'knap sekundær lille-knap', hidden: true, onclick: () => {
    nulstilFilter();
    søg.value = '';
    if (periode) tegnPeriode();
    tegnKategorier();
    if (ekstra) {
      mg.value = ''; omraade.value = ''; gratis.checked = false; mine.checked = false;
      flere.open = false;
    }
    opdaterNulstil(); onChange();
  } }, 'Ryd filtre');
  const opdaterNulstil = () => { nulstil.hidden = !filterAktivt(); };
  const skift = () => { opdaterNulstil(); onChange(); };
  let t; søg.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { f.q = søg.value; skift(); }, 200); });

  const periodeRække = h('div', { class: 'segment', role: 'group', 'aria-label': 'Periode' });
  const tegnPeriode = () => periodeRække.replaceChildren(...PERIODER.map(([v, t]) => h('button', {
    type: 'button', class: v === f.periode ? 'på' : '', 'aria-pressed': v === f.periode ? 'true' : 'false',
    onclick: () => { f.periode = v; tegnPeriode(); skift(); },
  }, t)));
  tegnPeriode();

  const kategorier = h('div', { class: 'chips', role: 'group', 'aria-label': 'Kategorier' });
  // Kategorichips tegnes lokalt, så reset-knappen også kan nulstille deres valgte tilstand.
  const tegnKategorier = () => kategorier.replaceChildren(...S.stam.kategorier.map((k) => h('button', {
    type: 'button', class: 'chip' + (f.kat.has(k.slug) ? ' på' : ''), style: `--c:${k.farve}`, 'aria-pressed': f.kat.has(k.slug) ? 'true' : 'false',
    onclick: () => { if (f.kat.has(k.slug)) f.kat.delete(k.slug); else f.kat.add(k.slug); tegnKategorier(); skift(); },
  }, h('span', { 'aria-hidden': 'true' }, k.ikon), ' ', k.navn)));
  tegnKategorier();

  const mg = h('select', { id: 'f-mg', onchange: (e) => { f.maalgruppe = e.target.value; skift(); }, value: f.maalgruppe }, h('option', { value: '' }, 'Alle'), S.stam.maalgrupper.map((v) => h('option', { value: v.slug }, v.navn)));
  const omraade = h('select', { id: 'f-om', onchange: (e) => { f.omraade = e.target.value; skift(); }, value: f.omraade }, h('option', { value: '' }, 'Alle'), S.stam.omraader.map((v) => h('option', { value: v.slug }, v.navn)));
  const gratis = h('input', { type: 'checkbox', checked: f.gratis, onchange: (e) => { f.gratis = e.target.checked; skift(); } });
  const mine = h('input', { type: 'checkbox', checked: f.mine, onchange: (e) => { f.mine = e.target.checked; skift(); } });

  const flere = ekstra ? h('details', { class: 'flere', open: !!(f.maalgruppe || f.omraade || f.gratis || f.mine) },
    h('summary', null, 'Flere filtre'),
    h('div', { class: 'flere-grid' },
      h('label', { class: 'felt-kompakt' }, 'Målgruppe', mg),
      h('label', { class: 'felt-kompakt' }, 'Område', omraade),
      h('label', { class: 'check' }, gratis, 'Kun gratis'),
      h('label', { class: 'check' }, mine, 'Kun mine ★'))) : null;

  return h('section', { class: 'filterbar', 'aria-label': 'Filtre' },
    h('div', { class: 'søg' }, icon('search', 18), søg),
    periode ? periodeRække : null,
    kategorier,
    flere,
    nulstil);
}

export function nulstilFilter() {
  Object.assign(S.filter, { periode: 'alle', kat: new Set(), maalgruppe: '', omraade: '', gratis: false, mine: false, q: '' });
}
export const filterAktivt = () => { const f = S.filter; return f.periode !== 'alle' || f.kat.size || f.maalgruppe || f.omraade || f.gratis || f.mine || f.q.trim(); };

export { tidTekst };
