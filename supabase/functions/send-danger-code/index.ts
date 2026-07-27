// =====================================================================
//  MAGPMS — send-danger-code
//  Creates a 6-digit confirmation code for a destructive admin action
//  and e-mails it to the address saved in app_security_settings.
//
//  The code never travels to the browser: the page only asks the admin to
//  type it back, and admin_verify_danger_code (SQL) checks it.
//
//  Deploy:
//    supabase functions deploy send-danger-code
//    supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="MAGPMS <alerts@yourdomain>"
//  (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
//
//  Any transactional mail provider works — swap the sendEmail() body.
// =====================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "MAGPMS <onboarding@resend.dev>";

const ACTIONS: Record<string, string> = {
  reset_all_data: "reset ALL station data",
};

/** Minimal PostgREST helper using the service role key. */
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`db ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : await res.json();
}

function maskEmail(email: string) {
  return email.replace(/^(.).*(.)@/, "$1***$2@");
}

async function sendEmail(to: string, code: string, what: string) {
  if (!RESEND_API_KEY) throw new Error("No mail provider configured (RESEND_API_KEY missing)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [to],
      subject: `MAGPMS confirmation code: ${code}`,
      text:
        `Someone is trying to ${what} in MAGPMS.\n\n` +
        `Confirmation code: ${code}\n` +
        `It expires in 10 minutes.\n\n` +
        `If this was not you, do NOT share this code and change the admin password now.`,
    }),
  });
  if (!res.ok) throw new Error(`mail ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, message: "POST only" }, 405);

  try {
    const { admin_id, action } = await req.json();
    if (!admin_id) return json({ success: false, message: "admin_id is required" }, 400);
    const what = ACTIONS[action];
    if (!what) return json({ success: false, message: "Unknown action" }, 400);

    const settings = await db("app_security_settings?id=eq.1&select=contact_email");
    const email: string | null = settings?.[0]?.contact_email ?? null;
    if (!email) {
      return json({ success: false, message: "No confirmation e-mail is set for this station" }, 400);
    }

    // Rate limit: at most 3 codes per admin+action in 10 minutes.
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const recent = await db(
      `danger_confirm_codes?admin_id=eq.${encodeURIComponent(admin_id)}` +
        `&action=eq.${encodeURIComponent(action)}&created_at=gte.${since}&select=id`,
    );
    if (Array.isArray(recent) && recent.length >= 3) {
      return json({ success: false, message: "Too many codes requested — wait a few minutes" }, 429);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await db("danger_confirm_codes", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        admin_id: String(admin_id),
        action,
        code,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      }),
    });

    await sendEmail(email, code, what);
    return json({ success: true, masked_email: maskEmail(email), message: "Code sent" });
  } catch (err) {
    console.error(err);
    return json({ success: false, message: "Could not send the confirmation e-mail" }, 500);
  }
});
