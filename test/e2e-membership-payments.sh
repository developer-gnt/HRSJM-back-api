#!/usr/bin/env bash
# Phase 5 E2E — Membership Payment scenario suite
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

echo "--- setup ---"
R=$(req POST /auth/register "" true '{"full_name":"Pay Admin","mobile_number":"9877770001","email":"pay.admin@example.com","password":"AdminPass#1","confirm_password":"AdminPass#1"}')
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" true '{"full_name":"Pay User 1","mobile_number":"9877770002","email":"pay.user1@example.com","password":"MemberPass#1","confirm_password":"MemberPass#1"}')
USER1_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" true '{"full_name":"Pay User 2","mobile_number":"9877770003","email":"pay.user2@example.com","password":"MemberPass#1","confirm_password":"MemberPass#1"}')
USER2_TOKEN=$(body "$R" | jget data.access_token)

ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='pay.admin@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null
echo "ADMIN role granted in DB"

# Create a test category
R=$(req POST /membership-categories "$ADMIN_TOKEN" true '{"name":"Payment Platinum Member","code":"PAY_PLATINUM","fee":1500,"validity_days":365,"status":"ACTIVE"}')
CAT_ID=$(body "$R" | jget data.id)
echo "test category created: $CAT_ID"

# User 1 applies for membership
R=$(req POST /memberships "$USER1_TOKEN" true "{\"category_id\":\"$CAT_ID\"}")
MEM1_ID=$(body "$R" | jget data.id)
echo "user 1 membership application created: $MEM1_ID"

# Admin approves membership application so it's ready for payment
R=$(req PATCH "/memberships/$MEM1_ID/status" "$ADMIN_TOKEN" true '{"status":"APPROVED","admin_notes":"Ready for payment"}')
echo "user 1 membership approved: http=$(code "$R") status=$(body "$R" | jget data.status)"

echo "--- scenarios ---"
# TC-PAY-001: Initiate Payment
R=$(req POST /membership-payments/initiate "$USER1_TOKEN" true "{\"membership_id\":\"$MEM1_ID\",\"payment_method\":\"ONLINE\"}")
PAY_ID=$(body "$R" | jget data.payment_id)
ORDER_ID=$(body "$R" | jget data.gateway_order_id)
echo "TC-PAY-001 initiate-payment: http=$(code "$R") payment_id=$PAY_ID order_id=$ORDER_ID amount=$(body "$R" | jget data.amount)"

# TC-PAY-002: User lists own payments via /membership-payments/my
R=$(req GET /membership-payments/my "$USER1_TOKEN")
echo "TC-PAY-002 my-payments: http=$(code "$R") count=$(body "$R" | jget data.meta.total)"

# TC-PAY-003: User views single payment by ID
R=$(req GET "/membership-payments/$PAY_ID" "$USER1_TOKEN")
echo "TC-PAY-003 view-own-payment: http=$(code "$R") id=$(body "$R" | jget data.id) status=$(body "$R" | jget data.payment_status)"

# TC-PAY-004: Another user cannot view payment (ownership check)
R=$(req GET "/membership-payments/$PAY_ID" "$USER2_TOKEN")
echo "TC-PAY-004 other-user-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-PAY-005: Verify Payment with signature
R=$(req POST /membership-payments/verify "$USER1_TOKEN" true "{\"payment_id\":\"$PAY_ID\",\"gateway_payment_id\":\"pay_simulated_123\",\"gateway_signature\":\"sig_simulated_456\",\"gateway_response\":{\"method\":\"upi\",\"status\":\"captured\"}}")
RECEIPT_NUM=$(body "$R" | jget data.receipt.receipt_number)
echo "TC-PAY-005 verify-payment: http=$(code "$R") payment_status=$(body "$R" | jget data.payment.payment_status) receipt_num=$RECEIPT_NUM"

# Verify membership is now ACTIVE
R=$(req GET "/memberships/$MEM1_ID" "$USER1_TOKEN")
echo "TC-PAY-005b membership-activated: status=$(body "$R" | jget data.status) number=$(body "$R" | jget data.membership_number) start=$(body "$R" | jget data.start_date) expiry=$(body "$R" | jget data.expiry_date)"

# TC-PAY-006: Verification idempotency check (verifying already success payment returns receipt and success)
R=$(req POST /membership-payments/verify "$USER1_TOKEN" true "{\"payment_id\":\"$PAY_ID\",\"gateway_payment_id\":\"pay_simulated_123\",\"gateway_signature\":\"sig_simulated_456\"}")
echo "TC-PAY-006 verify-idempotent: http=$(code "$R") success=$(body "$R" | jget success)"

# TC-PAY-007: Admin lists all payments
R=$(req GET /membership-payments "$ADMIN_TOKEN")
echo "TC-PAY-007 admin-list-payments: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

# TC-PAY-008: Admin offline payment creation & manual status update
R=$(req POST /memberships "$USER2_TOKEN" true "{\"category_id\":\"$CAT_ID\"}")
MEM2_ID=$(body "$R" | jget data.id)
R=$(req PATCH "/memberships/$MEM2_ID/status" "$ADMIN_TOKEN" true '{"status":"APPROVED"}')
R=$(req POST /membership-payments/initiate "$USER2_TOKEN" true "{\"membership_id\":\"$MEM2_ID\",\"payment_method\":\"CASH\"}")
PAY2_ID=$(body "$R" | jget data.payment_id)
R=$(req PATCH "/membership-payments/$PAY2_ID/status" "$ADMIN_TOKEN" true '{"status":"SUCCESS","notes":"Cash received at central office counter","transaction_id":"OFFLINE-CASH-001"}')
echo "TC-PAY-008 admin-offline-status-update: http=$(code "$R") status=$(body "$R" | jget data.payment.payment_status) receipt_num=$(body "$R" | jget data.receipt.receipt_number)"

echo "--- test suite completed ---"
