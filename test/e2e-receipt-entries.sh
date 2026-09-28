#!/usr/bin/env bash
# Phase 8 E2E — Receipt / Payment Accounting Integration scenario suite
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
R=$(req POST /auth/register "" "{\"full_name\":\"Rec Admin\",\"mobile_number\":\"96${STAMP}01\",\"email\":\"rec.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\",\"confirm_password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" "{\"full_name\":\"Rec User 1\",\"mobile_number\":\"96${STAMP}02\",\"email\":\"rec.user1.${STAMP}@example.com\",\"password\":\"MemberPass#1\",\"confirm_password\":\"MemberPass#1\"}")
USER1_TOKEN=$(body "$R" | jget data.access_token)

ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='rec.admin.${STAMP}@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null

# Re-login so the token carries the ADMIN role claim
R=$(req POST /auth/login "" "{\"identifier\":\"rec.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
echo "ADMIN ready"

INC_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='4004'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
EXP_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='5001'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
BANK_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='1001'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
CASH_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='1002'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")

echo "--- scenarios ---"

# TC-REC-001: Create receipt voucher (Dr Bank / Cr Other Income)
R=$(req POST /receipt-entries "$ADMIN_TOKEN" "{\"receipt_date\":\"2026-09-28T00:00:00.000Z\",\"received_from\":\"Mr. hall donor\",\"income_account_id\":\"$INC_ACC_ID\",\"received_in_account_id\":\"$BANK_ACC_ID\",\"amount\":2500,\"payment_method\":\"BANK_TRANSFER\",\"reference_number\":\"DEP-${STAMP}\",\"description\":\"Hall rent reimbursement\"}")
REC_ID=$(body "$R" | jget data.id)
echo "TC-REC-001 create-receipt: http=$(code "$R") number=$(body "$R" | jget data.voucher_number) status=$(body "$R" | jget data.status) entry_id=$(body "$R" | jget data.accounting_entry_id)"

# TC-REC-002: Reject non-positive amount
R=$(req POST /receipt-entries "$ADMIN_TOKEN" "{\"receipt_date\":\"2026-09-28T00:00:00.000Z\",\"received_from\":\"X\",\"income_account_id\":\"$INC_ACC_ID\",\"received_in_account_id\":\"$BANK_ACC_ID\",\"amount\":0,\"payment_method\":\"CASH\"}")
echo "TC-REC-002 non-positive-amount: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-REC-003: Reject non-INCOME income account
R=$(req POST /receipt-entries "$ADMIN_TOKEN" "{\"receipt_date\":\"2026-09-28T00:00:00.000Z\",\"received_from\":\"X\",\"income_account_id\":\"$EXP_ACC_ID\",\"received_in_account_id\":\"$BANK_ACC_ID\",\"amount\":100,\"payment_method\":\"CASH\"}")
echo "TC-REC-003 non-income-account: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-REC-004: Reject non-asset received-in account
R=$(req POST /receipt-entries "$ADMIN_TOKEN" "{\"receipt_date\":\"2026-09-28T00:00:00.000Z\",\"received_from\":\"X\",\"income_account_id\":\"$INC_ACC_ID\",\"received_in_account_id\":\"$INC_ACC_ID\",\"amount\":100,\"payment_method\":\"CASH\"}")
echo "TC-REC-004 non-asset-received-in: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-REC-005: Non-admin denied
R=$(req GET /receipt-entries "$USER1_TOKEN")
echo "TC-REC-005 non-admin-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-REC-006: Admin list
R=$(req GET /receipt-entries "$ADMIN_TOKEN")
echo "TC-REC-006 list: http=$(code "$R") total=$(body "$R" | jget data.total)"

# TC-REC-007: View detail — balanced lines Dr Bank / Cr Income
R=$(req GET "/receipt-entries/$REC_ID" "$ADMIN_TOKEN")
echo "TC-REC-007 detail: http=$(code "$R") dr=$(body "$R" | jget data.accounting_entry.lines.0.debit_amount) cr=$(body "$R" | jget data.accounting_entry.lines.1.credit_amount) accounts=$(body "$R" | jget data.accounting_entry.lines.0.account.account_code)/$(body "$R" | jget data.accounting_entry.lines.1.account.account_code)"

# TC-REC-008: Update metadata
R=$(req PATCH "/receipt-entries/$REC_ID" "$ADMIN_TOKEN" '{"description":"Hall rent reimbursement (updated)","received_from":"Mr. Hall Donor"}')
echo "TC-REC-008 update-metadata: http=$(code "$R") received_from=$(body "$R" | jget data.received_from)"

# TC-REC-009: Cancel receipt with automatic reversal
R=$(req PATCH "/receipt-entries/$REC_ID/status" "$ADMIN_TOKEN" '{"status":"CANCELLED","cancellation_reason":"Recorded against wrong account"}')
echo "TC-REC-009 cancel-with-reversal: http=$(code "$R") status=$(body "$R" | jget data.status)"

# TC-REC-009b: Reversal entry exists (journal + reversal by MANUAL_RECEIPT reference)
R=$(req GET "/accounting/entries?reference_type=MANUAL_RECEIPT&reference_id=$REC_ID" "$ADMIN_TOKEN")
echo "TC-REC-009b reversal-entries: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

# TC-REC-009c: Re-cancel is idempotent
R=$(req PATCH "/receipt-entries/$REC_ID/status" "$ADMIN_TOKEN" '{"status":"CANCELLED","cancellation_reason":"again"}')
echo "TC-REC-009c re-cancel-idempotent: http=$(code "$R") status=$(body "$R" | jget data.status)"

# TC-REC-010: Bank ledger nets to zero after cancellation (journal + reversal)
R=$(req GET "/accounts/$BANK_ACC_ID/ledger?from_date=2026-09-01&to_date=2026-09-30" "$ADMIN_TOKEN")
echo "TC-REC-010 bank-ledger-net: http=$(code "$R") closing=$(body "$R" | jget data.meta.closing_balance)"

# TC-REC-011: CASH receipt posts Dr Cash (1002)
R=$(req POST /receipt-entries "$ADMIN_TOKEN" "{\"receipt_date\":\"2026-09-28T00:00:00.000Z\",\"received_from\":\"Walk-in donor\",\"income_account_id\":\"$INC_ACC_ID\",\"received_in_account_id\":\"$CASH_ACC_ID\",\"amount\":300,\"payment_method\":\"CASH\",\"description\":\"Donation box collection\"}")
REC2_ID=$(body "$R" | jget data.id)
R=$(req GET "/receipt-entries/$REC2_ID" "$ADMIN_TOKEN")
echo "TC-REC-011 cash-receipt-entry: http=$(code "$R") dr_account=$(body "$R" | jget data.accounting_entry.lines.0.account.account_code) dr=$(body "$R" | jget data.accounting_entry.lines.0.debit_amount)"

echo "--- test suite completed ---"
