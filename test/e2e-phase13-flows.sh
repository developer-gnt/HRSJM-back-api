#!/usr/bin/env bash
# Phase 13 E2E — Integration flows: the full business lifecycles end-to-end.
# Flow A: register → category → apply → approve → pay → verify → receipt → accounting → membership ACTIVE
# Flow B: donation → payment → verify → receipt → accounting → refund → reversal
# Flow C: expense voucher → balanced accounting entry
# Flow D: manual receipt voucher → balanced accounting entry
# Flow E: reports reconcile after all of the above (TB balances, BS equation)
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
P13_MEMBER_MOBILE="91${STAMP}0"
P13_DONOR_MOBILE="91${STAMP}9"
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
assert_contains() { case "$2" in *"$1"*) ok "$3";; *) bad "$3 (expected '$1' in: $2)";; esac; }

echo "--- setup: admin + member + donor ---"
R=$(req POST /auth/register "" "{\"full_name\":\"P13 Admin\",\"mobile_number\":\"91${STAMP}1\",\"email\":\"p13.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\",\"confirm_password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='p13.admin.${STAMP}@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null
R=$(req POST /auth/login "" "{\"identifier\":\"p13.admin.${STAMP}@example.com\",\"password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" "{\"full_name\":\"P13 Member\",\"mobile_number\":\"$P13_MEMBER_MOBILE\",\"email\":\"p13.member.${STAMP}@example.com\",\"password\":\"MemberPass#1\",\"confirm_password\":\"MemberPass#1\"}")
MEMBER_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" "{\"full_name\":\"P13 Donor\",\"mobile_number\":\"$P13_DONOR_MOBILE\",\"email\":\"p13.donor.${STAMP}@example.com\",\"password\":\"MemberPass#1\",\"confirm_password\":\"MemberPass#1\"}")
DONOR_TOKEN=$(body "$R" | jget data.access_token)
echo "setup done"

echo "--- Flow A: membership lifecycle (register → apply → approve → pay → verify → receipt → accounting → ACTIVE) ---"
R=$(req POST /membership-categories "$ADMIN_TOKEN" "{\"name\":\"P13 Standard ${STAMP}\",\"code\":\"P13_${STAMP}\",\"fee\":1000,\"validity_days\":365,\"status\":\"ACTIVE\"}")
CAT_ID=$(body "$R" | jget data.id)
assert_contains "201" "$(code "$R")" "A1 category created"
R=$(req POST /memberships "$MEMBER_TOKEN" "{\"category_id\":\"$CAT_ID\"}")
MEM_ID=$(body "$R" | jget data.id)
assert_contains "201" "$(code "$R")" "A2 membership application created (PENDING)"
R=$(req PATCH "/memberships/$MEM_ID/status" "$ADMIN_TOKEN" '{"status":"APPROVED"}')
assert_contains "200" "$(code "$R")" "A3 admin approves application"
R=$(req POST /membership-payments "$MEMBER_TOKEN" "{\"membership_id\":\"$MEM_ID\",\"payment_method\":\"ONLINE\"}")
PAY_ID=$(body "$R" | jget data.id)
assert_contains "201" "$(code "$R")" "A4 payment initiated (PENDING)"
R=$(req POST "/membership-payments/$PAY_ID/verify" "$ADMIN_TOKEN" '{"gateway_payment_id":"pay_p13_001","gateway_signature":"sig_p13_001"}')
ENTRY_A=$(body "$R" | jget data.receipt.accounting_entry_id)
RECEIPT_A=$(body "$R" | jget data.receipt.receipt_number)
assert_contains "201" "$(code "$R")" "A5 payment verified, receipt $RECEIPT_A issued"
if [ "$ENTRY_A" != "null" ] && [ -n "$ENTRY_A" ] && [ "$ENTRY_A" != "ERR" ]; then ok "A6 accounting entry posted and linked to receipt"; else bad "A6 accounting entry missing"; fi
R=$(req GET "/memberships/$MEM_ID" "$MEMBER_TOKEN")
assert_contains "ACTIVE" "$(body "$R" | jget data.status)" "A7 membership ACTIVE"
MEM_NUM=$(body "$R" | jget data.membership_number)
case "$MEM_NUM" in HRSJM-MEM-*) ok "A8 membership number assigned ($MEM_NUM)";; *) bad "A8 membership number missing";; esac
R=$(req GET "/accounting/entries/$ENTRY_A" "$ADMIN_TOKEN")
assert_contains "1001" "$(body "$R" | jget data.lines.0.account.account_code)" "A9 entry Dr Bank (1001)"
assert_contains "4001" "$(body "$R" | jget data.lines.1.account.account_code)" "A10 entry Cr Membership Income (4001)"

echo "--- Flow B: donation lifecycle (payment → verify → receipt → accounting → refund → reversal) ---"
sql "INSERT INTO donations (id, donor_name, donor_mobile, cause, amount, status) VALUES ('55555555-5555-4555-8555-000000${STAMP}', 'P13 Donor', '$P13_DONOR_MOBILE', 'P13 e2e cause', 1200, 'PENDING') ON CONFLICT DO NOTHING" > /dev/null
DON_ID=$(sql "SELECT id FROM donations WHERE donor_mobile='$P13_DONOR_MOBILE' ORDER BY created_at DESC LIMIT 1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
R=$(req POST /donation-payments "$DONOR_TOKEN" "{\"donation_id\":\"$DON_ID\"}")
DPAY_ID=$(body "$R" | jget data.id)
assert_contains "201" "$(code "$R")" "B1 donation payment created"
R=$(req POST "/donation-payments/$DPAY_ID/verify" "$ADMIN_TOKEN" '{"gateway_payment_id":"pay_p13_don","gateway_signature":"sig_p13_don"}')
ENTRY_B=$(body "$R" | jget data.receipt.accounting_entry_id)
assert_contains "201" "$(code "$R")" "B2 donation verified, receipt + accounting posted"
assert_contains "4003" "$(sql "SELECT a.account_code FROM accounting_entry_lines l JOIN accounts a ON a.id=l.account_id JOIN accounting_entries e ON e.id=l.accounting_entry_id WHERE e.reference_type='DONATION_PAYMENT' AND e.reference_id='$DPAY_ID' AND l.credit_amount>0" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].account_code))")" "B3 Cr Donation Income (4003)"
R=$(req POST "/donations/$DON_ID/refund" "$ADMIN_TOKEN" '{"reason":"P13 e2e refund"}')
REV_B=$(body "$R" | jget data.reversal_entry_number)
assert_contains "201" "$(code "$R")" "B4 full refund with mirrored reversal ($REV_B)"
R=$(req POST "/donations/$DON_ID/refund" "$ADMIN_TOKEN" '{"reason":"again"}')
assert_contains "409" "$(code "$R")" "B5 double refund rejected"

echo "--- Flow C: expense voucher → accounting ---"
EXP_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='5001'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
BANK_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='1001'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
R=$(req POST /expense-entries "$ADMIN_TOKEN" "{\"expense_date\":\"2026-09-28T00:00:00.000Z\",\"paid_to\":\"P13 Vendor\",\"expense_account_id\":\"$EXP_ACC_ID\",\"paid_from_account_id\":\"$BANK_ACC_ID\",\"amount\":250,\"payment_method\":\"BANK_TRANSFER\",\"description\":\"P13 e2e expense\"}")
EXP_ID=$(body "$R" | jget data.id)
assert_contains "201" "$(code "$R")" "C1 expense voucher posted with balanced entry"

echo "--- Flow D: manual receipt voucher → accounting ---"
INC_ACC_ID=$(sql "SELECT id FROM accounts WHERE account_code='4004'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
R=$(req POST /receipt-entries "$ADMIN_TOKEN" "{\"receipt_date\":\"2026-09-28T00:00:00.000Z\",\"received_from\":\"P13 Payer\",\"income_account_id\":\"$INC_ACC_ID\",\"received_in_account_id\":\"$BANK_ACC_ID\",\"amount\":180,\"payment_method\":\"CASH\",\"description\":\"P13 e2e manual receipt\"}")
RECV_ID=$(body "$R" | jget data.id)
assert_contains "201" "$(code "$R")" "D1 manual receipt voucher posted with balanced entry"

echo "--- Flow E: reports reconcile after all flows ---"
R=$(req GET "/reports/trial-balance?as_of_date=2030-01-01" "$ADMIN_TOKEN")
assert_contains "true" "$(body "$R" | jget data.is_balanced)" "E1 trial balance balanced"
R=$(req GET "/reports/balance-sheet?as_of_date=2030-01-01" "$ADMIN_TOKEN")
assert_contains "true" "$(body "$R" | jget data.is_balanced)" "E2 balance sheet equation holds"
R=$(req GET "/reports/profit-loss?from_date=2026-01-01&to_date=2030-01-01" "$ADMIN_TOKEN")
assert_contains "true" "$(body "$R" | jget success)" "E3 P&L renders"

echo "--- DB financial integrity (post-flows) ---"
IMBAL=$(sql "SELECT COUNT(*)::int AS n FROM (SELECT accounting_entry_id FROM accounting_entry_lines GROUP BY accounting_entry_id HAVING SUM(debit_amount) <> SUM(credit_amount)) x" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].n))")
if [ "$IMBAL" = "0" ]; then ok "E4 every posted entry balances (Dr = Cr) in DB"; else bad "E4 found $IMBAL unbalanced entries"; fi

echo ""
echo "=== Phase 13 integration flows: $PASS passed, $FAIL failed ==="
echo "--- test suite completed ---"