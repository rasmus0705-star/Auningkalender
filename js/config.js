// =====================================================================
// Eneste fil du skal rette for at flytte siden til en anden by.
// Så længe supabaseUrl indeholder "DIT-PROJEKT", kører siden i DEMO-tilstand
// med eksempeldata (ingen database nødvendig).
// =====================================================================
export const CONFIG = {
  // --- Supabase (Project Settings -> API) ---
  supabaseUrl: 'https://DIT-PROJEKT.supabase.co',
  supabaseAnonKey: 'DIN-ANON-NOEGLE',

  // --- Cloudflare Turnstile (valgfri; lad stå tom hvis du ikke bruger captcha) ---
  turnstileSiteKey: '',

  // --- Notifikationer (valgfri; lad stå tom for at skjule klokken) ---
  // Offentlig VAPID-nøgle fra:  npx web-push generate-vapid-keys   (den private nøgle lægges i GitHub som hemmelighed)
  vapidPublicKey: '',

  // --- Din adresse (valgfri; bruges til delingslinks. Tom = samme adresse som siden) ---
  siteUrl: '',

  // --- Navn og tekster ---
  siteName: 'Kulturkalender Auning',
  shortName: 'Kulturkalender',
  tagline: 'Hvad sker der i Auning og omegn?',
  omraadeTekst: 'Auning og omegn',
  by: 'Auning',                  // bruges i søgemaskine-data (adresse)
  defaultOmraade: 'auning',

  // --- Ansvarlig (bruges i privatlivstekst og ansvarsfraskrivelse) ---
  ansvarlig: 'Navn på ansvarlig / forening',
  kontaktEmail: 'kontakt@eksempel.dk',
  facebookUrl: '',               // fx 'https://www.facebook.com/...' – vises i bunden

  // --- Udseende (hex) ---
  farveAccent: '#1f6f54',

  // --- Teknisk ---
  tidszone: 'Europe/Copenhagen',
  maxBilledeBredde: 1400,        // billeder formindskes til denne bredde før upload
  maxFremMaaneder: 18,
};

export const DEMO = CONFIG.supabaseUrl.includes('DIT-PROJEKT');
