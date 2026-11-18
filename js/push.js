// Notifikationer: "Jeg deltager"-påmindelser og nyheder. Valgfri – vises kun, hvis vapidPublicKey er sat (eller i demo).
import { CONFIG } from './config.js';
import { h, icon, dialog, toast } from './util.js';
import { S } from './state.js';

const NØGLE = 'kk_push';
const læs = () => { try { return JSON.parse(localStorage.getItem(NØGLE)) || {}; } catch { return {}; } };
const gem = (v) => { try { localStorage.setItem(NØGLE, JSON.stringify(v)); } catch { /* privat tilstand */ } };

export const pushMulig = () => S.demo || !!CONFIG.vapidPublicKey;
const underst = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const iosUdenApp = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(matchMedia('(display-mode: standalone)').matches || navigator.standalone);

// 'ikke-understoettet' | 'ios-install' | 'afvist' | 'fra' | 'til'
export function tilstand() {
  if (S.demo) return læs().til ? 'til' : 'fra';
  if (iosUdenApp()) return 'ios-install';
  if (!underst()) return 'ikke-understoettet';
  if (Notification.permission === 'denied') return 'afvist';
  return læs().til && Notification.permission === 'granted' ? 'til' : 'fra';
}
export const prefs = () => { const p = læs(); return { alleNye: !!p.alleNye, kategorier: p.kategorier || [] }; };

function tilBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raa = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raa, (c) => c.charCodeAt(0));
}

async function abonnement(nyt) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && nyt) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: tilBytes(CONFIG.vapidPublicKey) });
  return sub;
}

export async function slaaTil({ alleNye, kategorier }) {
  if (S.demo) {
    gem({ til: true, endpoint: 'demo', alleNye, kategorier, sidst: Date.now() });
    await S.api.pushGem({ endpoint: 'demo', alleNye, kategorier });
    await syncFav();
    return;
  }
  const svar = await Notification.requestPermission();
  if (svar !== 'granted') throw new Error('Du har ikke givet tilladelse til notifikationer.');
  const j = (await abonnement(true)).toJSON();
  await S.api.pushGem({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, alleNye, kategorier });
  gem({ til: true, endpoint: j.endpoint, alleNye, kategorier, sidst: Date.now() });
  await syncFav();
}

export async function slaaFra() {
  const p = læs();
  try { if (!S.demo) { const sub = await abonnement(false); if (sub) await sub.unsubscribe(); } } catch { /* ignorer */ }
  try { if (p.endpoint) await S.api.pushAfmeld(p.endpoint); } catch { /* serveren rydder selv op */ }
  gem({ til: false });
}

export async function syncFav() {
  const p = læs();
  if (!p.til || !p.endpoint) return;
  await S.api.pushFoelg(p.endpoint, [...S.favs]);
}

let syncT;
export function vedFavAendring() {
  if (!læs().til) return;
  clearTimeout(syncT);
  syncT = setTimeout(() => syncFav().catch(() => {}), 600);
}

// Kaldes ved opstart: fornyer abonnementet højst en gang om ugen og rydder op, hvis tilladelsen er fjernet.
export async function opfrisk() {
  S.onFav = vedFavAendring;
  const p = læs();
  if (!p.til || S.demo || !underst()) return;
  try {
    if (Notification.permission !== 'granted') { gem({ ...p, til: false }); return; }
    if (Date.now() - (p.sidst || 0) < 7 * 864e5) return;
    const sub = await abonnement(true);
    const j = sub.toJSON();
    await S.api.pushGem({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, alleNye: p.alleNye, kategorier: p.kategorier || [] });
    gem({ ...p, endpoint: j.endpoint, sidst: Date.now() });
    await syncFav();
  } catch { /* prøver igen næste gang */ }
}

// ---------- Dialog ----------
export async function visPushDialog() {
  const t = tilstand();
  if (t === 'ios-install') {
    return dialog({ titel: 'Notifikationer på iPhone', indhold: h('div', null, h('p', null, 'På iPhone og iPad virker notifikationer kun, når kalenderen ligger på hjemmeskærmen.'),
      h('p', null, 'Tryk på ', h('b', null, 'Del'), '-knappen i Safari, vælg ', h('b', null, 'Føj til hjemmeskærm'), ', åbn kalenderen fra ikonet, og tryk på klokken igen.')) });
  }
  if (t === 'ikke-understoettet') return dialog({ titel: 'Notifikationer', indhold: h('p', null, 'Din browser understøtter ikke notifikationer. Prøv Chrome, Edge, Firefox eller Safari (som app på hjemmeskærmen).') });
  if (t === 'afvist') return dialog({ titel: 'Notifikationer er blokeret', indhold: h('p', null, 'Du har blokeret notifikationer for denne side. Slå dem til igen i browserens indstillinger for siden, og prøv så igen.') });

  const nu = prefs();
  const til = t === 'til';
  const valg = nu.alleNye ? 'alle' : nu.kategorier.length ? 'udvalgte' : 'kun';
  const kats = new Set(nu.kategorier);
  const radio = (v, tekst) => h('label', { class: 'radio-række' }, h('input', { type: 'radio', name: 'kk-push-valg', value: v, checked: v === valg, onchange: opdater }), ' ', tekst);
  const chips = h('div', { class: 'chips push-kats' }, S.stam.kategorier.map((k) => {
    const c = h('input', { type: 'checkbox', value: k.slug, checked: kats.has(k.slug) });
    return h('label', { class: 'chip', style: `--c:${k.farve}` }, c, ' ', k.ikon, ' ', k.navn);
  }));
  const kroppen = h('div', { class: 'push-dialog' },
    h('p', null, 'Få besked, når der sker noget nyt – og bliv mindet om de arrangementer, du har trykket ', h('b', null, 'Jeg deltager'), ' på.'),
    h('ul', { class: 'dæmpet' }, h('li', null, 'Altid: påmindelse dagen før og besked, hvis et arrangement du følger bliver aflyst.')),
    h('fieldset', null, h('legend', null, 'Nye arrangementer'),
      radio('kun', 'Ingen – kun mine "Jeg deltager"'), radio('udvalgte', 'Kun i disse kategorier:'), chips, radio('alle', 'Alle nye arrangementer')));
  function opdater() { chips.hidden = kroppen.querySelector('input[name=kk-push-valg]:checked')?.value !== 'udvalgte'; }
  const læsValg = () => {
    const v = kroppen.querySelector('input[name=kk-push-valg]:checked')?.value;
    const ks = v === 'udvalgte' ? [...chips.querySelectorAll('input:checked')].map((i) => i.value) : [];
    return { alleNye: v === 'alle', kategorier: ks };
  };
  setTimeout(opdater, 0);

  const knapper = [{ tekst: 'Annuller', værdi: null }];
  if (til) knapper.push({ tekst: 'Slå fra', værdi: 'fra', fare: true });
  knapper.push({ tekst: til ? 'Gem' : 'Slå til', værdi: () => ({ gem: læsValg() }), primær: true });
  const svar = await dialog({ titel: 'Notifikationer', indhold: kroppen, knapper });
  if (svar === 'fra') { await slaaFra(); toast('Notifikationer er slået fra'); }
  else if (svar && svar.gem) {
    try { await slaaTil(svar.gem); toast(til ? 'Gemt' : 'Notifikationer er slået til'); } catch (e) { toast(e.message || 'Kunne ikke slå notifikationer til', 'fejl'); }
  }
  document.dispatchEvent(new CustomEvent('kk-push'));
  return svar;
}

export function klokkeKnap() {
  if (!pushMulig()) return null;
  const b = h('button', { type: 'button', class: 'klokke', 'aria-label': 'Notifikationer', title: 'Notifikationer', onclick: () => visPushDialog() }, icon('bell', 20));
  const tegn = () => { b.classList.toggle('på', tilstand() === 'til'); };
  document.addEventListener('kk-push', tegn);
  tegn();
  return b;
}
