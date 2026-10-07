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
  synchronize: false,
});

async function run() {
  await dataSource.initialize();
  console.log('Connected to PostgreSQL database');

  // 1. Unlink FK reference from expense_entries & receipt_entries
  await dataSource.query(`UPDATE expense_entries SET accounting_entry_id = NULL`);
  await dataSource.query(`UPDATE receipt_entries SET accounting_entry_id = NULL`);

  // 2. Delete lines for manual expense/receipt entries
  await dataSource.query(`
    DELETE FROM accounting_entry_lines 
    WHERE accounting_entry_id IN (
      SELECT id FROM accounting_entries 
      WHERE reference_type IN ('MANUAL_EXPENSE', 'MANUAL_RECEIPT')
    )
  `);

  // 3. Delete accounting entries
  await dataSource.query(`
    DELETE FROM accounting_entries 
    WHERE reference_type IN ('MANUAL_EXPENSE', 'MANUAL_RECEIPT')
  `);

  // 4. Delete all expense entries
  const deletedExpenses = await dataSource.query(`DELETE FROM expense_entries RETURNING id`);
  console.log(`Deleted ${deletedExpenses.length} mock expense entries.`);

  // 5. Delete all receipt entries
  const deletedReceipts = await dataSource.query(`DELETE FROM receipt_entries RETURNING id`);
  console.log(`Deleted ${deletedReceipts.length} mock receipt entries.`);

  // 6. Reset sequences
  await dataSource.query(`ALTER SEQUENCE IF EXISTS expense_voucher_number_seq RESTART WITH 1`);
  await dataSource.query(`ALTER SEQUENCE IF EXISTS receipt_voucher_number_seq RESTART WITH 1`);

  console.log('All mock data has been purged and voucher sequences reset to 1!');
  await dataSource.destroy();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
