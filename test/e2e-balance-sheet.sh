#!/usr/bin/env bash
# Phase 12 E2E — Balance Sheet test suite
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
R=$(req POST /auth/register "" "{\"full_name\":\"BS Admin\",\"mobile_number\":\"96${STAMP}01\",\"email\":\"bs.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\",\"confirm_password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" "{\"full_name\":\"BS Member\",\"mobile_number\":\"96${STAMP}02\",\"email\":\"bs.member.${STAMP}@example.com\",\"password\":\"MemberPass#1\",\"confirm_password\":\"MemberPass#1\"}")
MEMBER_TOKEN=$(body "$R" | jget data.access_token)

ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='bs.admin.${STAMP}@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null
echo "ADMIN role granted in DB"

# Re-login so token carries the ADMIN role claim
R=$(req POST /auth/login "" "{\"identifier\":\"bs.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)

echo "--- scenarios ---"

# TC-BS-001: Non-admin is denied access to balance sheet (403)
R=$(req GET "/reports/balance-sheet?as_of_date=2026-12-31" "$MEMBER_TOKEN")
echo "TC-BS-001 non-admin-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-BS-002: Admin gets balance sheet report
R=$(req GET "/reports/balance-sheet?as_of_date=2026-12-31" "$ADMIN_TOKEN")
echo "TC-BS-002 balance-sheet-report: http=$(code "$R") is_balanced=$(body "$R" | jget data.is_balanced) assets_total=$(body "$R" | jget data.total_assets) liab_equity_total=$(body "$R" | jget data.total_liabilities_and_equity) diff=$(body "$R" | jget data.difference)"

# TC-BS-003: Admin gets balance sheet summary
R=$(req GET "/reports/balance-sheet/summary?as_of_date=2026-12-31" "$ADMIN_TOKEN")
echo "TC-BS-003 balance-sheet-summary: http=$(code "$R") is_balanced=$(body "$R" | jget data.is_balanced) total_assets=$(body "$R" | jget data.total_assets) total_liabilities=$(body "$R" | jget data.total_liabilities) total_equity=$(body "$R" | jget data.total_equity)"

# TC-BS-004: Balance sheet with zero balances included
R=$(req GET "/reports/balance-sheet?include_zero_balances=true" "$ADMIN_TOKEN")
echo "TC-BS-004 zero-balances-included: http=$(code "$R") is_balanced=$(body "$R" | jget data.is_balanced)"
