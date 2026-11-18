// Kører hver time i GitHub Actions (se .github/workflows/kk-job.yml).
//  1. Laver søgbare sider til hvert arrangement (d/<id>/), en oversigt (d/), sitemap.xml og robots.txt.
//     Siderne har billede, tekst og søgemaskine-data (schema.org/Event), så de både kan deles på Facebook og findes via Google.
//  2. Sender push: nye arrangementer, påmindelse dagen før og aflysninger.
//  3. Rydder op i døde/inaktive enheder og holder GitHub-jobbet i live.
// Kræver: DATABASE_URL (hemmelig; se sql/05_job_rolle.sql). Push kræver også VAPID_PUBLIC_KEY og VAPID_PRIVATE_KEY.
// Valgfrit: SITE_URL, DRY_RUN=1 (sender/ændrer intet).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.env.DRY_RUN === '1';
const DB = process.env.DATABASE_URL || '';
if (!DB) { console.warn('DATABASE_URL er ikke sat som GitHub-hemmelighed endnu – springer over.'); process.exit(0); }

// ---------- config.js læses som tekst ----------
const CONFIG = new Function(fs.readFileSync(path.join(ROD, 'js/config.js'), 'utf8').replace(/export const /g, 'const ') + '\nreturn CONFIG;')();
const TZ = CONFIG.tidszone || 'Europe/Copenhagen';
const STORAGE = `${CONFIG.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/kk-billeder/`;

function siteUrl() {
  let u = process.env.SITE_URL || CONFIG.siteUrl || '';
  if (!u && fs.existsSync(path.join(ROD, 'CNAME'))) u = 'https://' + fs.readFileSync(path.join(ROD, 'CNAME'), 'utf8').trim();
  if (!u && process.env.GITHUB_REPOSITORY) {
    const [ejer, repo] = process.env.GITHUB_REPOSITORY.split('/');
    u = repo.toLowerCase() === `${ejer.toLowerCase()}.github.io` ? `https://${ejer}.github.io` : `https://${ejer}.github.io/${repo}`;
  }
  return u.replace(/\/+$/, '') + '/';
}
const SITE = siteUrl();

// ---------- Database ----------
const sslFra = /sslmode=disable/.test(DB) ? false : { rejectUnauthorized: false };
const db = new pg.Client({ connectionString: DB.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, ''), ssl: sslFra });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const skriv = async (sql, params = []) => {
  if (DRY) { console.log('[dry-run] ville køre:', sql.replace(/\s+/g, ' ').slice(0, 90)); return []; }
  return q(sql, params);
};
const nu = new Date();

// ---------- Tekst og datoer ----------
const delerIDK = (d, opt) => new Intl.DateTimeFormat('da-DK', { timeZone: TZ, ...opt }).format(new Date(d));
const dagNøgle = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(d)); // YYYY-MM-DD
const kl = (d) => delerIDK(d, { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
const lang = (d) => delerIDK(d, { weekday: 'long', day: 'numeric', month: 'long' });
const stort = (s) => s.replace(/^./, (c) => c.toUpperCase());
// Arrangement uden kendt tidspunkt gemmes kl. 00:00 (evt. slut 23:59) og vises som "Tid følger"
const udenTid = (e) => kl(e.start_ts) === '00:00' && (!e.slut_ts || kl(e.slut_ts) === '23:59');
function dagTekst(d) {
  const nøgle = dagNøgle(d);
  if (nøgle === dagNøgle(nu)) return 'I dag';
  if (nøgle === dagNøgle(new Date(nu.getTime() + 864e5))) return 'I morgen';
  return stort(lang(d));
}
const hvornår = (e) => {
  const u = udenTid(e);
  const flere = e.slut_ts && dagNøgle(e.slut_ts) > dagNøgle(e.start_ts);
  if (flere) return `${stort(lang(e.start_ts))}${u ? '' : ' kl. ' + kl(e.start_ts)} – ${lang(e.slut_ts)}${u ? '' : ' kl. ' + kl(e.slut_ts)}`;
  if (u) return `${stort(lang(e.start_ts))} · tid følger`;
  return `${stort(lang(e.start_ts))} kl. ${kl(e.start_ts)}${e.slut_ts ? '–' + kl(e.slut_ts) : ''}`;
};
// ISO-tid med dansk tidszone, fx 2026-11-27T14:00:00+01:00
function lokalISO(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  const off = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(new Date(d)).find((x) => x.type === 'timeZoneName').value.replace('GMT', '') || '+00:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`;
}
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kort = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const skrivFil = (fil, indhold) => {
  if (fs.existsSync(fil) && fs.readFileSync(fil, 'utf8') === indhold) return false;
  if (DRY) { console.log('[dry-run] ville skrive', fil); return false; }
  fs.mkdirSync(path.dirname(fil), { recursive: true });
  fs.writeFileSync(fil, indhold);
  return true;
};

// ---------- 1. Søgbare sider, delingskort, sitemap ----------
const STIL = `*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d2521;background:#faf9f5}
a{color:${CONFIG.farveAccent}}header.top{background:#fff;border-bottom:1px solid #e6e2d8;padding:.8rem 1rem}header.top a{font-weight:800;text-decoration:none;color:#1d2521}
main{max-width:46rem;margin:0 auto;padding:1.25rem 1rem 3rem}img.hero{width:100%;max-height:26rem;object-fit:cover;border-radius:14px;display:block;margin-bottom:1rem}
h1{font-size:1.9rem;line-height:1.2;margin:.25rem 0 .75rem}.pille{display:inline-block;background:#e9f1ed;color:${CONFIG.farveAccent};border-radius:999px;padding:.15rem .7rem;font-size:.85rem;font-weight:700}
.aflyst{background:#fde8e8;color:#9b1c1c;border-radius:10px;padding:.5rem .9rem;font-weight:700;margin:.5rem 0}dl{display:grid;grid-template-columns:7rem 1fr;gap:.35rem 1rem;margin:1rem 0}dt{font-weight:700;color:#5b6660}dd{margin:0}
.knapper{display:flex;flex-wrap:wrap;gap:.6rem;margin:1.2rem 0}.knap{display:inline-block;padding:.65rem 1.1rem;border-radius:999px;border:1.5px solid ${CONFIG.farveAccent};text-decoration:none;font-weight:700;color:${CONFIG.farveAccent}}
.knap.primær{background:${CONFIG.farveAccent};color:#fff}ul.liste{list-style:none;padding:0}ul.liste li{padding:.55rem 0;border-bottom:1px solid #e6e2d8}ul.liste small{color:#5b6660;display:block}
footer{max-width:46rem;margin:0 auto;padding:1rem;color:#5b6660;font-size:.9rem}h2{margin-top:2rem}`;

function side({ titel, ogTitel, beskr, url, billede, jsonld, krop, noindex = false }) {
  return `<!doctype html>
<html lang="da"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)}</title>
<meta name="description" content="${esc(beskr)}">
<meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large'}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="${esc(CONFIG.farveAccent)}">
<meta property="og:type" content="${jsonld ? 'article' : 'website'}">
<meta property="og:site_name" content="${esc(CONFIG.siteName)}">
<meta property="og:title" content="${esc(ogTitel || titel)}">
<meta property="og:description" content="${esc(beskr)}">
<meta property="og:image" content="${esc(billede)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:locale" content="da_DK">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${esc(SITE)}icons/favicon.svg" type="image/svg+xml">
<style>${STIL}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head><body>
<header class="top"><a href="${esc(SITE)}">${esc(CONFIG.siteName)}</a></header>
<main>${krop}</main>
<footer><a href="${esc(SITE)}d/">Alle kommende arrangementer</a> · <a href="${esc(SITE)}">Åbn kalenderen som app</a> · ${esc(CONFIG.siteName)}, ${esc(CONFIG.omraadeTekst)}</footer>
</body></html>
`;
}

async function søgbareSider() {
  const aarsstart = `${nu.getFullYear()}-01-01T00:00:00Z`;
  const events = await q(`select id, titel, beskrivelse, start_ts, slut_ts, slut_eff, sted_id, sted_navn, adresse, kategori, pris_tekst, billede_sti, status, arrangoer, link_url, opdateret
    from kk_events where status in ('godkendt','aflyst') and not skjult and slut_eff >= $1 order by start_ts limit 2000`, [aarsstart]);
  const kats = Object.fromEntries((await q('select slug, navn from kk_kategorier')).map((k) => [k.slug, k.navn]));
  const stedAdr = Object.fromEntries((await q('select id, navn, adresse from kk_steder')).map((s) => [s.id, s]));
  const kommende = events.filter((e) => new Date(e.slut_eff) >= nu);
  const mappe = path.join(ROD, 'd');
  const nuværende = new Set();
  let skrevet = 0;

  for (const e of events) {
    nuværende.add(e.id);
    const sted = e.sted_navn || stedAdr[e.sted_id]?.navn || '';
    const adresse = e.adresse || stedAdr[e.sted_id]?.adresse || '';
    const aflyst = e.status === 'aflyst';
    const hv = hvornår(e);
    const url = `${SITE}d/${e.id}/`;
    const billede = e.billede_sti ? `${STORAGE}${e.billede_sti}` : `${SITE}icons/og-standard.png`;
    const beskr = [aflyst ? 'Aflyst' : null, hv, sted, (e.pris_tekst || '').trim() || null].filter(Boolean).join(' · ') + (e.beskrivelse ? ` — ${kort(e.beskrivelse, 150)}` : '');
    const ogTitel = `${aflyst ? 'AFLYST: ' : ''}${e.titel}`;
    const titel = `${ogTitel} – ${lang(e.start_ts)}${sted ? ' – ' + sted : ''} | ${CONFIG.siteName}`;
    const u = udenTid(e);
    const jsonld = {
      '@context': 'https://schema.org', '@type': 'Event', name: e.titel, description: kort(e.beskrivelse || beskr, 500) || e.titel,
      startDate: u ? dagNøgle(e.start_ts) : lokalISO(e.start_ts),
      ...(e.slut_ts ? { endDate: u ? dagNøgle(e.slut_ts) : lokalISO(e.slut_ts) } : {}),
      eventStatus: aflyst ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: sted || CONFIG.by || CONFIG.omraadeTekst, address: { '@type': 'PostalAddress', ...(adresse ? { streetAddress: adresse } : {}), addressLocality: CONFIG.by || 'Auning', addressCountry: 'DK' } },
      image: [billede], url,
      ...(e.arrangoer && !/^ikke oplyst$/i.test(e.arrangoer) ? { organizer: { '@type': 'Organization', name: e.arrangoer } } : {}),
      ...(/^gratis/i.test(e.pris_tekst || '') ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'DKK', url, availability: 'https://schema.org/InStock' } } : {}),
    };
    const andre = kommende.filter((x) => x.id !== e.id && x.start_ts >= e.start_ts).slice(0, 4);
    const krop = `
${e.billede_sti ? `<img class="hero" src="${esc(billede)}" alt="" width="1200" height="630">` : ''}
<span class="pille">${esc(kats[e.kategori] || 'Arrangement')}</span>
<h1>${esc(e.titel)}</h1>
${aflyst ? '<div class="aflyst">Dette arrangement er aflyst</div>' : ''}
<dl>
<dt>Hvornår</dt><dd>${esc(hv)}</dd>
${sted ? `<dt>Hvor</dt><dd>${esc(sted)}${adresse ? '<br>' + esc(adresse) : ''}</dd>` : ''}
<dt>Pris</dt><dd>${esc((e.pris_tekst || '').trim() || 'Ikke oplyst')}</dd>
${e.arrangoer && !/^ikke oplyst$/i.test(e.arrangoer) ? `<dt>Arrangør</dt><dd>${esc(e.arrangoer)}</dd>` : ''}
</dl>
${(e.beskrivelse || '').split(/\n{2,}/).filter(Boolean).map((a) => `<p>${esc(a).replace(/\n/g, '<br>')}</p>`).join('\n')}
<div class="knapper">
<a class="knap primær" href="${esc(SITE)}#/event/${esc(e.id)}">Åbn i kalenderen</a>
${e.link_url ? `<a class="knap" href="${esc(e.link_url)}" rel="nofollow noopener" target="_blank">Mere info</a>` : ''}
</div>
${andre.length ? `<h2>Flere arrangementer</h2><ul class="liste">${andre.map((x) => `<li><a href="${esc(SITE)}d/${x.id}/">${esc(x.titel)}</a><small>${esc(hvornår(x))}</small></li>`).join('')}</ul>` : ''}`;
    if (skrivFil(path.join(mappe, e.id, 'index.html'), side({ titel, ogTitel, beskr, url, billede, jsonld, krop }))) skrevet++;
  }

  // Oversigt over kommende arrangementer (linkes fra forsiden, så søgemaskiner finder siderne)
  const perMåned = new Map();
  for (const e of kommende) { const m = stort(delerIDK(e.start_ts, { month: 'long', year: 'numeric' })); (perMåned.get(m) || perMåned.set(m, []).get(m)).push(e); }
  const oversigt = `<h1>Kommende arrangementer i ${esc(CONFIG.omraadeTekst)}</h1>
<p>${kommende.length} arrangementer. <a href="${esc(SITE)}">Åbn kalenderen</a> for filtre, kalendervisning og påmindelser.</p>
${[...perMåned].map(([m, liste]) => `<h2>${esc(m)}</h2><ul class="liste">${liste.map((x) => `<li><a href="${esc(SITE)}d/${x.id}/">${x.status === 'aflyst' ? 'AFLYST: ' : ''}${esc(x.titel)}</a><small>${esc(hvornår(x))}${x.sted_navn || stedAdr[x.sted_id] ? ' · ' + esc(x.sted_navn || stedAdr[x.sted_id].navn) : ''}</small></li>`).join('')}</ul>`).join('\n')}`;
  skrivFil(path.join(mappe, 'index.html'), side({ titel: `Kommende arrangementer i ${CONFIG.omraadeTekst} | ${CONFIG.siteName}`, ogTitel: `Kommende arrangementer i ${CONFIG.omraadeTekst}`, beskr: `Oversigt over kommende arrangementer i ${CONFIG.omraadeTekst}: koncerter, foredrag, børn og familie, sport, markeder og meget mere.`, url: `${SITE}d/`, billede: `${SITE}icons/og-standard.png`, krop: oversigt }));

  // Sitemap og robots
  const urls = [[SITE, nu], [`${SITE}d/`, nu], ...events.map((e) => [`${SITE}d/${e.id}/`, e.opdateret])];
  skrivFil(path.join(ROD, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, m]) => `<url><loc>${esc(u)}</loc><lastmod>${new Date(m).toISOString().slice(0, 10)}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  skrivFil(path.join(ROD, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);

  // Fjern sider til arrangementer, der ikke længere findes
  let fjernet = 0;
  if (fs.existsSync(mappe)) for (const navn of fs.readdirSync(mappe)) {
    if (!/^[0-9a-f-]{36}$/i.test(navn) || nuværende.has(navn)) continue;
    if (!DRY) fs.rmSync(path.join(mappe, navn), { recursive: true, force: true });
    fjernet++;
  }
  // Hjerteslag: én lille ændring om ugen holder repoet "aktivt", så GitHub ikke slår timejobbet fra efter 60 dages stilstand
  const uge = Math.floor((nu.getTime() - Date.UTC(2024, 0, 1)) / (7 * 864e5));
  skrivFil(path.join(mappe, '.hjerteslag'), `uge ${uge}\n`);

  // Forsiden: adresse og billede til deling
  const idx = path.join(ROD, 'index.html');
  let s = fs.readFileSync(idx, 'utf8');
  const sæt = (prop, værdi) => { s = s.replace(new RegExp(`(<meta property="${prop}" content=")[^"]*(")`), `$1${esc(værdi)}$2`); };
  sæt('og:url', SITE); sæt('og:image', `${SITE}icons/og-standard.png`); sæt('og:title', CONFIG.siteName); sæt('og:site_name', CONFIG.siteName);
  sæt('og:description', `${CONFIG.tagline} Alle arrangementer i ${CONFIG.omraadeTekst} samlet ét sted.`);
  if (!DRY) fs.writeFileSync(idx, s);
  console.log(`Søgbare sider: ${events.length} arrangementer, ${skrevet} skrevet/opdateret, ${fjernet} fjernet. Site: ${SITE}`);
}

// ---------- 2. Push ----------
let webpush = null;
async function startPush() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) { console.log('Push springes over (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY mangler).'); return false; }
  webpush = (await import('web-push')).default;
  const emne = /@/.test(CONFIG.kontaktEmail || '') && !/eksempel\.dk$/.test(CONFIG.kontaktEmail) ? `mailto:${CONFIG.kontaktEmail}` : (process.env.VAPID_SUBJECT || SITE);
  webpush.setVapidDetails(emne, pub, priv);
  return true;
}

const døde = new Set();
async function send(abo, payload) {
  if (DRY) { console.log('[dry-run] ville sende til', abo.endpoint.slice(0, 40) + '…', JSON.stringify(payload)); return 'ok'; }
  try {
    await webpush.sendNotification({ endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' });
    return 'ok';
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { døde.add(abo.id); return 'død'; }
    console.warn('Push fejlede', e.statusCode || '', String(e.body || e.message).slice(0, 120));
    return 'fejl';
  }
}
const tidslinje = (e) => (udenTid(e) ? dagTekst(e.start_ts) : `${dagTekst(e.start_ts)} kl. ${kl(e.start_ts)}`);

async function nyeArrangementer() {
  // Alt der allerede er slut eller aflyst markeres uden at sende
  await skriv(`update kk_events set notificeret_ts = now() where status in ('godkendt','aflyst') and notificeret_ts is null and (slut_eff < now() or status = 'aflyst')`);
  const nye = await q(`select id, titel, start_ts, slut_ts, kategori, sted_navn, sted_id, serie_id from kk_events
    where status = 'godkendt' and not skjult and notificeret_ts is null and slut_eff >= now() order by start_ts limit 500`);
  if (!nye.length) return console.log('Nye arrangementer: ingen.');
  const abonnenter = await q('select id, endpoint, p256dh, auth, alle_nye, kategorier from kk_abonnenter where alle_nye or cardinality(kategorier) > 0 limit 20000');
  const steder = Object.fromEntries((await q('select id, navn from kk_steder')).map((s) => [s.id, s.navn]));

  // Serier samles til én besked
  const grupper = [], serier = new Map();
  for (const e of nye) {
    if (e.serie_id) {
      if (serier.has(e.serie_id)) { serier.get(e.serie_id).antal++; continue; }
      const g = { ...e, antal: 1 }; serier.set(e.serie_id, g); grupper.push(g);
    } else grupper.push({ ...e, antal: 1 });
  }
  let sendt = 0;
  for (const a of abonnenter) {
    const mine = grupper.filter((g) => a.alle_nye || (a.kategorier || []).includes(g.kategori));
    if (!mine.length) continue;
    const beskeder = mine.length > 3
      ? [{ titel: `${mine.length} nye arrangementer`, tekst: mine.slice(0, 3).map((g) => g.titel).join(', ') + ' m.fl.', url: '#/', tag: 'kk-nye' }]
      : mine.map((g) => ({
        titel: `Nyt: ${g.titel}${g.antal > 1 ? ` (${g.antal} datoer)` : ''}`,
        tekst: [g.antal > 1 ? `Første gang ${tidslinje(g).toLowerCase()}` : tidslinje(g), g.sted_navn || steder[g.sted_id]].filter(Boolean).join(' · '),
        url: `#/event/${g.id}`, tag: `kk-ny-${g.id}`,
      }));
    for (const b of beskeder) { if ((await send(a, b)) === 'ok') sendt++; }
  }
  await skriv('update kk_events set notificeret_ts = now() where id = any($1::uuid[])', [nye.map((e) => e.id)]);
  console.log(`Nye arrangementer: ${nye.length} nye, ${sendt} beskeder sendt.`);
}

async function foelgere(events, felt, besked) {
  if (!['paamindelse_sendt', 'aflyst_sendt'].includes(felt)) throw new Error('Ugyldigt felt');
  if (!events.length) return 0;
  const rækker = await q(`select f.event_id, a.id, a.endpoint, a.p256dh, a.auth from kk_foelger f join kk_abonnenter a on a.id = f.abonnent_id
    where f.event_id = any($1::uuid[]) and not f.${felt} limit 20000`, [events.map((e) => e.id)]);
  const perEvent = Object.fromEntries(events.map((e) => [e.id, e]));
  let sendt = 0;
  const klare = new Map(); // event_id -> [abonnent_id]
  for (const r of rækker) {
    if (døde.has(r.id)) continue;
    if ((await send(r, besked(perEvent[r.event_id]))) === 'ok') { sendt++; (klare.get(r.event_id) || klare.set(r.event_id, []).get(r.event_id)).push(r.id); }
  }
  for (const [eventId, ids] of klare) await skriv(`update kk_foelger set ${felt} = true where event_id = $1 and abonnent_id = any($2::uuid[])`, [eventId, ids]);
  return sendt;
}

async function paamindelser() {
  const kommende = await q(`select id, titel, start_ts, slut_ts, sted_navn, sted_id from kk_events
    where status = 'godkendt' and not skjult and start_ts >= now() and start_ts <= now() + interval '26 hours' limit 500`);
  const steder = Object.fromEntries((await q('select id, navn from kk_steder')).map((s) => [s.id, s.navn]));
  const n = await foelgere(kommende, 'paamindelse_sendt', (e) => ({
    titel: e.titel, tekst: [tidslinje(e), e.sted_navn || steder[e.sted_id]].filter(Boolean).join(' · '), url: `#/event/${e.id}`, tag: `kk-paamind-${e.id}`,
  }));
  console.log(`Påmindelser: ${kommende.length} arrangementer inden for 26 timer, ${n} beskeder sendt.`);
}

async function aflysninger() {
  const aflyste = await q(`select id, titel, start_ts, slut_ts from kk_events where status = 'aflyst' and not skjult and slut_eff >= now() limit 500`);
  const n = await foelgere(aflyste, 'aflyst_sendt', (e) => ({
    titel: `Aflyst: ${e.titel}`, tekst: `Arrangementet ${hvornår(e).toLowerCase()} er desværre aflyst.`, url: `#/event/${e.id}`, tag: `kk-aflyst-${e.id}`,
  }));
  console.log(`Aflysninger: ${aflyste.length} aflyste kommende arrangementer, ${n} beskeder sendt.`);
}

async function oprydning() {
  if (døde.size) { await skriv('delete from kk_abonnenter where id = any($1::uuid[])', [[...døde]]); console.log(`Fjernede ${døde.size} døde enheder.`); }
  await skriv(`delete from kk_abonnenter where opdateret < now() - interval '120 days'`);
}

// ---------- Kør ----------
const trin = [['Søgbare sider', søgbareSider]];
if (await startPush()) trin.push(['Nye arrangementer', nyeArrangementer], ['Påmindelser', paamindelser], ['Aflysninger', aflysninger], ['Oprydning', oprydning]);
let fejl = 0;
for (const [navn, fn] of trin) {
  try { await fn(); } catch (e) { fejl++; console.error(`FEJL i "${navn}":`, e.message); }
}
await db.end();
process.exit(fejl ? 1 : 0);
