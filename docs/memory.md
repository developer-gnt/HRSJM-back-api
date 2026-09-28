# HRSJM Backend — Project Memory

**Purpose:** Persistent context for this project. Read this first in any new session before writing code.
**Last updated:** 2026-09-28

---

## 1. What This Project Is

HRSJM — Digital Membership & Donation Platform backend. The backend is the **single source of truth** for the Web App, Mobile App, and Admin Panel.

- **Stack:** NestJS + TypeScript · PostgreSQL · TypeORM (migrations only, `synchronize: false`) · REST `/api/v1` · Swagger
- **My role (Mubasshir):** Senior backend developer — core backend + financial engine
- **Other dev (Arshad):** Junior backend developer — feature/user-facing modules
- **Scope:** 12 modules / 74 APIs for Mubasshir; the full platform BRD defines 20 modules total

---

## 2. Document Map (`docs/`)

| File | Role |
|---|---|
| `HRSJM_Complete_Backend_BRD_20_Modules.md` | Master BRD — source of truth for all 20 modules, access matrix, business rules |
| `HRSJM_Full_Requirements_Architecture.md` | Technical architecture — naming, DB standards, folder structure, API/response standards |
| `HRSJM_Mubasshir_Senior_Backend_BRD.md` | My BRD — 12 modules, 74 APIs, Arshad split, money flows, dev order |
| `phases.md` | Execution plan — 14 phases (0–13), tracker, per-phase DoD and exit criteria |
| `rule.md` | Enforceable non-negotiable rules (always comply) |
| `test-scenarios.md` | Manual test scenarios per module — checklist must pass before a phase is marked complete |
| `memory.md` | This file — project state and context |

---

## 3. Current State

### Done
- Phase 0 foundation is built in the repo root:
  - `package.json` / `tsconfig.json` / `nest-cli.json` — NestJS 11 + TypeScript, TypeORM 0.3, PostgreSQL driver (`pg`), class-validator
  - `src/main.ts` — global prefix `api/v1`, ValidationPipe (whitelist + forbidNonWhitelisted + transform), global `HttpExceptionFilter` + `TransformInterceptor`, CORS, Swagger at `/docs`
  - `src/config/` — `app.config.ts`, `database.config.ts` (snake naming strategy, `synchronize: false`, autoLoadEntities), `auth.config.ts` (JWT placeholders)
  - `src/common/entities/base.entity.ts` — audit base: `id` (UUID), `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `deleted_by`
  - `src/common/enums/` — `common-status`, `membership-status`, `payment-status`
  - `src/common/interceptors/transform.interceptor.ts` — success envelope `{ success, message, data }`
  - `src/common/filters/http-exception.filter.ts` — error envelope `{ success, message, error: { code, details } }`
  - `src/database/data-source.ts` — standalone TypeORM CLI datasource; migration scripts wired in `package.json` (`migration:generate/run/revert/show`)
  - `src/health/` — `GET /api/v1/health`
  - Folders: `src/modules/`, `src/database/migrations/`, `src/database/seeds/`, `test/`
- Phase 1 (Authentication & User Account — 8 APIs):
  - User registration, login, logout, refresh rotation, forgot/reset password, `/auth/me`, profile update, and audit logging.
  - Verification: Clean build, unit tests (10/10), and manual/E2E test suite passed.
- Phase 2 (Users / Roles / Permissions RBAC — 15 APIs):
  - Modules: `users`, `roles`, `permissions`, `audit`.
  - Schema: `permissions` and `role_permissions` created via migration `CreatePermissionsSchema1790417442685`.
  - Guards: `PermissionsGuard` dynamic DB-backed permission resolution + `JwtAuthGuard` + `@RequirePermissions()`.
  - Invariants: Baseline roles (ADMIN, MEMBER, DONOR, SEEKER) protected from rename/delete; self-status deactivation blocked; accounts checked on protected ops.
- Phase 3 (Membership Categories — 5 APIs):
  - Module: `membership-categories` (`MembershipCategoryEntity`, `MembershipCategoriesController`, `MembershipCategoriesService`).
  - Schema: `membership_categories` table with `NUMERIC(12,2)` fee, unique constraints on `name` and `code`, default 365 validity days, status enum.
  - Permissions: `membership_category.read`, `membership_category.create`, `membership_category.update`, `membership_category.manage_status`.
  - Verification: Build clean, migration `CreateMembershipCategoriesSchema1790420422144` applied, unit tests (9/9 passed, 44 total across 5 suites), E2E suite (`test/e2e-membership-categories.sh` passed TC-CAT-001–012).

- Phase 4 (Membership Management — 9 APIs):
  - Module: `memberships` (`MembershipEntity`, `MembershipsController`, `MembershipsService`).
  - Schema: `memberships` table with UUID FKs to `users` and `membership_categories`, unique `membership_number`, `status` enum, validity date tracking, and JSONB application data.
  - Permissions: `membership.read`, `membership.create`, `membership.update`, `membership.manage_status`, `membership.approve`.
  - Invariants: Strict ownership gating on own membership, auto-generated membership numbers & validity ranges on approval, post-approval update immutability for members, inactive category blocking.
  - Verification: Build clean, migration `CreateMembershipsSchema1790420936132` applied, unit tests (10/10 passed, 54 total across 6 suites), E2E suite (`test/e2e-memberships.sh` passed TC-MEM-001–013).
- User-Facing Modules (Arshad Branch Port & Integration):
  - **Documents**: `DocumentEntity`, `DocumentsController`, `DocumentsService` — Multi-part uploads, MIME/extension/size validation, ownership scoping, soft-delete archiving, wired to `GET /memberships/:id/documents`.
  - **Assistance Requests**: `AssistanceRequestEntity`, `AssistanceController`, `AssistanceService` — Donation seeker assistance requests, lifecycle review, document attachment.
  - **Support Tickets**: `SupportTicketEntity`, `SupportTicketMessageEntity`, `SupportController`, `SupportService` — Ticketing, conversation threads, admin replies, attachments.
  - Schema: Migration `CreateArshadModulesSchema1790422318068` applied, permissions `assistance.review` and `support.manage` seeded and mapped to ADMIN.
  - Verification: All 9 unit test suites passed (74 tests total), clean build.

- Phase 5 (Membership Payment — 6 APIs):
  - Module: `membership-payments` (`MembershipPaymentEntity`, `ReceiptEntity`, `PaymentTransactionEntity`, `MembershipPaymentsController`, `MembershipPaymentsService`).
  - Schema: Migration `CreateMembershipPaymentsSchema1790422648141` applied (`membership_payments`, `receipts`, `payment_transactions`), permissions `payment.read`, `payment.create`, `payment.verify`, `payment.manage_status` seeded to ADMIN.
  - Invariants: Idempotent payment verification wrapped in DB transaction, automatic receipt generation (`RCP-YYYYMMDD-XXXX`), membership activation (`ACTIVE`), money column `NUMERIC(12,2)`.
  - Verification: Build clean, all 10 unit test suites passed (84 tests total), E2E suite (`test/e2e-membership-payments.sh` passed TC-PAY-001–008).
- Phase 6 (Accounting Foundation: COA + Entries + Ledger — 10 APIs):
  - Modules: `accounting` (`AccountEntity`, `AccountingEntryEntity`, `AccountingEntryLineEntity`, `AccountsController`, `AccountingController`, `AccountsService`, `AccountingEntriesService`, `AccountingPostingService`, `LedgerService`).
  - Schema: Migration `CreateAccountingSchema1790576732843` applied (`accounts`, `accounting_entries`, `accounting_entry_lines`), baseline COA seeded, sequence `accounting_entry_number_seq` created, permissions `account.read`, `account.create`, `account.update`, `account.manage_status`, `accounting_entry.read`, `accounting_entry.reverse`, `ledger.read` seeded to ADMIN.
  - Invariants: Strict balanced double-entry validation (`TOTAL DEBIT = TOTAL CREDIT`), immutable posted entries with mirrored reversal, running balance computation, integration posting service for modules.
  - Verification: Clean build, unit tests passed (`accounts.service.spec.ts`, `accounting-posting.service.spec.ts`). Phase 5 integration wired: verified payments post `Dr Bank/Cash, Cr Membership Income` inside the verify transaction and set `receipts.accounting_entry_id`. E2E suite (`test/e2e-accounting.sh`) passed TC-ACC-001–021 incl. posting idempotency, double-reversal rejection, and ledger netting to zero after reversal.
- Phase 7 (Expense / Payment Entry — 5 APIs):
  - Module: `expense-entries` (`ExpenseEntryEntity`, `ExpenseEntriesController`, `ExpenseEntriesService`).
  - Schema: Migration `CreateExpenseEntriesSchema1790600000000` created table `expense_entries`, sequence `expense_voucher_number_seq`, permissions `expense.read`, `expense.create`, `expense.update`, `expense.manage_status` mapped to ADMIN.
  - Invariants: Sequence-generated vouchers (`EXP-YYYYMMDD-#####`), transactional double-entry ledger posting (`Dr Expense / Cr Bank-Cash`), cancellation reversal integration, audit logging.
  - Verification: Clean build, 13/13 unit test suites passed (132 tests total across project).

### In progress / Next
- Next: **Phase 8 — Receipt / Payment Accounting Integration (0 new senior APIs)** per `phases.md` (downstream double-entry posting from Arshad's receipt entries `Dr Bank/Cash / Cr Income Account`).

### Progress tracker status (from phases.md)
- Phase 0: ✅ done (verified 2026-09-26)
- Phase 1: ✅ done (verified 2026-09-26)
- Phase 2: ✅ done (verified 2026-09-26)
- Phase 3: ✅ done (verified 2026-09-26)
- Phase 4: ✅ done (verified 2026-09-26)
- Phase 5: ✅ done (verified 2026-09-26)
- Phase 6: ✅ done (verified 2026-09-28)
- Phase 7: ✅ done (verified 2026-09-28)
- Phases 8–13: ⬜ not started

---

## 4. Key Decisions Made

- Build order follows `phases.md`: identity + membership pipeline first (Phases 1–5), accounting engine next (Phases 6–9), reports last (Phases 10–12), QA final (13).
- Response envelope and error codes are global in Phase 0 code — no per-module boilerplate.
- UUID primary keys + snake_case tables/columns via naming strategy (matches naming standards).
- Money is `NUMERIC(12,2)`, currency INR, everywhere — no floats for money.
- Phase 0 deliberately includes only `app/database/auth` configs; `storage.config.ts` and `payment.config.ts` are deferred to their owning phases.
- Git: `main`/`develop`/`feature/*`; conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Testing is a completion gate (rule.md §6): every module completion requires its unit test cases added **and** a manual scenario checklist in `docs/test-scenarios.md` written and executed.
- Token design: access tokens are JWTs (`sub` + `roles`); refresh tokens and password-reset tokens are opaque random tokens stored **only as SHA-256 hashes**, with refresh rotation (`replaced_by` chain) and revoke-all on password reset.
- Migration CLI must use `typeorm-ts-node-commonjs` (the `-esm` runner breaks on the project's CJS tsconfig).

---

## 5. Ownership Split (Mubasshir ↔ Arshad)

| Area | Arshad (junior) | Mubasshir (senior) |
|---|---|---|
| Membership renewal | renewal records, CRUD, status, history | payment verification, receipt, accounting, financial integration |
| Receipt (credit) entry | receipt CRUD, DTOs, attachments, admin API | double-entry posting, ledger, debit/credit validation, reports |
| Donations | donation, donor, cause CRUD, donation status | donation payments, gateway, verification, receipt, refund, accounting |

Hard rule: **Arshad must never write to ledger balances directly** — all money movement goes through Mubasshir's accounting posting service. Migration ownership must be agreed before cross-module foreign keys are created.

---

## 6. Open Items / TBC (need HRSJM confirmation before coding)

- Final renewal policy (free-renewal-with-referrals vs paid schedule) — **do not hard-code**
- Final membership categories, fees, validity, required documents
- Payment gateway provider + verification mechanism
- Final chart of accounts + opening fund/equity treatment
- Donation accounting treatment + refund policy
- Final admin roles and permission matrix
- Notification channels (SMS/WhatsApp/email out of scope unless separately agreed)
- Document/kit fulfilment statuses
- Allowed file types / max sizes for uploads

Full TBC list: `HRSJM_Complete_Backend_BRD_20_Modules.md` §54 and `HRSJM_Full_Requirements_Architecture.md` §30.

---

## 7. Gotchas & Lessons (append as discovered)

- `SnakeNamingStrategy` is NOT exported from `typeorm` 0.3 core — import from `typeorm-naming-strategies` or write a custom class extending `DefaultNamingStrategy`.
- `TransformInterceptor<T>` must cast `data` explicitly (TypeScript rejects `NonNullable<T> | null` as `T`).
- Do not name the folder `doc/` — it is `docs/`.
- Do not trust frontend payment success or frontend totals — server-side verification always (non-negotiable rule).
- Entities live under `src/modules/**/entities/` so the migration CLI glob (`src/modules/**/*.entity.ts`) picks them up; `base.entity.ts` is abstract and intentionally outside that glob.
- `@nestjs/jwt` ships ESM syntax that jest cannot parse from `node_modules` — mock it in unit tests (`jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))`).
- On Windows, stopping a background dev server can orphan the node process holding port 3000 — check `netstat -ano | findstr :3000` and `taskkill //PID <pid> //F` before rebooting (a stale pre-auth server caused a full suite of 404s once).
- Password-reset token delivery is TBC; outside `production` the raw reset token is returned in the forgot-password response for manual testing only — remove/replace when the delivery channel is confirmed.
