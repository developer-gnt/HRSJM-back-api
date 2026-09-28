/**
 * Phase 13 — RBAC/auth sweep over every endpoint in the Swagger document.
 * Every protected endpoint must reject an unauthenticated request with 401.
 * Public endpoints (health, register, login, forgot-password, refresh) are
 * expected to respond without 401.
 */
(async () => {
  const doc = await fetch('http://localhost:3000/docs-json').then((r) => r.json());
  const PUBLIC = [
    'GET /api/v1/health',
    'POST /api/v1/auth/register',
    'POST /api/v1/auth/login',
    'POST /api/v1/auth/forgot-password',
    'POST /api/v1/auth/refresh',
    // token-in-body endpoints (no bearer) — public by design
    'POST /api/v1/auth/logout',
    'POST /api/v1/auth/reset-password',
  ];

  let pass = 0;
  let fail = 0;
  const failures = [];

  const paths = Object.keys(doc.paths);
  for (const path of paths) {
    for (const method of Object.keys(doc.paths[path])) {
      if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue;
      const url = `http://localhost:3000${path}`;
      const res = await fetch(url, {
        method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json' },
        body: ['post', 'patch', 'put'].includes(method) ? '{}' : undefined,
      }).catch((e) => null);
      const status = res ? res.status : 0;
      const label = `${method.toUpperCase()} ${path}`;
      if (PUBLIC.includes(label)) {
        if (status !== 401) { pass++; } else { fail++; failures.push(`${label} — public but got 401`); }
        continue;
      }
      if (status === 401) { pass++; }
      else { fail++; failures.push(`${label} — expected 401, got ${status}`); }
    }
  }

  console.log(`RBAC sweep: ${pass} passed, ${fail} failed (${paths.length} paths)`);
  if (failures.length) console.log(failures.join('\n'));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });