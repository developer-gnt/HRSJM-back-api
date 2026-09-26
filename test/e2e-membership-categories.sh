#!/usr/bin/env bash
# Phase 3 E2E — Membership Categories scenario suite
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
# Unique identities per run: register is unique-keyed on email/mobile, and a
# crashed run can leave users behind — cleanup at the end removes both.
RUN_ID=$(date +%s)
ADMIN_EMAIL="cat.admin.${RUN_ID}@example.com"
MEMBER_EMAIL="cat.member.${RUN_ID}@example.com"
ADMIN_MOBILE="9877${RUN_ID}"
MEMBER_MOBILE="9876${RUN_ID}"
R=$(req POST /auth/register "" true "{\"full_name\":\"Cat Admin\",\"mobile_number\":\"$ADMIN_MOBILE\",\"email\":\"$ADMIN_EMAIL\",\"password\":\"AdminPass#1\",\"confirm_password\":\"AdminPass#1\"}")
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
R=$(req POST /auth/register "" true "{\"full_name\":\"Cat Member\",\"mobile_number\":\"$MEMBER_MOBILE\",\"email\":\"$MEMBER_EMAIL\",\"password\":\"MemberPass#1\",\"confirm_password\":\"MemberPass#1\"}")
MEMBER_TOKEN=$(body "$R" | jget data.access_token)

ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='$ADMIN_EMAIL'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
MEMBER_USER_ID=$(sql "SELECT id FROM users WHERE email='$MEMBER_EMAIL'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null
echo "ADMIN role granted in DB"

echo "--- scenarios ---"
# TC-CAT-001: Create membership category (admin)
R=$(req POST /membership-categories "$ADMIN_TOKEN" true '{"name":"General Member","code":"GENERAL","description":"Standard 1-year general membership","fee":1000,"validity_days":365,"status":"ACTIVE"}')
echo "TC-CAT-001 create-category: http=$(code "$R") name=$(body "$R" | jget data.name) fee=$(body "$R" | jget data.fee)"
CAT_ID=$(body "$R" | jget data.id)

# TC-CAT-002: Member cannot create category (permission check)
R=$(req POST /membership-categories "$MEMBER_TOKEN" true '{"name":"Sneaky Category","fee":500}')
echo "TC-CAT-002 member-create-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-CAT-003: Duplicate category name
R=$(req POST /membership-categories "$ADMIN_TOKEN" true '{"name":"general member","fee":2000}')
echo "TC-CAT-003 duplicate-name: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-CAT-004: Duplicate category code
R=$(req POST /membership-categories "$ADMIN_TOKEN" true '{"name":"Other Member","code":"GENERAL","fee":2000}')
echo "TC-CAT-004 duplicate-code: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-CAT-005: Validation error (negative fee or missing name)
R=$(req POST /membership-categories "$ADMIN_TOKEN" true '{"name":"","fee":-100}')
echo "TC-CAT-005 validation-error: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-CAT-006: List membership categories
R=$(req GET /membership-categories "$MEMBER_TOKEN")
echo "TC-CAT-006 list-categories: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

# TC-CAT-007: View single category
R=$(req GET "/membership-categories/$CAT_ID" "$MEMBER_TOKEN")
echo "TC-CAT-007 view-category: http=$(code "$R") name=$(body "$R" | jget data.name)"

# TC-CAT-008: Update category details (admin)
R=$(req PATCH "/membership-categories/$CAT_ID" "$ADMIN_TOKEN" true '{"description":"Updated description","fee":1200}')
echo "TC-CAT-008 update-category: http=$(code "$R") fee=$(body "$R" | jget data.fee) desc=$(body "$R" | jget data.description)"

# TC-CAT-009: Member cannot update category
R=$(req PATCH "/membership-categories/$CAT_ID" "$MEMBER_TOKEN" true '{"fee":0}')
echo "TC-CAT-009 member-update-denied: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-CAT-010: Update category status (deactivate)
R=$(req PATCH "/membership-categories/$CAT_ID/status" "$ADMIN_TOKEN" true '{"status":"INACTIVE"}')
echo "TC-CAT-010 update-status: http=$(code "$R") status=$(body "$R" | jget data.status)"

# TC-CAT-011: Filter active categories
R=$(req GET "/membership-categories?status=ACTIVE" "$MEMBER_TOKEN")
echo "TC-CAT-011 filter-active: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

# TC-CAT-012: Re-activate category
R=$(req PATCH "/membership-categories/$CAT_ID/status" "$ADMIN_TOKEN" true '{"status":"ACTIVE"}')
echo "TC-CAT-012 reactivate-status: http=$(code "$R") status=$(body "$R" | jget data.status)"

# TC-CAT-013: Non-UUID id rejected with 400 (guard against uuid-cast 500)
R=$(req GET "/membership-categories/not-a-uuid" "$MEMBER_TOKEN")
echo "TC-CAT-013 invalid-uuid: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-CAT-014: Fee above numeric(12,2) ceiling rejected
R=$(req POST /membership-categories "$ADMIN_TOKEN" true '{"name":"Overflow Fee","fee":99999999999}')
echo "TC-CAT-014 fee-overflow: http=$(code "$R") code=$(body "$R" | jget error.code)"

# TC-CAT-015: validity_days above int4 ceiling rejected
R=$(req POST /membership-categories "$ADMIN_TOKEN" true '{"name":"Overflow Days","fee":100,"validity_days":99999999999}')
echo "TC-CAT-015 validity-overflow: http=$(code "$R") code=$(body "$R" | jget error.code)"

echo "--- DB cleanup ---"
sql "DELETE FROM membership_categories WHERE id='$CAT_ID'" > /dev/null
sql "DELETE FROM audit_logs WHERE actor_id IN ('$ADMIN_USER_ID', '$MEMBER_USER_ID')" > /dev/null
# user_roles / refresh_tokens / password_reset_tokens cascade on user delete
sql "DELETE FROM users WHERE id IN ('$ADMIN_USER_ID', '$MEMBER_USER_ID')" > /dev/null
echo "cleanup done"
