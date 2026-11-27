import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'Root',
  database: process.env.DATABASE_NAME || 'hrsjm',
  synchronize: false,
});

async function run() {
  await dataSource.initialize();
  console.log('Connected to DB');

  // 1. Inspect assistance requests
  const reqs = await dataSource.query(`SELECT id, full_name, mobile, status, requested_amount, reason, created_at FROM assistance_requests`);
  console.log(`Found ${reqs.length} assistance request records:`, reqs);

  // 2. Delete mock assistance requests (khan, KS,bs, 87349)
  const deletedDocs = await dataSource.query(`
    DELETE FROM documents 
    WHERE related_entity_type = 'ASSISTANCE_REQUEST' 
       OR related_entity_id IN ('3b856c7b-f375-4436-b284-1b34c1857de2', '3e19d710-9ddf-4ea4-a7cd-16ba88fd6dab', 'c5ac70b3-880e-4926-8626-5332440b1028')
    RETURNING id
  `);
  console.log(`Deleted ${deletedDocs.length} associated documents`);

  const deletedReqs = await dataSource.query(`
    DELETE FROM assistance_requests 
    WHERE id IN ('3b856c7b-f375-4436-b284-1b34c1857de2', '3e19d710-9ddf-4ea4-a7cd-16ba88fd6dab', 'c5ac70b3-880e-4926-8626-5332440b1028')
       OR full_name IN ('khan', 'KS,bs', '87349')
    RETURNING id, full_name
  `);
  console.log(`Deleted ${deletedReqs.length} mock assistance requests:`, deletedReqs);

  // 3. Inspect memberships
  const memberships = await dataSource.query(`SELECT id, membership_number, status, created_at FROM memberships`);
  console.log(`Found ${memberships.length} membership records:`, memberships);

  await dataSource.destroy();
  console.log('Cleanup finished successfully.');
}

run().catch((err) => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
