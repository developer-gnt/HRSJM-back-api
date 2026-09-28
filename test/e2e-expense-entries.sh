#!/usr/bin/env bash
# Phase 7 E2E — Expense / Payment Entry scenario suite
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
R=$(req POST /auth/register "" "{\"full_name\":\"Exp Admin\",\"mobile_number\":\"97${STAMP}01\",\"email\":\"exp.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\",\"confirm_password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" "{\"full_name\":\"Exp User 1\",\"mobile_number\":\"97${STAMP}02\",\"email\":\"exp.user1.${STAMP}@example.com\",\"password\":\"MemberPass#1\",\"confirm_password\":\"MemberPass#1\"}")
USER1_TOKEN=$(body "$R" | jget data.access_token)

ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='exp.admin.${STAMP}@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null

# Re-login so the token carries the ADMIN role claim
R=$(req POST /auth/login "" "{\"identifier\":\"exp.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
echo "ADMIN ready"

EXP_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='5001'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
INC_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='4001'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
BANK_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='1001'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")

echo "--- scenarios ---"

# TC-EXP-001: Create expense voucher (Dr Other Expenses / Cr Bank)
R=$(req POST /expense-entries "$ADMIN_TOKEN" "{\"expense_date\":\"2026-09-28T00:00:00.000Z\",\"paid_to\":\"Apex Office Supplies Ltd\",\"expense_account_id\":\"$EXP_ACC_ID\",\"paid_from_account_id\":\"$BANK_ACC_ID\",\"amount\":750,\"payment_method\":\"BANK_TRANSFER\",\"reference_number\":\"INV-${STAMP}\",\"description\":\"Stationery purchase\"}")
Voucher_ID=$(body "$R" | jget data.id)
echo "TC-EXP-001 create-voucher: http=$(code "$R") number=$(body "$R" | jget data.voucher_number) status=$(body "$R" | jget data.status) entry_id=$(body "$R" | jget data.accounting_entry_id)"

# TC-EXP-002: Reject non-positive amount
R=$(req POST /expense-entries "$ADMIN_TOKEN" "{\"expense_date\":\"2026-09-28T00:00:00.000Z\",\"paid_to\":\"X\",\"expense_account_id\":\"$EXP_ACC_ID\",\"paid_from_account_id\":\"$BANK_ACC_ID\",\"amount\":0,\"payment_method\":\"CASH\"}")
echo "TC-EXP-002 non-positive-amount: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-EXP-003: Reject non-EXPENSE expense account
R=$(req POST /expense-entries "$ADMIN_TOKEN" "{\"expense_date\":\"2026-09-28T00:00:00.000Z\",\"paid_to\":\"X\",\"expense_account_id\":\"$INC_ACC_ID\",\"paid_from_account_id\":\"$BANK_ACC_ID\",\"amount\":100,\"payment_method\":\"CASH\"}")
echo "TC-EXP-003 non-expense-account: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-EXP-004: Reject non-asset paid-from account
R=$(req POST /expense-entries "$ADMIN_TOKEN" "{\"expense_date\":\"2026-09-28T00:00:00.000Z\",\"paid_to\":\"X\",\"expense_account_id\":\"$EXP_ACC_ID\",\"paid_from_account_id\":\"$INC_ACC_ID\",\"amount\":100,\"payment_method\":\"CASH\"}")
echo "TC-EXP-004 non-asset-paid-from: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-EXP-005: Non-admin denied
R=$(req GET /expense-entries "$USER1_TOKEN")
echo "TC-EXP-005 non-admin-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-EXP-006: Admin list
R=$(req GET /expense-entries "$ADMIN_TOKEN")
echo "TC-EXP-006 list: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

# TC-EXP-007: View detail — balanced lines Dr Expense / Cr Bank
R=$(req GET "/expense-entries/$Voucher_ID" "$ADMIN_TOKEN")
echo "TC-EXP-007 detail: http=$(code "$R") dr=$(body "$R" | jget data.accounting_entry.lines.0.debit_amount) cr=$(body "$R" | jget data.accounting_entry.lines.1.credit_amount) accounts=$(body "$R" | jget data.accounting_entry.lines.0.account.account_code)/$(body "$R" | jget data.accounting_entry.lines.1.account.account_code)"

# TC-EXP-008: Update metadata
R=$(req PATCH "/expense-entries/$Voucher_ID" "$ADMIN_TOKEN" '{"description":"Stationery purchase (corrected payee)","paid_to":"Apex Office Supplies Pvt Ltd"}')
echo "TC-EXP-008 update-metadata: http=$(code "$R") paid_to=$(body "$R" | jget data.paid_to)"

# TC-EXP-009: Cancel voucher with automatic reversal
R=$(req PATCH "/expense-entries/$Voucher_ID/status" "$ADMIN_TOKEN" '{"status":"CANCELLED","cancellation_reason":"Duplicate entry created in error"}')
echo "TC-EXP-009 cancel-with-reversal: http=$(code "$R") status=$(body "$R" | jget data.status)"

# TC-EXP-009b: Reversal entry exists with swapped sides
R=$(req GET "/accounting/entries?reference_type=MANUAL_EXPENSE&reference_id=$Voucher_ID" "$ADMIN_TOKEN")
echo "TC-EXP-009b reversal-entries: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

# TC-EXP-009c: Re-cancel is idempotent (no double reversal)
R=$(req PATCH "/expense-entries/$Voucher_ID/status" "$ADMIN_TOKEN" '{"status":"CANCELLED","cancellation_reason":"again"}')
echo "TC-EXP-009c re-cancel-idempotent: http=$(code "$R") status=$(body "$R" | jget data.status)"

# TC-EXP-010: Bank ledger nets to zero after cancellation (journal + reversal)
R=$(req GET "/accounts/$BANK_ACC_ID/ledger?from_date=2026-09-01&to_date=2026-09-30" "$ADMIN_TOKEN")
echo "TC-EXP-010 bank-ledger-net: http=$(code "$R") closing=$(body "$R" | jget data.meta.closing_balance)"

echo "--- test suite completed ---"
