// GASEO (proofposts.com) — same-origin fetch proxy for the free AI-search audit.
// The audit engine previously relied on free third-party CORS proxies
// (corsproxy.io / allorigins / cors-anywhere / cors.sh) — all four went
// dead or paywalled, breaking the core "enter site -> 7-dimension score" flow.
// This runs server-side on Cloudflare Pages and returns the raw page text
// with permissive CORS so the in-browser audit can read it.

const BLOCKED_HOST = /(^|\.)(local|localhost|internal|invalid|test|example|onion)$/i;
const PRIVATE_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0$|::1$|fc|fd)/;

function isBlockedHost(hostname) {
  if (!hostname) return true;
  const h = hostname.replace(/\.$/, "").toLowerCase();
  if (BLOCKED_HOST.test(h)) return true;
  // Resolve and reject private / loopback addresses (basic SSRF hygiene).
  try {
    // In the Workers runtime there is no synchronous DNS; we approximate with
    // the literal-IP check above and rely on fetch() to a public hostname only.
    if (PRIVATE_IP.test(h)) return true;
  } catch (e) { /* noop */ }
  return false;
}

export async function onRequestGet({ request }) {
  const headers = {
    "Content-Type": "text/plain;charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  };

  try {
    const u = new URL(request.url);
    const target = u.searchParams.get("url");
    if (!target) return new Response("missing url", { status: 400, headers });

    let parsed;
    try {
      parsed = new URL(target);
    } catch (e) {
      return new Response("invalid url", { status: 400, headers });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new Response("http(s) only", { status: 400, headers });
    }
    if (isBlockedHost(parsed.hostname)) {
      return new Response("host not allowed", { status: 403, headers });
    }

    let current = parsed;
    for (let hop = 0; hop < 5; hop++) {
      if (isBlockedHost(current.hostname)) {
        return new Response("host not allowed", { status: 403, headers });
      }
      const resp = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (resp.status >= 300 && resp.status < 400 && resp.headers.get("location")) {
        const next = new URL(resp.headers.get("location"), current);
        if (next.protocol !== "http:" && next.protocol !== "https:") {
          return new Response("bad redirect", { status: 400, headers });
        }
        current = next;
        continue;
      }
      if (!resp.ok) return new Response("upstream " + resp.status, { status: 502, headers });

      const text = await resp.text();
      return new Response(text.slice(0, 800000), { status: 200, headers });
    }
    return new Response("too many redirects", { status: 502, headers });
  } catch (e) {
    return new Response("proxy error", { status: 502, headers });
  }
}
