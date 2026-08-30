// GASEO (proofposts.com) — subscription checkout via Airwallex Billing.
// Creates a monthly subscription checkout for Starter / Pro / Agency.
// Runs server-side on Cloudflare Pages (secrets come from env vars).

const PLAN_PRICES = {
  starter: "pri_sgpdhl9k5hkcbr37g00",   // $99/mo
  pro: "pri_sgpdlqnjvhkcbr426jj",       // $243/mo
  agency: "pri_sgpdrtlplhkcbr4rggc",    // $585/mo
};

const LEGAL_ENTITY_ID = "le_cbCXmb2ZOOC9JHEcwi0UTw";
const LINKED_PAYMENT_ACCOUNT_ID = "acct_VWeQN0dyNtKTe6yiZSuKwg";
const AIRWALLEX = "https://api.airwallex.com";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function json(resp, status, headers) {
  return new Response(JSON.stringify(resp), { status, headers });
}

export async function onRequestPost({ request, env }) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400, headers);
  }

  const plan = String(body.plan || "").toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  const priceId = PLAN_PRICES[plan];
  const audit = (body.audit && typeof body.audit === "object") ? body.audit : null;

  if (!priceId) {
    return json({ error: "Unknown plan. Use starter, pro, or agency." }, 400, headers);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Please enter a valid email address." }, 400, headers);
  }

  // Persist subscriber intent (email + plan + day-0 audit scores) for the report cadence.
  const su = env.SUPABASE_URL, sk = env.SUPABASE_SERVICE_KEY;
  if (su && sk) {
    try {
      const row = { customer_email: email, plan, status: "checkout_started" };
      if (audit) {
        row.site_url = audit.site || null;
        row.competitor_urls = Array.isArray(audit.competitors) ? audit.competitors : null;
        row.initial_scores = (audit.overall || audit.dims) ? { overall: audit.overall, dims: audit.dims } : null;
        row.industry = audit.industry || null;
      }
      await fetch(su + "/rest/v1/gaseo_subscribers?on_conflict=customer_email", {
        method: "POST",
        headers: {
          apikey: sk, Authorization: "Bearer " + sk,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation,missing=default",
        },
        body: JSON.stringify(row),
      });
    } catch (e) { /* non-fatal — checkout must not fail on store errors */ }
  }

  const clientId = env.AIRWALLEX_CLIENT_ID;
  const apiKey = env.AIRWALLEX_API_KEY;
  if (!clientId || !apiKey) {
    return json({ error: "Billing is not configured yet." }, 500, headers);
  }

  try {
    const login = await fetch(AIRWALLEX + "/api/v1/authentication/login", {
      method: "POST",
      headers: { "x-client-id": clientId, "x-api-key": apiKey, "Content-Type": "application/json" },
    });
    const auth = await login.json();
    if (!auth.token) throw new Error("auth failed");

    const r = await fetch(AIRWALLEX + "/api/v1/billing/billing_checkouts/create", {
      method: "POST",
      headers: { Authorization: "Bearer " + auth.token, "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: uuid(),
        legal_entity_id: LEGAL_ENTITY_ID,
        linked_payment_account_id: LINKED_PAYMENT_ACCOUNT_ID,
        customer_data: { email },
        line_items: [{ price_id: priceId, quantity: 1 }],
        mode: "SUBSCRIPTION",
        subscription_data: { trial_period_days: 30 },
        success_url: "https://proofposts.com/?subscribed=1",
        cancel_url: "https://proofposts.com/#pricing",
      }),
    });
    const checkout = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(checkout));

    return json({ url: checkout.url }, 200, headers);
  } catch (e) {
    return json({ error: "Could not start checkout. Please try again." }, 500, headers);
  }
}
