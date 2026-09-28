#!/usr/bin/env bash
# Phase 9 E2E — Donation Financial / Payment Integration scenario suite
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
R=$(req POST /auth/register "" "{\"full_name\":\"Don Admin\",\"mobile_number\":\"95${STAMP}01\",\"email\":\"don.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\",\"confirm_password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
ADMIN_ID=$(body "$R" | jget data.user.id)
R=$(req POST /auth/register "" "{\"full_name\":\"Don User 1\",\"mobile_number\":\"95${STAMP}02\",\"email\":\"don.user1.${STAMP}@example.com\",\"password\":\"MemberPass#1\",\"confirm_password\":\"MemberPass#1\"}")
USER1_TOKEN=$(body "$R" | jget data.access_token)

ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='don.admin.${STAMP}@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null

# Re-login so the token carries the ADMIN role claim
R=$(req POST /auth/login "" "{\"identifier\":\"don.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
echo "ADMIN ready"

BANK_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='1001'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO donations (id, donor_name, donor_mobile, cause, amount, status) VALUES ('11111111-1111-4111-8111-000000${STAMP}', 'Walk-in Donor', '9800000001', 'Temple renovation fund', 2500, 'PENDING') ON CONFLICT DO NOTHING" > /dev/null
DON1_ID=$(sql "SELECT id FROM donations WHERE id='11111111-1111-4111-8111-000000${STAMP}' AND status='PENDING' LIMIT 1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
echo "donation seeded: $DON1_ID"

echo "--- scenarios ---"

# TC-DON-001: Create donation payment (defaults to donation amount)
R=$(req POST /donation-payments "$USER1_TOKEN" "{\"donation_id\":\"$DON1_ID\"}")
PAY_ID=$(body "$R" | jget data.id)
echo "TC-DON-001 create-payment: http=$(code "$R") status=$(body "$R" | jget data.payment_status) amount=$(body "$R" | jget data.amount)"

# TC-DON-002: Create payment for unknown donation
R=$(req POST /donation-payments "$USER1_TOKEN" '{"donation_id":"00000000-0000-4000-8000-000000000000"}')
echo "TC-DON-002 unknown-donation: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-DON-003: Verify payment → balanced entry Dr Bank / Cr Donation Income, receipt, donation SUCCESS
R=$(req POST "/donation-payments/$PAY_ID/verify" "$ADMIN_TOKEN" '{"gateway_payment_id":"pay_don_e2e_001","gateway_signature":"sig_don_001"}')
ENTRY_ID=$(body "$R" | jget data.receipt.accounting_entry_id)
echo "TC-DON-003 verify-posts-entry: http=$(code "$R") status=$(body "$R" | jget data.payment.payment_status) entry_id=$ENTRY_ID"

# TC-DON-003b: Donation reflects SUCCESS status
R=$(sql "SELECT status FROM donations WHERE id='$DON1_ID'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].status))")
echo "TC-DON-003b donation-status: status=$R"

# TC-DON-004: Entry detail — Dr 1001 = Cr 4003 with DONATION_PAYMENT reference
R=$(req GET "/accounting/entries/$ENTRY_ID" "$ADMIN_TOKEN")
echo "TC-DON-004 entry-detail: http=$(code "$R") lines=$(body "$R" | jget data.lines.length) dr=$(body "$R" | jget data.lines.0.debit_amount) cr=$(body "$R" | jget data.lines.1.credit_amount) accounts=$(body "$R" | jget data.lines.0.account.account_code)/$(body "$R" | jget data.lines.1.account.account_code)"

# TC-DON-005: Re-verification idempotent — still exactly one journal per payment
R=$(req POST "/donation-payments/$PAY_ID/verify" "$ADMIN_TOKEN" '{"gateway_payment_id":"pay_don_001"}')
R=$(req GET "/accounting/entries?reference_type=DONATION_PAYMENT&reference_id=$PAY_ID" "$ADMIN_TOKEN")
echo "TC-DON-005 idempotent-single-entry: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

# TC-DON-006: Receipt endpoint
R=$(req GET "/donation-payments/$PAY_ID/receipt" "$USER1_TOKEN")
echo "TC-DON-006 receipt: http=$(code "$R") number=$(body "$R" | jget data.receipt_number) type=$(body "$R" | jget data.receipt_type) entry=$(body "$R" | jget data.accounting_entry_id)"

# TC-DON-007: Non-admin refund denied
R=$(req POST "/donations/$DON1_ID/refund" "$USER1_TOKEN" '{"reason":"test"}')
echo "TC-DON-007 non-admin-refund-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-DON-008: Full refund — mirrored reversal, statuses REFUNDED, refund record
R=$(req POST "/donations/$DON1_ID/refund" "$ADMIN_TOKEN" '{"reason":"Donor requested refund"}')
echo "TC-DON-008 refund: http=$(code "$R") status=$(body "$R" | jget data.donation.status) payment_status=$(body "$R" | jget data.payment.payment_status) reversal=$(body "$R" | jget data.reversal_entry_number)"

# TC-DON-009: Double refund rejected
R=$(req POST "/donations/$DON1_ID/refund" "$ADMIN_TOKEN" '{"reason":"again"}')
echo "TC-DON-009 double-refund: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-DON-010: Bank ledger nets to zero after refund (journal + reversal)
R=$(req GET "/accounts/$BANK_ACC_ID/ledger?from_date=2026-09-01&to_date=2026-09-30" "$ADMIN_TOKEN")
echo "TC-DON-010 bank-ledger-net: http=$(code "$R") closing=$(body "$R" | jget data.meta.closing_balance)"

# TC-DON-011: Offline CASH donation posts Dr Cash (1002)
sql "INSERT INTO donations (id, donor_name, donor_mobile, cause, amount, status) VALUES ('22222222-2222-4222-8222-000001${STAMP}', 'Cash Donor', '9800000002', 'Annadaan fund', 800, 'PENDING') ON CONFLICT DO NOTHING" > /dev/null
DON2_ID=$(sql "SELECT id FROM donations WHERE id='22222222-2222-4222-8222-000001${STAMP}' LIMIT 1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
R=$(req POST /donation-payments "$USER1_TOKEN" "{\"donation_id\":\"$DON2_ID\",\"payment_method\":\"CASH\"}")
PAY2_ID=$(body "$R" | jget data.id)
R=$(req PATCH "/donation-payments/$PAY2_ID/status" "$ADMIN_TOKEN" '{"status":"SUCCESS","notes":"Cash at temple office"}')
echo "TC-DON-011a offline-status-update: http=$(code "$R") status=$(body "$R" | jget data.payment_status)"
R=$(req GET "/accounting/entries?reference_type=DONATION_PAYMENT&reference_id=$PAY2_ID" "$ADMIN_TOKEN")
ENTRY2_ID=$(body "$R" | jget data.items.0.id)
R=$(req GET "/accounting/entries/$ENTRY2_ID" "$ADMIN_TOKEN")
echo "TC-DON-011 offline-cash-entry: http=$(code "$R") dr_account=$(body "$R" | jget data.lines.0.account.account_code) dr=$(body "$R" | jget data.lines.0.debit_amount)"

# TC-DON-012: PATCH status REFUNDED is rejected (must use refund endpoint)
sql "INSERT INTO donations (id, donor_name, donor_mobile, cause, amount, status) VALUES ('33333333-3333-4333-8333-000002${STAMP}', 'Third Donor', '9800000003', 'Goshala fund', 300, 'PENDING') ON CONFLICT DO NOTHING" > /dev/null
DON3_ID=$(sql "SELECT id FROM donations WHERE id='33333333-3333-4333-8333-000002${STAMP}' LIMIT 1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
R=$(req POST /donation-payments "$USER1_TOKEN" "{\"donation_id\":\"$DON3_ID\",\"payment_method\":\"ONLINE\"}")
PAY3_ID=$(body "$R" | jget data.id)
R=$(req POST "/donation-payments/$PAY3_ID/verify" "$ADMIN_TOKEN" '{"gateway_payment_id":"pay_don_003"}')
R=$(req PATCH "/donation-payments/$PAY3_ID/status" "$ADMIN_TOKEN" '{"status":"REFUNDED"}')
echo "TC-DON-012 refunded-via-status-rejected: http=$(code "$R") code=$(body "$R" | jget error.code)"

echo "--- test suite completed ---"
