import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'hrsjm',
  entities: ['src/**/*.entity.ts'],
  synchronize: false,
});

async function run() {
  await dataSource.initialize();
  console.log('Connected to DB');

  // Count existing expense records
  const expenses = await dataSource.query(`SELECT id, voucher_number, paid_to, amount, expense_date, accounting_entry_id FROM expense_entries ORDER BY created_at DESC`);
  console.log(`Found ${expenses.length} expense records:`, expenses);

  // Delete accounting entry lines for expenses
  await dataSource.query(`
    DELETE FROM journal_lines 
    WHERE entry_id IN (
      SELECT accounting_entry_id FROM expense_entries WHERE accounting_entry_id IS NOT NULL
    )
  `);

  // Delete accounting entries for expenses
  await dataSource.query(`
    DELETE FROM accounting_entries 
    WHERE id IN (
      SELECT accounting_entry_id FROM expense_entries WHERE accounting_entry_id IS NOT NULL
    ) OR reference_type = 'MANUAL_EXPENSE'
  `);

  // Delete expense entries
  await dataSource.query(`DELETE FROM expense_entries`);

  // Reset voucher sequence
  await dataSource.query(`ALTER SEQUENCE expense_voucher_number_seq RESTART WITH 1`);

  console.log('Cleaned all test/mock expense entries and reset sequence to 1');
  await dataSource.destroy();
}

run().catch(console.error);
