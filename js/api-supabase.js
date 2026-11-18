// Supabase-implementering af data-laget. Resten af appen kender kun dette interface.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { cphToISO, nyId } from './util.js';

const BUCKET = 'kk-billeder';

export function createApi(C) {
  const sb = createClient(C.supabaseUrl, C.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const ok = ({ data, error }) => { if (error) throw error; return data; };
  let kategoriTabelTilgaengelig = null;
  const url = (sti) => (sti ? sb.storage.from(BUCKET).getPublicUrl(sti).data.publicUrl : null);
  const med = (r) => ({ ...r, billede_url: url(r.billede_sti) });
  const medKategorier = (r) => {
    const relationer = r.kk_event_kategorier || [];
    const { kk_event_kategorier, ...event } = r;
    return med({ ...event, kategorier: [...new Set([event.kategori, ...relationer.map((x) => x.kategori)])] });
  };
  const gemEkstraKategorier = async (ids, primær, ekstra = [], { erstat = true } = {}) => {
    const slugs = [...new Set(ekstra)].filter((slug) => slug && slug !== primær);
    if (!kategoriTabelTilgaengelig && slugs.length) throw new Error('Kør først sql/07_event_kategorier.sql i Supabase for at bruge ekstra kategorier.');
    if (!kategoriTabelTilgaengelig) return;
    for (const id of ids) {
      if (erstat) ok(await sb.from('kk_event_kategorier').delete().eq('event_id', id));
      if (slugs.length) ok(await sb.from('kk_event_kategorier').insert(slugs.map((kategori) => ({ event_id: id, kategori }))));
    }
  };
  const kraevEkstraKategoriTabel = async (primær, kategorier = []) => {
    const harEkstra = [...new Set(kategorier)].some((slug) => slug && slug !== primær);
    if (!harEkstra || kategoriTabelTilgaengelig === true) return;
    if (kategoriTabelTilgaengelig === null) {
      const probe = await sb.from('kk_event_kategorier').select('event_id').limit(1);
      kategoriTabelTilgaengelig = !probe.error;
    }
    if (!kategoriTabelTilgaengelig) throw new Error('Kør først sql/07_event_kategorier.sql i Supabase for at bruge ekstra kategorier.');
  };
  const hentKategoriserede = async (forespoerg, fallback) => {
    const result = await forespoerg();
    if (result.error) {
      if (!/kk_event_kategorier|relationship/i.test(result.error.message || '')) throw result.error;
      kategoriTabelTilgaengelig = false;
      const data = ok(await fallback());
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      const mapped = rows.map((r) => med({ ...r, kategorier: [r.kategori] }));
      return Array.isArray(data) ? mapped : mapped[0] || null;
    }
    kategoriTabelTilgaengelig = true;
    const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
    const mapped = rows.map(medKategorier);
    return Array.isArray(result.data) ? mapped : mapped[0] || null;
  };
  const aarsstart = () => cphToISO(`${new Date().getFullYear()}-01-01`, '00:00');

  async function billedeIBrug(sti, undtagenId) {
    const { count } = await sb.from('kk_events').select('id', { count: 'exact', head: true }).eq('billede_sti', sti).neq('id', undtagenId || '00000000-0000-0000-0000-000000000000');
    return (count || 0) > 0;
  }
  async function fjernBillede(sti, undtagenId) {
    if (!sti) return;
    try { if (!(await billedeIBrug(sti, undtagenId))) await sb.storage.from(BUCKET).remove([sti]); } catch { /* ikke kritisk */ }
  }
  const brugerFra = (u) => (u ? { id: u.id, email: u.email || null, anonym: !!u.is_anonymous } : null);

  return {
    // ---------- session ----------
    async init() { const { data } = await sb.auth.getSession(); return brugerFra(data.session?.user); },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(brugerFra(s?.user))); },
    async sikrSession(captchaToken) {
      const { data } = await sb.auth.getSession();
      if (data.session) return brugerFra(data.session.user);
      const r = await sb.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
      if (r.error) throw r.error;
      return brugerFra(r.data.user);
    },
    async login(email, kode, captchaToken) {
      const r = await sb.auth.signInWithPassword({ email, password: kode, options: captchaToken ? { captchaToken } : undefined });
      if (r.error) throw r.error;
    },
    async opretKonto(email, kode, captchaToken) {
      const r = await sb.auth.signUp({ email, password: kode, options: captchaToken ? { captchaToken } : undefined });
      if (r.error) throw r.error;
      return { kraeverBekraeftelse: !r.data.session };
    },
    async logud() { await sb.auth.signOut(); },
    async minRolle() { const { data, error } = await sb.rpc('kk_min_rolle'); if (error) return null; return data || null; },

    // ---------- offentligt ----------
    async hentStamdata() {
      const [kategorier, maalgrupper, omraader, steder] = await Promise.all([
        sb.from('kk_kategorier').select('*').eq('aktiv', true).order('sortering'),
        sb.from('kk_maalgrupper').select('*').eq('aktiv', true).order('sortering'),
        sb.from('kk_omraader').select('*').eq('aktiv', true).order('sortering'),
        sb.from('kk_steder').select('*').eq('aktiv', true).order('sortering').order('navn'),
      ]);
      return { kategorier: ok(kategorier), maalgrupper: ok(maalgrupper), omraader: ok(omraader), steder: ok(steder) };
    },
    async hentEvents() {
      return hentKategoriserede(
        () => sb.from('kk_events').select('*, kk_event_kategorier(kategori)').in('status', ['godkendt', 'aflyst']).eq('skjult', false).gte('slut_eff', aarsstart()).order('start_ts').limit(1500),
        () => sb.from('kk_events').select('*').in('status', ['godkendt', 'aflyst']).eq('skjult', false).gte('slut_eff', aarsstart()).order('start_ts').limit(1500));
    },
    async hentEvent(id) {
      return hentKategoriserede(
        () => sb.from('kk_events').select('*, kk_event_kategorier(kategori)').eq('id', id).maybeSingle(),
        () => sb.from('kk_events').select('*').eq('id', id).maybeSingle());
    },
    async konflikter(a) {
      return ok(await sb.rpc('kk_konflikter', {
        p_start: a.start, p_slut: a.slut || null, p_sted_id: a.sted_id || null, p_sted_navn: a.sted_navn || null,
        p_maalgruppe: a.maalgruppe || 'alle', p_ekskluder: a.ekskluder || null,
      }));
    },

    // ---------- oprettelse ----------
    async uploadBillede(blob) {
      const sti = `${nyId()}.jpg`;
      const r = await sb.storage.from(BUCKET).upload(sti, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (r.error) throw r.error;
      return sti;
    },
    async opret(event, kontakt) {
      await kraevEkstraKategoriTabel(event.kategori, event.kategorier || []);
      const ids = ok(await sb.rpc('kk_opret', { p: event, p_kontakt: kontakt || null }));
      if (event.kategorier?.length > 1) await gemEkstraKategorier(ids, event.kategori, event.kategorier, { erstat: false });
      return ids;
    },

    // ---------- rettelink (forslag til ændringer) ----------
    async rettelink(eventId) { return ok(await sb.rpc('kk_rettelink', { p_event: eventId })); },
    async retHent(token) { return ok(await sb.rpc('kk_ret_hent', { p_token: token })); },
    async retSend(token, forslag, kommentar, aflys) { return ok(await sb.rpc('kk_ret_indsend', { p_token: token, p_forslag: forslag, p_kommentar: kommentar || null, p_aflys: !!aflys })); },
    async hentAendringer() { return ok(await sb.from('kk_aendringer').select('*').eq('status', 'afventer').order('oprettet')); },
    async godkendAendring(id) { ok(await sb.rpc('kk_godkend_aendring', { p_id: id })); },
    async afvisAendring(id) { ok(await sb.rpc('kk_afvis_aendring', { p_id: id })); },

    // ---------- notifikationer ----------
    async pushGem({ endpoint, p256dh, auth, alleNye, kategorier }) {
      ok(await sb.rpc('kk_push_gem', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_alle_nye: !!alleNye, p_kategorier: kategorier || [] }));
    },
    async pushAfmeld(endpoint) { ok(await sb.rpc('kk_push_afmeld', { p_endpoint: endpoint })); },
    async pushFoelg(endpoint, ids) { ok(await sb.rpc('kk_push_foelg', { p_endpoint: endpoint, p_events: ids })); },

    // ---------- moderator ----------
    async hentModEvents() {
      const rows = await hentKategoriserede(
        () => sb.from('kk_events').select('*, kk_kontakt(*), kk_event_kategorier(kategori)').order('start_ts').limit(3000),
        () => sb.from('kk_events').select('*, kk_kontakt(*)').order('start_ts').limit(3000));
      return rows.map((r) => { const k = Array.isArray(r.kk_kontakt) ? r.kk_kontakt[0] : r.kk_kontakt; const { kk_kontakt, ...rest } = r; return { ...rest, kontakt: k || null }; });
    },
    async hentModEvent(id) {
      const r = await hentKategoriserede(
        () => sb.from('kk_events').select('*, kk_kontakt(*), kk_event_kategorier(kategori)').eq('id', id).maybeSingle(),
        () => sb.from('kk_events').select('*, kk_kontakt(*)').eq('id', id).maybeSingle());
      if (!r) return null;
      const k = Array.isArray(r.kk_kontakt) ? r.kk_kontakt[0] : r.kk_kontakt;
      const { kk_kontakt, ...rest } = r;
      return { ...rest, kontakt: k || null };
    },
    async opdaterEvent(id, patch) {
      const { kategorier, ...eventPatch } = patch;
      if (kategorier) await kraevEkstraKategoriTabel(eventPatch.kategori, kategorier);
      ok(await sb.from('kk_events').update(eventPatch).eq('id', id));
      if (kategorier) await gemEkstraKategorier([id], eventPatch.kategori, kategorier);
    },
    async gemKontakt(id, k) {
      if (!k || !k.navn || (!k.email && !k.telefon)) return;
      ok(await sb.from('kk_kontakt').upsert({ event_id: id, navn: k.navn, email: k.email || null, telefon: k.telefon || null }));
    },
    async skiftBillede(id, gammelSti, nyBlob) {
      const sti = await this.uploadBillede(nyBlob);
      ok(await sb.from('kk_events').update({ billede_sti: sti }).eq('id', id));
      await fjernBillede(gammelSti, id);
      return sti;
    },
    async fjernEventBillede(id, gammelSti) {
      ok(await sb.from('kk_events').update({ billede_sti: null }).eq('id', id));
      await fjernBillede(gammelSti, id);
    },
    async sletEvent(id, billedeSti) {
      ok(await sb.from('kk_events').delete().eq('id', id));
      await fjernBillede(billedeSti, id);
    },

    // ---------- admin ----------
    async hentRoller() { return ok(await sb.rpc('kk_hent_roller')); },
    async tildelRolle(email, rolle) { ok(await sb.rpc('kk_tildel_rolle', { p_email: email, p_rolle: rolle })); },
    async inviterModerator(email) { return ok(await sb.functions.invoke('kk-invite-moderator', { body: { email } })); },
    async moderatorInvitationAfventer() { return ok(await sb.rpc('kk_moderator_invite_pending')); },
    async accepterModeratorInvitation(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      return ok(await sb.rpc('kk_moderator_invite_accept'));
    },
    async hentTabel(tabel) {
      const orden = { kk_kategorier: 'sortering', kk_maalgrupper: 'sortering', kk_omraader: 'sortering', kk_steder: 'sortering', kk_afvisningsaarsager: 'id', kk_ordliste: 'id' }[tabel];
      return ok(await sb.from(tabel).select('*').order(orden));
    },
    async gemRække(tabel, række) { ok(await sb.from(tabel).upsert(række)); },
    async sletRække(tabel, pk, værdi) { ok(await sb.from(tabel).delete().eq(pk, værdi)); },
    async hentAfvisningsaarsager() { return ok(await sb.from('kk_afvisningsaarsager').select('*').eq('aktiv', true).order('id')); },
    async hentUbrugteBilleder() {
      const lager = [];
      for (let off = 0; ; off += 1000) {
        const r = await sb.storage.from(BUCKET).list('', { limit: 1000, offset: off, sortBy: { column: 'created_at', order: 'asc' } });
        if (r.error) throw r.error;
        lager.push(...r.data);
        if (r.data.length < 1000) break;
      }
      const brugt = new Set();
      for (let fra = 0; ; fra += 1000) {
        const rows = ok(await sb.from('kk_events').select('billede_sti').not('billede_sti', 'is', null).range(fra, fra + 999));
        rows.forEach((x) => brugt.add(x.billede_sti));
        if (rows.length < 1000) break;
      }
      const graense = Date.now() - 2 * 3600e3;   // nyuploadede billeder (under 2 timer) røres ikke
      return lager.filter((o) => /\.jpg$/i.test(o.name || '') && !brugt.has(o.name) && new Date(o.created_at).getTime() < graense)
        .map((o) => ({ navn: o.name, bytes: o.metadata?.size || 0 }));
    },
    async sletBilleder(navne) { for (let i = 0; i < navne.length; i += 50) { const r = await sb.storage.from(BUCKET).remove(navne.slice(i, i + 50)); if (r.error) throw r.error; } },
    async hentGamle() { return ok(await sb.rpc('kk_gamle')); },
    async rydGamle(liste) {
      const stier = [...new Set(liste.map((x) => x.billede_sti).filter(Boolean))];
      for (let i = 0; i < stier.length; i += 50) await sb.storage.from(BUCKET).remove(stier.slice(i, i + 50));
      return ok(await sb.rpc('kk_slet_gamle'));
    },
  };
}
