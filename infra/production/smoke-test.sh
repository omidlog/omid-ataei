#!/usr/bin/env bash
# Brand OS Studio anonymous smoke test. Read-only: it never signs in, creates a brand or writes to GitHub.
#
#   smoke-test.sh                                       # https://studio.omidataei.com, full public checks
#   smoke-test.sh --base http://172.18.0.1:8083 --host studio.omidataei.com --expect-https
#                                                       # the upstream directly, as Caddy would call it
#   smoke-test.sh --http-redirect                       # also check http:// redirects to https://
#
# Options:
#   --base URL        Studio base URL (default https://studio.omidataei.com)
#   --host NAME       send this Host header (for calling the upstream port directly); also enables the
#                     foreign-Host check
#   --expect-https    expect production cookie/HSTS behavior even if --base is http (upstream checks)
#   --http-redirect   check that http://<host>/ redirects to https://
#
# Exit status 0 only when every check passes. Authenticated checks (owner sign-in, New Brand, refresh)
# need the owner and are listed in docs-internal/phase-10/GROK_HANDOFF.md.
set -euo pipefail

BASE="https://studio.omidataei.com"
HOST_HEADER=""
EXPECT_HTTPS=0
HTTP_REDIRECT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="${2:?--base needs a URL}"; shift 2 ;;
    --host) HOST_HEADER="${2:?--host needs a name}"; shift 2 ;;
    --expect-https) EXPECT_HTTPS=1; shift ;;
    --http-redirect) HTTP_REDIRECT=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
BASE="${BASE%/}"
[[ "$BASE" == https://* ]] && EXPECT_HTTPS=1

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

# req METHOD PATH [extra curl args...] -> sets STATUS, writes $WORK/headers and $WORK/body
req() {
  local method="$1" path="$2"
  shift 2
  local args=(-sS -o "$WORK/body" -D "$WORK/headers" -w '%{http_code}' --max-time 20 -X "$method")
  [[ -n "$HOST_HEADER" ]] && args+=(-H "Host: $HOST_HEADER")
  STATUS="$(curl "${args[@]}" "$@" "$BASE$path" 2>"$WORK/curl.err" || true)"
  [[ -n "$STATUS" ]] || STATUS="000"
}
header() { grep -i "^$1:" "$WORK/headers" | head -n1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//' || true; }
check() { if eval "$2"; then pass "$1"; else fail "$1 (status $STATUS)"; fi; }

echo "Brand OS Studio smoke test: $BASE${HOST_HEADER:+ (Host: $HOST_HEADER)}"

# 1. Health
req GET /healthz
check "GET /healthz answers 200 ok" '[[ "$STATUS" == 200 && "$(cat "$WORK/body")" == "ok" ]]'

# 2. Sign-in page, headers and cookie flags
req GET /login
check "GET /login answers 200" '[[ "$STATUS" == 200 ]]'
check "login page has the sign-in form" 'grep -q "name=\"_csrf\"" "$WORK/body" && grep -q "name=\"password\"" "$WORK/body"'
check "Content-Security-Policy is strict (default-src none, no inline script)" '[[ "$(header content-security-policy)" == *"default-src '"'"'none'"'"'"* && "$(header content-security-policy)" == *"script-src '"'"'self'"'"'"* && "$(header content-security-policy)" != *unsafe-inline* ]]'
check "X-Frame-Options DENY" '[[ "$(header x-frame-options)" == DENY ]]'
check "X-Content-Type-Options nosniff" '[[ "$(header x-content-type-options)" == nosniff ]]'
check "Referrer-Policy same-origin" '[[ "$(header referrer-policy)" == same-origin ]]'
check "X-Robots-Tag noindex" '[[ "$(header x-robots-tag)" == *noindex* ]]'
check "no X-Powered-By header" '[[ -z "$(header x-powered-by)" ]]'
check "no inline script in the page" '! grep -Eq "<script(>| [^s])" "$WORK/body"'
COOKIE="$(grep -i '^set-cookie:' "$WORK/headers" | head -n1 | tr -d '\r' || true)"
check "login nonce cookie is HttpOnly and SameSite=Strict" '[[ "$COOKIE" == *HttpOnly* && "$COOKIE" == *SameSite=Strict* ]]'
if [[ "$EXPECT_HTTPS" == 1 ]]; then
  check "HSTS is set" '[[ "$(header strict-transport-security)" == *max-age=* ]]'
  check "cookie uses __Host- prefix and Secure" '[[ "$COOKIE" == *__Host-studio_login=* && "$COOKIE" == *Secure* ]]'
fi

# 3. Anonymous visitors get nothing: same redirect for real and invented brands
for path in /brands /brands/new /account /brands/smoke-no-such-brand /brands/smoke-no-such-brand/brand-book /brands/smoke-no-such-brand/assets/file/0000000000000000000000000000000000000000000000000000000000000000; do
  req GET "$path"
  check "anonymous GET $path redirects to sign-in" '[[ "$STATUS" == 302 && "$(header location)" == /login* ]] && ! grep -qi "brand book" "$WORK/body"'
done
req GET /brands/smoke-no-such-brand/provisioning.json
check "anonymous JSON answers 401" '[[ "$STATUS" == 401 ]] && grep -q authentication_required "$WORK/body"'

# 4. No anonymous writes; the only POST routes refuse without a session
for path in /brands/new /logout /brands/smoke-no-such-brand/refresh /brands/smoke-no-such-brand/provisioning/retry; do
  req POST "$path" -H 'Content-Type: application/x-www-form-urlencoded' --data '_csrf=x'
  check "anonymous POST $path answers 401" '[[ "$STATUS" == 401 ]]'
done
req POST /webhooks/github -H 'Content-Type: application/json' -H 'X-GitHub-Event: push' --data '{}'
check "unsigned webhook answers 401" '[[ "$STATUS" == 401 ]]'
for method in PUT PATCH DELETE; do
  req "$method" /brands
  check "$method /brands answers 405" '[[ "$STATUS" == 405 ]]'
done

# 5. No internal Docusaurus build or raw data is served
for path in /dashboard /docs /docs/intro /assets/js/main.js /search-index.json /generated/features.json /brand/brand.config.yaml /.env /registry.json /data/registry.json; do
  req GET "$path"
  check "GET $path serves nothing" '[[ "$STATUS" != 200 ]]'
done

# 6. Static bundle: present, small, and free of secrets or data
req GET /static/studio.js
check "GET /static/studio.js answers 200" '[[ "$STATUS" == 200 ]]'
check "static script has no token or Studio variable names" '! grep -Eqi "ghp_|github_pat_|STUDIO_|api\.github\.com|token" "$WORK/body"'
req GET /static/..%2fsrc%2fconfig.ts
check "static path traversal serves nothing" '[[ "$STATUS" != 200 ]]'

# 7. A foreign Host gets no Studio page (Studio answers 421; a proxy may answer for it itself)
if [[ -n "$HOST_HEADER" ]]; then
  SAVED="$HOST_HEADER"
  HOST_HEADER="smoke-foreign.invalid"
  req GET /login
  check "foreign Host gets no Studio page" '[[ "$STATUS" == 421 ]] || ! grep -q "name=\"_csrf\"" "$WORK/body"'
  HOST_HEADER="$SAVED"
fi

# 8. http:// -> https:// redirect (public mode)
if [[ "$HTTP_REDIRECT" == 1 ]]; then
  HTTP_URL="http://${BASE#https://}/login"
  STATUS="$(curl -sS -o /dev/null -D "$WORK/headers" -w '%{http_code}' --max-time 20 "$HTTP_URL" || true)"
  check "http:// redirects to https://" '[[ "$STATUS" =~ ^30[178]$ && "$(header location)" == https://* ]]'
fi

echo "Summary: $PASS passed, $FAIL failed"
[[ "$FAIL" == 0 ]]
