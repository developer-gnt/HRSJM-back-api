const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'Root',
  database: 'hrsjm',
});

const URGENT_SEEKER_CASES = [
  {
    full_name: 'Suresh Sharma',
    mobile: '9876543210',
    email: 'suresh.sharma@example.com',
    requested_amount: 500000.00,
    reason: 'Medical Assistance',
    description: 'Support for Heart Surgery for a 7-year-old Child in critical pediatric care.',
  },
  {
    full_name: 'Amina Khatun',
    mobile: '9876543211',
    email: 'amina.khatun@example.com',
    requested_amount: 100000.00,
    reason: 'Educational Assistance',
    description: 'Help for School Fees, Uniforms and Educational Supplies for underprivileged students.',
  },
  {
    full_name: 'Ramesh Patil',
    mobile: '9876543212',
    email: 'ramesh.patil@example.com',
    requested_amount: 500000.00,
    reason: 'Disaster Relief',
    description: 'Relief Support for Flood Affected Families in Kolhapur, Maharashtra.',
  },
  {
    full_name: 'Sunita Kamble',
    mobile: '9876543213',
    email: 'sunita.kamble@example.com',
    requested_amount: 400000.00,
    reason: 'Housing & Rehabilitation',
    description: 'Assistance to Rebuild a Home After Structural Building Collapse in Ratnagiri.',
  },
];

async function main() {
  await client.connect();

  // Find seeker user
  const userRes = await client.query("SELECT id FROM users WHERE email = 'seeker@hrsjm.org' LIMIT 1;");
  const seekerUserId = userRes.rows[0]?.id || '08606599-ccb1-43ec-92e5-48e8e1e94442';

  // Find admin user
  const adminRes = await client.query("SELECT id FROM users WHERE email = 'admin@hrsjm.org' LIMIT 1;");
  const adminUserId = adminRes.rows[0]?.id || '6b481b29-d4ec-4bad-8bde-4e21d8bb2d26';

  for (const c of URGENT_SEEKER_CASES) {
    const existing = await client.query(
      'SELECT id FROM assistance_requests WHERE reason = $1 AND full_name = $2 LIMIT 1;',
      [c.reason, c.full_name]
    );

    if (existing.rows.length === 0) {
      const insert = await client.query(
        `INSERT INTO assistance_requests
          (id, user_id, full_name, mobile, email, requested_amount, reason, description, status, reviewed_by, reviewed_at, created_at, updated_at)
         VALUES
          (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'APPROVED', $8, NOW(), NOW(), NOW())
         RETURNING id, full_name, reason, requested_amount;`,
        [seekerUserId, c.full_name, c.mobile, c.email, c.requested_amount, c.reason, c.description, adminUserId]
      );
      console.log('Inserted seeker case:', insert.rows[0]);
    } else {
      console.log('Already exists:', c.reason, c.full_name);
    }
  }

  const all = await client.query('SELECT id, full_name, reason, requested_amount, status FROM assistance_requests;');
  console.log('Total assistance_requests in DB:', all.rows.length);
  console.log(JSON.stringify(all.rows, null, 2));

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
