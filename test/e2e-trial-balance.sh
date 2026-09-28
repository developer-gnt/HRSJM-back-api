#!/usr/bin/env bash
# Phase 10 E2E — Trial Balance & Summary Reports test suite
BASE=http://localhost:3000/api/v1
jget() { node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{let v=JSON.parse(d);for(const k of process.argv[1].split('.'))v=v?.[k];console.log(typeof v==='object'?JSON.stringify(v):v)}catch(e){console.log('ERR')}})" "$1"; }
req() { curl -s -m 10 -X "$1" "$BASE$2" ${3:+-H "Authorization: Bearer $3"} ${4:+-H 'Content-Type: application/json'} ${4:+-d "$4"} -w '|%{http_code}'; }
code() { echo "$1" | awk -F'|' '{print $NF}'; }
body() { echo "$1" | sed 's/|[0-9]*$//'; }
sql() { node -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'localhost', port: 5432, database: 'hrsjm', user: 'postgres', password: 'postgres' });
  await c.connect();
  const r = await c.query(process.argv[1]);
  console.log(JSON.stringify(r.rows));
  await c.end();
})().catch(e => { console.error('DBERR', e.message); process.exit(1); });
" "$1"; }

STAMP=$(date +%H%M%S)

echo "--- setup ---"
R=$(req POST /auth/register "" "{\"full_name\":\"TB Admin\",\"mobile_number\":\"99${STAMP}01\",\"email\":\"tb.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\",\"confirm_password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" "{\"full_name\":\"TB Member\",\"mobile_number\":\"99${STAMP}02\",\"email\":\"tb.member.${STAMP}@example.com\",\"password\":\"MemberPass#1\",\"confirm_password\":\"MemberPass#1\"}")
MEMBER_TOKEN=$(body "$R" | jget data.access_token)

ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='tb.admin.${STAMP}@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null
echo "ADMIN role granted in DB"

# Re-login so token carries the ADMIN role claim
R=$(req POST /auth/login "" "{\"identifier\":\"tb.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)

echo "--- scenarios ---"

# TC-TB-001: Non-admin is denied access to trial balance (403)
R=$(req GET /reports/trial-balance "$MEMBER_TOKEN")
echo "TC-TB-001 non-admin-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-TB-002: Admin gets trial balance report
R=$(req GET /reports/trial-balance "$ADMIN_TOKEN")
echo "TC-TB-002 trial-balance-report: http=$(code "$R") is_balanced=$(body "$R" | jget data.is_balanced) diff=$(body "$R" | jget data.difference) total_debit=$(body "$R" | jget data.total_debit) total_credit=$(body "$R" | jget data.total_credit)"

# TC-TB-003: Admin gets trial balance summary
R=$(req GET /reports/trial-balance/summary "$ADMIN_TOKEN")
echo "TC-TB-003 trial-balance-summary: http=$(code "$R") is_balanced=$(body "$R" | jget data.is_balanced) accounts_count=$(body "$R" | jget data.total_accounts)"

# TC-TB-004: Trial balance with as_of_date filter
R=$(req GET "/reports/trial-balance?as_of_date=2026-12-31" "$ADMIN_TOKEN")
echo "TC-TB-004 as-of-date-filter: http=$(code "$R") is_balanced=$(body "$R" | jget data.is_balanced)"

# TC-TB-005: Trial balance with account_type filter
R=$(req GET "/reports/trial-balance?account_type=ASSET&include_zero_balances=true" "$ADMIN_TOKEN")
echo "TC-TB-005 account-type-filter: http=$(code "$R") accounts_count=$(body "$R" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).data.accounts.length)}catch(e){console.log('ERR')}})")"
