// Opstart, layout og router.
import { CONFIG, DEMO } from './config.js';
import { h, icon, clear, toast } from './util.js';
import { S, indlaesStamdata, opdaterRolle } from './state.js';
import { visHjem } from './view-home.js';
import { visKalender } from './view-calendar.js';
import { visEvent } from './view-event.js';
import { visForm } from './view-form.js';
import { visMod } from './view-mod.js';
import { visTekst } from './view-text.js';
import { klokkeKnap, opfrisk as opfriskPush } from './push.js';

const RUTER = [
  [/^#?\/?$/, (r) => visHjem(r), 'hjem'],
  [/^#\/kalender$/, (r) => visKalender(r), 'kalender'],
  [/^#\/event\/([^/]+)$/, (r, m) => visEvent(r, m[1]), 'hjem'],
  [/^#\/opret$/, (r) => visForm(r, {}), 'opret'],
  [/^#\/ret\/([^/]+)$/, (r, m) => visForm(r, { id: m[1] }), 'mod'],
  [/^#\/rettelse\/([\w-]{20,60})$/, (r, m) => visForm(r, { token: m[1] }), 'opret'],
  [/^#\/kopi\/([^/]+)$/, (r, m) => visForm(r, { kopi: m[1] }), 'mod'],
  [/^#\/mod$/, (r) => visMod(r), 'mod'],
  [/^#\/(om|regler|privatliv|ansvar)$/, (r, m) => visTekst(r, m[1]), 'om'],
];
const TITLER = { hjem: 'Arrangementer', kalender: 'Kalender', opret: 'Opret arrangement', mod: 'Moderator', om: 'Om' };

let main, nav, tabbar, installBox;
let deferredInstall = null;
let installOfferReady = false;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (installOfferReady) visInstallForslag();
});
window.addEventListener('appinstalled', () => {
  try { localStorage.setItem('kk_pwa_installeret', '1'); } catch { /* privat tilstand */ }
  deferredInstall = null;
  installBox?.replaceChildren();
});

async function start() {
  document.documentElement.style.setProperty('--accent', CONFIG.farveAccent);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', CONFIG.farveAccent);
  S.demo = DEMO;
  const app = document.getElementById('app');
  app.append(h('div', { class: 'indlæser' }, 'Henter …'));

  try {
    const mod = await import(DEMO ? './api-demo.js' : './api-supabase.js');
    S.api = mod.createApi(CONFIG);
    S.user = await S.api.init();
    await opdaterRolle();
    let invitationAfventer = false;
    if (!DEMO && S.user && !S.user.anonym) {
      try { invitationAfventer = await S.api.moderatorInvitationAfventer(); } catch { invitationAfventer = false; }
    }
    S.api.onAuth(async (u) => { S.user = u; await opdaterRolle(); tegnNav(); });
    await indlaesStamdata();
    if (invitationAfventer) location.hash = '#/mod';
  } catch (e) {
    console.error(e);
    clear(app).append(h('div', { class: 'tom' }, h('h2', null, 'Kalenderen kunne ikke starte'), h('p', null, 'Tjek din internetforbindelse, og at Supabase-nøglerne i js/config.js er rigtige.'), h('pre', { class: 'dæmpet' }, String(e.message || e))));
    return;
  }
  bygLayout(app);
  window.addEventListener('hashchange', rut);
  rut();
  opfriskPush();
  installBox = h('aside', { class: 'install-tilbud', 'aria-label': 'Installér kalenderen' });
  app.append(installBox);
  installOfferReady = true;
  setTimeout(visInstallForslag, 3500);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function visInstallForslag() {
  if (!installBox) return;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  let alleredeInstalleret = false, udsatTil = 0;
  try {
    alleredeInstalleret = localStorage.getItem('kk_pwa_installeret') === '1';
    udsatTil = Number(localStorage.getItem('kk_pwa_install_udsat') || 0);
  } catch { /* privat tilstand */ }
  if (standalone || alleredeInstalleret || Date.now() < udsatTil) return;

  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mobil = ios || /Android/i.test(navigator.userAgent);
  if (!deferredInstall && !mobil) return;
  const udsæt = () => {
    try { localStorage.setItem('kk_pwa_install_udsat', String(Date.now() + 14 * 864e5)); } catch { /* privat tilstand */ }
    installBox.replaceChildren();
  };
  const instruktion = h('div', { class: 'install-guide', hidden: true },
    h('ol', null, ...(ios
      ? [h('li', null, 'Tryk på Del i Safari.'), h('li', null, 'Vælg “Føj til hjemmeskærm”.'), h('li', null, 'Tryk “Tilføj”.')]
      : [h('li', null, 'Åbn browserens menu.'), h('li', null, 'Vælg “Installer app” eller “Føj til startskærm”.')])));
  const installer = h('button', { class: 'knap primær lille-knap', type: 'button', onclick: async (e) => {
    if (!deferredInstall) {
      instruktion.hidden = !instruktion.hidden;
      e.currentTarget.textContent = instruktion.hidden ? 'Tryk her for at tilføje' : 'Skjul vejledning';
      return;
    }
    deferredInstall.prompt();
    const valg = await deferredInstall.userChoice;
    deferredInstall = null;
    if (valg?.outcome === 'accepted') {
      installBox.replaceChildren();
    } else udsæt();
  } }, 'Tryk her for at tilføje');
  clear(installBox).append(
    h('div', { class: 'install-indhold' },
      h('div', { class: 'install-tekst' }, h('strong', null, 'Føj kalenderen til hjemmeskærmen'),
        h('span', null, deferredInstall ? 'Så er kalenderen nem at åbne som en app.' : 'Tryk på knappen for at se, hvordan du gør.')),
      instruktion),
    installer,
    h('button', { class: 'install-luk', type: 'button', 'aria-label': 'Ikke nu', onclick: udsæt }, '×'));
}

function bygLayout(app) {
  nav = h('nav', { class: 'topnav', 'aria-label': 'Hovedmenu' });
  tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Hovedmenu (mobil)' });
  main = h('main', { id: 'main', tabindex: '-1' });
  clear(app).append(
    h('a', { class: 'spring', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Spring til indhold'),
    S.demo ? h('div', { class: 'demo-bånd' }, 'DEMO-TILSTAND – eksempeldata. Indsæt dine Supabase-nøgler i js/config.js for at gå live.') : null,
    h('header', { class: 'top' }, h('div', { class: 'top-inde' },
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-ikon' }, icon('cal', 22)), h('span', { class: 'brand-navn' }, CONFIG.siteName)), h('div', { class: 'top-højre' }, nav, klokkeKnap()))),
    main,
    h('footer', { class: 'bund' },
      h('div', { class: 'bund-inde' },
        h('p', null, `${CONFIG.siteName} · ${CONFIG.omraadeTekst}`),
        h('p', { class: 'bund-links' },
          h('a', { href: '#/om' }, 'Om'), h('a', { href: '#/regler' }, 'Retningslinjer'), h('a', { href: '#/privatliv' }, 'Privatliv'), h('a', { href: '#/ansvar' }, 'Ansvar'),
          S.demo ? null : h('a', { href: 'd/' }, 'Arrangementsliste'),
          CONFIG.facebookUrl ? h('a', { href: CONFIG.facebookUrl, target: '_blank', rel: 'noopener' }, 'Facebook') : null,
          h('a', { href: '#/mod' }, icon('lock', 13), ' Moderator')))),
    tabbar);
  tegnNav();
}

function tegnNav(aktiv = S.aktivRute) {
  if (!nav) return;
  const punkter = [['hjem', '#/', 'list', 'Arrangementer'], ['kalender', '#/kalender', 'cal', 'Kalender'], ['opret', '#/opret', 'plus', 'Opret'], ['om', '#/om', 'info', 'Om']];
  if (S.rolle) punkter.push(['mod', '#/mod', 'lock', 'Moderator']);
  clear(nav).append(...punkter.map(([k, href, ik, t]) => h('a', { href, class: (k === aktiv ? 'på ' : '') + (k === 'opret' ? 'nav-opret' : ''), 'aria-current': k === aktiv ? 'page' : null }, t)));
  clear(tabbar).append(...punkter.map(([k, href, ik, t]) => h('a', { href, class: (k === aktiv ? 'på ' : '') + (k === 'opret' ? 'tab-opret' : ''), 'aria-current': k === aktiv ? 'page' : null }, icon(ik, k === 'opret' ? 26 : 22), h('span', null, t))));
}

let rid = 0;
async function rut() {
  const hash = location.hash || '#/';
  const mit = ++rid;
  const side = h('div', { class: 'side' });
  main.replaceChildren(side);
  let aktiv = 'hjem';
  document.title = CONFIG.siteName;
  for (const [mønster, fn, nøgle] of RUTER) {
    const m = hash.match(mønster);
    if (!m) continue;
    aktiv = nøgle; S.aktivRute = nøgle;
    document.title = `${TITLER[nøgle] || ''} – ${CONFIG.siteName}`;
    tegnNav(nøgle);
    try { await fn(side, m); } catch (e) {
      console.error(e);
      if (mit === rid) side.append(h('div', { class: 'tom' }, h('h2', null, 'Noget gik galt'), h('p', null, 'Prøv at genindlæse siden.'), h('a', { class: 'knap primær', href: '#/' }, 'Til forsiden')));
    }
    if (mit === rid) { window.scrollTo(0, 0); }
    return;
  }
  S.aktivRute = 'hjem'; tegnNav('hjem');
  side.append(h('div', { class: 'tom' }, h('h2', null, 'Siden findes ikke'), h('a', { class: 'knap primær', href: '#/' }, 'Til forsiden')));
}

start();
