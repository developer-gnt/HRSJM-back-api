/**
 * Phase 10/11 exit-criteria cross-check:
 *  1. Trial Balance API must equal per-account sums computed directly from
 *     accounting_entry_lines (hand-computed ledger figures).
 *  2. Trial Balance must balance: total debit = total credit.
 *  3. P&L API must equal hand-computed income/expense totals for a period.
 */
const { Client } = require('pg');

const BASE = 'http://localhost:3000/api/v1';
const toPaise = (v) => Math.round(Number(v) * 100);

async function getAdminToken() {
  // use the most recent reports admin or create one
  const stamp = String(process.hrtime.bigint()).slice(-6);
  const email = `xc.admin.${stamp}@example.com`;
  const reg = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'XC Admin', mobile_number: `92${stamp}`.slice(0, 10), email,
      password: 'AdminPass#1', confirm_password: 'AdminPass#1',
    }),
  }).then((r) => r.json());
  const c = new Client({ host: 'localhost', port: 5432, database: 'hrsjm', user: 'postgres', password: 'postgres' });
  await c.connect();
  const role = await c.query("SELECT id FROM roles WHERE name='ADMIN'");
  await c.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [reg.data.user.id, role.rows[0].id]);
  await c.end();
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password: 'AdminPass#1' }),
  }).then((r) => r.json());
  return login.data.access_token;
}

(async () => {
  const token = await getAdminToken();
  const auth = { Authorization: `Bearer ${token}` };

  const db = new Client({ host: 'localhost', port: 5432, database: 'hrsjm', user: 'postgres', password: 'postgres' });
  await db.connect();

  // ---- 1. Trial balance cross-check (all data, as_of far future) ----
  const rows = await db.query(`
    SELECT a.id, a.account_code, a.account_type,
           COALESCE(SUM(l.debit_amount), 0) AS gd,
           COALESCE(SUM(l.credit_amount), 0) AS gc
    FROM accounts a
    LEFT JOIN accounting_entry_lines l ON l.account_id = a.id
    GROUP BY a.id, a.account_code, a.account_type`);
  const expected = new Map();
  let expTotalDr = 0, expTotalCr = 0;
  for (const r of rows.rows) {
    const gd = toPaise(r.gd), gc = toPaise(r.gc);
    const dr = gd > gc ? gd - gc : 0;
    const cr = gc > gd ? gc - gd : 0;
    expected.set(r.id, { code: r.account_code, type: r.account_type, gd, gc, dr, cr });
    expTotalDr += dr;
    expTotalCr += cr;
  }

  const tb = await fetch(`${BASE}/reports/trial-balance?as_of_date=2030-01-01`, { headers: auth }).then((r) => r.json());
  let tbOk = true;
  const tbAccounts = new Map(tb.data.accounts.map((a) => [a.account.id, a]));
  for (const [id, exp] of expected) {
    const got = tbAccounts.get(id);
    const gDr = got ? toPaise(got.debit_balance) : 0;
    const gCr = got ? toPaise(got.credit_balance) : 0;
    if (gDr !== exp.dr || gCr !== exp.cr) {
      tbOk = false;
      console.log(`TB MISMATCH ${exp.code}: expected dr=${exp.dr / 100}/cr=${exp.cr / 100}, got dr=${gDr / 100}/cr=${gCr / 100}`);
    }
  }
  console.log(`1. Trial balance vs hand-computed: ${tbOk ? 'PASS' : 'FAIL'} (${expected.size} accounts)`);

  // ---- 2. TB balances ----
  const balanced = tb.data.is_balanced === true && tb.data.difference === 0;
  console.log(`2. TB balanced (dr=${tb.data.total_debit} = cr=${tb.data.total_credit}): ${balanced ? 'PASS' : 'FAIL'}`);

  // ---- 3. P&L cross-check for a period ----
  const FROM = '2026-01-01T00:00:00Z';
  const TO = '2026-09-28T23:59:59.999Z';
  const pl = await db.query(
    `SELECT a.account_type, l.debit_amount, l.credit_amount
     FROM accounting_entry_lines l
     JOIN accounting_entries e ON e.id = l.accounting_entry_id
     JOIN accounts a ON a.id = l.account_id
     WHERE e.entry_date >= $1 AND e.entry_date <= $2 AND a.account_type IN ('INCOME','EXPENSE')`,
    [FROM, TO],
  );
  let income = 0, expense = 0;
  for (const r of pl.rows) {
    const d = toPaise(r.debit_amount), cr = toPaise(r.credit_amount);
    if (r.account_type === 'INCOME') income += cr - d;
    else expense += d - cr;
  }
  const plApi = await fetch(`${BASE}/reports/profit-loss?from_date=2026-01-01&to_date=2026-09-28`, { headers: auth }).then((r) => r.json());
  const plOk =
    toPaise(plApi.data.total_income) === income &&
    toPaise(plApi.data.total_expenses) === expense &&
    toPaise(plApi.data.net_result) === income - expense;
  console.log(`3. P&L vs hand-computed (2026-01-01..2026-09-28): ${plOk ? 'PASS' : 'FAIL'}`);
  console.log(`   expected income=${income / 100} expense=${expense / 100} net=${(income - expense) / 100}`);
  console.log(`   api      income=${plApi.data.total_income} expense=${plApi.data.total_expenses} net=${plApi.data.net_result} (${plApi.data.result_type})`);

  await db.end();
  console.log('--- cross-check completed ---');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
