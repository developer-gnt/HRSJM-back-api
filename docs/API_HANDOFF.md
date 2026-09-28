# HRSJM Backend API — Handoff Contract (Phase 13)

**Generated:** 2026-09-28 · **Source:** live Swagger doc + permission catalogue
**Base URL:** `http://<host>/api/v1` · **Auth:** Bearer access token (`Authorization: Bearer <token>`)
**Envelope:** every response is `{ success, message, data }` on success and `{ success, message, error: { code, details } }` on failure.
**Pagination:** list endpoints accept `?page=1&limit=20` (limit max 100) and return `meta: { page, limit, total, totalPages }`.

Import `docs/HRSJM_Postman_Collection.json` for a ready-made request collection covering all 94 operations.

## Permission catalogue (module.action naming)

| Permission | Description |
|---|---|
| `account.create` | Create accounts in the chart of accounts |
| `account.manage_status` | Activate/deactivate accounts |
| `account.read` | View and list chart of accounts |
| `account.update` | Update chart of accounts details |
| `accounting_entry.read` | View accounting entries and their lines |
| `accounting_entry.reverse` | Reverse posted accounting entries |
| `assistance.review` | Review and manage assistance requests |
| `balance_sheet.read` | View balance sheet report and summary |
| `donation.create` | Create donations (Arshad CRUD, seeded ready) |
| `donation.manage` | Manage donation records (Arshad CRUD, seeded ready) |
| `donation.read` | View donations and donation payments |
| `donation.refund` | Refund verified donations with accounting reversal |
| `expense.create` | Create expense vouchers and post ledger journals |
| `expense.manage_status` | Cancel/void expense vouchers and reverse ledger entries |
| `expense.read` | View and list expense vouchers |
| `expense.update` | Update expense voucher details |
| `ledger.read` | View ledger reports with running balances |
| `membership.approve` | Approve membership applications |
| `membership.create` | Create membership applications |
| `membership.manage_status` | Approve, reject, or change membership status |
| `membership.read` | View and list memberships |
| `membership.update` | Update membership details |
| `membership_category.create` | Create membership categories |
| `membership_category.manage_status` | Activate/deactivate membership categories |
| `membership_category.read` | View and list membership categories |
| `membership_category.update` | Update membership categories |
| `payment.create` | Initiate payment orders |
| `payment.manage_status` | Update payment status, offline marks, or notes |
| `payment.read` | View and list membership and donation payments |
| `payment.verify` | Verify gateway signatures and complete payments |
| `permission.read` | List permissions |
| `profit_loss.read` | View profit and loss report and summary |
| `receipt_entry.create` | Create receipt vouchers and post ledger journals |
| `receipt_entry.manage_status` | Cancel/void receipt vouchers and reverse ledger entries |
| `receipt_entry.read` | View and list receipt vouchers |
| `receipt_entry.update` | Update receipt voucher details |
| `report.read` | View financial reports |
| `role.assign` | Assign/remove roles to users |
| `role.create` | Create roles |
| `role.delete` | Delete roles |
| `role.read` | View roles and permissions catalog |
| `role.update` | Update roles and role-permission mappings |
| `support.manage` | Manage and resolve support tickets |
| `trial_balance.read` | View trial balance report and summary |
| `user.manage_status` | Activate/deactivate user accounts |
| `user.read` | View and list users |
| `user.update` | Update user profile fields |

Baseline roles: ADMIN (47 perms) · DONATION_SEEKER (0 perms) · DONOR (0 perms) · MEMBER (0 perms). Grant additional roles via `POST /api/v1/users/:id/roles` (admin). Every protected endpoint resolves permissions from the database per request (never from token claims) and requires the account to be ACTIVE.

## Endpoints by module

### accounting

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/api/v1/accounting/entries` | Bearer JWT | List accounting entries with filters (admin) |
| GET | `/api/v1/accounting/entries/{id}` | Bearer JWT | View an accounting entry with its lines (admin) |
| POST | `/api/v1/accounting/entries/{id}/reverse` | Bearer JWT | Reverse a posted entry with a mirrored correction entry (admin) |
| GET | `/api/v1/accounting/ledger` | Bearer JWT | Global ledger across accounts with running balances (admin) |

### accounts

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/api/v1/accounts` | Bearer JWT | List/search chart of accounts (admin) |
| POST | `/api/v1/accounts` | Bearer JWT | Create an account in the chart of accounts (admin) |
| GET | `/api/v1/accounts/{id}` | Bearer JWT | View an account (admin) |
| PATCH | `/api/v1/accounts/{id}` | Bearer JWT | Update an account (name, code, parent, description — admin) |
| PATCH | `/api/v1/accounts/{id}/status` | Bearer JWT | Activate/deactivate an account (admin) |
| GET | `/api/v1/accounts/{id}/ledger` | Bearer JWT | Account ledger with running balance and optional date range (admin) |

### assistance-requests

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/api/v1/assistance-requests` | Bearer JWT | Submit an assistance request (Donation Seeker/Member) |
| GET | `/api/v1/assistance-requests` | Bearer JWT | List assistance requests (own or all for admin) |
| GET | `/api/v1/assistance-requests/{id}` | Bearer JWT | View single assistance request details |
| PATCH | `/api/v1/assistance-requests/{id}/status` | Bearer JWT | Review and update assistance request status (admin) |
| POST | `/api/v1/assistance-requests/{id}/documents` | Bearer JWT | Attach supporting document to assistance request |

### auth

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | Register a new user account (initial role: Member) |
| POST | `/api/v1/auth/login` | Public | Login with mobile number or email |
| POST | `/api/v1/auth/refresh` | Public | Exchange a refresh token for a new token pair (rotates the refresh token) |
| POST | `/api/v1/auth/logout` | Public | Revoke a refresh token (idempotent) |
| POST | `/api/v1/auth/forgot-password` | Public | Request a password reset (delivery channel TBC) |
| POST | `/api/v1/auth/reset-password` | Public | Reset the password with a valid reset token |
| GET | `/api/v1/auth/me` | Bearer JWT | Get the authenticated user profile |
| PATCH | `/api/v1/auth/me` | Bearer JWT | Update own profile (full_name and/or email) |

### documents

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/api/v1/documents` | Bearer JWT | Upload a document (PDF, images, Word docs) |
| GET | `/api/v1/documents` | Bearer JWT | List documents (scoped to user or all for admin) |
| GET | `/api/v1/documents/{id}` | Bearer JWT | View document metadata |
| DELETE | `/api/v1/documents/{id}` | Bearer JWT | Archive/soft-delete document |
| GET | `/api/v1/documents/{id}/download` | Bearer JWT | Download document file (authorized owner/admin only) |

### donation-payments

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/api/v1/donation-payments` | Bearer JWT | Initiate/record a donation payment |
| GET | `/api/v1/donation-payments` | Bearer JWT | List donation payments (own or all for admin) |
| GET | `/api/v1/donation-payments/{id}` | Bearer JWT | View single donation payment details |
| POST | `/api/v1/donation-payments/{id}/verify` | Bearer JWT | Verify gateway donation payment and post the accounting entry (idempotent) |
| PATCH | `/api/v1/donation-payments/{id}/status` | Bearer JWT | Manually update donation payment status (admin offline marks; REFUNDED must use the refund endpoint) |
| GET | `/api/v1/donation-payments/{id}/receipt` | Bearer JWT | Get generated receipt for a verified donation payment |

### donations

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/api/v1/donations/{id}/refund` | Bearer JWT | Refund a verified donation in full — posts a mirrored accounting reversal (admin) |

### expense-entries

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/api/v1/expense-entries` | Bearer JWT | Create expense voucher and post double-entry journal (admin) |
| GET | `/api/v1/expense-entries` | Bearer JWT | List expense entries with filters (admin) |
| GET | `/api/v1/expense-entries/{id}` | Bearer JWT | View an expense entry with accounts and journal lines (admin) |
| PATCH | `/api/v1/expense-entries/{id}` | Bearer JWT | Update expense entry metadata (admin) |
| PATCH | `/api/v1/expense-entries/{id}/status` | Bearer JWT | Update expense entry status (e.g. cancel/void and reverse journal) (admin) |

### health

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/api/v1/health` | Public |  |

### membership-categories

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/api/v1/membership-categories` | Bearer JWT | List/search membership categories |
| POST | `/api/v1/membership-categories` | Bearer JWT | Create a membership category (admin) |
| GET | `/api/v1/membership-categories/{id}` | Bearer JWT | View a membership category |
| PATCH | `/api/v1/membership-categories/{id}` | Bearer JWT | Update a membership category (admin) |
| PATCH | `/api/v1/membership-categories/{id}/status` | Bearer JWT | Activate/deactivate a membership category (admin) |

### membership-payments

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/api/v1/membership-payments` | Bearer JWT | Initiate/record a membership payment |
| GET | `/api/v1/membership-payments` | Bearer JWT | List membership payments (own or all for admin) |
| GET | `/api/v1/membership-payments/{id}` | Bearer JWT | View single payment details |
| PATCH | `/api/v1/membership-payments/{id}/status` | Bearer JWT | Manually update payment status (admin, e.g. for offline payments) |
| POST | `/api/v1/membership-payments/{id}/verify` | Bearer JWT | Verify gateway payment and activate membership (idempotent) |
| GET | `/api/v1/membership-payments/{id}/receipt` | Bearer JWT | Get generated receipt for verified payment |

### memberships

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/api/v1/memberships` | Bearer JWT | Apply for membership |
| GET | `/api/v1/memberships` | Bearer JWT | List/filter memberships (admin) |
| GET | `/api/v1/users/me/membership` | Bearer JWT | Get current user membership profile |
| GET | `/api/v1/memberships/{id}` | Bearer JWT | View single membership details (owner or admin) |
| PATCH | `/api/v1/memberships/{id}` | Bearer JWT | Update membership application (owner or admin) |
| PATCH | `/api/v1/memberships/{id}/status` | Bearer JWT | Approve, reject, or change membership status (admin) |
| GET | `/api/v1/memberships/{id}/documents` | Bearer JWT | List documents for membership |
| GET | `/api/v1/memberships/{id}/payment-history` | Bearer JWT | List payment history for membership |
| GET | `/api/v1/memberships/{id}/renewal-history` | Bearer JWT | List renewal history for membership |

### permissions

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/api/v1/permissions` | Bearer JWT | List/search permissions (admin) |

### receipt-entries

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/api/v1/receipt-entries` | Bearer JWT | Create receipt voucher and post double-entry journal (admin) |
| GET | `/api/v1/receipt-entries` | Bearer JWT | List receipt entries with filters (admin) |
| GET | `/api/v1/receipt-entries/{id}` | Bearer JWT | View a receipt entry with accounts and journal lines (admin) |
| PATCH | `/api/v1/receipt-entries/{id}` | Bearer JWT | Update receipt entry metadata (admin) |
| PATCH | `/api/v1/receipt-entries/{id}/status` | Bearer JWT | Update receipt entry status (e.g. cancel/void and reverse journal) (admin) |

### reports

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/api/v1/reports/trial-balance` | Bearer JWT | Get detailed trial balance report as of date (admin) |
| GET | `/api/v1/reports/trial-balance/summary` | Bearer JWT | Get trial balance summary and account-type breakdown as of date (admin) |
| GET | `/api/v1/reports/profit-loss` | Bearer JWT | Get detailed profit and loss (income statement) report for a period (admin) |
| GET | `/api/v1/reports/profit-loss/summary` | Bearer JWT | Get profit and loss summary for a period (admin) |
| GET | `/api/v1/reports/balance-sheet` | Bearer JWT | Get detailed balance sheet report as of date (admin) |
| GET | `/api/v1/reports/balance-sheet/summary` | Bearer JWT | Get balance sheet summary as of date (admin) |

### roles

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/api/v1/roles` | Bearer JWT | List all roles with their permissions (admin) |
| POST | `/api/v1/roles` | Bearer JWT | Create a role (admin) |
| GET | `/api/v1/roles/{id}` | Bearer JWT | View a role (admin) |
| PATCH | `/api/v1/roles/{id}` | Bearer JWT | Update a role (admin) |
| DELETE | `/api/v1/roles/{id}` | Bearer JWT | Delete a role (admin, baseline roles protected) |
| POST | `/api/v1/roles/{id}/permissions` | Bearer JWT | Assign permissions to a role (admin) |
| DELETE | `/api/v1/roles/{id}/permissions/{permissionId}` | Bearer JWT | Remove a permission from a role (admin) |

### support-tickets

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/api/v1/support-tickets` | Bearer JWT | Create a new support ticket |
| GET | `/api/v1/support-tickets` | Bearer JWT | List support tickets (own or all for admin) |
| GET | `/api/v1/support-tickets/{id}` | Bearer JWT | View single support ticket |
| PATCH | `/api/v1/support-tickets/{id}/status` | Bearer JWT | Update support ticket status (admin) |
| POST | `/api/v1/support-tickets/{id}/messages` | Bearer JWT | Add a reply message to support ticket |
| GET | `/api/v1/support-tickets/{id}/messages` | Bearer JWT | List conversation messages for support ticket |
| POST | `/api/v1/support-tickets/{id}/attachments` | Bearer JWT | Upload an attachment to a support ticket |

### users

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/api/v1/users` | Bearer JWT | List/search/filter users (admin) |
| GET | `/api/v1/users/{id}` | Bearer JWT | View a user (admin) |
| PATCH | `/api/v1/users/{id}` | Bearer JWT | Update user profile fields (admin) |
| PATCH | `/api/v1/users/{id}/status` | Bearer JWT | Activate/deactivate a user (admin) |
| GET | `/api/v1/users/{id}/roles` | Bearer JWT | View roles assigned to a user (admin) |
| POST | `/api/v1/users/{id}/roles` | Bearer JWT | Assign a role to a user (admin) |
| DELETE | `/api/v1/users/{id}/roles/{roleId}` | Bearer JWT | Remove a role from a user (admin) |

## Standard error codes

| HTTP | code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body/query failed class-validator rules (details lists the failures) |
| 401 | `UNAUTHORIZED` / `TOKEN_INVALID` | Missing/expired/tampered bearer token |
| 403 | `PERMISSION_DENIED` | Authenticated but lacks the required permission (details lists required/missing) |
| 404 | `NOT_FOUND` / `*_NOT_FOUND` | Resource does not exist (or is out of the caller's ownership scope) |
| 409 | `*_TAKEN` / `*_ALREADY_*` | Unique constraint or state conflict |
| 500 | `INTERNAL_ERROR` | Unhandled server error (no stack traces leak to clients) |

## Conventions the frontend must respect

- **Never trust client-side payment success** — after the gateway redirect, call the verify endpoint; the backend re-validates server-side and is idempotent (duplicate calls safe).
- **Amounts** are INR with at most 2 decimals; the backend re-validates every amount against the authoritative record.
- **Ownership**: self-scoped endpoints return only the caller's records; admin visibility requires the ADMIN role.
- **Status transitions** are backend-authoritative; refunds must go through `POST /donations/:id/refund` (accounting reversal) — the generic status endpoint rejects REFUNDED.
- **Accounting/reports** are admin-only (`account.*`, `accounting_entry.*`, `ledger.read`, `*_balance`/`profit_loss`/`report.read` permissions).

## TBC items to revisit with HRSJM before production

Final chart of accounts (minimal baseline seeded) · opening balances/fund treatment · payment gateway provider (generic `PAYMENT_GATEWAY_KEY/SECRET` placeholders) · partial refunds (full-refund-only implemented) · 80G/tax receipts · approved donation-cause catalogue (free-text for now) · donation status enum finalization (Arshad's donations CRUD).
