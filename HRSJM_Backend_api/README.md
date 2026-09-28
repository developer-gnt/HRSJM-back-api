# HRSJM Backend API

Backend API for the HRSJM NGO membership management system: members & digital IDs,
renewals, documents, assistance requests, support tickets, notifications, income
receipts (credit entry) and donations.

## Tech stack

- Node.js + NestJS 10 (TypeScript)
- PostgreSQL + TypeORM
- JWT authentication (passport-jwt) + role-based access control
- Swagger/OpenAPI docs at `/docs`

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Key settings:

- `DATABASE_*` — local PostgreSQL connection (database `hrsjm` is created on first run of the API in development mode; tables are synced automatically in dev).
- `JWT_SECRET` — any long random string. Production refuses to boot with the default.
- `RENEWAL_FEE_PER_YEAR` / `RENEWAL_ALLOWED_PERIODS` — renewal policy, deliberately config-driven until HRSJM confirms the fee schedule.

### 3. Seed demo accounts (optional, needed by the smoke suite)

```bash
npm run seed
```

Creates (idempotently): `admin@hrsjm.org` / `Admin@12345` (admin),
`aisha@example.com` / `Str0ngP@ss` (member, with an active membership),
`rahim@example.com` / `D0norP@ss` (donor), `nasreen@example.com` / `S33kerP@ss` (donation seeker).

### 4. Run the server

```bash
npm run start:dev
```

Health check: `GET http://localhost:3000/api/v1/health` → `{"success":true,"data":{"status":"ok",...}}`

Swagger docs: http://localhost:3000/docs

### 5. Run the smoke suite

Against a running dev server:

```bash
npm run test:smoke
```

Creates fresh throw-away accounts/data per run and exercises every implemented
phase end to end.

## API map (all routes under `/api/v1`)

| Area | Routes |
| --- | --- |
| Health | `GET /health` (public) |
| Auth & users | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `GET /users`, `GET /users/:id`, `PATCH /users/:id/status` |
| Memberships | `POST /admin/memberships`, `GET /admin/memberships`, `GET /membership-id/:membershipNumber` (public lookup), `GET /membership-id/:membershipNumber/validate` (public) |
| Renewals | `POST /renewals`, `GET /renewals/me`, `GET /renewals/:id`, `GET /admin/renewals`, `PATCH /admin/renewals/:id/payment|approve|reject|activate`, `GET /admin/memberships/:membershipNumber/renewals` |
| Documents | `POST /documents` (upload), `GET /documents`, `GET /documents/:id` (metadata), `GET /documents/:id/download`, `DELETE /documents/:id` (archive) |
| Assistance | `POST /assistance-requests`, `GET /assistance-requests/me`, `GET /assistance-requests` (admin), `PATCH /assistance-requests/:id/status` (admin), `POST /assistance-requests/:id/documents` |
| Support tickets | `POST /support-tickets`, `GET /support-tickets/me`, message thread + attachment routes, `PATCH /support-tickets/:id/status` (admin) |
| Notifications | `POST /notifications` (admin, send or schedule), `GET /notifications/me`, mark read / read-all, `GET /notifications/:id/recipients` (admin) |
| Admin | `GET /admin/dashboard`, `GET /admin/members`, `GET /admin/members/:id` (360 view) |
| Receipts | `POST /admin/receipts`, `GET /admin/receipts` (filters), `GET /admin/receipts/:id`, `POST /admin/receipts/:id/attachment` |
| Donations | `POST /donations/guest` (public), `POST /donations` (linked), `GET /donations/me`, `GET /donations` (admin), `PATCH /donations/:id/status` (admin) |

All responses use the envelope `{ success, message, data }`. Errors return
`{ success: false, message, error }` with the appropriate HTTP status.

## Architecture notes

- **Ownership boundary:** ledger and report balances belong to the senior
  accounting system. The receipts module posts through
  `AccountingBoundaryService` (currently a stub) and never touches balances;
  donations only display receipt references.
- **Digital membership IDs** are derived from the membership record itself
  (`HRSJM-YYYY-#####`) — no duplicate member data.
- **Documents** are stored with server-generated filenames, validated by MIME
  type/extension/size, and downloadable only by their owner or an admin;
  archived rows are never physically deleted.
- **Renewal policy** (fees, allowed periods) is env-configured, not hard-coded.

## Phase status

See [PHASES.md](./PHASES.md) for the phase plan and completion state.