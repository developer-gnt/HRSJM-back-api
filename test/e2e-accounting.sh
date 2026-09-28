#!/usr/bin/env bash
# Phase 6 E2E — Accounting Foundation scenario suite (COA + Entries + Ledger)
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
R=$(req POST /auth/register "" "{\"full_name\":\"Acc Admin\",\"mobile_number\":\"98${STAMP}01\",\"email\":\"acc.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\",\"confirm_password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" "{\"full_name\":\"Acc User 1\",\"mobile_number\":\"98${STAMP}02\",\"email\":\"acc.user1.${STAMP}@example.com\",\"password\":\"MemberPass#1\",\"confirm_password\":\"MemberPass#1\"}")
USER1_TOKEN=$(body "$R" | jget data.access_token)

ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='acc.admin.${STAMP}@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null
echo "ADMIN role granted in DB"

# Re-login so the token carries the ADMIN role claim
R=$(req POST /auth/login "" "{\"identifier\":\"acc.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)

echo "--- scenarios ---"

# TC-ACC-001: Admin lists baseline seeded chart of accounts
R=$(req GET /accounts "$ADMIN_TOKEN")
echo "TC-ACC-001 list-coa: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

# TC-ACC-002: Non-admin is denied accounting access
R=$(req GET /accounts "$USER1_TOKEN")
echo "TC-ACC-002 non-admin-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-ACC-003: Create an account (admin)
R=$(req POST /accounts "$ADMIN_TOKEN" "{\"account_name\":\"Travelling Expense ${STAMP}\",\"account_code\":\"5${STAMP}\",\"account_type\":\"EXPENSE\",\"description\":\"Travel conveyance costs\"}")
ACC_TRAVEL_ID=$(body "$R" | jget data.id)
echo "TC-ACC-003 create-account: http=$(code "$R") name=$(body "$R" | jget data.account_name) code=$(body "$R" | jget data.account_code)"

# TC-ACC-004: Validation error — invalid account type
R=$(req POST /accounts "$ADMIN_TOKEN" '{"account_name":"Bad Type Account","account_type":"NOT_A_TYPE"}')
echo "TC-ACC-004 invalid-type: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-ACC-005: Duplicate account name rejected
R=$(req POST /accounts "$ADMIN_TOKEN" '{"account_name":"Bank","account_type":"ASSET"}')
echo "TC-ACC-005 duplicate-name: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-ACC-006: Duplicate account code rejected
R=$(req POST /accounts "$ADMIN_TOKEN" '{"account_name":"Another Bank","account_code":"1001","account_type":"ASSET"}')
echo "TC-ACC-006 duplicate-code: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-ACC-007: Parent must be of the same account type
R=$(req POST /accounts "$ADMIN_TOKEN" "{\"account_name\":\"Travel Child\",\"account_type\":\"INCOME\",\"parent_account_id\":\"$ACC_TRAVEL_ID\"}")
echo "TC-ACC-007 parent-type-mismatch: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-ACC-008: Update an account (description + parent)
R=$(req PATCH "/accounts/$ACC_TRAVEL_ID" "$ADMIN_TOKEN" '{"description":"Travel & conveyance (updated)"}')
echo "TC-ACC-008 update-account: http=$(code "$R") description=$(body "$R" | jget data.description)"

# TC-ACC-009: Deactivate account without children, then reactivate
R=$(req PATCH "/accounts/$ACC_TRAVEL_ID/status" "$ADMIN_TOKEN" '{"is_active":false}')
echo "TC-ACC-009a deactivate: http=$(code "$R") is_active=$(body "$R" | jget data.is_active)"
R=$(req PATCH "/accounts/$ACC_TRAVEL_ID/status" "$ADMIN_TOKEN" '{"is_active":true}')
echo "TC-ACC-009b reactivate: http=$(code "$R") is_active=$(body "$R" | jget data.is_active)"

# TC-ACC-010: account_type is immutable (absent from DTO → whitelisted payload fails)
R=$(req PATCH "/accounts/$ACC_TRAVEL_ID" "$ADMIN_TOKEN" '{"account_type":"INCOME"}')
echo "TC-ACC-010 type-immutable: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-ACC-011: Integrated flow — membership payment posts a balanced entry
R=$(req POST /membership-categories "$ADMIN_TOKEN" "{\"name\":\"Acc Gold Member ${STAMP}\",\"code\":\"ACC_GOLD_${STAMP}\",\"fee\":1200,\"validity_days\":365,\"status\":\"ACTIVE\"}")
CAT_ID=$(body "$R" | jget data.id)
R=$(req POST /memberships "$USER1_TOKEN" "{\"category_id\":\"$CAT_ID\"}")
MEM1_ID=$(body "$R" | jget data.id)
R=$(req PATCH "/memberships/$MEM1_ID/status" "$ADMIN_TOKEN" '{"status":"APPROVED"}')
R=$(req POST /membership-payments "$USER1_TOKEN" "{\"membership_id\":\"$MEM1_ID\",\"payment_method\":\"ONLINE\"}")
PAY_ID=$(body "$R" | jget data.id)
echo "TC-ACC-011 setup payment: payment_id=$PAY_ID"
R=$(req POST "/membership-payments/$PAY_ID/verify" "$ADMIN_TOKEN" '{"gateway_payment_id":"pay_acc_e2e_001","gateway_signature":"sig_acc_e2e_001"}')
ENTRY_ID=$(body "$R" | jget data.receipt.accounting_entry_id)
echo "TC-ACC-011 verify-posts-entry: http=$(code "$R") entry_id=$ENTRY_ID"

# TC-ACC-012: Entry detail shows balanced Dr Bank / Cr Membership Income lines
R=$(req GET "/accounting/entries/$ENTRY_ID" "$ADMIN_TOKEN")
echo "TC-ACC-012 entry-detail: http=$(code "$R") lines=$(body "$R" | jget data.lines.length) dr=$(body "$R" | jget data.lines.0.debit_amount) cr=$(body "$R" | jget data.lines.1.credit_amount) accounts=$(body "$R" | jget data.lines.0.account.account_code)/$(body "$R" | jget data.lines.1.account.account_code)"

# TC-ACC-013: Entries list filterable by reference
R=$(req GET "/accounting/entries?reference_type=MEMBERSHIP_PAYMENT&reference_id=$PAY_ID" "$ADMIN_TOKEN")
echo "TC-ACC-013 entries-by-reference: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

# TC-ACC-014: Re-verification stays idempotent — still exactly one entry
R=$(req POST "/membership-payments/$PAY_ID/verify" "$ADMIN_TOKEN" '{"gateway_payment_id":"pay_acc_e2e_001"}')
R=$(req GET "/accounting/entries?reference_type=MEMBERSHIP_PAYMENT&reference_id=$PAY_ID" "$ADMIN_TOKEN")
echo "TC-ACC-014 idempotent-single-entry: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

# TC-ACC-015: Per-account ledger shows running balance
BANK_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='1001'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
R=$(req GET "/accounts/$BANK_ACC_ID/ledger?from_date=2026-01-01&to_date=2026-12-31" "$ADMIN_TOKEN")
echo "TC-ACC-015 bank-ledger: http=$(code "$R") rows=$(body "$R" | jget data.meta.total) running=$(body "$R" | jget data.items.0.running_balance) closing=$(body "$R" | jget data.meta.closing_balance)"

# TC-ACC-016: Global ledger requires from_date/to_date
R=$(req GET "/accounting/ledger" "$ADMIN_TOKEN")
echo "TC-ACC-016a ledger-missing-dates: http=$(code "$R") code=$(body "$R" | jget error.code)"
R=$(req GET "/accounting/ledger?from_date=2026-01-01&to_date=2026-12-31" "$ADMIN_TOKEN")
echo "TC-ACC-016b global-ledger: http=$(code "$R") rows=$(body "$R" | jget data.meta.total) dr=$(body "$R" | jget data.meta.total_debit) cr=$(body "$R" | jget data.meta.total_credit)"

# TC-ACC-017: Reverse the entry → mirrored REVERSAL entry
R=$(req POST "/accounting/entries/$ENTRY_ID/reverse" "$ADMIN_TOKEN" '{}')
REV_ID=$(body "$R" | jget data.id)
echo "TC-ACC-017 reverse-entry: http=$(code "$R") type=$(body "$R" | jget data.entry_type) number=$(body "$R" | jget data.entry_number)"
R=$(req GET "/accounting/entries/$ENTRY_ID" "$ADMIN_TOKEN")
echo "TC-ACC-017b original-shows-reversal: http=$(code "$R") reversed_by=$(body "$R" | jget data.reversed_by.entry_number)"

# TC-ACC-018: Double reversal rejected
R=$(req POST "/accounting/entries/$ENTRY_ID/reverse" "$ADMIN_TOKEN" '{}')
echo "TC-ACC-018 double-reversal: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-ACC-019: A reversal entry itself cannot be reversed
R=$(req POST "/accounting/entries/$REV_ID/reverse" "$ADMIN_TOKEN" '{}')
echo "TC-ACC-019 reversal-of-reversal: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-ACC-020: Ledger after reversal nets to zero for the reversed payment
R=$(req GET "/accounts/$BANK_ACC_ID/ledger?from_date=2026-01-01&to_date=2026-12-31" "$ADMIN_TOKEN")
echo "TC-ACC-020 ledger-after-reversal: http=$(code "$R") closing=$(body "$R" | jget data.meta.closing_balance)"

# TC-ACC-021: Offline CASH payment posts Dr Cash (1002)
R=$(req POST /membership-categories "$ADMIN_TOKEN" "{\"name\":\"Acc Cash Member ${STAMP}\",\"code\":\"ACC_CASH_${STAMP}\",\"fee\":500,\"validity_days\":365,\"status\":\"ACTIVE\"}")
CAT2_ID=$(body "$R" | jget data.id)
R=$(req POST /memberships "$USER1_TOKEN" "{\"category_id\":\"$CAT2_ID\"}")
MEM2_ID=$(body "$R" | jget data.id)
R=$(req PATCH "/memberships/$MEM2_ID/status" "$ADMIN_TOKEN" '{"status":"APPROVED"}')
R=$(req POST /membership-payments "$USER1_TOKEN" "{\"membership_id\":\"$MEM2_ID\",\"payment_method\":\"CASH\"}")
PAY2_ID=$(body "$R" | jget data.id)
R=$(req PATCH "/membership-payments/$PAY2_ID/status" "$ADMIN_TOKEN" '{"status":"SUCCESS","notes":"Cash at office counter"}')
echo "TC-ACC-021a offline-status-update: http=$(code "$R") status=$(body "$R" | jget data.payment_status)"
# status-update path returns the payment only — fetch the posted entry via reference
R=$(req GET "/accounting/entries?reference_type=MEMBERSHIP_PAYMENT&reference_id=$PAY2_ID" "$ADMIN_TOKEN")
ENTRY2_ID=$(body "$R" | jget data.items.0.id)
R=$(req GET "/accounting/entries/$ENTRY2_ID" "$ADMIN_TOKEN")
echo "TC-ACC-021 offline-cash-entry: http=$(code "$R") dr_account=$(body "$R" | jget data.lines.0.account.account_code) dr=$(body "$R" | jget data.lines.0.debit_amount)"

echo "--- test suite completed ---"
