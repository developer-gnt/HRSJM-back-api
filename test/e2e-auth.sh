#!/usr/bin/env bash
# Phase 1 E2E auth scenario suite (run against a freshly booted server)
BASE=http://localhost:3000/api/v1
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{let v=JSON.parse(d);for(const k of process.argv[1].split('.'))v=v?.[k];console.log(typeof v==='object'?JSON.stringify(v):v)}catch(e){console.log('ERR')}})" "$1"; }
post() { curl -s -m 10 -X POST "$BASE$1" -H 'Content-Type: application/json' -d "$2" -w '|%{http_code}'; }
patch() { curl -s -m 10 -X PATCH "$BASE$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "$3" -w '|%{http_code}'; }
get() { curl -s -m 10 "$BASE$1" -H "Authorization: Bearer $2" -w '|%{http_code}'; }
code() { echo "$1" | awk -F'|' '{print $NF}'; }
body() { echo "$1" | sed 's/|[0-9]*$//'; }

R=$(post /auth/register '{"full_name":"Test User One","mobile_number":"9999990001","password":"Password#123","confirm_password":"Password#123"}')
echo "TC-AUTH-001 register(no-email): http=$(code "$R") success=$(body "$R" | jget success) roles=$(body "$R" | jget data.user.roles) hasTokens=$([ -n "$(body "$R" | jget data.access_token)" ] && echo yes)"
echo "${R%|*}" > /tmp/reg1.json
ACCESS1=$(jget data.access_token < /tmp/reg1.json); REFRESH1=$(jget data.refresh_token < /tmp/reg1.json)

R=$(post /auth/register '{"full_name":"Test User Two","mobile_number":"9999990002","email":"user.two@example.com","password":"Password#456","confirm_password":"Password#456"}')
echo "TC-AUTH-002 register(with-email): http=$(code "$R") success=$(body "$R" | jget success) email=$(body "$R" | jget data.user.email)"

R=$(post /auth/register '{"full_name":"Dup User","mobile_number":"9999990001","password":"Password#123","confirm_password":"Password#123"}')
echo "TC-AUTH-003 dup-mobile: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/register '{"mobile_number":"9999990009","password":"Password#123","confirm_password":"Password#123"}')
echo "TC-AUTH-005 missing-fields: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/register '{"full_name":"Mismatch","mobile_number":"9999990010","password":"Password#123","confirm_password":"Different#123"}')
echo "TC-AUTH-006 mismatch: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/register '{"full_name":"Weak","mobile_number":"9999990011","password":"123","confirm_password":"123"}')
echo "TC-AUTH-007 weak-password: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/register '{"full_name":"BadEmail","mobile_number":"9999990012","email":"not-an-email","password":"Password#123","confirm_password":"Password#123"}')
echo "TC-AUTH-008 invalid-email: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/register '{"full_name":"Extra","mobile_number":"9999990013","password":"Password#123","confirm_password":"Password#123","role":"ADMIN"}')
echo "TC-BOOT-004 unknown-prop: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/login '{"identifier":"9999990001","password":"Password#123"}')
echo "TC-AUTH-010 login-mobile: http=$(code "$R") success=$(body "$R" | jget success)"

R=$(post /auth/login '{"identifier":"9999990001","password":"WrongPass#1"}')
echo "TC-AUTH-012 wrong-password: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/login '{"identifier":"nobody@example.com","password":"Whatever#1"}')
echo "TC-AUTH-013 unknown-user: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(get /auth/me "$ACCESS1")
echo "TC-AUTH-016 me-valid: http=$(code "$R") name=$(body "$R" | jget data.full_name) noHash=$([ "$(body "$R" | jget data.password_hash)" = "undefined" ] && echo yes)"

R=$(get /auth/me "")
echo "TC-AUTH-017 me-no-token: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(patch /auth/me "$ACCESS1" '{"email":"user.one.updated@example.com"}')
echo "TC-AUTH-020 patch-me: http=$(code "$R") email=$(body "$R" | jget data.email)"

R=$(patch /auth/me "$ACCESS1" '{"role":"ADMIN","status":"ACTIVE"}')
echo "TC-AUTH-021 privileged-fields: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/refresh "{\"refresh_token\":\"$REFRESH1\"}")
echo "TC-AUTH-023 refresh: http=$(code "$R") success=$(body "$R" | jget success)"
echo "${R%|*}" > /tmp/ref1.json
REFRESH1B=$(jget data.refresh_token < /tmp/ref1.json)

R=$(post /auth/refresh "{\"refresh_token\":\"$REFRESH1\"}")
echo "TC-AUTH-025 old-refresh-reuse: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/logout "{\"refresh_token\":\"$REFRESH1B\"}")
echo "TC-AUTH-027 logout: http=$(code "$R") success=$(body "$R" | jget success)"

R=$(post /auth/refresh "{\"refresh_token\":\"$REFRESH1B\"}")
echo "TC-AUTH-025b refresh-after-logout: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/logout "{\"refresh_token\":\"$REFRESH1B\"}")
echo "TC-AUTH-028 double-logout: http=$(code "$R")"

R=$(post /auth/forgot-password '{"identifier":"9999990001"}')
echo "TC-AUTH-029 forgot-existing: http=$(code "$R") generic=$(body "$R" | jget data.delivered_mechanism) devToken=$([ -n "$(body "$R" | jget data.reset_token)" ] && echo yes)"
echo "${R%|*}" > /tmp/forgot1.json

R=$(post /auth/forgot-password '{"identifier":"ghost@example.com"}')
echo "TC-AUTH-030 forgot-unknown: http=$(code "$R") generic=$(body "$R" | jget data.delivered_mechanism) noToken=$([ "$(body "$R" | jget data.reset_token)" = "undefined" ] && echo yes)"

RESET_TOKEN=$(jget data.reset_token < /tmp/forgot1.json)
R=$(post /auth/reset-password "{\"token\":\"$RESET_TOKEN\",\"password\":\"NewPass#999\",\"confirm_password\":\"NewPass#999\"}")
echo "TC-AUTH-031 reset: http=$(code "$R") success=$(body "$R" | jget success)"

R=$(post /auth/refresh "{\"refresh_token\":\"$REFRESH1B\"}")
echo "TC-AUTH-031b sessions-revoked-after-reset: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/login '{"identifier":"9999990001","password":"NewPass#999"}')
echo "TC-AUTH-034a login-new-password: http=$(code "$R") success=$(body "$R" | jget success)"

R=$(post /auth/login '{"identifier":"9999990001","password":"Password#123"}')
echo "TC-AUTH-034b login-old-password: http=$(code "$R") code=$(body "$R" | jget error.code)"
