/**
 * proofposts.com — same-origin relay for the two n8n notifications.
 *
 * Why this exists (2026-09-21): the audit page called the n8n webhooks straight from the
 * browser with Content-Type: application/json, which forces a CORS preflight. n8n answers
 * OPTIONS/POST with HTTP 200 but sends NO Access-Control-Allow-Origin header, so the browser
 * blocked both calls on every single submit. The visitor saw the "we could not send your
 * report email automatically" notice and no email was ever sent — the audit's main promise.
 *
 * A server-to-server fetch is not subject to CORS, so the page now posts here (same origin,
 * no preflight) and this function forwards to n8n. Only the two known webhook names are
 * allowed, so this cannot be used as an open proxy.
 *
 * Evidence at time of writing: OPTIONS/POST https://gaseo-n8n.linkfly.site/webhook/* -> 200,
 * headers: no access-control-allow-origin (raw header dump saved alongside this run).
 */

const UPSTREAM = "https://gaseo-n8n.linkfly.site/webhook/";
const ALLOWED = new Set(["kylygaseo-submit", "rankgas-welcome-v2"]);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function onRequestPost({ request }) {
  const name = new URL(request.url).searchParams.get("w") || "";
  if (!ALLOWED.has(name)) return json({ ok: false, error: "unknown-webhook" }, 404);

  let body;
  try {
    body = await request.text();
  } catch {
    return json({ ok: false, error: "no-body" }, 400);
  }
  if (!body || body.length > 8192) return json({ ok: false, error: "bad-body" }, 400);

  try {
    const r = await fetch(UPSTREAM + name, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    const txt = await r.text();
    // Surface the upstream status so a silent 200-with-empty-body can never masquerade as
    // "email sent" — we log what actually came back.
    console.log("n8n-relay", name, "upstream", r.status, txt.slice(0, 120));
    return json({ ok: r.ok, upstream: r.status }, r.ok ? 200 : 502);
  } catch (e) {
    console.error("n8n-relay", name, "exception", String(e).slice(0, 200));
    return json({ ok: false, error: "upstream-unreachable" }, 502);
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: "post-only" }, 405);
}
