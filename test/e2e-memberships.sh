#!/usr/bin/env bash
# Phase 4 E2E — Membership Management scenario suite
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
R=$(req POST /auth/register "" true '{"full_name":"Mem Admin","mobile_number":"9866660001","email":"mem.admin@example.com","password":"AdminPass#1","confirm_password":"AdminPass#1"}')
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" true '{"full_name":"Mem User 1","mobile_number":"9866660002","email":"mem.user1@example.com","password":"MemberPass#1","confirm_password":"MemberPass#1"}')
USER1_TOKEN=$(body "$R" | jget data.access_token)
USER1_ID=$(body "$R" | jget data.user.id)
R=$(req POST /auth/register "" true '{"full_name":"Mem User 2","mobile_number":"9866660003","email":"mem.user2@example.com","password":"MemberPass#1","confirm_password":"MemberPass#1"}')
USER2_TOKEN=$(body "$R" | jget data.access_token)

ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='mem.admin@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null
echo "ADMIN role granted in DB"

# Create a test category
R=$(req POST /membership-categories "$ADMIN_TOKEN" true '{"name":"Senior Citizen Member","code":"SR_CITIZEN","fee":500,"validity_days":365,"status":"ACTIVE"}')
CAT_ID=$(body "$R" | jget data.id)
echo "test category created: $CAT_ID"

echo "--- scenarios ---"
# TC-MEM-001: Apply for membership
R=$(req POST /memberships "$USER1_TOKEN" true "{\"category_id\":\"$CAT_ID\",\"application_data\":{\"city\":\"Delhi\",\"blood_group\":\"O+\"}}")
MEM_ID=$(body "$R" | jget data.id)
echo "TC-MEM-001 apply-membership: http=$(code "$R") status=$(body "$R" | jget data.status) id=$MEM_ID"

# TC-MEM-002: User gets own membership via /users/me/membership
R=$(req GET /users/me/membership "$USER1_TOKEN")
echo "TC-MEM-002 users-me-membership: http=$(code "$R") status=$(body "$R" | jget data.status) category=$(body "$R" | jget data.category.name)"

# TC-MEM-003: User gets own membership by ID
R=$(req GET "/memberships/$MEM_ID" "$USER1_TOKEN")
echo "TC-MEM-003 view-own-membership: http=$(code "$R") id=$(body "$R" | jget data.id)"

# TC-MEM-004: Another user cannot view user 1's membership (ownership enforcement)
R=$(req GET "/memberships/$MEM_ID" "$USER2_TOKEN")
echo "TC-MEM-004 other-user-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-MEM-005: User updates own pending application
R=$(req PATCH "/memberships/$MEM_ID" "$USER1_TOKEN" true '{"application_data":{"city":"New Delhi","blood_group":"O+"}}')
echo "TC-MEM-005 update-pending: http=$(code "$R") city=$(body "$R" | jget data.application_data.city)"

# TC-MEM-006: Admin lists memberships
R=$(req GET /memberships "$ADMIN_TOKEN")
echo "TC-MEM-006 admin-list-memberships: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

# TC-MEM-007: Non-admin denied listing all memberships
R=$(req GET /memberships "$USER1_TOKEN")
echo "TC-MEM-007 member-list-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-MEM-008: Admin approves membership
R=$(req PATCH "/memberships/$MEM_ID/status" "$ADMIN_TOKEN" true '{"status":"APPROVED","admin_notes":"Documents verified"}')
echo "TC-MEM-008 admin-approve: http=$(code "$R") status=$(body "$R" | jget data.status) number=$(body "$R" | jget data.membership_number) start=$(body "$R" | jget data.start_date) expiry=$(body "$R" | jget data.expiry_date)"

# TC-MEM-009: User cannot update application once APPROVED
R=$(req PATCH "/memberships/$MEM_ID" "$USER1_TOKEN" true '{"application_data":{"city":"Mumbai"}}')
echo "TC-MEM-009 update-approved-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-MEM-010: View documents sub-resource
R=$(req GET "/memberships/$MEM_ID/documents" "$USER1_TOKEN")
echo "TC-MEM-010 get-documents: http=$(code "$R") mem_id=$(body "$R" | jget data.membership_id)"

# TC-MEM-011: View payment history sub-resource
R=$(req GET "/memberships/$MEM_ID/payment-history" "$USER1_TOKEN")
echo "TC-MEM-011 get-payments: http=$(code "$R") mem_id=$(body "$R" | jget data.membership_id)"

# TC-MEM-012: View renewal history sub-resource
R=$(req GET "/memberships/$MEM_ID/renewal-history" "$USER1_TOKEN")
echo "TC-MEM-012 get-renewals: http=$(code "$R") mem_id=$(body "$R" | jget data.membership_id)"

# TC-MEM-013: Inactive category application blocked
req PATCH "/membership-categories/$CAT_ID/status" "$ADMIN_TOKEN" true '{"status":"INACTIVE"}' > /dev/null
R=$(req POST /memberships "$USER2_TOKEN" true "{\"category_id\":\"$CAT_ID\"}")
echo "TC-MEM-013 inactive-category-blocked: http=$(code "$R") code=$(body "$R" | jget error.code)"

echo "--- DB cleanup ---"
sql "DELETE FROM memberships WHERE id='$MEM_ID'" > /dev/null
sql "DELETE FROM membership_categories WHERE id='$CAT_ID'" > /dev/null
sql "DELETE FROM audit_logs WHERE actor_id IN ('$ADMIN_USER_ID','$USER1_ID')" > /dev/null
echo "cleanup done"
