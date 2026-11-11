#!/usr/bin/env bash
# P46: security headers and CSP on an owned preview URL. Single GET, no attack traffic.
set -uo pipefail
U="$1"; H=$(curl -sSIL --max-time 20 "$U" | tr -d '\r' | tr 'A-Z' 'a-z')
f=0; need(){ echo "$H" | grep -q "^$1:" && echo "ok   $1" || { echo "MISS $1"; f=1; }; }
need strict-transport-security; need content-security-policy; need x-content-type-options; need referrer-policy
echo "$H" | grep -q "^content-security-policy:.*frame-ancestors" || need x-frame-options
echo "$H" | grep "^content-security-policy:" | grep -q "script-src[^;]*'unsafe-inline'" && { echo "FAIL CSP script-src allows 'unsafe-inline'"; f=1; }
echo "$H" | grep -Eq "^(server|x-powered-by):.*[0-9]+\.[0-9]+" && { echo "FAIL version banner exposed"; f=1; }
exit $f
