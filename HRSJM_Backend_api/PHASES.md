# HRSJM Backend API — Development Phases

Source of truth: the HRSJM Junior Backend Developer BRD. One phase at a time; each phase
ends with a working, committed, testable increment before moving on.

## Phase 0 — Foundation & Environment (completed)
- Decide stack: NestJS + TypeScript + PostgreSQL (BRD mandate) vs. Express + MongoDB (current scaffold)
- DB connection, health endpoint, env config, first git commit
- **Done when:** `GET /api/health` returns 200 and the scaffold is committed

## Phase 1 — Auth & Users (RBAC foundation, completed)
- User entity with roles: ADMIN, MEMBER, DONOR, DONATION_SEEKER
- Register, login (JWT, bcrypt), current-user endpoint
- Role + ownership guards reused by every later module
- Shared response envelope `{ success, message, data }`, standard error format, pagination helpers
- **Done when:** register/login work, protected route rejects wrong role, committed

## Phase 2 — Membership Core & Digital ID (completed)
- Membership entity: category, status, joining date, expiry
- Digital Membership ID derived from membership (no duplicate member data — BRD rule 1)
- Validate membership endpoint
- **Done when:** a member's digital ID can be fetched and validated; committed

## Phase 3 — Membership Renewal
- Renewal flow: validate membership → eligibility → period → amount → payment method → submit
- Statuses PENDING/APPROVED/REJECTED/ACTIVE, payment statuses PENDING/SUCCESS/FAILED/REFUNDED
- Renewal history, expiry update, receipt reference
- Admin review (list/filter, approve/reject, remarks)
- Keep renewal policy configurable (BRD: do not hard-code until HRSJM confirms)
- **Done when:** member can renew, admin can approve, expiry updates; committed

## Phase 4 — Documents / File Management
- Secure upload with MIME/extension/size validation, safe filenames
- Entity linking (related_entity_type + id), authorized download only
- Soft delete/archive + audit
- **Done when:** upload → authorized download works, unauthorized download rejected; committed

## Phase 5 — Assistance Requests (Donation Seeker)
- Create request: full name, mobile, email, amount, reason, description, supporting doc
- Statuses PENDING/UNDER_REVIEW/APPROVED/REJECTED/CLOSED
- User sees own requests; admin reviews with status changes + remarks
- **Done when:** request lifecycle works end to end with ownership enforced; committed

## Phase 6 — Support / Complaints
- Tickets: subject, description, attachment, status SUBMITTED/UNDER_REVIEW/RESOLVED/CLOSED
- Ticket messages + attachments, admin response, resolved_at
- **Done when:** user creates ticket, admin responds and closes; committed

## Phase 7 — Notifications
- Notifications with target audience ALL_USERS/MEMBERS/DONORS/DONATION_SEEKERS/SPECIFIC_USER
- notification_recipients with read state + delivery status, mark-read endpoint
- Scheduled sends
- **Done when:** targeted notification reaches the right users' feeds and read state works; committed

## Phase 8 — Admin / Member Management
- Admin dashboard aggregates (members, expiring, renewals, payments, donations, assistance, tickets)
- Member list/search/filter, member detail 360° view
- **Done when:** dashboard + member management endpoints live; committed

## Phase 9 — Receipt / Credit Entry
- Manual income receipts: date, received from, income account, amount, received-in account, method
- Auto entry numbers, filters (fromDate/toDate/account/method), attachment, audit
- CRITICAL: call the (stub) senior accounting posting boundary — never touch ledger/report balances
- **Done when:** receipt creates with entry number and stub accounting call recorded; committed

## Phase 10 — Donation Management (core)
- Donation CRUD: donor info (guest or linked user), cause association, amounts, payment method
- Status display + receipt reference display only (financials stay senior-owned)
- **Done when:** donation created → status visible → receipt ref shown; committed

## Phase 11 — Hardening & Handoff
- Unit + integration tests for every module (BRD §18)
- Full Swagger/OpenAPI documentation (BRD §19)
- Seed data, env audit, no production synchronize, final QA
- **Done when:** all modules documented, tested, and pass a full manual pass; committed

---

## Working rules
1. One phase at a time — nothing from a later phase gets touched early.
2. Every phase ends with: manual API test in Postman → `git commit`.
3. Stack decision (Phase 0) is the only blocker; everything else follows the same pattern.
4. Beginner-friendly: we build each phase together, you run every command yourself.
