#!/usr/bin/env bash
# Phase 2 E2E — admin vs member RBAC scenario suite (run against a freshly booted server)
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
# Register two users (both start as MEMBER)
R=$(req POST /auth/register "" true '{"full_name":"RBAC Admin","mobile_number":"9888880001","email":"rbac.admin@example.com","password":"AdminPass#1","confirm_password":"AdminPass#1"}')
ADMIN_TOKEN=$(body "$R" | jget data.access_token)
echo "admin registered: http=$(code "$R")"
R=$(req POST /auth/register "" true '{"full_name":"RBAC Member","mobile_number":"9888880002","email":"rbac.member@example.com","password":"MemberPass#1","confirm_password":"MemberPass#1"}')
MEMBER_TOKEN=$(body "$R" | jget data.access_token)
echo "member registered: http=$(code "$R")"
# Grant ADMIN role in the DB (role assignment itself requires an admin — bootstrap via seed data)
ADMIN_ROLE_ID=$(sql "SELECT id FROM roles WHERE name='ADMIN'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
ADMIN_USER_ID=$(sql "SELECT id FROM users WHERE email='rbac.admin@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
MEMBER_USER_ID=$(sql "SELECT id FROM users WHERE email='rbac.member@example.com'" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)[0].id))")
sql "INSERT INTO user_roles (user_id, role_id) VALUES ('$ADMIN_USER_ID', '$ADMIN_ROLE_ID') ON CONFLICT DO NOTHING" > /dev/null
echo "ADMIN role granted in DB (token claims are NOT authoritative — guard re-resolves)"

echo "--- scenarios ---"
R=$(req GET /users "$ADMIN_TOKEN")
echo "TC-RBAC-001 admin-list-users: http=$(code "$R") items=$(body "$R" | jget data.items | head -c 40)... meta=$([ "$(body "$R" | jget data.meta.total)" != "undefined" ] && echo yes)"

R=$(req GET "/users/$MEMBER_USER_ID" "$ADMIN_TOKEN")
echo "TC-RBAC-002 admin-view-user: http=$(code "$R") name=$(body "$R" | jget data.full_name)"

R=$(req GET /users "$MEMBER_TOKEN")
echo "TC-RBAC-003 member-list-users: http=$(code "$R") code=$(body "$R" | jget error.code) missing=$(body "$R" | jget error.details.missing)"

R=$(req GET /users "")
echo "TC-RBAC-004 no-token: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(req POST /roles "$ADMIN_TOKEN" true '{"name":"Auditor Team","description":"Read-only finance auditors"}')
echo "TC-RBAC-005 admin-create-role: http=$(code "$R") name=$(body "$R" | jget data.name) protected=$(body "$R" | jget data.is_protected)"
AUDITOR_ROLE_ID=$(body "$R" | jget data.id)

R=$(req POST /roles "$ADMIN_TOKEN" true '{"name":"auditor team"}')
echo "TC-RBAC-010 duplicate-role: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(req PATCH "/roles/$AUDITOR_ROLE_ID" "$ADMIN_TOKEN" true '{"name":"AUDITOR_TEAM"}')
echo "TC-RBAC-006 admin-rename-role: http=$(code "$R") name=$(body "$R" | jget data.name)"

R=$(req PATCH "/roles/$ADMIN_ROLE_ID" "$ADMIN_TOKEN" true '{"name":"SUPER_ADMIN"}')
echo "TC-RBAC-011 rename-baseline-role: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(req DELETE "/roles/$ADMIN_ROLE_ID" "$ADMIN_TOKEN")
echo "TC-RBAC-012 delete-baseline-role: http=$(code "$R") code=$(body "$R" | jget error.code)"

PERM_IDS=$(sql "SELECT id FROM permissions WHERE name IN ('role.read','user.read')" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const a=JSON.parse(d);console.log(JSON.stringify([a[0].id,a[1].id]))})")
R=$(req POST "/roles/$AUDITOR_ROLE_ID/permissions" "$ADMIN_TOKEN" true "{\"permission_ids\":$PERM_IDS}")
echo "TC-RBAC-007 assign-permissions-to-role: http=$(code "$R") perms=$(body "$R" | jget data.permissions)"

R=$(req POST "/roles/$AUDITOR_ROLE_ID/permissions" "$ADMIN_TOKEN" true '{"permission_ids":["00000000-0000-4000-8000-000000000fff"]}')
echo "TC-RBAC-014 assign-unknown-permission: http=$(code "$R") code=$(body "$R" | jget error.code)"

# Grant the member the auditor role, then the member should now read users (ownership of role tree)
R=$(req POST "/users/$MEMBER_USER_ID/roles" "$ADMIN_TOKEN" true "{\"role_id\":\"$AUDITOR_ROLE_ID\"}")
echo "TC-RBAC-015 assign-role-to-user: http=$(code "$R") roles=$(body "$R" | jget data.roles)"
R=$(req POST "/users/$MEMBER_USER_ID/roles" "$ADMIN_TOKEN" true "{\"role_id\":\"$AUDITOR_ROLE_ID\"}")
echo "TC-RBAC-016 assign-role-again-idempotent: http=$(code "$R") count=$(body "$R" | jget data.roles | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).length))")"

# Member now holds user.read via the Auditor role → should list users
R=$(req GET /users "$MEMBER_TOKEN")
echo "TC-RBAC-017 member-with-role-can-read: http=$(code "$R") code=$(body "$R" | jget error.code)"

# ...but still cannot create roles (no role.create)
R=$(req POST /roles "$MEMBER_TOKEN" true '{"name":"Sneaky"}')
echo "TC-RBAC-018 member-without-permission-denied: http=$(code "$R") code=$(body "$R" | jget error.code) missing=$(body "$R" | jget error.details.missing)"

R=$(req DELETE "/users/$MEMBER_USER_ID/roles/$AUDITOR_ROLE_ID" "$ADMIN_TOKEN")
echo "TC-RBAC-019 remove-user-role: http=$(code "$R") roles=$(body "$R" | jget data.roles)"
R=$(req DELETE "/users/$MEMBER_USER_ID/roles/$AUDITOR_ROLE_ID" "$ADMIN_TOKEN")
echo "TC-RBAC-020 remove-user-role-again: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(req GET /permissions "$ADMIN_TOKEN")
echo "TC-RBAC-021 list-permissions: http=$(code "$R") total=$(body "$R" | jget data.meta.total)"

R=$(req PATCH "/users/$ADMIN_USER_ID/status" "$ADMIN_TOKEN" true '{"status":"INACTIVE"}')
echo "TC-RBAC-018a self-status-change: http=$(code "$R") code=$(body "$R" | jget error.code)"

R=$(req PATCH "/users/$MEMBER_USER_ID/status" "$ADMIN_TOKEN" true '{"status":"INACTIVE"}')
echo "TC-RBAC-018b admin-disables-member: http=$(code "$R") status=$(body "$R" | jget data.status)"
R=$(req GET /users "$MEMBER_TOKEN")
echo "TC-RBAC-008 disabled-user-blocked: http=$(code "$R") code=$(body "$R" | jget error.code)"
R=$(req PATCH "/users/$MEMBER_USER_ID/status" "$ADMIN_TOKEN" true '{"status":"ACTIVE"}')
echo "TC-RBAC-018c admin-re-enables-member: http=$(code "$R") status=$(body "$R" | jget data.status)"

echo "--- DB cleanup (leave test users, drop custom role) ---"
sql "DELETE FROM role_permissions WHERE role_id='$AUDITOR_ROLE_ID'" > /dev/null
sql "DELETE FROM user_roles WHERE role_id='$AUDITOR_ROLE_ID'" > /dev/null
sql "DELETE FROM roles WHERE id='$AUDITOR_ROLE_ID'" > /dev/null
sql "DELETE FROM audit_logs WHERE actor_id IN ('$ADMIN_USER_ID','$MEMBER_USER_ID')" > /dev/null
echo "cleanup done"
