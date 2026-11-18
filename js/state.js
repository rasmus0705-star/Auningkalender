// Fælles tilstand og dataindlæsning (med offline-reserve).
import { decorate, dayKey, addDays } from './util.js';

export const S = {
  api: null,
  demo: false,
  stam: { kategorier: [], maalgrupper: [], omraader: [], steder: [] },
  user: null,        // { id, email, anonym }
  rolle: null,       // 'moderator' | 'admin' | null
  events: [],
  offline: false,
  filter: { periode: 'alle', kat: new Set(), maalgruppe: '', omraade: '', gratis: false, mine: false, q: '' },
  favs: new Set(læs('kk_favs', [])),
};

function læs(nøgle, standard) { try { return JSON.parse(localStorage.getItem(nøgle)) ?? standard; } catch { return standard; } }
function gem(nøgle, v) { try { localStorage.setItem(nøgle, JSON.stringify(v)); } catch { /* fuld lagring el. privat tilstand */ } }

// Rettelinks til arrangementer, man selv har sendt ind fra denne enhed
export const hentRet = (id) => (læs('kk_ret', {}) || {})[id] || null;
export function gemRet(id, token) { const m = læs('kk_ret', {}) || {}; m[id] = token; gem('kk_ret', m); }
export const rettelinkUrl = (token) => `${location.origin}${location.pathname}#/rettelse/${token}`;

export function toggleFav(id) {
  if (S.favs.has(id)) S.favs.delete(id); else S.favs.add(id);
  gem('kk_favs', [...S.favs]);
  try { S.onFav?.(); } catch { /* push er valgfri */ }
  return S.favs.has(id);
}

export async function opdaterRolle() {
  try { S.rolle = S.user && !S.user.anonym ? await S.api.minRolle() : null; } catch { S.rolle = null; }
  return S.rolle;
}

export const kat = (slug) => S.stam.kategorier.find((k) => k.slug === slug) || { slug, navn: slug || 'Andet', farve: '#6b7280', ikon: '📅' };
export const maalgruppeNavn = (slug) => S.stam.maalgrupper.find((m) => m.slug === slug)?.navn || slug;
export const omraadeNavn = (slug) => S.stam.omraader.find((o) => o.slug === slug)?.navn || '';
export const stedById = (id) => S.stam.steder.find((s) => s.id === id);

export async function indlaesStamdata() {
  try {
    S.stam = await S.api.hentStamdata();
    gem('kk_stam', S.stam);
  } catch (e) {
    const c = læs('kk_stam', null);
    if (!c) throw e;
    S.stam = c;
  }
}

export async function indlaesEvents() {
  try {
    const rows = await S.api.hentEvents();
    S.events = rows.map(decorate);
    S.offline = false;
    gem('kk_events', rows);
  } catch (e) {
    const c = læs('kk_events', null);
    if (!c) throw e;
    S.events = c.map(decorate);
    S.offline = true;
  }
  return S.events;
}

// ---------- Filtrering ----------
export function periodeInterval(periode, nu = new Date()) {
  const idag = dayKey(nu);
  const dow = ((new Date(`${idag}T12:00:00Z`).getUTCDay()) + 6) % 7; // 0 = man
  switch (periode) {
    case 'idag': return [idag, idag];
    case 'weekend': {
      if (dow === 6) return [idag, idag];
      const lør = addDays(idag, 5 - dow);
      return [lør, addDays(lør, 1)];
    }
    case 'uge': return [idag, addDays(idag, 6)];
    case 'maaned': { const [y, m] = idag.split('-').map(Number); return [idag, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)]; }
    default: return [idag, '9999-12-31'];
  }
}

export async function sikrData(force = false) {
  if (force || !S.hentetTid || Date.now() - S.hentetTid > 60000) {
    await indlaesEvents();
    S.hentetTid = Date.now();
  }
}

// historik = true: ingen periode- og "er det slut"-filtre (bruges af kalenderen)
export function filtrer(events, f = S.filter, nu = new Date(), historik = false) {
  const [fra, til] = periodeInterval(f.periode, nu);
  const q = f.q.trim().toLowerCase();
  return events.filter((e) => {
    if (!historik) {
      if (e._slutDag < fra || e._startDag > til) return false;
      if (e._slutEff < nu) return false;
    }
    if (f.kat.size && !f.kat.has(e.kategori)) return false;
    if (f.maalgruppe && e.maalgruppe !== f.maalgruppe && e.maalgruppe !== 'alle') return false;
    if (f.omraade && e.omraade !== f.omraade) return false;
    if (f.gratis && !/^(gratis|fri|0)/i.test(e.pris_tekst || 'gratis')) return false;
    if (f.mine && !S.favs.has(e.id)) return false;
    if (q && !`${e.titel} ${e.beskrivelse || ''} ${e.sted_navn || ''} ${e.arrangoer}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => a._start - b._start);
}
