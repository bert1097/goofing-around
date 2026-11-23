#!/usr/bin/env bash
# Publish parts-bin/index.html and parts-bin/img/ to Cloudflare Pages (project "parts-bin-demo" -> https://parts-bin-demo.pages.dev).
# The page and its photos are bundled into a tiny Pages Worker (_worker.js) that serves them, so the deploy is a
# single API call with the account's API token: no asset-upload step, which needs a separate upload key.
# Needs: CLOUDFLARE_ACCOUNT_ID, and a token with Account > Cloudflare Pages > Edit
# (in Claude cloud sessions the proxy injects it; CLOUDFLARE_API_TOKEN can be a placeholder).
set -euo pipefail
cd "$(dirname "$0")"
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  CLOUDFLARE_ACCOUNT_ID="$(curl -sS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN:-proxy-injected}" https://api.cloudflare.com/client/v4/accounts \
    | python3 -c "import sys, json; r = json.load(sys.stdin).get('result') or []; print(r[0]['id'] if len(r) == 1 else '')")"
  [ -n "$CLOUDFLARE_ACCOUNT_ID" ] || { echo "Set CLOUDFLARE_ACCOUNT_ID (couldn't pick a single account from the token)"; exit 1; }
fi
out="$(mktemp -d)"
python3 - "$out/_worker.js" <<'EOF'
import base64, json, os, sys
html = open("index.html").read()
imgs = {f: base64.b64encode(open(os.path.join("img", f), "rb").read()).decode() for f in sorted(os.listdir("img")) if f.endswith(".jpg")} if os.path.isdir("img") else {}
open(sys.argv[1], "w").write(
    "const HTML = " + json.dumps(html) + ";\n"
    "const IMG = " + json.dumps(imgs) + ";\n"
    "const NOINDEX = { 'x-robots-tag': 'noindex' };\n"
    "export default {\n  async fetch(request) {\n    const url = new URL(request.url);\n"
    "    if (url.pathname === '/' || url.pathname === '/index.html') return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', ...NOINDEX } });\n"
    "    const m = url.pathname.match(/^\\/img\\/([a-z0-9-]+\\.jpg)$/);\n"
    "    if (m && IMG[m[1]]) { const bin = Uint8Array.from(atob(IMG[m[1]]), c => c.charCodeAt(0)); return new Response(bin, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400', ...NOINDEX } }); }\n"
    "    return new Response('Not found', { status: 404, headers: NOINDEX });\n  }\n};\n")
print(f"bundled page + {len(imgs)} photos ({os.path.getsize(sys.argv[1]) // 1024} KB)")
EOF
curl -sS -X POST -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN:-proxy-injected}" \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/parts-bin-demo/deployments" \
  -F "manifest={}" -F "branch=main" \
  -F "_worker.js=@$out/_worker.js;filename=_worker.js;type=application/javascript+module" \
  | python3 -c "import sys, json; d = json.load(sys.stdin); r = d.get('result') or {}; print('deployed' if d.get('success') else 'failed', r.get('url', ''), [e.get('message') for e in d.get('errors', [])])"
rm -rf "$out"
