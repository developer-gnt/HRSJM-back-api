/**
 * Phase 13 — backfill accounting journals for membership payments that were
 * verified BEFORE the Phase 6 posting hook was wired (legacy data gap).
 * Uses the production AccountingPostingService so the posted entries are
 * identical to what verify() posts today, and links the receipts.
 * Run: npx ts-node test/backfill-legacy-payments.ts
 */
import 'dotenv/config';
import dataSource from '../src/database/data-source';
import { AccountingPostingService } from '../src/modules/accounting/services/accounting-posting.service';
import { ReferenceType } from '../src/modules/accounting/enums/accounting.enums';
import { ACCOUNT_CODES } from '../src/modules/accounting/accounting.constants';

(async () => {
  await dataSource.initialize();
  const posting = new AccountingPostingService();

  const missing: { id: string; amount: string; payment_method: string }[] =
    await dataSource.query(`
      SELECT p.id, p.amount, p.payment_method
      FROM membership_payments p
      WHERE p.payment_status = 'SUCCESS'
        AND NOT EXISTS (
          SELECT 1 FROM accounting_entries e
          WHERE e.reference_type = 'MEMBERSHIP_PAYMENT'
            AND e.reference_id = p.id AND e.entry_type = 'JOURNAL')`);

  console.log(`legacy SUCCESS payments without journal: ${missing.length}`);

  for (const p of missing) {
    const amount = Math.round(parseFloat(p.amount) * 100) / 100;
    await dataSource.transaction(async (manager) => {
      const entry = await posting.postEntry(manager, {
        entry_date: new Date(),
        reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
        reference_id: p.id,
        description: `Backfill: membership payment verified via ${p.payment_method} (posted after Phase 6 wiring)`,
        lines: [
          {
            account_code:
              p.payment_method === 'CASH' ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK,
            debit_amount: amount,
            credit_amount: 0,
            line_description: `Membership payment received (${p.payment_method})`,
          },
          {
            account_code: ACCOUNT_CODES.MEMBERSHIP_INCOME,
            debit_amount: 0,
            credit_amount: amount,
            line_description: 'Membership fee income',
          },
        ],
        acting_user_id: null,
      });
      await manager.query(
        `UPDATE receipts SET accounting_entry_id = $1 WHERE membership_payment_id = $2 AND accounting_entry_id IS NULL`,
        [entry.id, p.id],
      );
      console.log(`backfilled ${p.id}: ${entry.entry_number}`);
    });
  }

  await dataSource.destroy();
  console.log('backfill complete');
  process.exit(0);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});