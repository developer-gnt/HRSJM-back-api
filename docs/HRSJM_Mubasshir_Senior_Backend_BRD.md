# HRSJM — Mubasshir Senior Backend Developer BRD

## 1. Senior Development Scope

You own the core backend, membership, payment, accounting, and financial reporting modules.

| # | Module | Responsibility |
|---|---|---|
| 1 | Authentication & User Account | Full |
| 2 | Users / Roles / Permissions | Full |
| 3 | Membership Categories | Full |
| 4 | Membership Management | Full |
| 5 | Membership Payment | Full |
| 6 | Donation Financial / Payment Integration | Full |
| 7 | Expense / Payment Entry | Full |
| 8 | Accounting Ledger / Chart of Accounts | Full |
| 9 | Receipt & Payment Reports | Full |
| 10 | Trial Balance | Full |
| 11 | Profit & Loss | Full |
| 12 | Balance Sheet | Full |

**Total senior API inventory: 74 APIs.**

---

# 2. Authentication & User Account

## Features
- User registration
- Login/logout
- Access and refresh tokens
- Forgot/reset password
- Current-user profile
- Update own profile
- Account status
- JWT validation
- Authentication guards
- Role/permission integration
- Audit information

## APIs
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

## Workflow
```text
Register → Validate → Create User → Hash Password
→ Assign Initial Role → Login → Tokens → Authenticated API Access
```

---

# 3. Users / Roles / Permissions

## Features

### User Management
- List/search/filter users
- View user
- Update user
- Activate/deactivate user

### Role Management
- Create/list/view/update/delete roles
- Assign/remove permissions

### User Role Assignment
- View roles
- Assign role
- Remove role

### Permission Management
- List permissions
- Create permissions where required
- Role-permission mapping

## APIs
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

## Core
```text
User → Role → Permissions → Authorization Guard → Protected API
```

Baseline roles:
- Member
- Donor
- Donation Seeker
- HRSJM Admin

---

# 4. Membership Categories

## Features
- Create category
- List categories
- View category
- Update category
- Activate/deactivate
- Category name
- Description
- Membership amount
- Validity/period
- Status

## APIs
```text
GET    /api/v1/membership-categories
POST   /api/v1/membership-categories
GET    /api/v1/membership-categories/:id
PATCH  /api/v1/membership-categories/:id
PATCH  /api/v1/membership-categories/:id/status
```

---

# 5. Membership Management

## Features
- Membership application
- Membership CRUD
- Membership status
- Own membership
- Membership category
- Start/expiry dates
- Approval/rejection
- Documents
- Payment history
- Renewal history

## APIs
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

## Workflow
```text
Application
→ Validation
→ Membership
→ Payment
→ Admin Review
→ Approve/Reject
→ Active Membership
→ Digital Membership ID
```

---

# 6. Membership Payment

## Features
- Create payment
- Amount validation
- Payment method
- Transaction/reference ID
- Payment status
- Gateway integration
- Gateway verification
- Success/failure handling
- Receipt
- Payment history
- Refund where applicable
- Accounting integration

## APIs
```text
POST   /api/v1/membership-payments
GET    /api/v1/membership-payments
GET    /api/v1/membership-payments/:id
PATCH  /api/v1/membership-payments/:id/status
POST   /api/v1/membership-payments/:id/verify
GET    /api/v1/membership-payments/:id/receipt
```

## Critical Flow
```text
Frontend → Payment → Gateway → Backend Verification
→ Success → Payment Record → Receipt → Accounting → Membership Activation
```

**Never trust frontend-only payment success.**

---

# 7. Donation Financial / Payment Integration

Arshad owns core donation CRUD. You own the financial/payment layer.

## You Handle
- Donation payment
- Payment gateway
- Payment verification
- Financial status
- Receipt
- Refund
- Accounting
- Payment history

## APIs
```text
POST   /api/v1/donation-payments
GET    /api/v1/donation-payments
GET    /api/v1/donation-payments/:id
POST   /api/v1/donation-payments/:id/verify
PATCH  /api/v1/donation-payments/:id/status
GET    /api/v1/donation-payments/:id/receipt
POST   /api/v1/donations/:id/refund
```

## Flow
```text
Donation → Donation Payment → Gateway → Verify
→ Success → Receipt → Accounting Ledger
```

---

# 8. Expense / Payment Entry

## Features
- Create expense/payment
- List/detail expenses
- Update expense
- Expense status
- Expense account
- Payment account
- Amount
- Payment method
- Reference
- Description
- Attachment
- Accounting posting

## APIs
```text
POST   /api/v1/expense-entries
GET    /api/v1/expense-entries
GET    /api/v1/expense-entries/:id
PATCH  /api/v1/expense-entries/:id
PATCH  /api/v1/expense-entries/:id/status
```

## Required Fields
```text
Date
Paid To
Expense Account
Amount
Paid From
Payment Method
Reference
Description
Attachment
```

## Example
```text
Dr Office Expense     ₹5,000
Cr Bank               ₹5,000
```

---

# 9. Accounting Ledger / Chart of Accounts

This is the core financial engine.

## 9.1 Chart of Accounts

### Features
- Create/list/view/update accounts
- Activate/deactivate
- Parent account
- Account type
- Account code
- Description

### Account Types
```text
ASSET
LIABILITY
INCOME
EXPENSE
FUND_EQUITY
```

### APIs
```text
GET    /api/v1/accounts
POST   /api/v1/accounts
GET    /api/v1/accounts/:id
PATCH  /api/v1/accounts/:id
PATCH  /api/v1/accounts/:id/status
```

## 9.2 Accounting Entries

### Features
- Accounting entries
- Debit/credit lines
- Reference type/id
- Entry date
- Description
- Reversal
- Audit trail

### APIs
```text
GET    /api/v1/accounting/entries
GET    /api/v1/accounting/entries/:id
POST   /api/v1/accounting/entries/:id/reverse
```

### Non-negotiable rule
```text
TOTAL DEBIT = TOTAL CREDIT
```

## 9.3 Ledger

```text
GET /api/v1/accounts/:id/ledger
GET /api/v1/accounting/ledger
```

Features:
- Account filter
- Date range
- Debit
- Credit
- Running balance
- Reference
- Description

---

# 10. Receipt & Payment Reports

## Features
- Receipt report
- Payment report
- Combined report
- Date filter
- Account filter
- Category/filter where applicable
- Total receipts
- Total payments
- Derived closing balance where defined
- Export if required

## APIs
```text
GET /api/v1/reports/receipt-payment
GET /api/v1/reports/receipt-payment/receipts
GET /api/v1/reports/receipt-payment/payments
```

Reports must derive from accounting data.

---

# 11. Trial Balance

## Features
- Trial Balance
- Date/as-of filter
- Account list
- Debit balance
- Credit balance
- Total debit
- Total credit
- Balance validation

## APIs
```text
GET /api/v1/reports/trial-balance
GET /api/v1/reports/trial-balance/summary
```

## Rule
```text
Total Debit = Total Credit
```

---

# 12. Profit & Loss

## Features
- Income
- Expenses
- Period filter
- Account/category breakdown
- Total income
- Total expense
- Net result
- Summary
- Detailed report

## APIs
```text
GET /api/v1/reports/profit-loss
GET /api/v1/reports/profit-loss/summary
```

## Formula
```text
Income - Expenses = Net Result
```

---

# 13. Balance Sheet

## Features
- Assets
- Liabilities
- Fund/equity
- Account breakdown
- As-of date
- Summary
- Detailed report

## APIs
```text
GET /api/v1/reports/balance-sheet
GET /api/v1/reports/balance-sheet/summary
```

## Fundamental Relationship
```text
Assets = Liabilities + Fund/Equity
```

---

# 14. Complete Architecture

```text
Authentication
      ↓
Roles & Permissions
      ↓
Membership ───────── Donation
      ↓                 ↓
Membership Payment   Donation Payment
      └────────┬────────┘
               ↓
        Accounting Engine
               ↓
      ┌────────┼────────┐
      ↓        ↓        ↓
   Receipts  Expenses  Payments
      └────────┼────────┘
               ↓
       Accounting Ledger
               ↓
    ┌──────────┼──────────┐
    ↓          ↓          ↓
   R&P         TB       P&L / BS
```

---

# 15. Senior API Inventory

| Module | APIs |
|---|---:|
| Authentication & User Account | 8 |
| Users / Roles / Permissions | 15 |
| Membership Categories | 5 |
| Membership Management | 9 |
| Membership Payment | 6 |
| Donation Financial/Payment | 7 |
| Expense / Payment Entry | 5 |
| Accounting Ledger / COA | 10 |
| Receipt & Payment | 3 |
| Trial Balance | 2 |
| Profit & Loss | 2 |
| Balance Sheet | 2 |
| **TOTAL** | **74** |

---

# 16. Integration With Arshad

## Membership Renewal

### Arshad
```text
Renewal Application
Renewal Record
Renewal Status
Renewal History
```

### Mubasshir
```text
Payment Verification
Payment Success
Receipt
Accounting Entry
Renewal Financial Integration
```

## Credit / Receipt Entry

### Arshad
```text
Receipt CRUD
DTO
Validation
Attachment
Admin API
```

### Mubasshir
```text
Double-entry accounting
Ledger posting
Debit/Credit validation
Accounting Entry
Reports
```

Arshad must not directly manipulate ledger balances.

## Donation

### Arshad
```text
Donation
Donor
Cause
Donation History
Donation Status
```

### Mubasshir
```text
Donation Payment
Gateway
Verification
Receipt
Refund
Accounting
```

---

# 17. Core Database Design

```text
users
roles
permissions
user_roles
role_permissions

membership_categories
memberships
membership_payments

donations
donation_payments

expense_entries
receipt_entries

accounts
accounting_entries
accounting_entry_lines
```

Supporting entities may include:

```text
refresh_tokens / sessions
payment transactions
receipts
audit information
```

Use the approved migration design as the final source of truth for exact schema.

---

# 18. Financial Money Flows

## Membership
```text
Member
 ↓
Membership
 ↓
Payment
 ↓
Gateway Verification
 ↓
Receipt
 ↓
Accounting

Dr Bank/Cash
Cr Membership Income
```

## Donation
```text
Donor
 ↓
Donation
 ↓
Payment
 ↓
Verification
 ↓
Receipt
 ↓
Accounting

Dr Bank/Cash
Cr Donation Income
```

## Manual Receipt
```text
Receipt Entry
 ↓
Accounting

Dr Bank/Cash
Cr Income Account
```

## Expense
```text
Expense Entry
 ↓
Accounting

Dr Expense Account
Cr Bank/Cash
```

---

# 19. Non-Negotiable Backend Rules

## Financial
- Never trust frontend totals.
- Backend validates amounts.
- Backend verifies payment gateway results.
- Every accounting transaction must balance.
- Debit must equal credit.
- Reports derive from accounting entries.
- Do not directly update ledger balances as the primary source of truth.
- Use database transactions for financial operations.
- Monetary values use `NUMERIC(12,2)`.
- INR is the baseline currency.

## Database
```text
synchronize: false
```

Use TypeORM migrations.

## API
```text
/api/v1
```

## Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

## Error Response
```json
{
  "success": false,
  "message": "Operation failed",
  "error": {
    "code": "ERROR_CODE",
    "details": null
  }
}
```

## Security
- JWT authentication
- RBAC
- Permission guards
- DTO validation
- Password hashing
- Secure secrets
- Audit fields
- Authorization on protected resources
- Ownership checks
- Payment verification
- No sensitive data in logs

---

# 20. Development Order

```text
PHASE 1  Authentication
    ↓
PHASE 2  Users / Roles / Permissions
    ↓
PHASE 3  Membership Categories
    ↓
PHASE 4  Membership Management
    ↓
PHASE 5  Membership Payment
    ↓
PHASE 6  Accounting Foundation
         ├── Chart of Accounts
         ├── Accounting Entries
         └── Ledger
    ↓
PHASE 7  Expense / Payment Entry
    ↓
PHASE 8  Receipt / Payment Integration
    ↓
PHASE 9  Donation Financial Integration
    ↓
PHASE 10 Trial Balance
    ↓
PHASE 11 Profit & Loss
    ↓
PHASE 12 Balance Sheet
    ↓
PHASE 13 Integration + QA
```

---

# 21. Definition of Done

For every module:

- [ ] Entity/model created
- [ ] Migration created
- [ ] DTOs created
- [ ] Service implemented
- [ ] Controller implemented
- [ ] Authentication applied
- [ ] Authorization/RBAC applied
- [ ] Validation implemented
- [ ] Error handling implemented
- [ ] Database transaction used where required
- [ ] Audit fields handled
- [ ] Swagger documentation added
- [ ] API tested
- [ ] Edge cases tested
- [ ] Test cases added (unit + manual scenarios in `docs/test-scenarios.md`)
- [ ] Integration tested
- [ ] Accounting integration tested where applicable
- [ ] No frontend-dependent financial calculations
- [ ] Code reviewed
- [ ] API handed off to frontend

---

# 22. Senior Completion Checklist

## Authentication
- [ ] Register
- [ ] Login
- [ ] Logout
- [ ] Refresh token
- [ ] Forgot password
- [ ] Reset password
- [ ] Get current user
- [ ] Update current user

## RBAC
- [ ] User CRUD
- [ ] User status
- [ ] Role CRUD
- [ ] Permission management
- [ ] Role-permission mapping
- [ ] User-role mapping
- [ ] Authorization guards

## Membership
- [ ] Membership categories
- [ ] Membership application
- [ ] Membership CRUD
- [ ] Membership status
- [ ] Membership payment
- [ ] Payment verification
- [ ] Receipt
- [ ] Payment history

## Donations
- [ ] Donation payment
- [ ] Gateway integration
- [ ] Payment verification
- [ ] Donation receipt
- [ ] Refund
- [ ] Accounting integration

## Accounting
- [ ] Chart of Accounts
- [ ] Accounting entries
- [ ] Debit/credit validation
- [ ] Ledger
- [ ] Receipt entry integration
- [ ] Expense entry integration
- [ ] Reversal
- [ ] Audit trail

## Reports
- [ ] Receipt & Payment
- [ ] Trial Balance
- [ ] Profit & Loss
- [ ] Balance Sheet
- [ ] Report filters
- [ ] Report validation

## Final QA
- [ ] Unit tests
- [ ] Integration tests
- [ ] API tests
- [ ] Authentication tests
- [ ] Authorization tests
- [ ] Financial consistency tests
- [ ] Swagger verification
- [ ] Production configuration
- [ ] Migration verification
- [ ] Deployment verification

---

# 23. Final Ownership Summary

Your responsibility is the core backend and financial engine:

```text
                    MUBASSHIR
                        │
       ┌────────────────┼─────────────────┐
       ↓                ↓                 ↓
 Authentication       RBAC           Membership
       │                │                 │
       └────────────────┼─────────────────┘
                        ↓
                  Payments
                  /                 Membership      Donation
             Payment       Payment
                 \         /
                  \       /
                   ↓     ↓
                 Accounting
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
       Ledger      Receipts   Expenses
          │          │          │
          └──────────┼──────────┘
                     ↓
              Financial Reports
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
       R&P           TB        P&L / BS
```

**Your 74 APIs form the core backend and financial foundation of HRSJM.**
