# HRSJM — Complete Backend BRD

## Digital Membership & Donation Platform
### Backend Requirements — Complete Module & Access Specification

**Project:** HRSJM Digital Membership & Donation Platform  
**Scope:** Central Backend / REST API / Database  
**Platforms consuming backend:** Web App, Mobile App, Admin Panel  
**Backend:** NestJS + TypeScript  
**Database:** PostgreSQL  
**ORM:** TypeORM  
**API:** REST `/api/v1`  
**Document Status:** Development Baseline  
**Version:** 1.0

---

# 1. Document Purpose

This document is the complete backend Business Requirements Document for the HRSJM Digital Membership & Donation Platform.

It defines:

- all backend modules in the current scope
- features inside every module
- actors and access permissions
- required and optional business data
- workflows
- status transitions
- API responsibilities
- database responsibilities
- integrations
- accounting requirements
- security requirements
- audit requirements
- validation rules
- testing requirements
- module dependencies
- acceptance criteria
- scope exclusions
- requirements that still require HRSJM confirmation

The backend is the **single source of truth** for the Web App, Mobile App and Admin Panel.

---

# 2. Source Basis and Scope Rule

This BRD is based on the current HRSJM source materials:

1. HRSJM Digital Membership & Donation Platform proposal
2. HRSJM Minimal Input Fields & Required / Optional Matrix
3. HRSJM Full Requirements & Development Architecture
4. HRSJM Complete Backend BRD
5. HRSJM membership/payment/renewal scope addendum

The source materials define the major business workflows and the four financial reports.

Where the source does not define an exact field, permission, status, integration or business rule, this BRD marks it as **TBC / HRSJM Confirmation Required** rather than silently inventing a final business rule.

---

# 3. Backend Scope

## 3.1 Included Modules

The current backend scope contains **20 functional modules**:

### Identity & Membership

1. Authentication & User Account
2. Users / Roles / Permissions
3. Membership Categories
4. Membership Management
5. Membership Payment
6. Membership Renewal
7. Digital Membership ID

### Donation & Assistance

8. Donation Management
9. Donation Seeker / Assistance

### Administration & Platform Services

10. Admin / Member Management
11. Documents / File Management
12. Notifications
13. Support / Complaints

### Financial & Accounting

14. Credit / Receipt Entry
15. Expense / Payment Entry
16. Accounting Ledger
17. Receipt & Payment
18. Trial Balance
19. Profit & Loss
20. Balance Sheet

---

# 4. Explicitly Excluded from This Backend

The following are not included in the current backend scope:

- Public Website News CMS
- Public Website Events CMS
- Advanced recurring-payment mandates
- Automatic renewal deductions
- Advanced donation disbursement accounting
- Advanced donor case management
- Advanced analytics/reporting beyond agreed reports
- Production WhatsApp automation
- Production SMS automation
- Unapproved email automation
- Large-scale legacy data migration
- Unapproved personal-data collection
- Additional accounting reports not listed in scope
- Full ERP/Tally-style accounting functionality

News and Events remain public/application content features only if separately connected later. They are **not backend modules in this current 20-module backend scope**.

---

# 5. Product Architecture

```text
                  HRSJM Web App
                       │
                  HRSJM Mobile App
                       │
                  HRSJM Admin Panel
                       │
                       ▼
               ┌─────────────────┐
               │  NestJS REST API │
               └────────┬────────┘
                        │
       ┌────────────────┼────────────────┐
       │                │                │
       ▼                ▼                ▼
   Identity         Business          Accounting
       │             Modules             │
       │                │                │
 Auth / Users      Membership       Receipt Entry
 Roles/Permissions Payments          Expense Entry
                   Renewal            Ledger
                   Digital ID         Reports
                   Donation
                   Assistance
                   Documents
                   Notifications
                   Support
                        │
                        ▼
                  PostgreSQL
```

---

# 6. Core Actors

The source proposal defines these primary roles:

| Role | Purpose |
|---|---|
| Member | Apply for and manage HRSJM membership |
| Donor | Make donations |
| Donation Seeker | Submit and track assistance requests |
| HRSJM Admin | Manage members, applications, payments and donation-related information |

The same authenticated account may be associated with more than one business capability where the final product design permits it.

The exact role/permission matrix must be finalized by HRSJM before production.

---

# 7. Access Control Model

## 7.1 Access Levels

Use permission-based authorization rather than relying only on frontend route hiding.

Conceptual permission format:

```text
module.action
```

Examples:

```text
membership.read
membership.create
membership.approve
membership.update
payment.read
payment.verify
donation.create
donation.read
donation.manage
accounting.receipt.create
accounting.expense.create
accounting.report.read
document.upload
document.read
```

---

# 8. Master Access Matrix

Legend:

- **FULL** = create/read/update/manage as permitted
- **SELF** = own records only
- **READ** = read access
- **MANAGE** = administrative management
- **NONE** = no access

| Module | Member | Donor | Donation Seeker | HRSJM Admin |
|---|---|---|---|---|
| Authentication & User Account | SELF | SELF | SELF | FULL |
| Users / Roles / Permissions | SELF | SELF | SELF | FULL |
| Membership Categories | READ | READ | READ | FULL |
| Membership Management | SELF | NONE | NONE | FULL |
| Membership Payment | SELF | NONE | NONE | FULL |
| Membership Renewal | SELF | NONE | NONE | FULL |
| Digital Membership ID | SELF | NONE | NONE | FULL |
| Donation Management | SELF/CREATE | SELF/CREATE | CREATE | FULL |
| Donation Seeker / Assistance | CREATE/SELF | CREATE/SELF | SELF | FULL |
| Admin / Member Management | NONE | NONE | NONE | FULL |
| Documents / File Management | SELF | SELF | SELF | FULL |
| Notifications | SELF | SELF | SELF | FULL |
| Support / Complaints | SELF | SELF | SELF | FULL |
| Credit / Receipt Entry | NONE | NONE | NONE | FULL |
| Expense / Payment Entry | NONE | NONE | NONE | FULL |
| Accounting Ledger | NONE | NONE | NONE | FULL |
| Receipt & Payment Report | NONE | NONE | NONE | FULL |
| Trial Balance | NONE | NONE | NONE | FULL |
| Profit & Loss | NONE | NONE | NONE | FULL |
| Balance Sheet | NONE | NONE | NONE | FULL |

### Access clarification

The matrix above is the **backend design baseline**, not a claim that every permission has already been approved by HRSJM.

HRSJM must confirm:

- final admin permission levels
- whether a donor may also be a member
- whether a member may submit assistance requests
- whether non-members can donate
- whether accounting access should be restricted to a separate finance role

Do not create additional business roles without confirmation.

---

# 9. Module 1 — Authentication & User Account

## Objective

Provide secure registration, login, account recovery and authenticated access.

## Actors

- Member
- Donor
- Donation Seeker
- HRSJM Admin

## Registration

| Field | Requirement |
|---|---|
| Full Name | REQUIRED |
| Mobile Number | REQUIRED |
| Email | OPTIONAL |
| Password | REQUIRED |
| Confirm Password | REQUIRED |

## Login

| Field | Requirement |
|---|---|
| Mobile / Email | REQUIRED |
| Password | REQUIRED |

## Features

- Registration
- Login
- Logout/session termination
- Authentication token handling
- Account status
- Password hashing
- Password recovery
- Credential reset
- Authenticated user profile
- Role/permission loading
- Protected endpoints
- Authentication audit events

## Workflow

```text
Register
   ↓
Validate
   ↓
Create User
   ↓
Authenticate
   ↓
Issue Session/Token
   ↓
Access Protected APIs
```

## Business Rules

- Never store plain passwords.
- Never trust role information sent by a client.
- User identity must come from the authenticated session/token.
- Account status must be checked before protected operations.

The exact OTP/email recovery mechanism is TBC.

---

# 10. Module 2 — Users / Roles / Permissions

## Objective

Maintain the central identity and authorization model used by every module.

## User Features

- View own profile
- Update permitted profile information
- View account status
- Access permitted business capabilities

## Admin Features

- View users
- Search/filter users
- View user details
- Manage account status
- Assign approved roles
- Manage permissions according to the approved authorization model

## Core User Data

Conceptually:

```text
id
full_name
mobile_number
email
password_hash
status
created_at
updated_at
```

Additional fields must only be added when required.

## Roles

Baseline business roles:

```text
MEMBER
DONOR
DONATION_SEEKER
ADMIN
```

The exact role implementation and whether capabilities are represented as roles, permissions, or both must be finalized during technical design.

---

# 11. Module 3 — Membership Categories

## Objective

Define the available HRSJM membership categories.

## Fields

| Field | Requirement |
|---|---|
| Category Name | REQUIRED |
| Qualification | REQUIRED |
| Fee | REQUIRED |
| Validity | REQUIRED |
| Membership Kit / Materials | OPTIONAL |
| Status | REQUIRED |

## Features

### Public/Authenticated

- List categories
- View category details
- View qualification
- View fee
- View validity
- View benefits/material information where configured

### Admin

- Create category
- Update category
- Activate/deactivate category
- View category
- Manage fee/validity

## Rules

- Inactive categories cannot be selected for new applications.
- Existing memberships must retain their historical category reference.
- Historical payment data must not change when a category fee is later changed.

---

# 12. Module 4 — Membership Management

## Objective

Manage the member application and membership lifecycle.

## Application Fields

| Field | Requirement |
|---|---|
| Full Name | REQUIRED |
| Mobile Number | REQUIRED |
| Email | OPTIONAL |
| Membership Category | REQUIRED |
| Qualification | REQUIRED |
| Address | OPTIONAL |
| City | OPTIONAL |
| State | OPTIONAL |
| Pincode | OPTIONAL |
| Photo | OPTIONAL |
| Required Documents | CONDITIONAL |

## Workflow

```text
Register
   ↓
Select Membership Category
   ↓
Submit Application
   ↓
Payment where applicable
   ↓
Admin Review
   ↓
Approved / Rejected
   ↓
Active Membership
   ↓
Digital ID
   ↓
Renewal
```

## Statuses

Baseline:

```text
PENDING
APPROVED
REJECTED
ACTIVE
```

Final status model must be confirmed before schema freeze.

## Admin Features

- List applications
- Filter applications
- View application
- Review application
- Approve
- Reject
- Add remark where supported
- View documents
- View payment information
- View member history

## Business Rules

- Application belongs to the authenticated user.
- Admin approval controls application status.
- Membership cannot become active incorrectly through client-side manipulation.
- Membership status must be authoritative on the backend.

---

# 13. Module 5 — Membership Payment

## Objective

Record and verify online membership payments.

## Fields

| Field | Requirement |
|---|---|
| Membership / Application | REQUIRED |
| Amount | REQUIRED |
| Payment Method | REQUIRED |
| Transaction ID | OPTIONAL |
| Payment Remark | OPTIONAL |

System-generated information:

```text
payment_id
receipt_number
payment_date
payment_status
gateway_reference
```

## Statuses

```text
PENDING
SUCCESS
FAILED
REFUNDED
```

## Workflow

```text
Membership Application
       ↓
Payment Request
       ↓
Gateway
       ↓
Backend Verification
       ↓
SUCCESS / FAILED
       ↓
Receipt
       ↓
Accounting Entry
```

## Rules

- Client cannot directly mark payment successful.
- Backend must verify payment result.
- Successful payment generates the appropriate receipt record.
- Successful payment integrates with accounting.
- Payment records must be auditable.

---

# 14. Module 6 — Membership Renewal

## Objective

Allow eligible members to renew membership.

## Fields

| Field | Requirement |
|---|---|
| Membership | REQUIRED |
| Renewal Period | REQUIRED |
| Renewal Amount | REQUIRED |
| Payment Method | REQUIRED |
| Transaction ID | OPTIONAL |

System-generated:

```text
renewal_id
renewal_date
previous_expiry_date
new_expiry_date
payment_id
receipt_id
```

## Workflow

```text
Active Membership
       ↓
Check Expiry / Eligibility
       ↓
Renewal Available
       ↓
Calculate Applicable Fee
       ↓
Payment
       ↓
Verification
       ↓
Renewal Record
       ↓
Update Expiry
       ↓
Receipt
       ↓
Accounting
```

## Critical Requirement

The supplied HRSJM materials contain both:

- a free-renewal policy linked to introducing new members
- a paid renewal schedule

Therefore:

```text
DO NOT HARD-CODE FINAL RENEWAL ELIGIBILITY
DO NOT HARD-CODE FINAL RENEWAL FEES
```

until HRSJM confirms the final rule.

---

# 15. Module 7 — Digital Membership ID

## Objective

Provide a digital membership identity using existing membership data.

## Data

| Field | Source | Requirement |
|---|---|---|
| Name | Member | REQUIRED |
| Membership ID | System | REQUIRED |
| Category | Membership | REQUIRED |
| Status | Membership | REQUIRED |
| Joining Date | Membership | REQUIRED |
| Expiry Date | Membership | REQUIRED |
| Photo | Member | OPTIONAL |

## Features

- Generate digital membership ID
- Retrieve current ID
- Display membership status
- Display expiry
- Display member photo where available
- Prevent duplicate IDs
- Reflect current membership status

## Optional Future Capability

QR-based verification may be considered only if confirmed by HRSJM.

---

# 16. Module 8 — Donation Management

## Objective

Allow donors/users to donate to approved causes or requests.

## Fields

| Field | Requirement |
|---|---|
| Donor Full Name | REQUIRED |
| Mobile Number | REQUIRED |
| Email | OPTIONAL |
| Donation Cause / Request | REQUIRED |
| Donation Amount | REQUIRED |
| Payment Method | REQUIRED |
| Transaction ID | OPTIONAL |
| Remark | OPTIONAL |

## Features

- View donation causes/requests
- Create donation
- Select amount
- Custom amount
- One-time donation concept
- Monthly donation concept
- Payment initiation
- Payment result
- Donation receipt
- Donation history
- Donation status

## Workflow

```text
Select Cause/Request
       ↓
Enter Amount
       ↓
Payment
       ↓
Verification
       ↓
Donation Success
       ↓
Receipt
       ↓
Accounting
       ↓
Donation History
```

## Recurring Payment

The source mentions a monthly donation concept, but real recurring-payment mandates are not part of the current scope unless separately agreed.

## Accounting

```text
Donation
   ↓
Successful Payment
   ↓
Receipt
   ↓
Accounting Entry
```

Exact donation accounting treatment requires HRSJM confirmation.

---

# 17. Module 9 — Donation Seeker / Assistance

## Objective

Allow users to request financial or other assistance.

## Fields

| Field | Requirement |
|---|---|
| Full Name | REQUIRED |
| Mobile Number | REQUIRED |
| Email | OPTIONAL |
| Requested Amount | REQUIRED |
| Reason / Purpose | REQUIRED |
| Description | OPTIONAL |
| Supporting Document | OPTIONAL |
| Request Status | REQUIRED |
| Admin Remark | OPTIONAL |

## Workflow

```text
Create Request
     ↓
Submit
     ↓
Under Review
     ↓
Approved / Rejected
     ↓
Status History
```

## Features

### User

- Create request
- View request
- View history
- View status
- View admin remark
- Upload supporting document

### Admin

- List requests
- Filter requests
- View details
- Review request
- Change status
- Add remark
- View documents

## Important Scope Boundary

Advanced donation disbursement, case management and complex assistance accounting are not included unless separately agreed.

---

# 18. Module 10 — Admin / Member Management

## Objective

Provide centralized administrative APIs.

## Member Fields

| Field | Requirement |
|---|---|
| Full Name | REQUIRED |
| Mobile Number | REQUIRED |
| Email | OPTIONAL |
| Membership Category | REQUIRED |
| Membership Status | REQUIRED |
| Address | OPTIONAL |
| Photo | OPTIONAL |

## Features

### Dashboard

Basic summaries:

```text
Members
Pending Applications
Payments
Donations
Donation Requests
```

### Member Management

- List members
- Search
- Filter
- View details
- View membership
- View payment history
- View renewal information
- View digital ID
- Manage permitted account status

### Application Management

- List applications
- Filter applications
- View application
- Approve/reject through membership workflow
- View documents
- View payment state

### Payment Management

- List payments
- Filter payments
- View payment detail
- View payment status
- View receipt

### Donation Management

- List donations
- Filter donations
- View donor
- View cause/request
- View amount/status/date

### Assistance Management

- List requests
- Filter
- View request
- Review
- Status update
- Admin remark

---

# 19. Module 11 — Documents / File Management

## Objective

Securely manage documents associated with membership, assistance and other approved workflows.

## Supported Use Cases

- Membership documents
- Assistance supporting documents
- Membership certificates
- Appointment letters
- Membership-kit/fulfilment information
- Other approved documents

The source addendum specifically mentions appointment letter, certificate and applicable physical-kit information.

## Document Fields

| Field | Requirement |
|---|---|
| Document Name | REQUIRED |
| Document File | REQUIRED |
| Member | REQUIRED |
| Description | OPTIONAL |

Storage metadata:

```text
id
file_name
file_type
file_size
storage_key
uploaded_by
created_at
```

## Features

- Upload
- Validate
- Store metadata
- Retrieve
- Download/view where authorized
- Delete/archive where authorized
- Associate document with business record

## Security

```text
Validate type
Validate size
Generate safe storage key
Store metadata
Restrict access
```

Do not expose private documents publicly by default.

---

# 20. Module 12 — Notifications

## Objective

Provide in-app/push notification capability for important system events.

## Manual Notification Fields

| Field | Requirement |
|---|---|
| Title | REQUIRED |
| Message | REQUIRED |
| Target Audience | REQUIRED |
| Schedule | OPTIONAL |

## Automatic Notification Events

Possible events from the source architecture:

```text
Membership Confirmation
Payment Confirmation
Renewal Notification
Event Notification
Application Status Update
```

For the current backend scope, Event Notification should only be implemented if an approved event source exists.

Additional triggers:

```text
Donation Confirmation
Assistance Request Status
```

may be implemented after confirmation.

## Features

- Create notification
- Deliver notification
- Store notification
- List notifications
- Read/unread status
- Mark as read
- Target audience
- Notification history

External SMS, WhatsApp Business and email-service integrations are outside current scope unless separately agreed.

---

# 21. Module 13 — Support / Complaints

## Objective

Provide a backend workflow for user support and complaints.

## Minimum Source Fields

| Field | Requirement |
|---|---|
| Subject | REQUIRED |
| Description | REQUIRED |
| Attachment | OPTIONAL |

## Features

- Create support request
- View own requests
- View request history
- Attach document
- Admin list
- Admin detail
- Admin response/remark
- Status management

## Status

A final status set is not fully specified in the source.

Potential implementation:

```text
SUBMITTED
UNDER_REVIEW
RESOLVED
CLOSED
```

This is **TBC / HRSJM confirmation required**.

---

# 22. Module 14 — Credit / Receipt Entry

## Official Business Name

Use:

**Receipt / Income Entry**

The term "Credit Entry" may be used as an accounting shorthand, but the source recommends Receipt / Income Entry.

## Objective

Record money received by HRSJM.

## Fields

| Field | Requirement |
|---|---|
| Date | REQUIRED |
| Received From | REQUIRED |
| Income Account | REQUIRED |
| Amount | REQUIRED |
| Received In — Cash/Bank | REQUIRED |
| Payment Method | REQUIRED |
| Reference | OPTIONAL |
| Description | OPTIONAL |
| Attachment | OPTIONAL |

## Example

```text
Debit   Bank/Cash          800
Credit  Membership Income 800
```

## Features

- Create receipt
- Validate amount
- Select income account
- Select receiving account
- Generate receipt/entry number
- Create balanced accounting entry
- Link source reference
- View receipt
- List receipts
- Filter receipts
- Audit changes

---

# 23. Module 15 — Expense / Payment Entry

## Objective

Record money paid by HRSJM.

## Fields

| Field | Requirement |
|---|---|
| Date | REQUIRED |
| Paid To | REQUIRED |
| Expense Account | REQUIRED |
| Amount | REQUIRED |
| Paid From — Cash/Bank | REQUIRED |
| Payment Method | REQUIRED |
| Reference | OPTIONAL |
| Description | OPTIONAL |
| Bill / Attachment | OPTIONAL |

## Example

```text
Debit   Printing Expense   2000
Credit  Bank/Cash          2000
```

## Features

- Create expense/payment
- Validate amount
- Select expense account
- Select payment account
- Generate payment/voucher number
- Create balanced accounting entry
- Link source reference
- View
- List
- Filter
- Audit

---

# 24. Module 16 — Accounting Ledger

## Objective

Provide the operational ledger from accounting entry lines.

## Filters

| Field | Requirement |
|---|---|
| From Date | REQUIRED |
| To Date | REQUIRED |
| Account | OPTIONAL |
| Entry Type | OPTIONAL |
| Reference Number | OPTIONAL |

## Output

```text
Date
Entry Number
Account
Description
Debit
Credit
Running Balance
```

## Features

- Ledger by account
- Date filtering
- Entry-type filtering
- Reference filtering
- Running balance
- Entry drill-down
- Source transaction link

## Integrity

The ledger must derive from posted accounting entries.

Do not create a separate independent balance calculation that can diverge from the accounting engine.

---

# 25. Module 17 — Receipt & Payment Report

## Objective

Show money received and money paid for a selected period.

## Filters

| Field | Requirement |
|---|---|
| From Date | REQUIRED |
| To Date | REQUIRED |
| Account | OPTIONAL |

## Receipts

```text
Date
Receipt Number
From
Account
Category
Amount
```

## Payments

```text
Date
Voucher Number
Paid To
Account
Expense Category
Amount
```

## Features

- Generate report
- Filter by date
- Optional account filter
- Show receipt totals
- Show payment totals
- Show net movement
- Export if approved

---

# 26. Module 18 — Trial Balance

## Objective

Show accounting balances and validate that total debits and credits balance.

## Filters

| Field | Requirement |
|---|---|
| As-of Date | REQUIRED |
| Account | OPTIONAL |

## Output

```text
Account
Debit
Credit
```

## Core Rule

```text
TOTAL DEBIT = TOTAL CREDIT
```

## Features

- Generate trial balance
- Filter account
- Calculate debit/credit totals
- Show difference
- Flag imbalance
- Export if approved

---

# 27. Module 19 — Profit & Loss

## Objective

Show income, expenses and resulting profit/loss for a selected period.

## Filters

| Field | Requirement |
|---|---|
| From Date | REQUIRED |
| To Date | REQUIRED |

## Output

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

The exact account grouping must follow the approved HRSJM chart of accounts.

## Formula

```text
NET PROFIT / LOSS
=
TOTAL INCOME - TOTAL EXPENSES
```

---

# 28. Module 20 — Balance Sheet

## Objective

Show HRSJM's financial position as of a selected date.

## Filter

| Field | Requirement |
|---|---|
| As-of Date | REQUIRED |

## Output

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

## Core Equation

```text
TOTAL ASSETS
=
TOTAL LIABILITIES + FUND / EQUITY
```

The exact opening-fund and equity treatment must be confirmed.

---

# 29. Chart of Accounts

Although the four reports are the explicitly named financial reports, the accounting engine requires a Chart of Accounts.

## Fields

| Field | Required |
|---|---|
| Account Name | REQUIRED |
| Account Type | REQUIRED |
| Parent Account | OPTIONAL |
| Account Code | OPTIONAL |
| Description | OPTIONAL |
| Status | REQUIRED |

## Types

```text
ASSET
LIABILITY
INCOME
EXPENSE
FUND_EQUITY
```

## Features

- Create account
- Update account
- Activate/deactivate
- Parent-child hierarchy
- Account code
- Account type
- Account lookup

The exact HRSJM chart must be approved before production.

---

# 30. Accounting Transaction Architecture

```text
MEMBERSHIP PAYMENT
        │
        ▼
PAYMENT VERIFICATION
        │
        ▼
RECEIPT
        │
        ▼
ACCOUNTING ENTRY
        │
        ▼
ENTRY LINES
        │
        ▼
GENERAL LEDGER
        │
        ├── Receipt & Payment
        ├── Trial Balance
        ├── P&L
        └── Balance Sheet
```

The same architecture applies to:

```text
Renewal Payment
Donation Payment
Manual Receipt
Manual Expense
```

---

# 31. Accounting Reference Types

Accounting entries should retain their source transaction.

Example:

```text
reference_type = MEMBERSHIP_PAYMENT
reference_id   = <payment-id>
```

Potential reference types:

```text
MEMBERSHIP_PAYMENT
RENEWAL_PAYMENT
DONATION_PAYMENT
MANUAL_RECEIPT
MANUAL_EXPENSE
```

---

# 32. Accounting Integrity Rules

1. Every posted journal must balance.
2. Total debit must equal total credit.
3. Posted accounting entries must not be silently overwritten.
4. Corrections should use controlled reversal/correction entries.
5. Reports must derive from accounting records.
6. Accounting entries must retain source references.
7. Financial totals must be calculated by the backend.
8. Client-calculated totals must never be trusted.
9. Accounting operations must be transactional/atomic.
10. Historical financial records must remain auditable.

---

# 33. Payment Integration Rules

The payment system is shared by:

```text
Membership Payment
Renewal Payment
Donation Payment
```

## Common Flow

```text
Create Payment Intent
        ↓
Payment Gateway
        ↓
Gateway Callback/Verification
        ↓
Backend Verification
        ↓
Payment Status
        ↓
Receipt
        ↓
Accounting
```

## Never

```text
Frontend says SUCCESS
        ↓
Backend accepts SUCCESS
```

The backend must verify the payment.

The final payment gateway/provider is TBC.

---

# 34. Membership Document / Kit Fulfilment

The supplied scope addendum mentions:

- Appointment Letter
- Certificate
- Physical ID Card where applicable
- ID Cover
- Lanyard
- Car/Bike Sticker
- T-Shirt
- Government Speed Post where applicable

The backend should support **status/information tracking** for agreed documents and physical-kit fulfilment.

Exact fulfilment fields and workflow require confirmation.

---

# 35. Common API Conventions

Base URL:

```text
/api/v1
```

Conceptual route groups:

```text
/auth
/users
/roles
/permissions
/membership-categories
/memberships
/membership-payments
/membership-renewals
/digital-membership
/donations
/donation-requests
/admin
/documents
/notifications
/support
/accounting
```

---

# 36. Standard HTTP Methods

```text
GET     Read
POST    Create
PATCH   Partial Update
DELETE  Delete/archive where permitted
```

Avoid destructive deletion of financial/audit records.

---

# 37. Standard Success Response

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

---

# 38. Standard Error Response

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": null
  }
}
```

---

# 39. Pagination Standard

List APIs:

```text
?page=1&limit=20
```

Response:

```json
{
  "items": [],
  "page": 1,
  "limit": 20,
  "total": 100,
  "totalPages": 5
}
```

---

# 40. Validation Requirements

All incoming data must be validated server-side.

Validate:

- required fields
- data types
- enum values
- numeric ranges
- date formats
- ownership
- status transitions
- payment state
- file types
- file sizes
- authorization

---

# 41. Audit Requirements

Important actions must record:

```text
created_at
updated_at
created_by
updated_by
```

Where appropriate:

```text
deleted_at
deleted_by
```

Audit important events such as:

- account changes
- role/permission changes
- membership approval/rejection
- payment verification
- renewal
- donation status changes
- assistance review
- document actions
- accounting entries
- accounting corrections

---

# 42. Database Architecture

Recommended backend structure:

```text
src/
├── main.ts
├── app.module.ts
├── config/
├── common/
├── database/
│   ├── migrations/
│   └── seeds/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── roles/
│   ├── permissions/
│   ├── membership-categories/
│   ├── memberships/
│   ├── membership-payments/
│   ├── membership-renewals/
│   ├── digital-membership/
│   ├── donations/
│   ├── donation-requests/
│   ├── admin/
│   ├── documents/
│   ├── notifications/
│   ├── support/
│   └── accounting/
└── health/
```

---

# 43. Core Database Entities

Conceptual entities:

```text
users
roles
permissions
role_permissions
user_roles

membership_categories
memberships
membership_payments
membership_renewals
digital_membership_cards

donations
donation_requests

documents
notifications
support_requests

accounts
accounting_entries
accounting_entry_lines
```

Exact foreign-key relationships must be finalized during implementation.

---

# 44. Data Ownership Rules

## User Data

Owned by:

```text
Users/Auth
```

## Membership Data

Owned by:

```text
Membership Module
```

## Payment Data

Owned by:

```text
Payment Module
```

## Accounting Data

Owned by:

```text
Accounting Module
```

## Documents

Owned by:

```text
Document Module
```

Do not create duplicate tables containing the same authoritative business data.

---

# 45. Module Dependency Map

```text
AUTH
 │
 ├── USERS
 │    ├── MEMBERSHIP
 │    ├── DONATION
 │    ├── ASSISTANCE
 │    ├── DOCUMENTS
 │    ├── NOTIFICATIONS
 │    └── SUPPORT
 │
 ▼
MEMBERSHIP
 │
 ├── MEMBERSHIP PAYMENT
 │        │
 │        ▼
 │     ACCOUNTING
 │
 ├── MEMBERSHIP RENEWAL
 │        │
 │        ▼
 │     ACCOUNTING
 │
 └── DIGITAL MEMBERSHIP ID

DONATION
 │
 ├── PAYMENT
 │
 └── ACCOUNTING

ASSISTANCE
 │
 └── DOCUMENTS

MANUAL RECEIPT
 │
 ▼
ACCOUNTING

MANUAL EXPENSE
 │
 ▼
ACCOUNTING

ACCOUNTING
 │
 ├── LEDGER
 ├── RECEIPT & PAYMENT
 ├── TRIAL BALANCE
 ├── P&L
 └── BALANCE SHEET
```

---

# 46. Developer Ownership

## Senior Developer — Core Backend

Primary ownership:

```text
Authentication
Users
Roles/Permissions
Membership Categories
Membership
Membership Payment
Membership Renewal
Accounting
Accounting Ledger
Financial Reports
Payment Verification
Security-sensitive integrations
```

Shared review:

```text
Digital Membership
Donation Accounting Integration
Admin Authorization
Document Security
Notifications
```

## Junior Developer — Feature Backend

Primary implementation:

```text
Digital Membership API
Donation APIs
Donation Seeker APIs
Documents
Notifications
Support
Admin Listing/Filtering APIs
```

The junior developer consumes the core contracts rather than duplicating payment/accounting business logic.

---

# 47. Development Sequence

## Phase 1 — Foundation

```text
Project setup
Database
Configuration
Base entity
Common enums
Error handling
Validation
Swagger
Git workflow
```

## Phase 2 — Identity

```text
Users
Authentication
Roles
Permissions
Guards
```

## Phase 3 — Membership

```text
Membership categories
Membership application
Approval
Membership status
```

## Phase 4 — Payment

```text
Payment abstraction
Membership payment
Receipt
Payment verification
```

## Phase 5 — Renewal

```text
Renewal
Eligibility
Payment
Receipt
Expiry update
```

## Phase 6 — Digital ID

```text
Digital membership ID
Member verification data
```

## Phase 7 — Donations

```text
Donation
Donation history
Payment
Receipt
Accounting integration
```

## Phase 8 — Assistance

```text
Assistance request
Documents
Status
Admin review
```

## Phase 9 — Administration

```text
Admin member APIs
Applications
Payments
Donations
Requests
Dashboard summaries
```

## Phase 10 — Accounting

```text
Chart of Accounts
Receipt/Income Entry
Expense/Payment Entry
Ledger
Reports
```

## Phase 11 — Platform Services

```text
Notifications
Documents
Support
```

## Phase 12 — Integration / QA

```text
API integration
Authorization testing
Accounting testing
Payment testing
Security testing
Regression
UAT
Deployment
```

---

# 48. Testing Requirements

## Authentication

- registration
- duplicate account
- login
- invalid credentials
- password recovery
- authorization

## Membership

- category selection
- application validation
- status transitions
- approval/rejection
- ownership

## Payment

- payment creation
- amount validation
- successful payment
- failed payment
- duplicate callback
- verification
- receipt
- accounting integration

## Renewal

- eligibility
- fee calculation
- payment
- expiry update
- renewal history

## Donation

- amount validation
- cause/request
- payment
- receipt
- history
- accounting integration

## Assistance

- request creation
- validation
- document
- status transition
- admin review

## Documents

- file validation
- upload
- access control
- metadata
- unauthorized access

## Accounting

- balanced entry
- unbalanced entry rejection
- ledger
- Trial Balance
- P&L
- Balance Sheet
- Receipt & Payment
- date filters
- source references

---

# 49. Definition of Done

Every backend module must satisfy:

```text
☐ Requirement confirmed
☐ Database design completed
☐ Migration created
☐ Entity created
☐ DTO created
☐ Validation created
☐ Service implemented
☐ Controller implemented
☐ Authorization implemented
☐ Error handling implemented
☐ Swagger documentation updated
☐ Unit tests added
☐ Integration tests added where appropriate
☐ API tested with Swagger/Postman
☐ Audit requirements implemented
☐ Pagination implemented where required
☐ API contract shared
☐ No duplicated business logic
☐ No secrets committed
```

---

# 50. Security Baseline

Mandatory:

- password hashing
- secure authentication
- authorization guards
- permission checks
- input validation
- file validation
- secure storage keys
- private document access control
- HTTPS in deployment
- secrets in environment variables
- controlled CORS
- rate limiting where appropriate
- safe error responses
- audit logging
- database access only through backend
- payment verification on server

---

# 51. Environment Configuration

Use:

```text
.env.example
```

Never commit:

```text
.env
```

Potential variables:

```env
APP_NAME=HRSJM
APP_ENV=development
APP_PORT=3000

DATABASE_HOST=
DATABASE_PORT=
DATABASE_NAME=
DATABASE_USER=
DATABASE_PASSWORD=

JWT_SECRET=

STORAGE_URL=
STORAGE_BUCKET=

PAYMENT_GATEWAY_KEY=
PAYMENT_GATEWAY_SECRET=
```

Actual provider and credential names depend on final infrastructure decisions.

---

# 52. Migration Rules

Use TypeORM migrations.

Production:

```text
synchronize: false
```

Rules:

- never rely on automatic schema synchronization in production
- never edit an already-applied migration
- create a new migration for schema changes
- test migrations before deployment
- review foreign keys/indexes
- preserve historical accounting data

---

# 53. Financial Data Rules

Money fields should use a database decimal/numeric type, not floating point.

Recommended baseline:

```text
NUMERIC(12,2)
```

Currency:

```text
INR
```

The final currency configuration should be confirmed if HRSJM intends to support additional currencies.

---

# 54. Important Business Rules Requiring HRSJM Confirmation

Before production freeze, HRSJM must confirm:

### Membership

1. Final membership categories
2. Qualification rules
3. Final membership fees
4. Validity periods
5. Required documents
6. Approval process
7. Membership status definitions

### Payment

8. Payment gateway/provider
9. Refund policy
10. Failed-payment/retry policy
11. Payment verification mechanism

### Renewal

12. Final renewal policy
13. Free-renewal condition
14. Paid renewal fee schedule
15. Renewal eligibility
16. Renewal grace period

### Donations

17. Approved causes
18. One-time donation behavior
19. Monthly donation behavior
20. Recurring mandate requirement
21. Refund rules
22. Donation accounting treatment

### Assistance

23. Required assistance documents
24. Review process
25. Approval/rejection rules
26. Disbursement process
27. Disbursement accounting

### Administration

28. Final admin roles
29. Permission matrix
30. Who can approve memberships
31. Who can verify/manage payments
32. Who can access accounting

### Documents

33. Allowed file types
34. Maximum file size
35. Retention rules
36. Document categories

### Notifications

37. Exact notification events
38. Push provider
39. Email/SMS requirements

### Support

40. Final support/complaint statuses
41. Admin response workflow
42. SLA/escalation rules if required

### Accounting

43. Final Chart of Accounts
44. Opening fund treatment
45. Opening balances
46. Tax/statutory requirements
47. Correction/reversal policy
48. Report export requirements

---

# 55. Scope Protection

A request should be considered a new requirement if it introduces:

- a new module
- a new external integration
- a new payment flow
- a new accounting report
- a new role with materially different permissions
- a new workflow
- substantial personal-data collection
- advanced automation
- complex disbursement logic

Do not silently expand the backend.

---

# 56. End-to-End Business Flows

## Member

```text
Register
   ↓
Login
   ↓
Select Membership
   ↓
Submit Application
   ↓
Payment
   ↓
Admin Review
   ↓
Approval
   ↓
Active Membership
   ↓
Digital ID
   ↓
Renewal
```

## Donor

```text
Register/Login where required
   ↓
Select Cause/Request
   ↓
Enter Amount
   ↓
Payment
   ↓
Verification
   ↓
Receipt
   ↓
Donation History
```

## Donation Seeker

```text
Register/Login
   ↓
Create Assistance Request
   ↓
Upload Supporting Document
   ↓
Submit
   ↓
Admin Review
   ↓
Status
   ↓
History
```

## Accounting

```text
Membership Payment
Renewal Payment
Donation Payment
Manual Receipt
Manual Expense
        │
        ▼
Accounting Entries
        │
        ▼
Ledger
        │
        ├── Receipt & Payment
        ├── Trial Balance
        ├── Profit & Loss
        └── Balance Sheet
```

---

# 57. API Handoff Contract

For every API delivered to the Web/Mobile developer, provide:

```text
Endpoint
HTTP Method
Authentication Requirement
Role/Permission
Request Body
Query Parameters
Path Parameters
Success Response
Error Responses
Status Enums
Pagination Rules
Filter Rules
File Upload Rules
Example Request
Example Response
```

Feature handoff:

```text
Database
   ↓
Entity
   ↓
DTO
   ↓
Service
   ↓
Controller
   ↓
Swagger
   ↓
API Contract
   ↓
Frontend/Mobile Integration
```

---

# 58. Final Backend Module Checklist

```text
01  Authentication & User Account
02  Users / Roles / Permissions
03  Membership Categories
04  Membership Management
05  Membership Payment
06  Membership Renewal
07  Digital Membership ID
08  Donation Management
09  Donation Seeker / Assistance
10  Admin / Member Management
11  Documents / File Management
12  Notifications
13  Support / Complaints
14  Credit / Receipt Entry
15  Expense / Payment Entry
16  Accounting Ledger
17  Receipt & Payment
18  Trial Balance
19  Profit & Loss
20  Balance Sheet
```

**Total: 20 backend functional modules.**

---

# 59. Final Architecture Principle

The backend must maintain one source of truth:

```text
                 HRSJM BACKEND
                       │
          ┌────────────┼────────────┐
          │            │            │
       Identity     Business     Accounting
          │            │            │
          ▼            ▼            ▼
        Users      Membership     Entries
        Roles      Payment        Ledger
        Auth       Renewal        Reports
                   Donation
                   Assistance
                       │
                       ▼
                  PostgreSQL
```

The critical principle is:

```text
COLLECT DATA ONCE
        ↓
STORE AUTHORITATIVELY
        ↓
REUSE ACROSS MODULES
        ↓
VALIDATE ON BACKEND
        ↓
AUDIT IMPORTANT ACTIONS
        ↓
DERIVE REPORTS FROM SOURCE RECORDS
```

The backend is the authority for:

- identity
- permissions
- membership state
- payment state
- renewal state
- donation state
- assistance state
- documents/access
- accounting state
- financial reports

No client application should be treated as the authority for any of these states.
