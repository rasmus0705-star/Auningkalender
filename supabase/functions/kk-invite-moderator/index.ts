import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = "https://rasmus0705-star.github.io/Auningkalender/";
const allowedOrigins = new Set([
  new URL(SITE_URL).origin,
  "http://localhost:8000",
]);

function json(req: Request, status: number, body: Record<string, unknown>) {
  const origin = req.headers.get("origin") || "";
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : new URL(SITE_URL).origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

function apiKey(value: string | undefined, legacyValue: string | undefined): string {
  if (value) {
    try {
      const keys = JSON.parse(value) as Record<string, string>;
      if (keys.default) return keys.default;
      const first = Object.values(keys)[0];
      if (first) return first;
    } catch {
      // Older Supabase projects use the singular legacy environment variables.
    }
  }
  return legacyValue || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, 200, {});

  const origin = req.headers.get("origin") || "";
  if (origin && !allowedOrigins.has(origin)) return json(req, 403, { error: "Ugyldig webadresse." });
  if (req.method !== "POST") return json(req, 405, { error: "Brug POST." });

  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json(req, 401, { error: "Log ind som admin først." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = apiKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"), Deno.env.get("SUPABASE_ANON_KEY"));
  const secretKey = apiKey(Deno.env.get("SUPABASE_SECRET_KEYS"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json(req, 500, { error: "Supabase Edge Function mangler API-konfiguration." });
  }

  const caller = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user || userData.user.is_anonymous) {
    return json(req, 401, { error: "Log ind med din admin-konto først." });
  }

  const { data: role, error: roleError } = await caller.rpc("kk_min_rolle");
  if (roleError) return json(req, 500, { error: "Kunne ikke kontrollere din rolle." });
  if (role !== "admin") return json(req, 403, { error: "Kun admins kan invitere moderatorer." });

  let email = "";
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return json(req, 400, { error: "Ugyldig forespørgsel." });
  }
  if (email.length < 5 || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(req, 400, { error: "Skriv en gyldig e-mailadresse." });
  }
  if (email === userData.user.email?.toLowerCase()) {
    return json(req, 400, { error: "Du er allerede logget ind på din egen konto." });
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: SITE_URL });
  if (inviteError || !invited.user) {
    const message = inviteError?.message || "Invitationen kunne ikke sendes.";
    if (/email_address_not_authorized/i.test(message)) {
      return json(req, 400, { error: "Supabases standardmail sender kun til teamadresser. Konfigurér en SMTP-udbyder for at invitere andre e-mailadresser." });
    }
    if (/already registered|already exists|email_exists/i.test(message)) {
      return json(req, 409, { error: "Der findes allerede en konto til adressen. Brug den eksisterende rolletildeling i stedet." });
    }
    return json(req, 400, { error: message });
  }

  const { error: storeError } = await admin.from("kk_moderator_invites").upsert({
    user_id: invited.user.id,
    email,
    invited_by: userData.user.id,
    invited_at: new Date().toISOString(),
    accepted_at: null,
  }, { onConflict: "user_id" });

  if (storeError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return json(req, 500, { error: "Invitationen blev sendt, men den kunne ikke gemmes. Prøv igen eller kontakt en admin." });
  }

  return json(req, 200, { ok: true, email });
});
