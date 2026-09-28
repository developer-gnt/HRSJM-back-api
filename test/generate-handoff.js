/**
 * Phase 13 — generates docs/API_HANDOFF.md from the live Swagger document.
 * Per-endpoint contract: method, path, auth, permission (from the guard
 * metadata reflected into Swagger via summary text), and operation summary.
 * The permission each endpoint requires is read from the route's
 * RequirePermissions decorator — reflected here by re-scanning controllers
 * is overkill; instead the report service, membership, etc. all use
 * consistent naming documented in the summary. We emit auth + summary.
 * Run with the dev server up: node test/generate-handoff.js
 */
const fs = require('fs');

(async () => {
  const doc = await fetch('http://localhost:3000/docs-json').then((r) => r.json());

  // Permission catalogue from DB for the contract tables
  const { Client } = require('pg');
  const c = new Client({ host: 'localhost', port: 5432, database: 'hrsjm', user: 'postgres', password: 'postgres' });
  await c.connect();
  const perms = (await c.query('SELECT name, description FROM permissions ORDER BY name')).rows;
  const roles = (await c.query('SELECT r.name, COUNT(rp.permission_id)::int AS n FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id GROUP BY r.name ORDER BY r.name')).rows;
  await c.end();

  const byTag = {};
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue;
      const tag = (op.tags || ['other'])[0];
      (byTag[tag] = byTag[tag] || []).push({
        method: method.toUpperCase(),
        path,
        summary: op.summary || '',
        auth: op.security ? 'Bearer JWT' : 'Public',
      });
    }
  }

  const tagOrder = Object.keys(byTag).sort();
  let md = `# HRSJM Backend API — Handoff Contract (Phase 13)

**Generated:** 2026-09-28 · **Source:** live Swagger doc + permission catalogue
**Base URL:** \`http://<host>/api/v1\` · **Auth:** Bearer access token (\`Authorization: Bearer <token>\`)
**Envelope:** every response is \`{ success, message, data }\` on success and \`{ success, message, error: { code, details } }\` on failure.
**Pagination:** list endpoints accept \`?page=1&limit=20\` (limit max 100) and return \`meta: { page, limit, total, totalPages }\`.

Import \`docs/HRSJM_Postman_Collection.json\` for a ready-made request collection covering all ${Object.values(byTag).reduce((a, b) => a + b.length, 0)} operations.

## Permission catalogue (module.action naming)

| Permission | Description |
|---|---|
${perms.map((p) => `| \`${p.name}\` | ${p.description} |`).join('\n')}

Baseline roles: ${roles.map((r) => `${r.name} (${r.n} perms)`).join(' · ')}. Grant additional roles via \`POST /api/v1/users/:id/roles\` (admin). Every protected endpoint resolves permissions from the database per request (never from token claims) and requires the account to be ACTIVE.

## Endpoints by module

`;
  for (const tag of tagOrder) {
    md += `### ${tag}\n\n`;
    md += '| Method | Path | Auth | Summary |\n|---|---|---|---|\n';
    for (const e of byTag[tag]) {
      md += `| ${e.method} | \`${e.path}\` | ${e.auth} | ${e.summary} |\n`;
    }
    md += '\n';
  }

  md += `## Standard error codes

| HTTP | code | Meaning |
|---|---|---|
| 400 | \`VALIDATION_ERROR\` | Body/query failed class-validator rules (details lists the failures) |
| 401 | \`UNAUTHORIZED\` / \`TOKEN_INVALID\` | Missing/expired/tampered bearer token |
| 403 | \`PERMISSION_DENIED\` | Authenticated but lacks the required permission (details lists required/missing) |
| 404 | \`NOT_FOUND\` / \`*_NOT_FOUND\` | Resource does not exist (or is out of the caller's ownership scope) |
| 409 | \`*_TAKEN\` / \`*_ALREADY_*\` | Unique constraint or state conflict |
| 500 | \`INTERNAL_ERROR\` | Unhandled server error (no stack traces leak to clients) |

## Conventions the frontend must respect

- **Never trust client-side payment success** — after the gateway redirect, call the verify endpoint; the backend re-validates server-side and is idempotent (duplicate calls safe).
- **Amounts** are INR with at most 2 decimals; the backend re-validates every amount against the authoritative record.
- **Ownership**: self-scoped endpoints return only the caller's records; admin visibility requires the ADMIN role.
- **Status transitions** are backend-authoritative; refunds must go through \`POST /donations/:id/refund\` (accounting reversal) — the generic status endpoint rejects REFUNDED.
- **Accounting/reports** are admin-only (\`account.*\`, \`accounting_entry.*\`, \`ledger.read\`, \`*_balance\`/\`profit_loss\`/\`report.read\` permissions).

## TBC items to revisit with HRSJM before production

Final chart of accounts (minimal baseline seeded) · opening balances/fund treatment · payment gateway provider (generic \`PAYMENT_GATEWAY_KEY/SECRET\` placeholders) · partial refunds (full-refund-only implemented) · 80G/tax receipts · approved donation-cause catalogue (free-text for now) · donation status enum finalization (Arshad's donations CRUD).
`;

  fs.writeFileSync('docs/API_HANDOFF.md', md);
  console.log('docs/API_HANDOFF.md written,', md.split('\n').length, 'lines');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });