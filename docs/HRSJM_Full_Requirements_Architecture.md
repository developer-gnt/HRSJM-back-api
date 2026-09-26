# HRSJM — Full Requirements & Development Architecture

**Project:** HRSJM Digital Membership & Donation Platform  
**Platforms:** Web App + Mobile App + Admin Panel  
**Backend:** NestJS + TypeScript  
**Database:** PostgreSQL  
**ORM:** TypeORM  
**Status:** Development Baseline

---

## 1. Purpose

This document converts the current HRSJM proposal into a practical requirements and development architecture for a two-developer team.

The source proposal covers membership, payments, renewals, digital membership ID, donations, donation-seeker requests, administration, news/events, notifications, documents/support, and four financial reports.

The Web App and Mobile App use the same central member information and agreed business rules, with an Admin Panel managing the central system.

---

## 2. Main Modules

### Core Modules

1. Authentication & User Account
2. Membership Management
3. Membership Payment
4. Membership Renewal
5. Digital Membership ID
6. Donation Management
7. Donation Seeker / Assistance
8. Admin / Member Management
9. Financial & Accounting

### Secondary Modules

10. News & Events
11. Notifications
12. Documents & Support

This core/secondary grouping is a development-priority decision for the two-developer team; the source proposal does not itself classify the modules this way.

---

## 3. High-Level Architecture

```text
Web App ───────┐
Mobile App ────┼──> NestJS REST API ──> PostgreSQL
Admin Panel ───┘          │
                          ├── Authentication
                          ├── Membership
                          ├── Payments
                          ├── Renewal
                          ├── Donations
                          ├── Documents
                          ├── Notifications
                          └── Accounting
                                  │
                                  ├── Receipt/Income
                                  ├── Expense/Payment
                                  ├── Ledger
                                  ├── Trial Balance
                                  ├── Profit & Loss
                                  └── Balance Sheet
```

---

## 4. Architecture Principles

- **Single source of truth:** Core member, payment, donation and accounting data remain centralized.
- **API-first:** Web, mobile and admin clients use the same backend APIs.
- **Feature-first backend:** Organize code by business module.
- **Minimal data collection:** Collect only workflow-critical information.
- **Reuse existing records:** Never ask users to re-enter data already stored.
- **Auditability:** Important administrative and accounting actions retain actor and timestamps.
- **Database migrations:** Production schema changes are migration-driven.
- **Accounting integrity:** Posted accounting entries must remain auditable.

---

## 5. Backend Folder Structure

```text
src/
├── main.ts
├── app.module.ts
├── config/
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── auth.config.ts
│   ├── storage.config.ts
│   └── payment.config.ts
├── common/
│   ├── decorators/
│   ├── guards/
│   ├── interceptors/
│   ├── filters/
│   ├── pipes/
│   ├── middleware/
│   ├── constants/
│   ├── enums/
│   ├── types/
│   └── utils/
├── database/
│   ├── migrations/
│   └── seeds/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── memberships/
│   ├── membership-payments/
│   ├── membership-renewals/
│   ├── digital-membership/
│   ├── donations/
│   ├── donation-requests/
│   ├── admin/
│   ├── news/
│   ├── events/
│   ├── notifications/
│   ├── documents/
│   ├── support/
│   └── accounting/
└── health/
```

Each module should consistently use:

```text
module/
├── controllers/
├── services/
├── repositories/
├── entities/
├── dto/
├── enums/
├── interfaces/
└── module.ts
```

---

## 6. Naming Standards

### Folders and files

Use lowercase kebab-case:

```text
membership-payments
membership.entity.ts
create-membership.dto.ts
membership-status.enum.ts
```

### Classes

Use PascalCase:

```text
MembershipEntity
MembershipService
MembershipController
CreateMembershipDto
MembershipStatus
```

### Database

Tables: plural snake_case.

```text
users
memberships
membership_categories
membership_payments
membership_renewals
donations
donation_requests
support_requests
accounting_entries
accounting_entry_lines
```

Columns: snake_case.

```text
id
user_id
membership_id
created_at
updated_at
deleted_at
```

Foreign keys:

```text
user_id
membership_id
donation_id
account_id
```

---

## 7. Database Standards

### Primary Key

Use UUID:

```text
id UUID PRIMARY KEY
```

### Audit Fields

Use a common audit strategy:

```text
id
created_at
updated_at
deleted_at
created_by
updated_by
deleted_by
```

### Money

Use PostgreSQL:

```text
NUMERIC(12,2)
```

Currency:

```text
INR
```

Do not use uncontrolled floating-point calculations for accounting.

---

## 8. Common Status Enums

### Generic

```text
ACTIVE
INACTIVE
```

### Membership

```text
PENDING
APPROVED
REJECTED
ACTIVE
EXPIRED
CANCELLED
```

### Payment

```text
PENDING
SUCCESS
FAILED
REFUNDED
```

Final business-specific statuses must be confirmed before production.

---

# 9. Module Requirements

## 9.1 Authentication & User Account

### Registration

| Field | Required |
|---|---|
| Full Name | Yes |
| Mobile Number | Yes |
| Email | No |
| Password | Yes |
| Confirm Password | Yes |

### Login

| Field | Required |
|---|---|
| Mobile / Email | Yes |
| Password | Yes |

Requirements:

- Secure password storage
- Authentication
- Account recovery
- User status
- Role/permission authorization

---

## 9.2 Membership Management

### Membership Category

| Field | Required |
|---|---|
| Category Name | Yes |
| Qualification | Yes |
| Fee | Yes |
| Validity | Yes |
| Membership Kit / Materials | No |

### Membership Application

| Field | Required |
|---|---|
| Full Name | Yes |
| Mobile Number | Yes |
| Email | No |
| Membership Category | Yes |
| Qualification | Yes |
| Address | No |
| City | No |
| State | No |
| Pincode | No |
| Photograph | No |
| Required Documents | Conditional |

Application status:

```text
PENDING
APPROVED
REJECTED
```

Admin fields:

```text
Status       Required
Admin Remark Optional
```

---

## 9.3 Membership Payment

| Field | Required |
|---|---|
| Membership / Application | Yes |
| Amount | Yes |
| Payment Method | Yes |
| Transaction ID | No |
| Payment Remark | No |

System-generated:

- Receipt number
- Payment date
- Member
- Membership category
- Payment status

---

## 9.4 Membership Renewal

| Field | Required |
|---|---|
| Membership | Yes |
| Renewal Period | Yes |
| Renewal Amount | Yes |
| Payment Method | Yes |
| Transaction ID | No |

System-generated:

- Renewal date
- Previous expiry date
- New expiry date
- Renewal history
- Receipt

### Critical confirmation

The supplied HRSJM material contains both a free-renewal policy and a paid renewal schedule. The source explicitly says HRSJM must confirm the final renewal rule before implementation. Do not hard-code either rule before confirmation.

---

## 9.5 Digital Membership ID

Generated from existing data:

```text
Member Name
Membership ID
Membership Category
Membership Status
Joining Date
Expiry Date
Photo
```

No duplicate manual-entry form should be created for these values.

---

## 9.6 Donation Management

### Donor

| Field | Required |
|---|---|
| Full Name | Yes |
| Mobile Number | Yes |
| Email | No |

### Donation

| Field | Required |
|---|---|
| Donation Cause / Request | Yes |
| Donation Amount | Yes |
| Payment Method | Yes |
| Transaction ID | No |
| Remark | No |

Supported source requirements:

- Fixed donation amount
- Custom amount
- One-time donation
- Online payment
- Confirmation
- Receipt
- Donation history

---

## 9.7 Donation Seeker / Assistance

### Registration

| Field | Required |
|---|---|
| Full Name | Yes |
| Mobile Number | Yes |
| Email | No |

### Request

| Field | Required |
|---|---|
| Requested Amount | Yes |
| Reason / Purpose | Yes |
| Description | No |
| Supporting Document | No |

### Admin

| Field | Required |
|---|---|
| Status | Yes |
| Admin Remark | No |

---

## 9.8 Admin / Member Management

### Member Management

| Field | Required |
|---|---|
| Full Name | Yes |
| Mobile Number | Yes |
| Email | No |
| Membership Category | Yes |
| Membership Status | Yes |
| Address | No |
| Photo | No |

Suggested search/filter:

```text
Name
Membership ID
Mobile
Category
Status
```

---

## 9.9 News & Events

### News

| Field | Required |
|---|---|
| Title | Yes |
| Description | Yes |
| Image | No |
| Publish Status | Yes |

### Event

| Field | Required |
|---|---|
| Event Title | Yes |
| Date | Yes |
| Time | Yes |
| Location | Yes |
| Description | No |
| Image | No |

---

## 9.10 Notifications

### Manual Notification

| Field | Required |
|---|---|
| Title | Yes |
| Message | Yes |
| Target Audience | Yes |
| Schedule | No |

Automatic notification events can include:

```text
Membership Confirmation
Payment Confirmation
Renewal Notification
Event Notification
Application Status Update
```

External SMS, WhatsApp Business and email-service integrations are not included unless separately agreed.

---

## 9.11 Documents & Support

### Document

| Field | Required |
|---|---|
| Document Name | Yes |
| Document File | Yes |
| Member | Yes |
| Description | No |

### Support / Complaint

| Field | Required |
|---|---|
| Subject | Yes |
| Description | Yes |
| Attachment | No |

The supplied addendum also requires support for membership document/kit fulfilment information, including appointment letter, certificate and applicable physical-kit information.

---

# 10. Financial & Accounting Architecture

The current scope includes:

1. Receipt & Payment
2. Trial Balance
3. Profit & Loss
4. Balance Sheet

To generate them reliably, implement:

```text
Chart of Accounts
Receipt / Income Entry
Expense / Payment Entry
Accounting Ledger
Receipt & Payment
Trial Balance
Profit & Loss
Balance Sheet
```

---

## 10.1 Chart of Accounts

| Field | Required |
|---|---|
| Account Name | Yes |
| Account Type | Yes |
| Parent Account | No |
| Account Code | No |
| Description | No |

Types:

```text
ASSET
LIABILITY
INCOME
EXPENSE
FUND_EQUITY
```

The exact HRSJM chart of accounts must be confirmed.

---

## 10.2 Receipt / Income Entry

Use **Receipt / Income Entry** in the UI instead of relying only on the phrase "Credit Entry".

| Field | Required |
|---|---|
| Date | Yes |
| Received From | Yes |
| Income Account | Yes |
| Amount | Yes |
| Received In | Yes |
| Payment Method | Yes |
| Reference | No |
| Description | No |
| Attachment | No |

Example:

```text
Debit   Bank/Cash          800
Credit  Membership Income 800
```

---

## 10.3 Expense / Payment Entry

| Field | Required |
|---|---|
| Date | Yes |
| Paid To | Yes |
| Expense Account | Yes |
| Amount | Yes |
| Paid From | Yes |
| Payment Method | Yes |
| Reference | No |
| Description | No |
| Bill / Attachment | No |

Example:

```text
Debit   Printing Expense   2000
Credit  Bank/Cash          2000
```

---

## 10.4 Accounting Ledger

Filters:

| Field | Required |
|---|---|
| From Date | Yes |
| To Date | Yes |
| Account | No |
| Entry Type | No |
| Reference Number | No |

Ledger output:

```text
Date
Entry Number
Account
Description
Debit
Credit
Running Balance
```

---

## 10.5 Receipt & Payment Report

Filters:

| Field | Required |
|---|---|
| From Date | Yes |
| To Date | Yes |
| Account | No |

Output:

### Receipts

```text
Date
Receipt Number
From
Account
Category
Amount
```

### Payments

```text
Date
Voucher Number
Paid To
Account
Expense Category
Amount
```

---

## 10.6 Trial Balance

| Field | Required |
|---|---|
| As-of Date | Yes |
| Account | No |

Output:

```text
Account
Debit
Credit
```

Rule:

```text
TOTAL DEBIT = TOTAL CREDIT
```

---

## 10.7 Profit & Loss

| Field | Required |
|---|---|
| From Date | Yes |
| To Date | Yes |

Output:

```text
INCOME
  Membership Income
  Renewal Income
  Donation Income
  Other Income

TOTAL INCOME

EXPENSES
  Office Expense
  Salary
  Travel
  Printing
  Other Expenses

TOTAL EXPENSES

NET PROFIT / LOSS
```

---

## 10.8 Balance Sheet

| Field | Required |
|---|---|
| As-of Date | Yes |

Output:

```text
ASSETS
  Cash
  Bank
  Receivables
  Other Assets

LIABILITIES
  Payables
  Other Liabilities

FUND / EQUITY
  Opening Fund
  Current Surplus / Deficit
```

Rule:

```text
TOTAL ASSETS
=
TOTAL LIABILITIES + FUND / EQUITY
```

---

# 11. Accounting Database Model

Conceptual model:

```text
accounts
    │
    ▼
accounting_entries
    │
    ▼
accounting_entry_lines
```

### accounts

```text
id
account_code
account_name
account_type
parent_account_id
description
is_active
created_at
updated_at
```

### accounting_entries

```text
id
entry_number
entry_date
entry_type
reference_type
reference_id
description
created_at
updated_at
```

### accounting_entry_lines

```text
id
accounting_entry_id
account_id
debit_amount
credit_amount
description
```

Rule:

```text
SUM(debit_amount) = SUM(credit_amount)
```

---

# 12. Financial Integration

```text
Membership Payment ──> Payment Record ──> Receipt ──> Accounting Entry
Renewal Payment ─────> Payment Record ──> Receipt ──> Accounting Entry
Donation ────────────> Donation Payment ─> Receipt ──> Accounting Entry
Manual Expense ──────> Expense Entry ────────────────> Accounting Entry
```

Reports are generated from accounting records.

---

# 13. API Architecture

Base path:

```text
/api/v1
```

Suggested groups:

```text
/api/v1/auth
/api/v1/users
/api/v1/memberships
/api/v1/membership-categories
/api/v1/membership-payments
/api/v1/membership-renewals
/api/v1/digital-membership
/api/v1/donations
/api/v1/donation-requests
/api/v1/admin
/api/v1/news
/api/v1/events
/api/v1/notifications
/api/v1/documents
/api/v1/support
/api/v1/accounting
```

HTTP:

```text
GET     Read
POST    Create
PATCH   Partial Update
DELETE  Delete
```

---

# 14. API Response Standard

### Success

```json
{
  "success": true,
  "message": "Membership created successfully",
  "data": {}
}
```

### Error

```json
{
  "success": false,
  "message": "Membership not found",
  "error": {
    "code": "MEMBERSHIP_NOT_FOUND",
    "details": null
  }
}
```

### Pagination

Request:

```text
?page=1&limit=20
```

Response:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

# 15. DTO & Validation Standard

Files:

```text
create-membership.dto.ts
update-membership.dto.ts
list-membership.dto.ts
```

Classes:

```text
CreateMembershipDto
UpdateMembershipDto
ListMembershipDto
```

Use one validation approach across the entire backend.

---

# 16. Migration Standards

Rules:

1. Use TypeORM migrations.
2. Never use `synchronize: true` in production.
3. Never edit an already-applied migration.
4. Create a new migration for every schema change.
5. Use timestamp-based migration names.
6. One migration = one logical database change.
7. Pull/rebase latest `develop` before creating migrations.

Example:

```text
1700000000000-create-users.ts
1700000001000-create-memberships.ts
1700000002000-create-donations.ts
```

### Migration ownership

Developer 1 primarily owns:

```text
users
roles
permissions
memberships
membership_categories
membership_payments
membership_renewals
accounts
accounting_entries
accounting_entry_lines
```

Developer 2 primarily owns:

```text
donations
donation_requests
news
events
notifications
documents
support_requests
```

Cross-module relationships must be coordinated before migrations are created.

---

# 17. Git Standards

Branches:

```text
main
develop
feature/*
fix/*
hotfix/*
```

Examples:

```text
feature/membership
feature/payment
feature/accounting
feature/donation
feature/news
```

Commit format:

```text
feat: add membership application API
fix: resolve payment validation
refactor: simplify accounting service
docs: update API documentation
test: add membership service tests
chore: update dependencies
```

Do not directly develop on `main`.

---

# 18. Environment Standards

Commit:

```text
.env.example
```

Never commit real credentials.

Example:

```env
APP_NAME=HRSJM
APP_ENV=development
APP_PORT=3000

DATABASE_HOST=
DATABASE_PORT=5432
DATABASE_NAME=hrsjm
DATABASE_USER=
DATABASE_PASSWORD=

JWT_SECRET=

STORAGE_URL=

PAYMENT_GATEWAY_KEY=
PAYMENT_GATEWAY_SECRET=
```

---

# 19. Two-Developer Ownership

## Developer 1 — Core / Complex Business Logic

Primary ownership:

```text
Authentication
Users
Membership
Membership Payment
Membership Renewal
Financial & Accounting
```

Responsibilities:

- Core database architecture
- Authentication
- Authorization
- Membership rules
- Payment verification
- Renewal logic
- Accounting calculations
- Accounting schema
- Critical integrations

## Developer 2 — Feature / User-Facing Modules

Primary ownership:

```text
Digital Membership ID
Donation
Donation Seeker
Admin Management
News
Events
Notifications
Documents
Support
```

Responsibilities:

- Feature APIs
- Forms
- UI
- Validation
- User-facing workflows
- Admin screens
- Integration with core APIs

---

# 20. Shared Ownership

Both developers must agree on:

```text
Authentication contract
User model
API response format
Enums
Database relationships
File upload
Notifications
Audit fields
Error codes
Pagination
Swagger
Testing
Deployment
```

---

# 21. Module Dependency Map

```text
AUTH
  │
  ├── USERS
  └── ADMIN
       │
       ▼
MEMBERSHIP
  ├── PAYMENT ──> ACCOUNTING
  ├── RENEWAL ──> ACCOUNTING
  └── DIGITAL ID

DONATION ────────> ACCOUNTING

DONATION REQUEST ─> ADMIN

NEWS
EVENTS
NOTIFICATIONS
DOCUMENTS
SUPPORT
```

---

# 22. Development Sequence

## Phase 0 — Shared Foundation

Both developers:

```text
Repository
Folder structure
Environment
Database connection
Base entity
Common enums
API standards
Git workflow
Authentication contract
```

## Phase 1 — Core Membership

Developer 1:

```text
Auth
Users
Membership Categories
Membership Application
Approval
```

Developer 2:

```text
Frontend foundation
Member dashboard
Membership screens
Reusable components
```

## Phase 2 — Payment & Renewal

Developer 1:

```text
Payment
Receipt
Renewal
```

Developer 2:

```text
Payment UI
Receipt UI
Renewal UI
Digital Membership ID
```

## Phase 3 — Donations

Developer 1:

```text
Donation APIs
Donation Request APIs
Payment integration
```

Developer 2:

```text
Donor UI
Donation UI
Donation Seeker UI
Admin donation screens
```

## Phase 4 — Accounting

Developer 1:

```text
Chart of Accounts
Receipt / Income
Expense / Payment
Ledger
Trial Balance
P&L
Balance Sheet
```

Developer 2:

```text
Accounting UI
Report filters
Report tables
PDF/Excel export
```

## Phase 5 — Secondary Features

Developer 2:

```text
News
Events
Notifications
Documents
Support
```

Developer 1:

```text
API review
Authorization review
Integration review
```

## Phase 6 — Integration & QA

Both:

```text
Integration
Unit tests
API tests
End-to-end tests
Security review
Bug fixing
UAT
Deployment
```

---

# 23. Database Relationship Overview

```text
users
 │
 ├── memberships
 │     ├── membership_payments
 │     ├── membership_renewals
 │     └── digital_membership_cards
 │
 ├── donations
 ├── donation_requests
 ├── documents
 └── support_requests

membership_payments ──┐
membership_renewals ──┤
donations ────────────┤
expenses ─────────────┤
                      ▼
             accounting_entries
                      │
                      ▼
             accounting_entry_lines
                      │
                      ▼
                   accounts
```

This is a conceptual model; exact foreign-key relationships must be finalized during database design.

---

# 24. Security Requirements

Minimum baseline:

- Password hashing
- Secure authentication
- Role-based authorization
- Permission checks for admin functions
- Input validation
- File upload validation
- File access control
- Rate limiting where appropriate
- Secure headers
- Secrets outside Git
- Database inaccessible directly from clients
- Audit trail for important actions

---

# 25. File Upload Requirements

For uploaded documents:

```text
Validate type
Validate size
Generate safe storage key
Store metadata
Restrict access
```

Metadata:

```text
id
file_name
file_type
file_size
storage_key
uploaded_by
created_at
```

---

# 26. Accounting Integrity

1. Every posted journal must balance.
2. Posted entries must not be silently overwritten.
3. Corrections should use controlled reversal/correction entries.
4. Reports should derive from accounting records.
5. Accounting entries should retain source references.

Example:

```text
reference_type = MEMBERSHIP_PAYMENT
reference_id   = <payment-id>
```

---

# 27. Testing Architecture

## Unit Tests

Test:

- Services
- Business rules
- Calculations
- Validators
- Accounting calculations

## Integration Tests

Test:

```text
Membership → Payment
Payment → Receipt
Payment → Accounting
Renewal → Payment
Donation → Payment
Expense → Accounting
```

## End-to-End Tests

Critical flow:

```text
Registration
↓
Membership Application
↓
Admin Approval
↓
Payment
↓
Receipt
↓
Digital ID
↓
Renewal
```

Donation:

```text
Donor
↓
Donation
↓
Payment
↓
Receipt
↓
Accounting
```

Accounting:

```text
Receipt + Expense
↓
Ledger
↓
Trial Balance
↓
P&L
↓
Balance Sheet
```

---

# 28. Definition of Done

A module is complete only when:

```text
☐ Database migration complete
☐ Entity complete
☐ DTO validation complete
☐ Repository/service complete
☐ Controller/API complete
☐ Authorization complete
☐ Swagger documentation complete
☐ Unit tests complete
☐ Integration tests where applicable
☐ Frontend integrated
☐ Error handling complete
☐ Loading/empty states complete
☐ Validation messages complete
☐ Audit requirements complete
☐ Code reviewed
☐ Merged into develop
```

---

# 29. Pre-Coding Checklist

Before starting a module:

```text
☐ Module name confirmed
☐ Owner confirmed
☐ Database tables confirmed
☐ Relationships confirmed
☐ Required fields confirmed
☐ Optional fields confirmed
☐ Enums confirmed
☐ Status values confirmed
☐ API endpoints confirmed
☐ DTOs confirmed
☐ Authorization rules confirmed
☐ Migration ownership confirmed
☐ UI screens identified
☐ Dependencies identified
```

---

# 30. Business Rules Requiring HRSJM Confirmation

The supplied proposal does not provide enough detail to safely invent these rules.

Confirm before production:

1. Exact membership personal-information fields.
2. Exact documents required by membership category.
3. Final renewal rule.
4. Renewal fee/eligibility logic.
5. Exact donation accounting treatment.
6. Exact chart of accounts.
7. Opening fund/equity treatment.
8. Any tax/statutory accounting requirements.
9. Document/kit fulfilment statuses.
10. Payment gateway provider and final payment flow.
11. Final admin roles and permissions.
12. Final notification channels.
13. Data retention requirements.
14. Existing-data migration requirements.

Do not silently decide these rules in code.

---

# 31. Scope Boundaries

The current proposal excludes or limits:

- Public-facing website development
- Advanced recurring-payment mandates
- Automated WhatsApp Business campaigns
- Automated SMS campaigns
- External email-service charges/advanced email automation
- Payment gateway transaction charges
- Cloud/server/service charges
- Apple Developer account fees
- Google Play Developer account fees
- Large-scale legacy data migration
- Advanced donor case management
- Advanced donation disbursement/accounting
- Advanced analytics/reporting

New requirements must be reviewed separately before development.

---

# 32. Final Development Standard

Before parallel development begins, both developers must agree on:

```text
DATABASE
├── Table naming
├── Column naming
├── Relationships
├── UUID strategy
├── Audit fields
└── Migrations

BACKEND
├── Folder structure
├── Entity naming
├── DTO naming
├── Service naming
├── API naming
├── Response format
├── Error format
└── Validation

BUSINESS
├── Status enums
├── Payment methods
├── Membership rules
├── Renewal rules
└── Accounting rules

GIT
├── Branch strategy
├── Commit convention
├── Review process
└── Migration coordination
```

**Rule:** Any change to shared architecture, database naming, enums, API contracts, or accounting rules must be documented before both developers implement against it.
