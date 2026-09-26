#!/usr/bin/env bash
# Phase 1 E2E auth suite — batch 2 (remaining TC-AUTH coverage + DB checks)
BASE=http://localhost:3000/api/v1
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{let v=JSON.parse(d);for(const k of process.argv[1].split('.'))v=v?.[k];console.log(typeof v==='object'?JSON.stringify(v):v)}catch(e){console.log('ERR')}})" "$1"; }
post() { curl -s -m 10 -X POST "$BASE$1" -H 'Content-Type: application/json' -d "$2" -w '|%{http_code}'; }
patch() { curl -s -m 10 -X PATCH "$BASE$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "$3" -w '|%{http_code}'; }
code() { echo "$1" | awk -F'|' '{print $NF}'; }
body() { echo "$1" | sed 's/|[0-9]*$//'; }

echo "--- API checks ---"

R=$(post /auth/register '{"full_name":"Email Dup","mobile_number":"9999990020","email":"user.two@example.com","password":"Password#123","confirm_password":"Password#123"}')
echo "TC-AUTH-004 dup-email: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/login '{"identifier":"user.two@example.com","password":"Password#456"}')
echo "TC-AUTH-011 login-email: http=$(code "$R") success=$(body "$R" | jget success)"
echo "${R%|*}" > /tmp/login2.json
RT2=$(jget data.refresh_token < /tmp/login2.json)

R=$(post /auth/login '{"identifier":"9999990002"}')
echo "TC-AUTH-015 login-missing-password: http=$(code "$R") code=$(body "$R" | jget error.code)"

ACCESS_BAD="x$(cat /tmp/reg1.json | jget data.access_token)"
R=$(curl -s -m 10 "$BASE/auth/me" -H "Authorization: Bearer $ACCESS_BAD" -w '|%{http_code}')
echo "TC-AUTH-019 tampered-token: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(patch /auth/me "$(cat /tmp/reg1.json | jget data.access_token)" '{"email":"bad"}')
echo "TC-AUTH-022 patch-invalid-email: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/refresh '{"refresh_token":"garbage-token-value"}')
echo "TC-AUTH-024 refresh-garbage: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/forgot-password '{"identifier":"9999990001"}')
RESET_TOKEN=$(body "$R" | jget data.reset_token)
R=$(post /auth/reset-password "{\"token\":\"$RESET_TOKEN\",\"password\":\"Another#999\",\"confirm_password\":\"Different#1\"}")
echo "TC-AUTH-033 reset-confirm-mismatch: http=$(code "$R") code=$(body "$R" | jget error.code)"

echo "--- DB checks (node/pg) ---"
node -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'localhost', port: 5432, database: 'hrsjm', user: 'postgres', password: 'postgres' });
  await c.connect();
  const u = await c.query(\"SELECT full_name, password_hash, status FROM users WHERE mobile_number = '9999990001'\");
  const row = u.rows[0];
  console.log('TC-AUTH-009 no-plaintext-password:', row.password_hash.startsWith('\$2') ? 'PASS (bcrypt hash only)' : 'FAIL', '| full_name present:', !!row.full_name);
  const a = await c.query('SELECT event, count(*)::int AS n FROM audit_logs GROUP BY event ORDER BY event');
  console.log('TC-AUTH-036 audit-events:', a.rows.map(r => r.event + '=' + r.n).join(', '));
  await c.query(\"UPDATE users SET status = 'INACTIVE' WHERE mobile_number = '9999990002'\");
  console.log('DB: user two disabled');
  await c.end();
})().catch(e => { console.error('DBERR', e.message); process.exit(1); });
"

R=$(post /auth/login '{"identifier":"9999990002","password":"Password#456"}')
echo "TC-AUTH-014 disabled-login: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(post /auth/refresh "{\"refresh_token\":\"$RT2\"}")
echo "TC-AUTH-035 disabled-refresh: http=$(code "$R") code=$(body "$R" | jget error.code)"

node -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'localhost', port: 5432, database: 'hrsjm', user: 'postgres', password: 'postgres' });
  await c.connect();
  await c.query(\"UPDATE users SET status = 'ACTIVE' WHERE mobile_number = '9999990002'\");
  console.log('DB: user two re-enabled');
  await c.end();
})().catch(e => { console.error('DBERR', e.message); process.exit(1); });
"