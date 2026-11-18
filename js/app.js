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

let main, nav, tabbar;

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
    S.api.onAuth(async (u) => { S.user = u; await opdaterRolle(); tegnNav(); });
    await indlaesStamdata();
  } catch (e) {
    console.error(e);
    clear(app).append(h('div', { class: 'tom' }, h('h2', null, 'Kalenderen kunne ikke starte'), h('p', null, 'Tjek din internetforbindelse, og at Supabase-nøglerne i js/config.js er rigtige.'), h('pre', { class: 'dæmpet' }, String(e.message || e))));
    return;
  }
  bygLayout(app);
  window.addEventListener('hashchange', rut);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installPrompt = e; });
  rut();
  opfriskPush();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
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
