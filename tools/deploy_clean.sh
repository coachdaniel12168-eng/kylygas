#!/usr/bin/env bash
# Clean deploy for proofposts.com (Cloudflare Pages project: proofposts)
# WHY THIS EXISTS: `npx wrangler pages deploy .` from the repo root publishes EVERYTHING it finds —
# it published 20 *.bak.night3.* page copies, MARKETING.md, backups/, CNAME and the whole stage/ tree
# to the live domain on 2026-10-03 (all previously 404). This script deploys from an allow-list copy
# and refuses to run if anything outside the allow-list sneaks in.
set -euo pipefail
REPO="/home/amber/kylygas"
STAGE="$REPO/_deploy_clean"
cd "$REPO"

# 1) the allow-list: published pages + assets + the Pages Functions bundle
ALLOW=(
  404.html _headers llms.txt og-image.png robots.txt sitemap.xml survey-engine.js functions
  index.html pricing.html start.html welcome.html progress.html help.html refund.html terms.html privacy.html
  faq.html how-to-read-scores.html benchmarking.html sample-report.html citation.html
  ai-search-visibility.html geo-ranking.html aeo-ranking.html seo-aeo-geo.html chatgpt-seo.html
  ai-citation-guide.html geo-optimization-guide.html ai-search-trends-2026.html
)
# 2) anything matching these patterns must never reach production
FORBIDDEN_RE='(\.bak\.|(^|/)backups/|(^|/)stage/|(^|/)\.git|(^|/)\.github|(^|/)\.vercel|(^|/)\.wrangler|\.md$|(^|/)node_modules/)'

rm -rf "$STAGE"; mkdir -p "$STAGE"
for f in "${ALLOW[@]}"; do
  [ -e "$f" ] || { echo "ABORT: allow-listed file missing: $f"; exit 1; }
  cp -R "$f" "$STAGE"/
done
# the Cloudflare domain-verification file, if present
for f in *.txt; do [ -e "$f" ] && cp "$f" "$STAGE"/; done

BAD=$(cd "$STAGE" && find . -type f | sed 's|^\./||' | grep -E "$FORBIDDEN_RE" || true)
if [ -n "$BAD" ]; then echo "ABORT — forbidden files in the deploy set:"; echo "$BAD"; exit 1; fi
COUNT=$(cd "$STAGE" && find . -type f | wc -l)
echo "clean deploy set: $COUNT files"

# 3) deploy (production branch must be 'main' or it will not reach the domain)
: "${CLOUDFLARE_EMAIL:?export CLOUDFLARE_EMAIL first}"
: "${CLOUDFLARE_API_KEY:?export CLOUDFLARE_API_KEY first}"
npx wrangler pages deploy "$STAGE" --project-name=proofposts --branch=main

# 4) prove the artifacts are gone and the pages are alive (cache-busted)
echo; echo "--- post-deploy checks ---"
for u in / /pricing /start /faq; do printf "  %-12s " "$u"; curl -s -o /dev/null -w "HTTP %{http_code} %{size_download}B\n" --max-time 20 "https://proofposts.com$u?cb=$RANDOM"; done
for u in /stage/ /MARKETING.md /index.html.bak.night3.20260917_024357 /backups/llms.txt.bak-20260926-074104; do printf "  %-46s " "$u"; curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 20 "https://proofposts.com$u?v=$RANDOM"; done
printf "  %-46s " "GET /lead (function alive)"; curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 20 "https://proofposts.com/lead"
