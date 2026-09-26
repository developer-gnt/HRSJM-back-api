# HRSJM Backend — Manual Test Scenarios

**Rule (rule.md §6):** every completed module must have (1) its unit test cases added and (2) this manual scenario checklist written and executed. A phase is marked complete in `phases.md` only after its checklist passes.

- **Base URL:** `http://localhost:3000/api/v1` — Swagger UI at `/docs` (Postman optional)
- **Start:** `npm run start:dev` with `.env` containing `DATABASE_*` and `JWT_SECRET`
- **Record:** mark each ID ✅ / ❌ with notes; every ❌ needs a bug entry before handoff

Every response must use the standard envelopes:

- Success: `{ success, message, data }`
- Error: `{ success, message, error: { code, details } }` with the correct HTTP status

---

## Phase 0 — Platform smoke tests

| ID | Steps | Expected |
|---|---|---|
| TC-BOOT-001 | GET `/api/v1/health` | 200, success envelope, `status: ok` |
| TC-BOOT-002 | Open `/docs` | Swagger UI renders; registered endpoints visible |
| TC-BOOT-003 | GET `/api/v1/does-not-exist` | 404 with standard error envelope + error code (no raw stack) |
| TC-BOOT-004 | POST `/api/v1/auth/login` with an unknown extra property | 400 `VALIDATION_ERROR`; details names the unknown field |
| TC-BOOT-005 | `npm run migration:run` twice | First run applies the migration; second run is a no-op |

> **Executed 2026-09-26:** TC-BOOT-001/002/003 ✅ (Phase 0 verification), TC-BOOT-004 ✅ (exercised via `POST /auth/register` with an unknown property once the auth module existed), TC-BOOT-005 ✅ (`Init` + `CreateAuthSchema` applied; `migration:show` lists both; re-run is a no-op). **All pass.**

---

## Phase 1 — Authentication & User Account (8 APIs)

> Forgot/reset delivery mechanism (email link vs OTP) is **TBC** per BRD — scenarios are written mechanism-agnostic.

> **Executed 2026-09-26 (unit + E2E):** PASS — TC-AUTH-001–008, 009 (DB check: only bcrypt `password_hash` stored), 010–017, 019, 020, 021, 022, 023, 024, 025 (+refresh-after-logout), 027, 028, 029, 030, 031 (+all refresh tokens revoked), 033, 034, 035 (login and refresh blocked when disabled), 036 (audit events verified in `audit_logs`). TC-FLOW-001/002/003 ✅. Unit suite `auth.service.spec.ts`: 10/10 passed (covers TC-AUTH-003/004/012/013/014/025/026/028/030/032).
> **Deferred with reason:** TC-AUTH-018 (expired access token — needs a short-TTL test setup; expiry handling verified via guard logic + unit-level), TC-AUTH-026 and TC-AUTH-032 (covered by unit tests).

### 1. Registration — POST /auth/register

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-AUTH-001 | Valid registration (no email) | POST with full_name, mobile_number, password, confirm_password | 2xx success; user persisted; initial role assigned (Member); tokens issued or login required (per design) |
| TC-AUTH-002 | Valid registration with email | Same + optional email | 2xx; email stored |
| TC-AUTH-003 | Duplicate mobile | Register again with the same mobile_number | 4xx error (e.g., MOBILE_NUMBER_TAKEN); no second user row |
| TC-AUTH-004 | Duplicate email | Register with an already-used email | 4xx error (e.g., EMAIL_TAKEN) |
| TC-AUTH-005 | Missing required fields | Omit full_name / mobile_number / password / confirm_password one at a time | 400 `VALIDATION_ERROR`; details names each missing field |
| TC-AUTH-006 | Password mismatch | confirm_password ≠ password | 400 `VALIDATION_ERROR` |
| TC-AUTH-007 | Weak password | e.g., `123` | 400 `VALIDATION_ERROR` (minimum-length rule) |
| TC-AUTH-008 | Invalid email format | email: `not-an-email` | 400 `VALIDATION_ERROR` |
| TC-AUTH-009 | No plain-text password | Inspect the `users` row in the DB | Only `password_hash` present; raw password appears in no table, log, or token payload |

### 2. Login — POST /auth/login

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-AUTH-010 | Login via mobile | Correct mobile + password | 200; access + refresh tokens; payload contains no password hash |
| TC-AUTH-011 | Login via email | Correct email + password | 200; same as above |
| TC-AUTH-012 | Wrong password | Valid user, wrong password | 401 `INVALID_CREDENTIALS` |
| TC-AUTH-013 | Unknown user | Non-existent mobile/email + any password | 401 with the **same generic message** as TC-AUTH-012 (no user enumeration) |
| TC-AUTH-014 | Disabled account | Deactivate the user, then login with the correct password | 403 `ACCOUNT_DISABLED` |
| TC-AUTH-015 | Missing fields | Omit identifier or password | 400 `VALIDATION_ERROR` |

### 3. Current user — GET /auth/me

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-AUTH-016 | Valid token | GET with `Authorization: Bearer <access token>` | 200; own profile only; no password fields |
| TC-AUTH-017 | No token | GET without the header | 401 `UNAUTHORIZED` |
| TC-AUTH-018 | Expired token | Wait out expiry (use a short TTL in dev) | 401 (token expired) |
| TC-AUTH-019 | Tampered token | Change one character of the token | 401 (invalid signature) |

### 4. Update profile — PATCH /auth/me

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-AUTH-020 | Valid update | PATCH `{ "email": "..." }` (or full_name) | 200; value updated; `updated_at` / `updated_by` audit fields change |
| TC-AUTH-021 | Privileged fields from client | PATCH `{ "role": "ADMIN", "status": "ACTIVE" }` | Fields ignored or 400 — role/status are never client-controlled |
| TC-AUTH-022 | Invalid values | PATCH `{ "email": "bad" }` | 400 `VALIDATION_ERROR` |

### 5. Token lifecycle — POST /auth/refresh, POST /auth/logout

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-AUTH-023 | Valid refresh | POST with a valid refresh token | 200; new access token (and rotated refresh token if rotation is enabled) |
| TC-AUTH-024 | Expired refresh token | Use an old/expired refresh token | 401 |
| TC-AUTH-025 | Revoked refresh token | Logout, then refresh with the same token | 401 (revoked) |
| TC-AUTH-026 | Re-use after rotation | Re-use the pre-rotation refresh token | 401 (session invalidated) — applies only if rotation is enabled |
| TC-AUTH-027 | Logout | POST /auth/logout with a valid session | 200; refresh token revoked; subsequent /auth/refresh fails |
| TC-AUTH-028 | Double logout | Logout again with the same token | Graceful 200/no-op or 401 — never a 500 |

### 6. Password recovery — POST /auth/forgot-password, POST /auth/reset-password

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-AUTH-029 | Forgot — existing account | POST forgot-password with a registered mobile/email | 200 generic success; recovery token/OTP issued (channel per TBC mechanism) |
| TC-AUTH-030 | Forgot — unknown account | POST forgot-password with an unregistered identifier | Same generic success (no user enumeration) |
| TC-AUTH-031 | Reset — valid token | POST reset-password `{ token, password, confirm_password }` | 200; new hash stored; all existing refresh tokens/sessions of the user revoked |
| TC-AUTH-032 | Reset — invalid/expired/used token | Replay the same reset token twice; or use a wrong token | 400/401; password unchanged |
| TC-AUTH-033 | Reset — confirm mismatch | confirm_password ≠ password | 400 `VALIDATION_ERROR` |
| TC-AUTH-034 | After reset | Login with the NEW password; then with the OLD password | New works; old fails with 401 |

### 7. Account status & audit

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-AUTH-035 | Status gate on protected ops | Disable the user; call /auth/me and /auth/refresh | Both rejected (account status checked before protected operations) |
| TC-AUTH-036 | Auth audit trail | Perform register, login, failed login, logout, reset; inspect audit records/logs | Events recorded with actor + timestamp; no raw passwords or token values in logs |

### 8. End-to-end flows

| ID | Flow | Expected |
|---|---|---|
| TC-FLOW-001 | register → login → /me → PATCH /me → refresh → logout → refresh | Full lifecycle succeeds until logout; post-logout refresh is rejected |
| TC-FLOW-002 | register → forgot-password → reset-password → login | New password works; old password rejected |
| TC-FLOW-003 | Security regression sweep | Expired / tampered / revoked tokens and disabled accounts are all rejected with standard envelopes |

---

## Phase 2 — Users / Roles / Permissions (15 APIs)

> **Executed 2026-09-26 (unit + E2E suite `test/e2e-rbac.sh`):** PASS — TC-RBAC-001 through TC-RBAC-021. Unit test suites: `permissions.guard.spec.ts` (7 tests), `roles.service.spec.ts` (11 tests), `users-admin.service.spec.ts` (7 tests) — 100% passing.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-RBAC-001 | List users | GET `/api/v1/users` with `user.read` | 200, success envelope, paginated user list with `total`/`totalPages` metadata |
| TC-RBAC-002 | View single user | GET `/api/v1/users/:id` | 200 with user profile (no password fields) |
| TC-RBAC-003 | Member denied admin API | GET `/api/v1/users` with Member token | 403 `INSUFFICIENT_PERMISSIONS`, details specifies missing `user.read` |
| TC-RBAC-004 | No token | GET `/api/v1/users` without auth header | 401 `UNAUTHORIZED` |
| TC-RBAC-005 | Create custom role | POST `/api/v1/roles` with unique name | 201 success; custom role created with `is_protected: false` |
| TC-RBAC-006 | Update custom role | PATCH `/api/v1/roles/:id` | 200 with updated role name/description |
| TC-RBAC-007 | Assign permissions to role | POST `/api/v1/roles/:id/permissions` with valid permission IDs | 200 with assigned permissions list |
| TC-RBAC-008 | Disabled user blocked | Deactivate user; attempt authenticated call | 403 `ACCOUNT_DISABLED` |
| TC-RBAC-009 | View single role | GET `/api/v1/roles/:id` | 200 with role details and attached permissions |
| TC-RBAC-010 | Duplicate role name | POST `/api/v1/roles` with existing role name | 409 `ROLE_NAME_TAKEN` |
| TC-RBAC-011 | Rename baseline role | PATCH `/api/v1/roles/:adminId` | 403 `BASELINE_ROLE_IMMUTABLE` (ADMIN, MEMBER, DONOR, SEEKER protected) |
| TC-RBAC-012 | Delete baseline role | DELETE `/api/v1/roles/:adminId` | 403 `BASELINE_ROLE_IMMUTABLE` |
| TC-RBAC-013 | Delete custom role in use | DELETE `/api/v1/roles/:id` while assigned to users | 400 `ROLE_IN_USE` |
| TC-RBAC-014 | Assign unknown permission | POST `/api/v1/roles/:id/permissions` with non-existent UUID | 404 `PERMISSION_NOT_FOUND` |
| TC-RBAC-015 | Assign role to user | POST `/api/v1/users/:id/roles` | 201 with updated roles list for user |
| TC-RBAC-016 | Idempotent role assign | POST `/api/v1/users/:id/roles` duplicate | 200/201 without duplicate assignments |
| TC-RBAC-017 | Dynamic permission grant | Assign role to member; call endpoint matching granted permission | 200 success (permissions resolved live from DB) |
| TC-RBAC-018 | Role without permission denied | Call endpoint requiring unheld permission | 403 `INSUFFICIENT_PERMISSIONS` |
| TC-RBAC-018a| Self-status deactivation blocked | PATCH `/api/v1/users/:adminId/status` by self | 403 `SELF_STATUS_CHANGE_FORBIDDEN` |
| TC-RBAC-018b| Admin disables member | PATCH `/api/v1/users/:memberId/status` -> INACTIVE | 200 with `status: INACTIVE` |
| TC-RBAC-018c| Admin re-enables member | PATCH `/api/v1/users/:memberId/status` -> ACTIVE | 200 with `status: ACTIVE` |
| TC-RBAC-019 | Remove user role | DELETE `/api/v1/users/:id/roles/:roleId` | 200 with updated roles list |
| TC-RBAC-020 | Remove unassigned role | DELETE `/api/v1/users/:id/roles/:roleId` again | 404 `USER_ROLE_NOT_FOUND` |
| TC-RBAC-021 | List permissions catalog | GET `/api/v1/permissions` | 200 with all available permissions in `module.action` format |

---

## Phase 3 — Membership Categories (5 APIs)

> **Executed 2026-09-26 (unit + E2E suite `test/e2e-membership-categories.sh`):** PASS — TC-CAT-001 through TC-CAT-012. Unit test suite: `membership-categories.service.spec.ts` (9 tests) — 100% passing.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-CAT-001 | Create membership category | POST `/api/v1/membership-categories` with `membership_category.create` (admin) | 201 success; category created with fee, validity_days, and active status |
| TC-CAT-002 | Member create denied | POST `/api/v1/membership-categories` with Member token | 403 `INSUFFICIENT_PERMISSIONS` (requires `membership_category.create`) |
| TC-CAT-003 | Duplicate category name | POST `/api/v1/membership-categories` with duplicate name | 409 `CATEGORY_NAME_TAKEN` |
| TC-CAT-004 | Duplicate category code | POST `/api/v1/membership-categories` with duplicate code | 409 `CATEGORY_CODE_TAKEN` |
| TC-CAT-005 | Validation error | POST `/api/v1/membership-categories` with negative fee / blank name | 400 `VALIDATION_ERROR` |
| TC-CAT-006 | List categories | GET `/api/v1/membership-categories` | 200, success envelope, paginated list with metadata |
| TC-CAT-007 | View single category | GET `/api/v1/membership-categories/:id` | 200 with category details |
| TC-CAT-008 | Update category details | PATCH `/api/v1/membership-categories/:id` with `membership_category.update` (admin) | 200 with updated fields |
| TC-CAT-009 | Member update denied | PATCH `/api/v1/membership-categories/:id` with Member token | 403 `INSUFFICIENT_PERMISSIONS` |
| TC-CAT-010 | Deactivate category | PATCH `/api/v1/membership-categories/:id/status` -> INACTIVE with `membership_category.manage_status` (admin) | 200 with `status: INACTIVE` |
| TC-CAT-011 | Filter active categories | GET `/api/v1/membership-categories?status=ACTIVE` | 200, returns only ACTIVE categories |
| TC-CAT-012 | Re-activate category | PATCH `/api/v1/membership-categories/:id/status` -> ACTIVE | 200 with `status: ACTIVE` |
| TC-CAT-013 | Non-UUID id rejected | GET `/api/v1/membership-categories/not-a-uuid` | 400 `VALIDATION_ERROR` (not 500) |
| TC-CAT-014 | Fee above column ceiling | POST `/api/v1/membership-categories` with `fee: 99999999999` | 400 `VALIDATION_ERROR` (numeric(12,2) overflow guard) |
| TC-CAT-015 | validity_days above int4 ceiling | POST `/api/v1/membership-categories` with `validity_days: 99999999999` | 400 `VALIDATION_ERROR` (int overflow guard) |

---

## Phase 4 — Membership Management (9 APIs)

> **Executed 2026-09-26 (unit + E2E suite `test/e2e-memberships.sh`):** PASS — TC-MEM-001 through TC-MEM-013. Unit test suite: `memberships.service.spec.ts` (10 tests) — 100% passing.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-MEM-001 | Apply for membership | POST `/api/v1/memberships` with category_id | 201 success; status `PENDING`, applied_at timestamp |
| TC-MEM-002 | View own membership | GET `/api/v1/users/me/membership` | 200 with current user membership and category details |
| TC-MEM-003 | View membership by ID | GET `/api/v1/memberships/:id` as owner | 200 with membership profile (no user password hash) |
| TC-MEM-004 | Unauthorized view denied | GET `/api/v1/memberships/:id` as different member | 403 `MEMBERSHIP_ACCESS_DENIED` |
| TC-MEM-005 | Update pending application | PATCH `/api/v1/memberships/:id` as owner | 200 with updated application data |
| TC-MEM-006 | List memberships (admin) | GET `/api/v1/memberships` with `membership.read` | 200, success envelope, filterable by status/user/category |
| TC-MEM-007 | Member list denied | GET `/api/v1/memberships` as normal member | 403 `INSUFFICIENT_PERMISSIONS` |
| TC-MEM-008 | Admin approve application | PATCH `/api/v1/memberships/:id/status` -> APPROVED | 200, sets `membership_number`, `approval_date`, `start_date`, `expiry_date` |
| TC-MEM-009 | Immutable post-approval | PATCH `/api/v1/memberships/:id` after approval | 400 `APPLICATION_NOT_PENDING` |
| TC-MEM-010 | View documents | GET `/api/v1/memberships/:id/documents` | 200 with documents array |
| TC-MEM-011 | View payment history | GET `/api/v1/memberships/:id/payment-history` | 200 with payment history array |
| TC-MEM-012 | View renewal history | GET `/api/v1/memberships/:id/renewal-history` | 200 with renewal history array |
| TC-MEM-013 | Inactive category blocked | POST `/api/v1/memberships` with inactive category | 400 `INACTIVE_CATEGORY_SELECTION_BLOCKED` |

---

## Phase 5 — Membership Payment (6 APIs)

> **Executed 2026-09-26 (unit + E2E suite `test/e2e-membership-payments.sh`):** PASS — TC-PAY-001 through TC-PAY-008. Unit test suite: `membership-payments.service.spec.ts` (10 tests) — 100% passing.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-PAY-001 | Initiate payment | POST `/api/v1/membership-payments/initiate` with membership_id | 201 success; order created with exact category fee, status `PENDING`, returns gateway order details |
| TC-PAY-002 | Unapproved membership payment | POST `/api/v1/membership-payments/initiate` for unapproved application | 400 `MEMBERSHIP_NOT_ELIGIBLE_FOR_PAYMENT` |
| TC-PAY-003 | View own payment history | GET `/api/v1/membership-payments/my` as authenticated user | 200 with paginated payments array for current user |
| TC-PAY-004 | View payment by ID | GET `/api/v1/membership-payments/:id` as payment owner | 200 with payment profile and receipt |
| TC-PAY-005 | Unauthorized payment view denied | GET `/api/v1/membership-payments/:id` as another user | 403 `PAYMENT_ACCESS_DENIED` |
| TC-PAY-006 | Verify payment & issue receipt | POST `/api/v1/membership-payments/verify` with gateway signature | 200 success inside DB transaction; payment becomes `SUCCESS`, receipt generated with `RCP-...`, membership becomes `ACTIVE` |
| TC-PAY-007 | Payment verification idempotency | POST `/api/v1/membership-payments/verify` on already-verified payment | 200 success returning existing receipt; no duplicate receipt or double activation |
| TC-PAY-008 | Admin list all payments | GET `/api/v1/membership-payments` with `payment.read` permission | 200 with paginated payments across all users with filters |
| TC-PAY-009 | Member list all payments denied | GET `/api/v1/membership-payments` without `payment.read` | 403 `INSUFFICIENT_PERMISSIONS` |
| TC-PAY-010 | Admin manual/offline status update | PATCH `/api/v1/membership-payments/:id/status` -> SUCCESS with notes | 200 with updated payment status and auto-generated receipt for offline collection |

---

## Template — every future module adds a section here

Minimum coverage per module (rule.md §6):

1. Happy-path scenario for every endpoint
2. Validation-error case for every endpoint
3. Auth cases (no token / expired / tampered) on every protected endpoint
4. Authorization/ownership: own records vs. other users' records; role gating
5. Business-rule edge cases from that phase's "Key rules" in `phases.md`
6. Financial modules only: balanced-entry enforcement, idempotent verification, reversal correctness
7. Audit assertions (actor + timestamps on create/update)
8. One end-to-end flow covering the module's business lifecycle

**Sign-off:** a phase is marked ✅ in `phases.md` only when every scenario in its section passes.




