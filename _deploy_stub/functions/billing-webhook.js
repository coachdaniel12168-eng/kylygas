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

// When the event itself happened. Airwallex's Event object carries a unique `id` and a
// `created_at` (their docs, read 29 Sep 2026); returns null when the payload has neither,
// in which case the ordering guard stands down rather than guess.
function eventTimeOf(event) {
  const raw = event.created_at || (event.data && (event.data.created_at || event.data.updated_at));
  if (!raw) return null;
  const t = typeof raw === "number" ? (raw > 1e12 ? raw : raw * 1000) : Date.parse(raw);
  return t && !isNaN(t) ? new Date(t).toISOString() : null;
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

  // Verify signature — FAIL CLOSED. If the webhook secret is not configured,
  // refuse to process events rather than accept unsigned (forgeable) ones.
  if (!secret) {
    return new Response(JSON.stringify({ error: "webhook not configured" }), { status: 503, headers });
  }
  if (!signature || !timestamp) {
    return new Response(JSON.stringify({ error: "missing signature headers" }), { status: 401, headers });
  }
  const expected = await hmacHex(secret, timestamp + rawBody);
  if (expected !== signature) {
    return new Response(JSON.stringify({ error: "signature mismatch" }), { status: 400, headers });
  }

  let event = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400, headers });
  }

  const type = String(event.name || event.type || event.event_type || "unknown");
  const interesting = type.startsWith("subscription.") || type.startsWith("billing.")
    || type === "payment_intent.succeeded" || type === "payment_attempt.paid";

  if (interesting) {
    const data = event.data || {};
    const obj = data.object || data;
    const email =
      obj.customer_email || data.customer_email || obj.email || data.email
      || (obj.metadata && obj.metadata.email) || (data.metadata && data.metadata.email)
      || (obj.customer && obj.customer.email) || "(email not in payload)";
    const plan = planFromEvent(event);
    const dataStr = JSON.stringify(data).slice(0, 800);

    // ORDER / DUPLICATE SAFETY (29 Sep 2026). Airwallex retries a failed delivery for about
    // three days and its docs state that duplicates can arrive and order is not guaranteed, so
    // an event is applied to the subscriber record only when it is NEWER than the last event
    // already applied, and never when it repeats that event's id. Measured before the fix: a
    // `subscription.active` applied at 17:02:35Z was overwritten to status=cancelled by a
    // replay carrying created_at 27 days earlier, i.e. a paid subscriber could be recorded as
    // cancelled by a stale retry.
    const eventId = event.id ? String(event.id) : null;
    const eventAt = eventTimeOf(event);
    let record = "written";

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
        const planMatch = String(plan).match(/GASEO (starter|pro|agency)/i);
        // Read the row we already hold (fails OPEN: if this read fails we write as before and
        // never drop an event).
        let prev = null;
        try {
          const q = await fetch(
            su + "/rest/v1/gaseo_subscribers?select=last_event_at,last_event_id&customer_email=eq."
            + encodeURIComponent(email) + "&limit=1",
            { headers: { apikey: sk, Authorization: "Bearer " + sk } }
          );
          const j = await q.json();
          if (Array.isArray(j) && j.length) prev = j[0];
        } catch (e) { prev = null; }
        const dup = !!(prev && prev.last_event_id && eventId && prev.last_event_id === eventId);
        const prevAt = prev && prev.last_event_at ? Date.parse(prev.last_event_at) : NaN;
        const stale = !!(prev && eventAt && !isNaN(prevAt) && Date.parse(eventAt) < prevAt);
        if (dup || stale) {
          record = dup ? "NOT APPLIED - duplicate of event " + eventId
                       : "NOT APPLIED - event older than the one already applied";
          console.log("gaseo webhook: " + record + " (" + email + ", " + type + ")");
        } else {
        const row = {
          customer_email: email,
          plan: planMatch ? planMatch[1].toLowerCase() : "gaseo",
          subscription_id: obj.id || obj.subscription_id || null,
          status, updated_at: now,
          ...(eventId ? { last_event_id: eventId } : {}),
          ...(eventAt ? { last_event_at: eventAt } : {}),
        };
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
        }
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
              "Subscriber record: " + record + "\n" +
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
