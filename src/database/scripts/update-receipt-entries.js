const { Client } = require('pg');
const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'Root',
  database: 'hrsjm',
});
async function main() {
  await client.connect();
  const updateRes = await client.query(`
    UPDATE receipt_entries
    SET description = '[Website Donation] ' || description || ' | Source: Donation from Website'
    WHERE description LIKE '%Donation for Cause:%' AND description NOT LIKE '%[Website Donation]%';
  `);
  console.log('Updated receipt_entries rows:', updateRes.rowCount);
  const rows = await client.query('SELECT voucher_number, received_from, amount, description FROM receipt_entries ORDER BY created_at DESC LIMIT 6;');
  console.log(JSON.stringify(rows.rows, null, 2));
  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
