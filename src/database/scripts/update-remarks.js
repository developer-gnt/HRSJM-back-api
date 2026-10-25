const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'hrsjm',
    user: 'postgres',
    password: 'Root',
  });

  await client.connect();

  const res = await client.query(
    "UPDATE donations SET remark = 'Donation from Website' WHERE remark IS NULL"
  );
  console.log(`Updated ${res.rowCount} donation records with 'Donation from Website'.`);

  const countRes = await client.query(
    "SELECT count(*) FROM donations WHERE remark = 'Donation from Website'"
  );
  console.log(`Total website donations now: ${countRes.rows[0].count}`);

  await client.end();
}

main().catch(console.error);
