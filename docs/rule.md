# HRSJM Backend — Project Rules

**Purpose:** Non-negotiable rules for every phase of this backend. Compiled from `HRSJM_Mubasshir_Senior_Backend_BRD.md` §19, `HRSJM_Complete_Backend_BRD_20_Modules.md`, and `HRSJM_Full_Requirements_Architecture.md`. If code violates any rule here, fix the code.

---

## 1. Financial Rules

1. **Never trust the frontend.** Never trust frontend totals, amounts, or payment success claims.
2. Backend validates all amounts server-side (type, range, `> 0`, against the category fee where applicable).
3. Backend verifies every payment gateway result server-side before marking SUCCESS.
4. Payment verification must be **idempotent** — duplicate callbacks/webhooks must never double-post.
5. Every accounting transaction must balance: `TOTAL DEBIT = TOTAL CREDIT`. Unbalanced entries are rejected at the service layer, never just in the UI.
6. Reports (Ledger, Receipt & Payment, Trial Balance, P&L, Balance Sheet) derive **only** from accounting entries. No side calculations, no separate balance tables.
7. Ledger balances are never updated directly — balances always derive from posted entry lines.
8. Posted accounting entries are immutable. Corrections use controlled **reversal** (mirrored entry), never edits or deletes.
9. Accounting entries must retain source references (`reference_type` + `reference_id`: MEMBERSHIP_PAYMENT, RENEWAL_PAYMENT, DONATION_PAYMENT, MANUAL_RECEIPT, MANUAL_EXPENSE).
10. All financial operations run inside a **database transaction** (e.g., payment status + receipt + accounting entry together, or nothing).
11. Money columns: `NUMERIC(12,2)`. Currency: INR. Never use floats for money.
12. Do not silently expand accounting scope — new reports or flows need HRSJM confirmation.

## 2. Database Rules

1. `synchronize: false` everywhere. Schema changes only via TypeORM **migrations**.
2. Never edit an already-applied migration — create a new one.
3. Timestamp-based migration names; one migration = one logical change; pull/rebase latest `develop` before creating migrations.
4. UUID primary keys on all tables.
5. Table names: plural snake_case (`users`, `membership_categories`, `accounting_entry_lines`). Columns: snake_case. FKs: `<entity>_id`.
6. Every table carries the audit base: `created_at`, `updated_at`, `created_by`, `updated_by` (+ `deleted_at`/`deleted_by` where soft-delete applies).
7. Historical records never mutate with master data: changing a category's fee must not alter past payments (snapshot fees at payment time).
8. The `users`, membership, payment, accounting, and document tables have single authoritative owners (one module each) — no duplicate tables holding the same business data.
9. Cross-module foreign keys are created only after migration ownership is agreed with Arshad.
10. **Every entity change ships with its migration in the same change.** The workflow is mandatory: (1) edit the entity, (2) generate the migration — `npm run migration:generate -- src/database/migrations/<DescriptiveName>`, (3) review the generated SQL, (4) apply it — `npm run migration:run`, (5) verify the result (rebuild, boot the app, exercise affected endpoints/tests), and (6) **any issue found during verification must be solved before the change is considered done, and the issue + resolution recorded in the Migration Issue Log in `phases.md`**. Never hand-edit the database schema or rely on `synchronize` to pick up entity changes.

## 3. API Rules

1. Base path `/api/v1`; kebab-case route groups; module folder convention `module/{controllers,services,repositories,entities,dto,enums,module.ts}`.
2. HTTP semantics: GET read · POST create · PATCH partial update · DELETE only where permitted — never destructively delete financial/audit records.
3. Success envelope: `{ "success": true, "message": "...", "data": ... }`.
4. Error envelope: `{ "success": false, "message": "...", "error": { "code": "ERROR_CODE", "details": ... } }` with meaningful error codes.
5. Pagination: `?page=1&limit=20`, response meta `{ page, limit, total, totalPages }`.
6. DTO + validation: class-validator, one validation approach project-wide, whitelist + reject unknown properties (global ValidationPipe already enforces this).
7. Every list endpoint is filterable as specified per module in the BRD.

## 4. Security Rules

1. Passwords hashed (never stored/logged in plain text); identity always from the authenticated token, never from client payloads.
2. JWT authentication on all protected endpoints + RBAC permission guards (`module.action` permissions; e.g., `membership.approve`, `payment.verify`).
3. Role info is never trusted from the client; baseline roles are Member, Donor, Donation Seeker, HRSJM Admin.
4. Ownership checks on all self-scoped resources (a member sees only their own membership/payments).
5. Account status checked before protected operations; disabled accounts rejected.
6. File uploads: validate type and size, generate safe storage keys, store metadata, restrict access — private documents are never publicly exposed.
7. Secrets only via environment variables; `.env` never committed; `.env.example` is the contract.
8. No sensitive data in logs; safe error responses (no stack traces to clients).
9. Database is only reachable through the backend — never directly from clients.
10. HTTPS in deployment; controlled CORS; rate limiting where appropriate.

## 5. Workflow Rules

1. Work phase-by-phase per `phases.md`; a phase is done only when its exit criteria and the Definition of Done are met.
2. Git: never develop directly on `main`; `feature/*` branches; conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`); PR review before merge.
3. Audit important actions: account changes, role/permission changes, membership approval, payment verification, renewals, assistance review, document actions, accounting entries and corrections.
4. Arshad coordinates before building anything that touches shared contracts (renewal, receipt entry, donations); he never manipulates ledger balances directly.
5. TBC business rules (renewal policy, fees, chart of accounts, gateway, refund policy…) are **never** silently decided in code — mark TBC, implement behind configuration, and list in the open-questions section of `memory.md`.
6. Don't silently expand scope: new module/integration/report/role/workflow = new requirement to be reviewed first.
7. **Every completed module updates the tracking docs.** When a module is completed (not only at phase end), immediately update: `phases.md` — tracker status, the phase's notes, and the Migration Issue Log if a migration was involved — and `memory.md` — Current State, plus Key Decisions / Gotchas & Lessons if the module introduced new ones. Docs are part of the Definition of Done: code, tests, and docs move together. A phase is never marked done while its module entries are missing from either file.

## 6. Testing Rules

1. **No module is complete without tests.** When a module is completed, its test cases must be added before the phase is marked done in `phases.md`.
2. Unit tests cover services, business rules, validators, and (for financial modules) accounting calculations and integrity (balanced entries, idempotent verification, reversal).
3. Every module also ships a **manual test scenario checklist** in `docs/test-scenarios.md` — happy path, validation errors, auth/ownership, and business-rule edge cases — written and executed before API handoff.
4. Financial modules additionally require scenario coverage for: unbalanced-entry rejection, duplicate verification/idempotency, and reversal correctness.
5. A phase is marked complete in `phases.md` only after all its tests pass and every scenario in its checklist is executed and recorded.
