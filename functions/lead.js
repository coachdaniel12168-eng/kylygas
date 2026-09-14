/**
 * proofposts.com — lead capture that ACTUALLY stores the lead.
 *
 * Why this exists (2026-09-14): the audit form posted only to two n8n webhooks. Those answer
 * HTTP 200 with an EMPTY body and store nothing — a live test reached none of the candidate
 * tables. So every lead proofposts ever collected evaporated. A 200 from a webhook is not
 * proof of storage, and Daniel was paying for cold email that had nowhere to land.
 *
 * This function stores the lead directly in Supabase at submit time, so it survives n8n being
 * down, misconfigured or absent. The n8n calls are left alone — if they ever work, they still
 * fire; they are simply no longer the only place a lead can go.
 *
 * Destination: kyly.leads (company, domain, contact_name, contact_email, source, campaign,
 * icp_score, stage, status) — a purpose-built lead table that was sitting empty.
 *
 * Env required (set in Cloudflare Pages for the `proofposts` project):
 *   KYLY_SUPABASE_URL          e.g. https://<ref>.supabase.co
 *   KYLY_SUPABASE_SERVICE_KEY  service_role key for the Kyly project (server-side only)
 */

const MAX = { email: 254, name: 120, url: 500, industry: 80 };

// Deliberately strict. The scalesmes form accepted ' OR '1'='1 and <script>alert(1)</script>
// and stored them; that is the exact defect this avoids.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function clean(v, limit) {
  if (typeof v !== "string") return "";
  // strip control chars, collapse whitespace, hard-cap length
  return v.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function hostOf(u) {
  try {
    const s = u.startsWith("http") ? u : "https://" + u;
    return new URL(s).hostname.replace(/^www\./, "").slice(0, 200);
  } catch {
    return "";
  }
}

export async function onRequestPost({ request, env }) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }

  const email = clean(body.email, MAX.email).toLowerCase();
  const name = clean(body.name, MAX.name);
  const rawUrl = clean(body.url, MAX.url);
  const industry = clean(body.industry, MAX.industry);
  const score = Number.isFinite(Number(body.score)) ? Math.round(Number(body.score)) : null;

  if (!email || !EMAIL_RE.test(email)) return json({ ok: false, error: "bad-email" }, 400);
  if (!rawUrl) return json({ ok: false, error: "bad-url" }, 400);

  const domain = hostOf(rawUrl);
  if (!domain || !domain.includes(".")) return json({ ok: false, error: "bad-domain" }, 400);

  const base = env.KYLY_SUPABASE_URL;
  const key = env.KYLY_SUPABASE_SERVICE_KEY;
  if (!base || !key) {
    // Fail LOUDLY. A silent ok:true here is the defect that lost every previous lead.
    console.error("lead.js: KYLY_SUPABASE_URL / KYLY_SUPABASE_SERVICE_KEY not configured");
    return json({ ok: false, error: "not-configured" }, 500);
  }

  const row = {
    // kyly.projects row for GASEO / proofposts (FK target)
    project_id: "0a0f95a8-b5d6-4f8a-bb2c-4178c770fa38",
    company: name || domain,
    domain,
    contact_name: name || null,
    contact_email: email,
    contact_role: industry || null,
    source: "proofposts.com/audit",
    campaign: clean(body.campaign, 80) || "organic",
    icp_score: score,
    stage: "new",
    last_contact_at: new Date().toISOString(),
  };

  try {
    const r = await fetch(base.replace(/\/$/, "") + "/rest/v1/leads", {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        "content-type": "application/json",
        // kyly.leads lives in the `kyly` schema, which is exposed to PostgREST
        "Accept-Profile": "kyly",
        "Content-Profile": "kyly",
        // return the inserted row so we can prove storage rather than assume it
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    const text = await r.text();
    if (!r.ok) {
      console.error("lead.js: supabase rejected", r.status, text.slice(0, 300));
      return json({ ok: false, error: "db-rejected", status: r.status }, 502);
    }
    let id = null;
    try {
      const parsed = JSON.parse(text);
      id = Array.isArray(parsed) && parsed[0] ? parsed[0].id : null;
    } catch {}
    return json({ ok: true, stored: true, id, domain });
  } catch (e) {
    console.error("lead.js: exception", String(e).slice(0, 300));
    return json({ ok: false, error: "exception" }, 500);
  }
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: false, error: "post-only" }), {
    status: 405,
    headers: { "content-type": "application/json" },
  });
}
