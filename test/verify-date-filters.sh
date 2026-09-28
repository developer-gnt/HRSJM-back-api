#!/usr/bin/env bash
# Phase 10/11 verification — date-filter correctness proof.
# Post a FUTURE-dated expense entry, then confirm the reports exclude it:
#   - Trial balance as-of today must NOT include the future entry
#   - P&L period ending today must NOT include the future entry
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
FUTURE_DATE="2027-12-31"
TODAY="2026-09-28"

echo "--- setup ---"
R=$(req POST /auth/register "" "{\"full_name\":\"Rep Test Admin\",\"mobile_number\":\"94${STAMP}01\",\"email\":\"rep.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\",\"confirm_password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='rep.admin.${STAMP}@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null
R=$(req POST /auth/login "" "{\"identifier\":\"rep.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
echo "ADMIN ready"

EXP_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='5001'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
BANK_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='1001'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")

# Baselines BEFORE the future-dated entry
R=$(req GET "/reports/trial-balance?as_of_date=$TODAY" "$ADMIN_TOKEN")
TB_BEFORE=$(body "$R" | jget data.total_debit)
R=$(req GET "/reports/profit-loss?from_date=2026-01-01&to_date=$TODAY" "$ADMIN_TOKEN")
PL_BEFORE=$(body "$R" | jget data.total_expenses)
echo "baseline: tb_total_debit=$TB_BEFORE pl_total_expenses=$PL_BEFORE"

# Post a FUTURE-dated expense voucher (expense_date 2027-12-31, amount 777)
R=$(req POST /expense-entries "$ADMIN_TOKEN" "{\"expense_date\":\"${FUTURE_DATE}T00:00:00.000Z\",\"paid_to\":\"Future Vendor\",\"expense_account_id\":\"$EXP_ACC_ID\",\"paid_from_account_id\":\"$BANK_ACC_ID\",\"amount\":777,\"payment_method\":\"BANK_TRANSFER\",\"reference_number\":\"FUT-${STAMP}\"}")
V_ID=$(body "$R" | jget data.id)
echo "future-dated voucher: http=$(code "$R") id=$V_ID"

# After: TB as-of today must be UNCHANGED, P&L period ending today must be UNCHANGED
R=$(req GET "/reports/trial-balance?as_of_date=$TODAY" "$ADMIN_TOKEN")
TB_AFTER=$(body "$R" | jget data.total_debit)
R=$(req GET "/reports/profit-loss?from_date=2026-01-01&to_date=$TODAY" "$ADMIN_TOKEN")
PL_AFTER=$(body "$R" | jget data.total_expenses)
echo "after: tb_total_debit=$TB_AFTER pl_total_expenses=$PL_AFTER"

if [ "$TB_BEFORE" = "$TB_AFTER" ]; then
  echo "RESULT trial-balance as-of-date: PASS (future entry excluded)"
else
  echo "RESULT trial-balance as-of-date: FAIL ($TB_BEFORE -> $TB_AFTER; future entry leaked in)"
fi

if [ "$PL_BEFORE" = "$PL_AFTER" ]; then
  echo "RESULT profit-loss period-filter: PASS (future entry excluded)"
else
  echo "RESULT profit-loss period-filter: FAIL ($PL_BEFORE -> $PL_AFTER; future entry leaked in)"
fi

# Sanity: reports including the future date DO see it
R=$(req GET "/reports/trial-balance?as_of_date=2027-12-31" "$ADMIN_TOKEN")
echo "sanity tb as_of 2027-12-31: total_debit=$(body "$R" | jget data.total_debit)"
R=$(req GET "/reports/profit-loss?from_date=2026-01-01&to_date=2027-12-31" "$ADMIN_TOKEN")
echo "sanity pl through 2027-12-31: total_expenses=$(body "$R" | jget data.total_expenses)"

echo "--- verification completed ---"
