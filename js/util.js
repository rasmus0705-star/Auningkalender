// Små hjælpefunktioner: DOM, datoer (Europe/Copenhagen), ikoner, billeder, kalenderfiler.
import { CONFIG } from './config.js';

export const TZ = CONFIG.tidszone || 'Europe/Copenhagen';
export const pad = (n) => String(n).padStart(2, '0');

// ---------- DOM ----------
// Gør Element.append tolerant over for null/undefined/false (så betingede børn ikke bliver til teksten "null").
const nativAppend = Element.prototype.append;
Element.prototype.append = function (...kids) {
  nativAppend.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false));
};
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') value = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}
export function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const clear = (el) => { el.replaceChildren(); return el; };
export const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const nyId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export const kapitaliser = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

// ---------- Ikoner (statiske, betroede strenge) ----------
const IKON = {
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3-6.2 3.3 1.2-6.8-5-4.9 6.9-1z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  repeat: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};
export function icon(navn, size = 18, fyld = false) {
  const s = document.createElement('span');
  s.className = 'ikon';
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fyld ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKON[navn] || ''}</svg>`;
  return s;
}

// ---------- Datoer i dansk tid ----------
export function cphParts(d) {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute };
}
export const dayKey = (d) => { const p = cphParts(new Date(d)); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
export const tidTekst = (d) => { const p = cphParts(new Date(d)); return `${pad(p.hh)}:${pad(p.mm)}`; };
// 'YYYY-MM-DD' + 'HH:MM' (dansk tid) -> ISO-streng (UTC)
export function cphToISO(dato, tid) {
  const [y, m, d] = dato.split('-').map(Number);
  const [hh, mm] = (tid || '00:00').split(':').map(Number);
  const mål = Date.UTC(y, m - 1, d, hh, mm);
  let gæt = mål;
  for (let i = 0; i < 2; i++) {
    const p = cphParts(new Date(gæt));
    gæt -= Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - mål;
  }
  return new Date(gæt).toISOString();
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const dowOf = (key) => { const [y, m, d] = key.split('-').map(Number); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; }; // 0 = mandag
export const dageIMaaned = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12
export const dagTilDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };

const F = (opt) => new Intl.DateTimeFormat('da-DK', { timeZone: TZ, ...opt });
export const fmt = {
  dagKort: (d) => F({ weekday: 'short', day: 'numeric', month: 'short' }).format(d),
  dagLang: (d) => F({ weekday: 'long', day: 'numeric', month: 'long' }).format(d),
  dagLangAar: (d) => F({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d),
  dagNr: (d) => F({ day: 'numeric' }).format(d),
  maanedKort: (d) => F({ month: 'short' }).format(d).replace('.', ''),
  maanedLang: (y, m) => new Intl.DateTimeFormat('da-DK', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1))),
  ugedag: (d) => F({ weekday: 'short' }).format(d).replace('.', ''),
};

export function decorate(ev) {
  const e = { ...ev };
  e._start = new Date(e.start_ts);
  e._slutEff = new Date(e.slut_eff || e.slut_ts || (e._start.getTime() + 2 * 3600e3));
  e._slut = e.slut_ts ? new Date(e.slut_ts) : null;
  e._startDag = dayKey(e._start);
  const sd = dayKey(new Date(e._slutEff.getTime() - 60000));
  e._slutDag = sd < e._startDag ? e._startDag : sd;
  e.flerdages = e._slutDag > e._startDag;
  return e;
}

// Et arrangement uden kendt tidspunkt gemmes med start kl. 00:00 (og evt. slut 23:59) og vises som "Tid følger".
export const udenTid = (ev) => tidTekst(ev._start) === '00:00' && (!ev._slut || tidTekst(ev._slut) === '23:59');
export function hvornaar(ev) {
  const s = ev._start, e = ev._slut, u = udenTid(ev);
  if (ev.flerdages) return `${kapitaliser(fmt.dagKort(s))}${u ? '' : ' ' + tidTekst(s)} – ${fmt.dagKort(ev._slut || ev._slutEff)}${!u && e ? ' ' + tidTekst(e) : ''}`;
  if (u) return `${kapitaliser(fmt.dagLang(s))} · Tid følger`;
  return `${kapitaliser(fmt.dagLang(s))} · ${tidTekst(s)}${e ? '–' + tidTekst(e) : ''}`;
}
export function kortTid(ev) {
  if (ev.flerdages) return `${fmt.dagKort(ev._start)} – ${fmt.dagKort(ev._slut || ev._slutEff)}`;
  if (udenTid(ev)) return 'Tid følger';
  return `${tidTekst(ev._start)}${ev._slut ? '–' + tidTekst(ev._slut) : ''}`;
}

// ---------- Tekst ----------
export function linkify(tekst) {
  const out = [];
  String(tekst || '').split(/(https?:\/\/[^\s<]+)/g).forEach((del, i) => {
    if (i % 2) {
      const a = document.createElement('a');
      a.href = del; a.textContent = del; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
      out.push(a);
    } else if (del) out.push(del);
  });
  return out;
}

// ---------- Billeder ----------
export async function formindskBillede(fil, maxBredde = 1400) {
  const bmp = await createImageBitmap(fil);
  const skala = Math.min(1, maxBredde / bmp.width);
  const w = Math.round(bmp.width * skala), hh = Math.round(bmp.height * skala);
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
  ctx.drawImage(bmp, 0, 0, w, hh);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Kunne ikke behandle billedet'))), 'image/jpeg', 0.82));
}

// ---------- Kalenderfiler ----------
const icsDato = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const heldag = (ev) => { const d = (k) => k.replace(/-/g, ''); return [d(ev._startDag), d(addDays(ev._slutDag, 1))]; };
export function hentIcs(ev, url) {
  const hd = udenTid(ev) ? heldag(ev) : null;
  const sted = [ev.sted_navn, ev.adresse].filter(Boolean).join(', ');
  const linjer = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kulturkalender//DA', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${ev.id}@kulturkalender`, `DTSTAMP:${icsDato(new Date())}`, hd ? `DTSTART;VALUE=DATE:${hd[0]}` : `DTSTART:${icsDato(ev._start)}`, hd ? `DTEND;VALUE=DATE:${hd[1]}` : `DTEND:${icsDato(ev._slutEff)}`,
    `SUMMARY:${icsEsc(ev.titel)}`, `LOCATION:${icsEsc(sted)}`, `DESCRIPTION:${icsEsc((ev.beskrivelse || '') + (url ? '\n' + url : ''))}`,
    url ? `URL:${url}` : null, ev.status === 'aflyst' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean);
  return linjer.join('\r\n');
}
export function hentIcsFil(ev, url) {
  const blob = new Blob([hentIcs(ev, url)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (ev.titel || 'arrangement').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) + '.ics';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function googleKalenderUrl(ev, url) {
  const sted = [ev.sted_navn, ev.adresse].filter(Boolean).join(', ');
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.titel, dates: udenTid(ev) ? heldag(ev).join('/') : `${icsDato(ev._start)}/${icsDato(ev._slutEff)}`, details: (ev.beskrivelse || '') + (url ? '\n' + url : ''), location: sted });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

// ---------- Delingslink (statisk side med forhåndsvisning til Facebook m.fl.) ----------
export function delUrl(id) {
  const base = CONFIG.siteUrl ? CONFIG.siteUrl.replace(/\/?$/, '/') : location.href.split('#')[0].replace(/[^/]*$/, '');
  return `${base}d/${id}/`;
}

// ---------- Toast og dialog ----------
export function toast(tekst, type = 'info') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + type, role: 'status' }, tekst);
  box.append(t);
  setTimeout(() => { t.classList.add('ud'); setTimeout(() => t.remove(), 300); }, type === 'fejl' ? 6000 : 3200);
}
export function dialog({ titel, indhold, knapper }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog' });
    const luk = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    const bar = h('div', { class: 'dialog-knapper' }, (knapper || [{ tekst: 'OK', værdi: true, primær: true }]).map((k) =>
      h('button', { type: 'button', class: 'knap ' + (k.primær ? 'primær' : k.fare ? 'fare' : 'sekundær'), onclick: () => luk(typeof k.værdi === 'function' ? k.værdi() : k.værdi) }, k.tekst)));
    dlg.append(h('h2', null, titel), h('div', { class: 'dialog-krop' }, indhold), bar);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); luk(null); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
export const bekraeft = (titel, tekst, jaTekst = 'Ja', fare = false) =>
  dialog({ titel, indhold: h('p', null, tekst), knapper: [{ tekst: 'Annuller', værdi: false }, { tekst: jaTekst, værdi: true, primær: !fare, fare }] });

// ---------- Captcha (Cloudflare Turnstile) ----------
let turnstileLoading;
export async function captcha(container) {
  if (!CONFIG.turnstileSiteKey) return { token: () => null, reset() {}, aktiv: false };
  if (!turnstileLoading) {
    turnstileLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.onload = res; s.onerror = () => rej(new Error('Kunne ikke hente captcha'));
      document.head.append(s);
    });
  }
  await turnstileLoading;
  const id = window.turnstile.render(container, { sitekey: CONFIG.turnstileSiteKey, language: 'da', theme: 'auto' });
  return { token: () => window.turnstile.getResponse(id) || null, reset: () => window.turnstile.reset(id), aktiv: true };
}
