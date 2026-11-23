#!/usr/bin/env bash
# Publish parts-bin/index.html to Cloudflare Pages (project "parts-bin-demo" -> https://parts-bin-demo.pages.dev).
# The page is wrapped in a tiny Pages Worker (_worker.js) that serves it, so the deploy is a single
# API call with the account's API token: no asset-upload step, which needs a separate upload key.
# Needs: CLOUDFLARE_ACCOUNT_ID, and a token with Account > Cloudflare Pages > Edit
# (in Claude cloud sessions the proxy injects it; CLOUDFLARE_API_TOKEN can be a placeholder).
set -euo pipefail
cd "$(dirname "$0")"
out="$(mktemp -d)"
python3 - "$out/_worker.js" <<'EOF'
import json, sys
html = open("index.html").read()
open(sys.argv[1], "w").write(
    "const HTML = " + json.dumps(html) + ";\n"
    "export default {\n  async fetch(request) {\n    const url = new URL(request.url);\n"
    "    if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('Not found', { status: 404, headers: { 'x-robots-tag': 'noindex' } });\n"
    "    return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-robots-tag': 'noindex' } });\n  }\n};\n")
EOF
curl -sS -X POST -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN:-proxy-injected}" \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/parts-bin-demo/deployments" \
  -F "manifest={}" -F "branch=main" \
  -F "_worker.js=@$out/_worker.js;filename=_worker.js;type=application/javascript+module" \
  | python3 -c "import sys, json; d = json.load(sys.stdin); r = d.get('result') or {}; print('deployed' if d.get('success') else 'failed', r.get('url', ''), [e.get('message') for e in d.get('errors', [])])"
rm -rf "$out"
