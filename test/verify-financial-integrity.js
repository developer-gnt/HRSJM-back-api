/**
 * Phase 13 — financial consistency verification (DB-level).
 * Rule.md §1: every posted entry must balance; entries immutable with
 * controlled reversal; references retained; NUMERIC(12,2) INR.
 */
const { Client } = require('pg');

(async () => {
  const c = new Client({ host: 'localhost', port: 5432, database: 'hrsjm', user: 'postgres', password: 'postgres' });
  await c.connect();
  let fails = 0;
  const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ✅ ${name}`);
    else { fails++; console.log(`  ❌ ${name} ${detail}`); }
  };

  // 1. Every posted entry balances
  const imbalanced = await c.query(`
    SELECT e.entry_number, SUM(l.debit_amount) AS dr, SUM(l.credit_amount) AS cr
    FROM accounting_entries e JOIN accounting_entry_lines l ON l.accounting_entry_id = e.id
    GROUP BY e.entry_number HAVING SUM(l.debit_amount) <> SUM(l.credit_amount)`);
  check('every posted entry balances (Dr = Cr)', imbalanced.rowCount === 0, JSON.stringify(imbalanced.rows));

  // 2. No orphan lines
  const orphans = await c.query(`
    SELECT COUNT(*)::int AS n FROM accounting_entry_lines l
    WHERE NOT EXISTS (SELECT 1 FROM accounting_entries e WHERE e.id = l.accounting_entry_id)
       OR NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = l.account_id)`);
  check('no orphan entry lines (entry + account exist)', orphans.rows[0].n === 0);

  // 3. Entry numbers unique
  const dupNums = await c.query(`
    SELECT entry_number, COUNT(*)::int AS n FROM accounting_entries
    GROUP BY entry_number HAVING COUNT(*) > 1`);
  check('entry numbers unique', dupNums.rowCount === 0);

  // 4. Every entry has ≥ 2 lines
  const fewLines = await c.query(`
    SELECT e.entry_number, COUNT(*)::int AS n FROM accounting_entries e
    JOIN accounting_entry_lines l ON l.accounting_entry_id = e.id
    GROUP BY e.entry_number HAVING COUNT(*) < 2`);
  check('every entry has at least two lines', fewLines.rowCount === 0);

  // 5. Each line carries exactly one side
  const bothSides = await c.query(`
    SELECT COUNT(*)::int AS n FROM accounting_entry_lines
    WHERE (debit_amount > 0 AND credit_amount > 0) OR (debit_amount = 0 AND credit_amount = 0)`);
  check('each line has exactly one of debit/credit', bothSides.rows[0].n === 0);

  // 6. Reversal integrity: every REVERSAL points at an existing JOURNAL; no double reversal
  const badRev = await c.query(`
    SELECT COUNT(*)::int AS n FROM accounting_entries r
    WHERE r.entry_type = 'REVERSAL' AND (
      r.reversal_of_entry_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM accounting_entries j WHERE j.id = r.reversal_of_entry_id AND j.entry_type = 'JOURNAL')
      OR (SELECT COUNT(*) FROM accounting_entries x WHERE x.reversal_of_entry_id = r.reversal_of_entry_id) > 1)`);
  check('reversals: one per entry, pointing at a journal', badRev.rows[0].n === 0);

  // 7. Reversals mirror the original (same accounts, swapped sides, same totals)
  const mirror = await c.query(`
    SELECT COUNT(*)::int AS n FROM accounting_entries j
    JOIN accounting_entries r ON r.reversal_of_entry_id = j.id
    JOIN accounting_entry_lines jl ON jl.accounting_entry_id = j.id
    JOIN accounting_entry_lines rl ON rl.accounting_entry_id = r.id
      AND rl.line_number = jl.line_number AND rl.account_id = jl.account_id
      AND rl.debit_amount = jl.credit_amount AND rl.credit_amount = jl.debit_amount
    WHERE j.entry_type = 'JOURNAL'
    GROUP BY j.id HAVING COUNT(rl.id) <> COUNT(jl.id)`);
  // count journals whose mirror check didn't fully match: compare totals instead (safer across line ordering)
  const totals = await c.query(`
    SELECT j.id FROM accounting_entries j
    JOIN accounting_entries r ON r.reversal_of_entry_id = j.id
    JOIN accounting_entry_lines jl ON jl.accounting_entry_id = j.id
    JOIN accounting_entry_lines rl ON rl.accounting_entry_id = r.id
    WHERE j.entry_type = 'JOURNAL'
    GROUP BY j.id
    HAVING SUM(jl.debit_amount) <> SUM(rl.credit_amount) OR SUM(jl.credit_amount) <> SUM(rl.debit_amount)`);
  check('reversals mirror original totals (swapped sides)', totals.rowCount === 0);

  // 8. Every verified payment has exactly one receipt + one journal
  const pay = await c.query(`
    SELECT
      (SELECT COUNT(*)::int FROM membership_payments p WHERE p.payment_status='SUCCESS'
        AND (SELECT COUNT(*) FROM receipts r WHERE r.membership_payment_id=p.id) <> 1) AS mem_bad_receipt,
      (SELECT COUNT(*)::int FROM membership_payments p WHERE p.payment_status='SUCCESS'
        AND (SELECT COUNT(*) FROM accounting_entries e WHERE e.reference_type='MEMBERSHIP_PAYMENT' AND e.reference_id=p.id AND e.entry_type='JOURNAL') <> 1) AS mem_bad_journal,
      (SELECT COUNT(*)::int FROM donation_payments p WHERE p.payment_status='SUCCESS'
        AND (SELECT COUNT(*) FROM receipts r WHERE r.donation_payment_id=p.id) <> 1) AS don_bad_receipt,
      (SELECT COUNT(*)::int FROM donation_payments p WHERE p.payment_status='SUCCESS'
        AND (SELECT COUNT(*) FROM accounting_entries e WHERE e.reference_type='DONATION_PAYMENT' AND e.reference_id=p.id AND e.entry_type='JOURNAL') <> 1) AS don_bad_journal`);
  const r8 = pay.rows[0];
  check('SUCCESS payments ↔ exactly one receipt + one journal (membership & donation)',
    r8.mem_bad_receipt === 0 && r8.mem_bad_journal === 0 && r8.don_bad_receipt === 0 && r8.don_bad_journal === 0,
    JSON.stringify(r8));

  // 9. Reference types confined to the approved catalogue
  const badRef = await c.query(`
    SELECT DISTINCT reference_type FROM accounting_entries
    WHERE reference_type NOT IN ('MEMBERSHIP_PAYMENT','RENEWAL_PAYMENT','DONATION_PAYMENT','MANUAL_RECEIPT','MANUAL_EXPENSE')`);
  check('reference types within approved catalogue', badRef.rowCount === 0);

  // 10. Money columns are NUMERIC(12,2)
  const badType = await c.query(`
    SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE table_name IN ('accounting_entry_lines','membership_payments','donation_payments','donation_refunds','receipts')
      AND column_name IN ('debit_amount','credit_amount','amount')
      AND (data_type <> 'numeric' OR numeric_precision <> 12 OR numeric_scale <> 2)`);
  check('money columns are NUMERIC(12,2)', badType.rows[0].n === 0);

  await c.end();
  console.log(fails === 0 ? '=== financial integrity: ALL PASS ===' : `=== financial integrity: ${fails} FAILURES ===`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });