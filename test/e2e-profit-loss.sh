#!/usr/bin/env bash
# Phase 11 E2E — Profit & Loss (Income Statement) test suite
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
R=$(req POST /auth/register "" "{\"full_name\":\"PL Admin\",\"mobile_number\":\"97${STAMP}01\",\"email\":\"pl.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\",\"confirm_password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" "{\"full_name\":\"PL Member\",\"mobile_number\":\"97${STAMP}02\",\"email\":\"pl.member.${STAMP}@example.com\",\"password\":\"MemberPass#1\",\"confirm_password\":\"MemberPass#1\"}")
MEMBER_TOKEN=$(body "$R" | jget data.access_token)

ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='pl.admin.${STAMP}@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null
echo "ADMIN role granted in DB"

# Re-login so token carries the ADMIN role claim
R=$(req POST /auth/login "" "{\"identifier\":\"pl.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)

echo "--- scenarios ---"

# TC-PL-001: Non-admin is denied access to P&L (403)
R=$(req GET "/reports/profit-loss?from_date=2026-01-01&to_date=2026-12-31" "$MEMBER_TOKEN")
echo "TC-PL-001 non-admin-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-PL-002: Admin gets P&L report
R=$(req GET "/reports/profit-loss?from_date=2026-01-01&to_date=2026-12-31" "$ADMIN_TOKEN")
echo "TC-PL-002 profit-loss-report: http=$(code "$R") income_total=$(body "$R" | jget data.income.total) expense_total=$(body "$R" | jget data.expenses.total) net_result=$(body "$R" | jget data.net_result) result_type=$(body "$R" | jget data.result_type)"

# TC-PL-003: Admin gets P&L summary
R=$(req GET "/reports/profit-loss/summary?from_date=2026-01-01&to_date=2026-12-31" "$ADMIN_TOKEN")
echo "TC-PL-003 profit-loss-summary: http=$(code "$R") total_income=$(body "$R" | jget data.total_income) total_expenses=$(body "$R" | jget data.total_expenses) net_result=$(body "$R" | jget data.net_result)"

# TC-PL-004: Invalid date range (from_date > to_date)
R=$(req GET "/reports/profit-loss?from_date=2027-01-01&to_date=2026-01-01" "$ADMIN_TOKEN")
echo "TC-PL-004 invalid-date-range: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-PL-005: Missing required date params
R=$(req GET "/reports/profit-loss" "$ADMIN_TOKEN")
echo "TC-PL-005 missing-date-params: http=$(code "$R") code=$(body "$R" | jget error.code)"
