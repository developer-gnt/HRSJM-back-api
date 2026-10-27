const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'hrsjm',
});

// All mock data has been purged. Verified cases are submitted exclusively via live portal.
const URGENT_SEEKER_CASES = [];

async function main() {
  await client.connect();

  // Purge any legacy mock assistance requests
  const mockNames = ['Suresh Sharma', 'Amina Khatun', 'Ramesh Patil', 'Sunita Kamble'];
  const deleteRes = await client.query(
    'DELETE FROM assistance_requests WHERE full_name = ANY($1) RETURNING id, full_name, reason;',
    [mockNames]
  );
  if (deleteRes.rows.length > 0) {
    console.log(`Purged ${deleteRes.rows.length} mock assistance records:`, deleteRes.rows);
  } else {
    console.log('No mock assistance records found in database.');
  }

  const all = await client.query('SELECT id, full_name, reason, requested_amount, status FROM assistance_requests;');
  console.log('Total verified assistance requests in DB:', all.rows.length);
  console.log(JSON.stringify(all.rows, null, 2));

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
