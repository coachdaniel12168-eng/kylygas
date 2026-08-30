// GASEO (proofposts.com) — Airwallex Billing webhook handler.
// Verifies x-signature = HMAC-SHA256(AIRWALLEX_WEBHOOK_SECRET, x-timestamp + raw body),
// then emails Daniel on subscription lifecycle events so he can provision/revoke/chase.
// Registered URL: https://proofposts.com/billing-webhook

const PLAN_PRICES = {
  "pri_sgpdhl9k5hkcbr37g00": "GASEO Starter ($99/mo)",
  "pri_sgpdlqnjvhkcbr426jj": "GASEO Pro ($243/mo)",
  "pri_sgpdrtlplhkcbr4rggc": "GASEO Agency ($585/mo)",
};

async function hmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function planFromEvent(event) {
  const needle = JSON.stringify(event);
  for (const pid of Object.keys(PLAN_PRICES)) {
    if (needle.includes(pid)) return PLAN_PRICES[pid];
  }
  return "GASEO (unknown plan)";
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ error: "POST only" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost({ request, env }) {
  const headers = { "Content-Type": "application/json" };

  const rawBody = await request.text();
  const secret = env.AIRWALLEX_WEBHOOK_SECRET || "";
  const signature = request.headers.get("x-signature") || "";
  const timestamp = request.headers.get("x-timestamp") || "";

  // Verify signature (skip only if secret not yet configured — bootstrap state).
  if (secret) {
    if (!signature || !timestamp) {
      return new Response(JSON.stringify({ error: "missing signature headers" }), { status: 401, headers });
    }
    const expected = await hmacHex(secret, timestamp + rawBody);
    if (expected !== signature) {
      return new Response(JSON.stringify({ error: "signature mismatch" }), { status: 400, headers });
    }
  }

  let event = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400, headers });
  }

  const type = String(event.name || event.type || event.event_type || "unknown");
  const interesting = type.startsWith("subscription.") || type.startsWith("billing.");

  if (interesting) {
    const data = event.data || {};
    const obj = data.object || data;
    const email =
      obj.customer_email || data.customer_email || obj.email || data.email || "(email not in payload)";
    const plan = planFromEvent(event);
    const dataStr = JSON.stringify(data).slice(0, 800);

    // Sync the subscriber lifecycle into the report-cadence store (best effort).
    const su = env.SUPABASE_URL, sk = env.SUPABASE_SERVICE_KEY;
    if (su && sk && email && !email.startsWith("(")) {
      try {
        const t = type.toLowerCase();
        let status = "active";
        if (t.includes("cancel")) status = "cancelled";
        else if (t.includes("past_due")) status = "past_due";
        else if (t.includes("create")) status = "trial_active";
        const now = new Date().toISOString();
        const row = { customer_email: email, status, updated_at: now };
        // trial_end from the subscription object if present (ISO or unix seconds)
        const te = obj.trial_end || data.trial_end;
        if (te) {
          row.trial_end = typeof te === "number" ? new Date(te * 1000).toISOString() : te;
          // Day-14 progress report = trial_start + 14 days
          const ts = obj.trial_start || data.trial_start;
          const start = ts ? (typeof ts === "number" ? new Date(ts * 1000) : new Date(ts)) : new Date();
          row.trial_start = start.toISOString();
          row.next_report_at = new Date(start.getTime() + 14 * 86400000).toISOString();
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
      } catch (e) { /* best effort */ }
    }

    const resendKey = env.RESEND_API_KEY || "";
    if (resendKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "GASEO Billing <scan@arkprivate.com>",
            to: ["coachdaniel.12168@gmail.com"],
            subject: "GASEO billing: " + type + " — " + email,
            text:
              "GASEO Airwallex billing webhook received.\n\n" +
              "Plan: " + plan + "\n" +
              "Event: " + type + "\n" +
              "Customer email: " + email + "\n\n" +
              "Raw event:\n" + dataStr,
          }),
        });
      } catch (e) {
        // best effort — never block the webhook ack
      }
    }
  }

  // Always acknowledge so Airwallex doesn't retry.
  return new Response(JSON.stringify({ received: true }), { status: 200, headers });
}
