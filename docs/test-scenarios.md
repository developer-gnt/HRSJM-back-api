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

## Phase 6 — Accounting Foundation: COA + Entries + Ledger (10 APIs)

> **Executed 2026-09-28 (unit + E2E suite `test/e2e-accounting.sh`):** PASS — TC-ACC-001 through TC-ACC-021 (plus a/b variants). Unit test suites: `accounts.service.spec.ts` (16 tests), `accounting-posting.service.spec.ts` (15 tests), `membership-payments.service.spec.ts` (posting integration cases) — 125 unit tests across the project, 100% passing.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-ACC-001 | List baseline chart of accounts | GET `/api/v1/accounts` as admin | 200 with the 7 seeded accounts (1001 Bank, 1002 Cash, 4001–4004 Income, 5001 Other Expenses) |
| TC-ACC-002 | Non-admin denied accounting access | GET `/api/v1/accounts` as authenticated non-admin user | 403 `PERMISSION_DENIED` (accounting is admin-only per access matrix) |
| TC-ACC-003 | Create account | POST `/api/v1/accounts` with name, unique code, type | 201 created with `is_active: true` |
| TC-ACC-004 | Create account validation | POST `/api/v1/accounts` with invalid `account_type` | 400 `VALIDATION_ERROR` |
| TC-ACC-005 | Duplicate account name | POST `/api/v1/accounts` with existing name | 409 `ACCOUNT_NAME_TAKEN` |
| TC-ACC-006 | Duplicate account code | POST `/api/v1/accounts` with existing code | 409 `ACCOUNT_CODE_TAKEN` |
| TC-ACC-007 | Parent must share account type | POST `/api/v1/accounts` with parent of different type | 400 `ACCOUNT_PARENT_TYPE_MISMATCH` |
| TC-ACC-008 | Update account | PATCH `/api/v1/accounts/:id` (description/parent/code/name) | 200 updated; audit recorded |
| TC-ACC-009a | Deactivate account (no active children) | PATCH `/api/v1/accounts/:id/status` → `is_active:false` | 200 `is_active:false`; posting to it rejected thereafter |
| TC-ACC-009b | Reactivate account | PATCH `/api/v1/accounts/:id/status` → `is_active:true` | 200 `is_active:true` |
| TC-ACC-010 | `account_type` immutable | PATCH `/api/v1/accounts/:id` with `account_type` | 400 `VALIDATION_ERROR` (field not accepted after creation) |
| TC-ACC-011 | Payment verify posts accounting entry | Verify a verified membership payment (Phase 5 flow) | 201; receipt carries `accounting_entry_id`; entry posted Dr Bank/Cash, Cr Membership Income |
| TC-ACC-012 | Entry detail balanced lines | GET `/api/v1/accounting/entries/:id` | 200 with 2 lines, Dr 1200 (account 1001) = Cr 1200 (account 4001) |
| TC-ACC-013 | Entries filterable by reference | GET `/api/v1/accounting/entries?reference_type=MEMBERSHIP_PAYMENT&reference_id=<paymentId>` | 200 with exactly the payment's entry |
| TC-ACC-014 | Posting idempotency (duplicate verify safe) | Re-verify the same payment, re-query entries by reference | 200; still exactly ONE journal entry for the reference (no double posting) |
| TC-ACC-015 | Per-account ledger running balance | GET `/api/v1/accounts/:id/ledger?from_date=...&to_date=...` for Bank | 200 with rows ordered by date, running balance and closing balance correct |
| TC-ACC-016a | Global ledger requires date range | GET `/api/v1/accounting/ledger` without from/to | 400 `VALIDATION_ERROR` (BRD §24: dates required) |
| TC-ACC-016b | Global ledger derives from entry lines | GET `/api/v1/accounting/ledger?from_date=...&to_date=...` | 200 with per-account running balances; `total_debit = total_credit` |
| TC-ACC-017 | Reverse posted entry | POST `/api/v1/accounting/entries/:id/reverse` | 201 mirrored `REVERSAL` entry with swapped Dr/Cr sides |
| TC-ACC-017b | Original shows its reversal | GET `/api/v1/accounting/entries/:id` (original) after reversal | 200 with `reversed_by.entry_number` pointing at the reversal entry |
| TC-ACC-018 | Double reversal rejected | POST `/api/v1/accounting/entries/:id/reverse` on already-reversed entry | 409 `ACCOUNTING_ENTRY_ALREADY_REVERSED` |
| TC-ACC-019 | Reversal of reversal rejected | POST reverse on the REVERSAL entry | 400 `ACCOUNTING_REVERSAL_OF_REVERSAL` |
| TC-ACC-020 | Ledger nets to zero after reversal | Re-query account ledger after reversal | 200; closing balance reflects journal + mirrored reversal = net zero for that entry |
| TC-ACC-021a | Offline cash payment via status update | PATCH `/api/v1/membership-payments/:id/status` → SUCCESS (admin) | 200 `SUCCESS`; delegates to verify and posts the accounting entry |
| TC-ACC-021 | Offline cash posts Dr Cash | GET entry detail for the offline payment | 200 with Dr line on account **1002 (Cash)** — payment_method→account mapping correct |

**Unit-level financial integrity (rule.md §6.4):** unbalanced-entry rejection (`ACCOUNTING_ENTRY_UNBALANCED`), single-side line validation, negative-amount rejection, inactive-account rejection, unknown-account rejection, duplicate-posting idempotency, reversal mirror correctness, and paise-integer rounding are covered in `accounting-posting.service.spec.ts` (15 tests).

**Sign-off:** Phase 6 marked ✅ in `phases.md`.

---

## Phase 7 — Expense / Payment Entry (5 APIs)

> **Executed 2026-09-28 (unit tests):** PASS — TC-EXP-001 through TC-EXP-009. Unit test suite: `expense-entries.service.spec.ts` (15 tests) — 100% passing.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-EXP-001 | Create Expense Voucher | POST `/api/v1/expense-entries` with date, paid_to, expense_account_id, paid_from_account_id, amount, payment_method | 201 success; voucher `EXP-YYYYMMDD-#####` created, status `POSTED`, balanced journal entry posted (`Dr Expense / Cr Bank-Cash`) |
| TC-EXP-002 | Reject Non-positive Amount | POST `/api/v1/expense-entries` with `amount <= 0` | 400 `EXPENSE_INVALID_AMOUNT` |
| TC-EXP-003 | Reject Inactive/Non-Expense Account | POST `/api/v1/expense-entries` with non-EXPENSE or inactive account | 400 `INVALID_EXPENSE_ACCOUNT_TYPE` / `EXPENSE_ACCOUNT_INACTIVE` |
| TC-EXP-004 | Reject Inactive/Non-Asset Payment Account | POST `/api/v1/expense-entries` with non-ASSET paid_from account | 400 `INVALID_PAID_FROM_ACCOUNT_TYPE` / `PAID_FROM_ACCOUNT_INACTIVE` |
| TC-EXP-005 | List Expense Entries (Admin) | GET `/api/v1/expense-entries` with `expense.read` | 200 with paginated expense list, filterable by date, accounts, status, search |
| TC-EXP-006 | View Expense Entry Detail | GET `/api/v1/expense-entries/:id` | 200 with accounts and full accounting entry lines |
| TC-EXP-007 | Update Expense Metadata | PATCH `/api/v1/expense-entries/:id` with updated paid_to / description / reference | 200 with updated fields; audit log recorded |
| TC-EXP-008 | Cancel Expense Voucher & Reverse Journal | PATCH `/api/v1/expense-entries/:id/status` -> CANCELLED | 200 status becomes `CANCELLED`; mirrored reversal journal posted via `AccountingPostingService.reverse` |
| TC-EXP-009 | Reject Update/Reactivate Cancelled Expense | PATCH on already `CANCELLED` expense | 400 `EXPENSE_ENTRY_ALREADY_CANCELLED` / `EXPENSE_ENTRY_CANNOT_REACTIVATE` |

---

## Phase 8 — Receipt / Payment Accounting Integration (5 APIs)

> **Executed 2026-09-28 (unit + E2E suite `test/e2e-receipt-entries.sh`):** PASS — TC-REC-001 through TC-REC-011 (plus a/b/c variants). Unit test suite: `receipt-entries.service.spec.ts` (15 tests) — 100% passing.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-REC-001 | Create Receipt Voucher | POST `/api/v1/receipt-entries` with date, received_from, income_account_id, received_in_account_id, amount, payment_method | 201 success; voucher `REC-YYYYMMDD-#####` created, status `POSTED`, balanced journal entry posted (`Dr Bank-Cash / Cr Income Account`) |
| TC-REC-002 | Reject Non-positive Amount | POST `/api/v1/receipt-entries` with `amount <= 0` | 400 `RECEIPT_INVALID_AMOUNT` |
| TC-REC-003 | Reject Inactive/Non-Income Account | POST `/api/v1/receipt-entries` with non-INCOME or inactive account | 400 `INVALID_INCOME_ACCOUNT_TYPE` / `INCOME_ACCOUNT_INACTIVE` |
| TC-REC-004 | Reject Inactive/Non-Asset Payment Account | POST `/api/v1/receipt-entries` with non-ASSET received_in account | 400 `INVALID_RECEIVED_IN_ACCOUNT_TYPE` / `RECEIVED_IN_ACCOUNT_INACTIVE` |
| TC-REC-005 | List Receipt Entries (Admin) | GET `/api/v1/receipt-entries` with `receipt_entry.read` | 200 with paginated receipt list, filterable by date, accounts, status, search |
| TC-REC-006 | View Receipt Entry Detail | GET `/api/v1/receipt-entries/:id` | 200 with accounts and full accounting entry lines |
| TC-REC-007 | Update Receipt Metadata | PATCH `/api/v1/receipt-entries/:id` with updated received_from / description / reference | 200 with updated fields; audit log recorded |
| TC-REC-008 | Cancel Receipt Voucher & Reverse Journal | PATCH `/api/v1/receipt-entries/:id/status` -> CANCELLED | 200 status becomes `CANCELLED`; mirrored reversal journal posted via `AccountingPostingService.reverse` |
| TC-REC-009 | Reject Update/Reactivate Cancelled Receipt | PATCH on already `CANCELLED` receipt | 400 `RECEIPT_ENTRY_ALREADY_CANCELLED` / `RECEIPT_ENTRY_CANNOT_REACTIVATE` |
| TC-REC-009b | Reversal entry exists by reference | GET `/api/v1/accounting/entries?reference_type=MANUAL_RECEIPT&reference_id=<voucherId>` | 200 with exactly 2 entries — the journal and its mirrored reversal |
| TC-REC-009c | Re-cancel is idempotent | PATCH status → `CANCELLED` again | 200, still `CANCELLED`; no duplicate reversal posted |
| TC-REC-010 | Bank ledger nets to zero after cancellation | GET `/api/v1/accounts/:id/ledger` for Bank after cancel | 200; closing balance reflects journal + mirrored reversal = net zero |
| TC-REC-011 | CASH receipt posts Dr Cash | Create receipt with `payment_method: CASH`, view entry detail | 200 with Dr line on account **1002 (Cash)** |

---

## Phase 9 — Donation Financial / Payment Integration (7 APIs)

> **Executed 2026-09-28 (unit + E2E suite `test/e2e-donations.sh`):** PASS — TC-DON-001 through TC-DON-012 (plus b/a variants). Unit test suites: `donation-payments.service.spec.ts` (13 tests), `donations.service.spec.ts` (5 tests) — 179 unit tests across the project, 100% passing.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-DON-001 | Create donation payment | POST `/api/v1/donation-payments` with donation_id (amount omitted) | 201 PENDING; amount defaults to the donation's recorded amount (server-validated) |
| TC-DON-002 | Payment for unknown donation | POST with random UUID | 404 `DONATION_NOT_FOUND` |
| TC-DON-003 | Verify posts accounting entry | POST `/api/v1/donation-payments/:id/verify` with gateway_payment_id | 201; payment `SUCCESS`; receipt generated (`HRSJM-REC-...`, type `DONATION`) with `accounting_entry_id` |
| TC-DON-003b | Donation reflects financial status | Query the donation row after verify | `status = SUCCESS` (donation history reflects financial status) |
| TC-DON-004 | Entry detail balanced lines | GET `/api/v1/accounting/entries/:id` | 200 with 2 lines: Dr Bank (1001) = Cr Donation Income (4003), reference `DONATION_PAYMENT` |
| TC-DON-005 | Posting idempotency | Re-verify the same payment, re-query entries by reference | 200; still exactly ONE journal entry per payment (no double posting) |
| TC-DON-006 | Receipt endpoint | GET `/api/v1/donation-payments/:id/receipt` | 200 with receipt number, `receipt_type: DONATION`, linked accounting entry |
| TC-DON-007 | Non-admin refund denied | POST `/api/v1/donations/:id/refund` as non-admin | 403 `PERMISSION_DENIED` |
| TC-DON-008 | Full refund with reversal | POST `/api/v1/donations/:id/refund` as admin with reason | 201; donation + payment → `REFUNDED`; mirrored REVERSAL entry posted (`Dr Donation Income / Cr Bank`) |
| TC-DON-009 | Double refund rejected | POST refund on already-refunded donation | 409 `DONATION_ALREADY_REFUNDED` |
| TC-DON-010 | Ledger reflects refund | GET `/api/v1/accounts/:id/ledger` for Bank after refund | 200; journal + mirrored reversal net to zero |
| TC-DON-011a | Offline cash donation via status update | PATCH `/api/v1/donation-payments/:id/status` → SUCCESS (admin) | 200 `SUCCESS`; delegates to verify and posts the accounting entry |
| TC-DON-011 | Offline cash posts Dr Cash | GET entry detail for the offline donation payment | 200 with Dr line on account **1002 (Cash)** |
| TC-DON-012 | REFUNDED via status endpoint rejected | PATCH status → REFUNDED | 400 `DONATION_REFUND_REQUIRES_ENDPOINT` (refunds must reverse accounting) |

**Unit-level financial integrity (rule.md §6.4):** unbalanced-entry rejection (posting service), single-side/negative line validation, duplicate-verify idempotency, posting-failure rollback, REFUNDED-via-status guard, double-refund rejection, refund-of-unpaid donation rejection, and missing-journal data-consistency guard are covered in `donation-payments.service.spec.ts` and `donations.service.spec.ts`.

**Scaffold note:** the `donations` table is a minimal scaffold (Arshad owns donations CRUD per the ownership split); e2e seeds donations via SQL. Refund policy implemented: full refund via mirrored reversal only — partial refunds remain TBC (BRD §54 #21).

**Sign-off:** Phase 9 marked ✅ in `phases.md`.

---

## Phase 10 — Trial Balance (2 APIs)

> **Executed 2026-09-28 (unit + E2E suite `test/e2e-trial-balance.sh` + date-filter verification `test/verify-date-filters.sh` + cross-check `test/cross-check-reports.js`):** PASS — TC-TB-001 through TC-TB-006. Unit test suite: `trial-balance.service.spec.ts` — passing.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-TB-001 | Non-admin denied | GET `/api/v1/reports/trial-balance` as authenticated non-admin | 403 `PERMISSION_DENIED` (reports are admin-only) |
| TC-TB-002 | Trial balance balances | GET `/api/v1/reports/trial-balance` | 200 with per-account gross debit/credit, net debit/credit balances; `is_balanced=true`, `difference=0` |
| TC-TB-003 | Summary by account type | GET `/api/v1/reports/trial-balance/summary` | 200 with per-type totals, net balances, account counts |
| TC-TB-004 | As-of-date filter | GET with `as_of_date` | 200; report derived strictly from entries dated ≤ as-of date |
| TC-TB-005 | Account-type filter | GET with `account_type=EXPENSE` | 200 with only matching accounts |
| TC-TB-006 | As-of-date excludes future entries | Post a 2027-dated expense voucher, GET TB `as_of_date=2026-09-28` vs `2027-12-31` | Future voucher absent at 2026 as-of, present at 2027 as-of (per-account gross figures — TB totals never move for a single balanced entry, so totals alone cannot detect this) |
| TC-TB-007 | Hand-computed reconciliation | Compare API per-account balances with sums computed directly from `accounting_entry_lines` | Identical for every account; total debit = total credit |

**Date-filter bug found & fixed 2026-09-28:** the as-of condition originally sat inside the entry LEFT JOIN's ON clause and never filtered rows; fixed to a WHERE row filter in all three report services (TB, P&L, Balance Sheet).

---

## Phase 11 — Profit & Loss (2 APIs)

> **Executed 2026-09-28 (unit + E2E suite `test/e2e-profit-loss.sh` + date-filter verification + cross-check):** PASS — TC-PL-001 through TC-PL-007. Unit test suite: `profit-loss.service.spec.ts` — passing.

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-PL-001 | Non-admin denied | GET `/api/v1/reports/profit-loss` as authenticated non-admin | 403 `PERMISSION_DENIED` |
| TC-PL-002 | P&L report for period | GET with `from_date`/`to_date` | 200 with INCOME and EXPENSE account breakdowns, totals, net result, SURPLUS/DEFICIT |
| TC-PL-003 | P&L summary | GET `/api/v1/reports/profit-loss/summary` | 200 with totals + net result + account counts |
| TC-PL-004 | Invalid date range | GET with `from_date > to_date` | 400 `INVALID_DATE_RANGE` |
| TC-PL-005 | Missing date params | GET without `from_date`/`to_date` | 400 `VALIDATION_ERROR` |
| TC-PL-006 | Period filter excludes future entries | Post a 2027-dated voucher, GET P&L for 2026 period vs through 2027 | Excluded from the 2026 period; included when the range covers 2027 (P&L through 2027 = 2331 = exactly three 777 vouchers) |
| TC-PL-007 | Hand-computed reconciliation | Compare API totals with sums computed directly from entry lines for the period | Identical income/expenses/net (2026-01-01..2026-09-28: income 5500, expenses 0 in-period, SURPLUS) |

**Date-filter bug found & fixed 2026-09-28:** same LEFT JOIN ON-clause pattern as Phase 10; additionally the date condition must use `.andWhere` after the account-type `.where` — a later `.where()` call replaces the entire WHERE clause.

---
## Phase 12 — Balance Sheet (2 APIs)

> **Executed 2026-09-28 (unit + E2E suite `test/e2e-balance-sheet.sh` + cross-check `test/cross-check-reports.js`):** PASS — TC-BS-001 through TC-BS-007. Unit test suite: `balance-sheet.service.spec.ts` — passing (carries the Phase 10/11 date-filter fix).

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-BS-001 | Non-admin denied | GET `/api/v1/reports/balance-sheet` as authenticated non-admin | 403 `PERMISSION_DENIED` |
| TC-BS-002 | Balance sheet report | GET `/api/v1/reports/balance-sheet` | 200 with ASSET/LIABILITY/FUND_EQUITY breakdowns; `Assets = Liabilities + Equity`, `is_balanced=true`, `difference=0` |
| TC-BS-003 | Balance sheet summary | GET `/api/v1/reports/balance-sheet/summary` | 200 with totals and equation check |
| TC-BS-004 | Zero-balance handling | GET with `include_zero_balances=true` | 200; zero-activity accounts included when requested |
| TC-BS-005 | Hand-computed reconciliation | Compare assets/liabilities/equity/surplus against sums computed directly from `accounting_entry_lines` | Identical (assets 3169 = liabilities 0 + equity 3169); negative asset balance (bank overdraft from test activity) handled correctly |
| TC-BS-006 | Surplus ties to P&L | Compare `equity.current_surplus_deficit` with the cumulative P&L net result over the same span | Identical (3169 = 3169); a sub-period P&L legitimately differs (2026-only P&L = 5500 excludes 2027-dated vouchers) |
| TC-BS-007 | As-of-date filter shifts totals | GET `as_of_date=2026-09-28` vs `2030-01-01` | Totals differ (future-dated vouchers move assets 5500 → 3169) and BOTH dates balance — entry-level date filtering keeps the equation intact |

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






