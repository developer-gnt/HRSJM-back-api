# HRSJM Backend — Development Phases

**Owner:** Mubasshir (Senior Backend Developer)
**Source:** `HRSJM_Mubasshir_Senior_Backend_BRD.md`
**Scope:** 12 modules / 74 APIs — core backend + financial engine
**Stack:** NestJS + TypeScript · PostgreSQL · TypeORM (migrations, `synchronize: false`) · REST `/api/v1`

---

## Progress Tracker

| Phase | Name | APIs | Status |
|---|---|---:|---|
| 0 | Project Foundation & Setup | — | ✅ Done (verified 2026-09-26) |
| 1 | Authentication & User Account | 8 | ✅ Done (verified 2026-09-26) |
| 2 | Users / Roles / Permissions (RBAC) | 15 | ✅ Done (verified 2026-09-26) |
| 3 | Membership Categories | 5 | ✅ Done (verified 2026-09-26) |
| 4 | Membership Management | 9 | ✅ Done (verified 2026-09-26) |
| 5 | Membership Payment | 6 | ✅ Done (verified 2026-09-26) |
| 6 | Accounting Foundation (COA + Entries + Ledger) | 10 | ✅ Done (verified 2026-09-28) |
| 7 | Expense / Payment Entry | 5 | ✅ Done (verified 2026-09-28) |
| 8 | Receipt / Payment Accounting Integration | 5 | ✅ Done (verified 2026-09-28) |
| 9 | Donation Financial / Payment Integration | 7 | ✅ Done (verified 2026-09-28) |
| 10 | Trial Balance | 2 | ✅ Done (verified 2026-09-28) |
| 11 | Profit & Loss | 2 | ✅ Done (verified 2026-09-28) |
| 12 | Balance Sheet | 2 | ✅ Done (verified 2026-09-28) |
| 13 | Integration, QA & Handoff | — | ⬜ Not started |
| | **TOTAL** | **74** | |

Phases 1 → 5 build the identity + membership pipeline; Phases 6 → 12 build the accounting engine and reports; Phase 13 hardens everything. A phase must be complete (per Definition of Done below) before the next starts, except Phase 0 which only needs to exist once.

---

## Phase 0 — Project Foundation & Setup

**Objective:** A runnable NestJS project with the shared skeleton every later phase plugs into.

**Deliverables**
- [ ] NestJS + TypeScript project initialized, Git flow agreed (`main` / `develop` / `feature/*`)
- [ ] PostgreSQL connection via TypeORM, `synchronize: false`, migrations pipeline configured
- [ ] `.env.example` committed; real secrets never committed (`DATABASE_*`, `JWT_SECRET`, `PAYMENT_GATEWAY_*`, `STORAGE_*`)
- [ ] Base entity with audit fields: `id`, `created_at`, `updated_at`, `created_by`, `updated_by`
- [ ] Common enums: `ACTIVE/INACTIVE`, membership + payment status enums
- [ ] Standard response envelope: `{ success, message, data }` and error shape `{ success, message, error: { code, details } }`
- [ ] Global error filter, DTO validation pipe (single validation approach project-wide), Swagger setup
- [ ] Health check endpoint
- [ ] Module folder convention: `module/{controllers,services,repositories,entities,dto,enums,module.ts}`

**Exit criteria:** App boots, connects to DB, serves `/health`, Swagger reachable, a sample migration runs.

---

## Phase 1 — Authentication & User Account (8 APIs)

**Objective:** Secure registration, login, token lifecycle, and profile self-service.

**Tables:** `users`, `refresh_tokens / sessions`

**APIs**
```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
GET    /api/v1/auth/me
PATCH  /api/v1/auth/me
```

**Key rules**
- Passwords hashed, never stored or logged in plain text
- Access + refresh token strategy; logout revokes the session/refresh token
- Registration assigns an initial role (integration point with Phase 2 — seed baseline roles early)
- Account status checked before protected operations

**Exit criteria:** Full auth flow works end-to-end; invalid credentials, expired/revoked tokens, and disabled accounts are rejected; auth events audited.

---

## Phase 2 — Users / Roles / Permissions (15 APIs)

**Objective:** Central RBAC: `User → Role → Permissions → Authorization Guard → Protected API`.

**Tables:** `roles`, `permissions`, `role_permissions`, `user_roles`

**APIs**
```text
GET    /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
PATCH  /api/v1/users/:id/status
GET    /api/v1/roles
POST   /api/v1/roles
GET    /api/v1/roles/:id
PATCH  /api/v1/roles/:id
DELETE /api/v1/roles/:id
GET    /api/v1/permissions
POST   /api/v1/roles/:id/permissions
DELETE /api/v1/roles/:id/permissions/:permissionId
GET    /api/v1/users/:id/roles
POST   /api/v1/users/:id/roles
DELETE /api/v1/users/:id/roles/:roleId
```

**Key rules**
- Baseline roles seeded: Member, Donor, Donation Seeker, HRSJM Admin
- Permission-based guards on every protected endpoint from here on (this phase produces the guard all later phases consume)
- Role info is never trusted from client payloads

**Exit criteria:** Admin can manage users/roles/permissions; a non-admin is blocked from admin endpoints; guard is reusable and documented.

> **Verified 2026-09-26:** 15 APIs verified with full RBAC guard integration (`PermissionsGuard` resolving from DB, `JwtAuthGuard`), role protection checks, self-status guard, custom role lifecycle, and 100% unit tests (35 tests total across 4 suites) + E2E suite (`test/e2e-rbac.sh`). All scenarios in `docs/test-scenarios.md` passed.

---

## Phase 3 — Membership Categories (5 APIs)

**Objective:** Admin-managed catalog of membership categories (name, description, fee, validity/period, status).

**Tables:** `membership_categories`

**APIs**
```text
GET    /api/v1/membership-categories
POST   /api/v1/membership-categories
GET    /api/v1/membership-categories/:id
PATCH  /api/v1/membership-categories/:id
PATCH  /api/v1/membership-categories/:id/status
```

**Key rules**
- Deactivated categories are not selectable for new applications
- Fee changes must not alter historical payment records (fees snapshotted at application/payment time)

**Exit criteria:** Admin CRUD works; inactive categories blocked from selection; audit fields populated.

> **Verified 2026-09-26:** 5 APIs verified with RBAC permissions (`membership_category.read`, `membership_category.create`, `membership_category.update`, `membership_category.manage_status`), unique constraint validation, audit logging on create/update/status-change, unit tests (9/9 passed), and E2E suite (`test/e2e-membership-categories.sh` passed TC-CAT-001–012).

---

## Phase 4 — Membership Management (9 APIs)

**Objective:** Membership application lifecycle: apply → admin review → approve/reject → active.

**Tables:** `memberships`

**APIs**
```text
POST   /api/v1/memberships
GET    /api/v1/memberships
GET    /api/v1/memberships/:id
PATCH  /api/v1/memberships/:id
PATCH  /api/v1/memberships/:id/status
GET    /api/v1/users/me/membership
GET    /api/v1/memberships/:id/documents
GET    /api/v1/memberships/:id/payment-history
GET    /api/v1/memberships/:id/renewal-history
```

**Key rules**
- Application belongs to the authenticated user; ownership enforced
- Status transitions (approve/reject/activate) are backend-authoritative only
- Start/expiry dates derived from category validity at approval
- Payment/renewal/documents history endpoints expose Phase 5+ data — stub or wire as those phases land

**Exit criteria:** Apply → review → approve → active flow works with correct status transitions; members see only their own membership; admins see all with filtering.

> **Verified 2026-09-26:** 9 APIs verified with strict ownership gating, admin filtering, lifecycle status transitions (auto-generating membership numbers & deriving validity dates on approval), post-approval immutability, audit logging, unit tests (10/10 passed), and E2E suite (`test/e2e-memberships.sh` passed TC-MEM-001–013).

---

## Phase 5 — Membership Payment (6 APIs)

**Objective:** Record, verify, and monetize membership: payment → gateway → verification → receipt → accounting → activation.

**Tables:** `membership_payments`, `receipts`, `payment_transactions`

**APIs**
```text
POST   /api/v1/membership-payments
GET    /api/v1/membership-payments
GET    /api/v1/membership-payments/:id
PATCH  /api/v1/membership-payments/:id/status
POST   /api/v1/membership-payments/:id/verify
GET    /api/v1/membership-payments/:id/receipt
```

**Key rules**
- **Never trust frontend-only payment success** — backend verifies every gateway result
- Amount validated server-side against the category fee; `NUMERIC(12,2)`, INR
- Successful payment generates receipt and posts the accounting entry (Dr Bank/Cash, Cr Membership Income) — requires Phase 6 accounting service if built in parallel; if not yet available, post on Phase 6 completion
- Payment verification must be idempotent (duplicate callbacks safe)
- DB transaction wraps: payment status update + receipt + accounting entry

**Exit criteria:** Verified payment → receipt → accounting entry → membership activation chain works; failed/duplicate gateway results handled; payment history visible in Phase 4 endpoints.

---

## Phase 6 — Accounting Foundation: COA + Entries + Ledger (10 APIs)

**Objective:** The core double-entry financial engine everything else posts into.

**Tables:** `accounts`, `accounting_entries`, `accounting_entry_lines`

**APIs**
```text
GET    /api/v1/accounts
POST   /api/v1/accounts
GET    /api/v1/accounts/:id
PATCH  /api/v1/accounts/:id
PATCH  /api/v1/accounts/:id/status
GET    /api/v1/accounting/entries
GET    /api/v1/accounting/entries/:id
POST   /api/v1/accounting/entries/:id/reverse
GET    /api/v1/accounts/:id/ledger
GET    /api/v1/accounting/ledger
```

**Key rules — non-negotiable**
- Account types: `ASSET / LIABILITY / INCOME / EXPENSE / FUND_EQUITY`, with parent-account hierarchy and account codes
- **Every posted entry must balance: TOTAL DEBIT = TOTAL CREDIT** — unbalanced entries rejected at the service layer
- Entries carry `reference_type` + `reference_id` linking back to the source (MEMBERSHIP_PAYMENT, RENEWAL_PAYMENT, DONATION_PAYMENT, MANUAL_RECEIPT, MANUAL_EXPENSE)
- Posted entries are immutable — corrections only via controlled reversal
- Ledger derives strictly from posted entry lines (running balance by account/date range)
- Seed the baseline Chart of Accounts as a migration

**Exit criteria:** Posting service (used by Phases 5, 7, 8, 9) validates balanced entries transactionally; reversal produces mirrored entries; ledger output includes running balance; source references retained.

> **Verified 2026-09-28:** 10 APIs verified with Chart of Accounts management, strict double-entry balancing validation (`AccountingPostingService`), running balance ledger, reversal support, audit logging, and 100% unit test coverage (`accounts.service.spec.ts`, `accounting-posting.service.spec.ts`). Phase 5 integration wired: verified payments post `Dr Bank/Cash, Cr Membership Income` inside the verify transaction and set `receipts.accounting_entry_id`. E2E suite (`test/e2e-accounting.sh`) passed TC-ACC-001–021 incl. posting idempotency, double-reversal rejection, and ledger netting to zero after reversal. All scenarios in `docs/test-scenarios.md` passed.

---

## Phase 7 — Expense / Payment Entry (5 APIs)

**Objective:** Manual expense vouchers that post to the ledger.

**Tables:** `expense_entries`

**APIs**
```text
POST   /api/v1/expense-entries
GET    /api/v1/expense-entries
GET    /api/v1/expense-entries/:id
PATCH  /api/v1/expense-entries/:id
PATCH  /api/v1/expense-entries/:id/status
```

**Key rules**
- Required fields: Date, Paid To, Expense Account, Amount, Paid From, Payment Method, Reference, Description, Attachment
- Posting pattern: `Dr Expense Account / Cr Bank-Cash`
- Uses the Phase 6 posting service inside a DB transaction; status changes re-validate accounting state

**Exit criteria:** Expense entry creates a balanced accounting entry; list/detail/filter work; audit trail intact.

> **Verified 2026-09-28:** 5 APIs verified with automatic sequence voucher numbering (`EXP-YYYYMMDD-#####`), transactional double-entry ledger posting (`Dr Expense / Cr Bank-Cash`), cancellation reversal integration, audit logging, and 100% unit test coverage (`expense-entries.service.spec.ts`). E2E suite (`test/e2e-expense-entries.sh`) passed TC-EXP-001–010 incl. account-type validation, permission denial, cancellation with mirrored reversal, idempotent re-cancel, and bank ledger netting to zero. All scenarios in `docs/test-scenarios.md` passed.


---

## Phase 8 — Receipt / Payment Accounting Integration (5 APIs)

**Objective:** Wire receipt entries into the ledger.

**Tables:** `receipt_entries`

**APIs**
```text
POST   /api/v1/receipt-entries
GET    /api/v1/receipt-entries
GET    /api/v1/receipt-entries/:id
PATCH  /api/v1/receipt-entries/:id
PATCH  /api/v1/receipt-entries/:id/status
```

**Key rules**
- Required fields: Date, Received From, Income Account, Amount, Received In, Payment Method, Reference, Description, Attachment
- Posting pattern: `Dr Bank/Cash / Cr Income Account`
- Uses the Phase 6 posting service inside a DB transaction; status changes re-validate accounting state

**Exit criteria:** A created/approved receipt entry produces a balanced ledger entry with a MANUAL_RECEIPT reference; totals reconcile with manual accounting entries.

> **Verified 2026-09-28:** 5 APIs verified with automatic sequence voucher numbering (`REC-YYYYMMDD-#####`), transactional double-entry ledger posting (`Dr Bank-Cash / Cr Income Account`), cancellation reversal integration, audit logging, and 100% unit test coverage (`receipt-entries.service.spec.ts`). E2E suite (`test/e2e-receipt-entries.sh`) passed TC-REC-001–011 incl. account-type validation, permission denial, cancellation with mirrored reversal, idempotent re-cancel, and bank ledger netting to zero. All scenarios in `docs/test-scenarios.md` passed.

---

## Phase 9 — Donation Financial / Payment Integration (7 APIs)

**Objective:** The financial layer of donations. **Arshad owns donation/donor/cause CRUD; Mubasshir owns payments, gateway, verification, receipt, refund, accounting.**

**Tables:** `donation_payments` (+ `donations` from Arshad's side), refund records

**APIs**
```text
POST   /api/v1/donation-payments
GET    /api/v1/donation-payments
GET    /api/v1/donation-payments/:id
POST   /api/v1/donation-payments/:id/verify
PATCH  /api/v1/donation-payments/:id/status
GET    /api/v1/donation-payments/:id/receipt
POST   /api/v1/donations/:id/refund
```

**Key rules**
- Same gateway discipline as Phase 5: backend verification only, idempotent verify, server-validated amounts
- Posting pattern: `Dr Bank/Cash / Cr Donation Income`
- Refund: controlled accounting reversal (mirrored entry), refund policy per HRSJM confirmation
- Coordinate the `donations` ↔ `donation_payments` contract with Arshad before building

**Exit criteria:** Donation payment → verify → receipt → accounting chain works; refund reverses correctly in the ledger; donation history reflects financial status.

> **Verified 2026-09-28:** 7 APIs verified with server-validated amounts (defaults from the donation record), idempotent verification in a single DB transaction (payment + transaction row + receipt + accounting entry `Dr Bank/Cash, Cr Donation Income` via `AccountingPostingService`, donation status SUCCESS, `receipts.accounting_entry_id` linked), full refund via mirrored REVERSAL entry with `donation_refunds` record (double refund → 409 `DONATION_ALREADY_REFUNDED`; REFUNDED via status endpoint → 400 `DONATION_REFUND_REQUIRES_ENDPOINT`). Minimal `donations` scaffold created (Arshad owns CRUD; `donation.read/create/manage` permissions seeded ready). Unit tests: `donation-payments.service.spec.ts` (13), `donations.service.spec.ts` (5) — 179 tests project-wide passing. E2E suite (`test/e2e-donations.sh`) passed TC-DON-001–012 incl. idempotent posting, refund netting the ledger to zero, and offline CASH donation posting Dr 1002. All scenarios in `docs/test-scenarios.md` passed.

---

## Phase 10 — Trial Balance (2 APIs)

**Objective:** Account balances as of a date, proving Debit = Credit.

**APIs**
```text
GET /api/v1/reports/trial-balance
GET /api/v1/reports/trial-balance/summary
```

**Key rules**
- Aggregates `accounting_entry_lines` grouped by account (as-of date filter)
- Report returns per-account debit/credit balances, totals, and difference flag
- Derived strictly from accounting entries — no side calculations

**Exit criteria:** Trial balance balances (total debit = total credit) for seeded test data; imbalance surfaces as a visible difference, never silently.

> **Verified 2026-09-28 (with date-filter fix):** 2 APIs verified. Testing found and fixed a real bug: the as-of-date condition sat inside the entry LEFT JOIN's ON clause, which never filters rows — future-dated entries leaked into as-of reports (proven by a 2027-dated voucher appearing in a 2026 as-of report). Fixed by moving the date condition to a row filter `WHERE (line.id IS NULL OR entry.entry_date <= :asOfDate)` (same fix applied to Balance Sheet). Unit tests: `trial-balance.service.spec.ts` passing (QB mock extended with `andWhere`). E2E `test/e2e-trial-balance.sh` passed TC-TB-001–005; a dedicated date-filter verification (`test/verify-date-filters.sh`) proves future entries are excluded as-of today and included as-of 2027; cross-check (`test/cross-check-reports.js`) reconciles the API report against per-account sums computed directly from `accounting_entry_lines` (9 accounts) — PASS, and the report balances (Dr = Cr = 6931).

---

## Phase 11 — Profit & Loss (2 APIs)

**Objective:** Income − Expenses = Net Result for a period.

**APIs**
```text
GET /api/v1/reports/profit-loss
GET /api/v1/reports/profit-loss/summary
```

**Key rules**
- Income breakdown by INCOME accounts (Membership, Renewal, Donation, Other), expenses by EXPENSE accounts
- From/to date filtering; summary returns totals + net result
- Grouping follows the approved Chart of Accounts

**Exit criteria:** P&L matches hand-computed figures from ledger test data for a given period.

> **Verified 2026-09-28 (with date-filter fix):** 2 APIs verified. Same LEFT JOIN ON-clause date-filter bug as Phase 10 found and fixed here (plus a TypeORM ordering lesson: the date condition must use `.andWhere` AFTER the `.where` account-type filter — a later `.where()` replaces the whole WHERE clause). E2E `test/e2e-profit-loss.sh` passed TC-PL-001–005 (non-admin denied, report, summary, invalid range 400 `INVALID_DATE_RANGE`, missing params 400). Date-filter verification proves future-dated vouchers are excluded from the period and included when the range covers them (P&L through 2027-12-31 = 2331 = three 777 vouchers exactly); cross-check reconciles income/expenses/net for 2026-01-01..2026-09-28 against hand-computed entry-line sums — PASS (income 5500, expenses 0 in-period, SURPLUS).

---

## Phase 12 — Balance Sheet (2 APIs)

**Objective:** Assets = Liabilities + Fund/Equity as of a date.

**APIs**
```text
GET /api/v1/reports/balance-sheet
GET /api/v1/reports/balance-sheet/summary
```

**Key rules**
- ASSET / LIABILITY / FUND_EQUITY account groups with breakdowns
- Current surplus/deficit ties to the P&L net result; opening fund treatment per HRSJM confirmation
- Must satisfy the accounting equation — difference surfaced if not

**Exit criteria:** Balance sheet equation holds on seeded data; cross-checks with Trial Balance and P&L.

---

## Phase 13 — Integration, QA & Handoff

**Objective:** Harden the whole engine and hand off to frontend/Arshad integration.

**Checklist**
- [ ] End-to-end flows tested: register → apply → pay → verify → receipt → accounting → active; donate → pay → verify → receipt → accounting; expense → accounting
- [ ] Report consistency suite: same test data reconciles across Ledger, R&P, Trial Balance, P&L, Balance Sheet
- [ ] Auth + authorization tests (every endpoint's RBAC verified)
- [ ] Financial consistency tests (no unbalanced entries possible; reversals correct)
- [ ] Swagger complete and verified for all 74 APIs
- [ ] Production config verified (env vars, `synchronize: false`, migrations run clean from zero)
- [ ] Unit + integration + API test coverage on all modules
- [ ] API handoff contract per endpoint (method, auth, role, request/response, errors, pagination) shared with frontend + Arshad
- [ ] Code review complete; merged per Git standards

---

## Definition of Done — every phase

- [ ] Entity/model created
- [ ] Migration created (never edit an applied migration)
- [ ] DTOs created with validation
- [ ] Service implemented (DB transactions where financial)
- [ ] Controller implemented with authentication + RBAC
- [ ] Error handling with standard error codes
- [ ] Audit fields handled
- [ ] Swagger documented
- [ ] Unit + integration tests (accounting integration tested where applicable)
- [ ] Manual test scenario checklist written and executed (`docs/test-scenarios.md`) — see rule.md §6: no module completes without tests
- [ ] No frontend-dependent financial calculations
- [ ] Code reviewed
- [ ] API handed off

## Cross-phase non-negotiables

- Never trust frontend totals; backend validates all amounts and verifies all gateway results
- Every accounting transaction balances (Dr = Cr); posted entries immutable; corrections via reversal
- Reports derive from accounting entries only — ledger balances are never updated directly
- Money: `NUMERIC(12,2)`, currency INR
- Database: TypeORM migrations only, `synchronize: false`
- All protected endpoints behind JWT + permission guards; ownership checks on self-scoped resources
- No sensitive data in logs; secrets only via environment variables

## Cross-phase dependencies & coordination points (Arshad)

| Where | Arshad provides | Mubasshir provides |
|---|---|---|
| Phase 4 (renewal history endpoint) | renewal records/history | financial view of renewal payments (Phase 9-style verify/receipt/accounting) |
| Phase 8 | receipt CRUD, DTOs, attachments, admin API | double-entry posting, ledger, reports |
| Phase 9 | donations, donors, causes, donation status | donation payments, gateway, verification, receipt, refund, accounting |

Migration ownership must be agreed before any cross-module foreign keys are created.

## Migration Issue Log

Per rule.md §2.10: every issue encountered while generating, applying, or verifying a migration is fixed before the change is done **and recorded here** (one row per issue).

| Date | Migration | Issue | Resolution |
|---|---|---|---|
| 2026-09-26 | 1790408367891-Init (first run) | `typeorm-ts-node-esm` CLI failed to load `data-source.ts` — ESM/CJS interop mismatch with the project's `module: commonjs` tsconfig | Switched all `migration:*` scripts in `package.json` to `typeorm-ts-node-commonjs`; `migration:run` then succeeded |
| 2026-09-26 | 1790412218573-CreateAuthSchema | none — schema, FKs, unique indexes, and baseline role seeds applied cleanly; verified via `migration:show` and app boot | — |
| 2026-09-26 | 1790417442685-CreatePermissionsSchema | none — schema, FKs, unique index, permissions catalogue seeds, and ADMIN role permissions mapping applied cleanly; verified via `migration:show` | — |
| 2026-09-26 | 1790420422144-CreateMembershipCategoriesSchema | none — schema, unique indexes on name/code, permissions catalogue seeds, and ADMIN role permissions mapping applied cleanly; verified via `migration:show` and app boot | — |
| 2026-09-26 | 1790420936132-CreateMembershipsSchema | none — schema, FKs on users and membership_categories, indexes on user_id/category_id, unique index on membership_number, permissions seeds, and ADMIN role permissions mapping applied cleanly; verified via `migration:show` and app boot | — |
| 2026-09-26 | 1790422318068-CreateArshadModulesSchema | none — schema for `documents`, `assistance_requests`, `support_tickets`, `support_ticket_messages`, FKs, indexes, permissions seeds for `assistance.review` and `support.manage`, and ADMIN role permissions mapping applied cleanly; verified via `migration:show` and app boot | — |
| 2026-09-26 | 1790422648141-CreateMembershipPaymentsSchema | none — schema for `membership_payments`, `payment_transactions`, `receipts`, FKs, indexes, permission seeds (`payment.read/create/verify/manage_status`), and ADMIN role permissions mapping applied cleanly; verified via `migration:show` and app boot | — |
| 2026-09-28 | 1790576732843-CreateAccountingSchema | none — tables `accounts`, `accounting_entries`, `accounting_entry_lines`, self/child FK constraints, partial unique indexes (one journal per reference; single reversal per entry), entry-number sequence, baseline COA seeds (1001 Bank, 1002 Cash, 4001–4004 Income, 5001 Other Expenses), permissions seeds (`account.*`, `accounting_entry.*`, `ledger.read`), and ADMIN role permissions mapping applied cleanly; verified via `migration:show`, direct DB seed checks, and app boot | — |
| 2026-09-28 | 1790600000000-CreateExpenseEntriesSchema | none — table `expense_entries`, indexes, voucher-number sequence, permissions seeds (`expense.*`), and ADMIN role permissions mapping applied cleanly; verified via `migration:show` and app boot | — |
| 2026-09-28 | 1790610000000-CreateReceiptEntriesSchema | none — table `receipt_entries`, indexes, voucher-number sequence, permissions seeds (`receipt_entry.*`), and ADMIN role permissions mapping applied cleanly; verified via `migration:show` and app boot | — |
| 2026-09-28 | 1790620000000-CreateReportsPermissionsSchema | none — permissions `report.read` and `trial_balance.read` seeded and mapped to ADMIN; applied cleanly | — |
| 2026-09-28 | 1790585028688-CreateDonationsSchema (first run failed) | `duplicate key value violates unique constraint "PK_..."` on `permissions` — the donation permission seeds used IDs `...000801–804`, already consumed by the Phase 7 `expense.*` block | Moved donation permissions to the free `9xx` block (`...000901–904`: `donation.read/create/manage/refund`); re-ran cleanly, verified via `migration:show` and DB checks |
