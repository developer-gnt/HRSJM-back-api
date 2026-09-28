import * as bcrypt from 'bcryptjs';
import dataSource from '../data-source';

interface TestUserDefinition {
  fullName: string;
  email: string;
  mobile: string;
  password: string;
  roleName: 'ADMIN' | 'MEMBER' | 'DONOR' | 'DONATION_SEEKER';
}

const TEST_USERS: TestUserDefinition[] = [
  {
    fullName: 'HRSJM Test Admin',
    email: 'admin@hrsjm.org',
    mobile: '9888880001',
    password: 'AdminPass#1',
    roleName: 'ADMIN',
  },
  {
    fullName: 'HRSJM Test Member',
    email: 'member@hrsjm.org',
    mobile: '9888880002',
    password: 'MemberPass#1',
    roleName: 'MEMBER',
  },
  {
    fullName: 'HRSJM Test Donor',
    email: 'donor@hrsjm.org',
    mobile: '9888880003',
    password: 'DonorPass#1',
    roleName: 'DONOR',
  },
  {
    fullName: 'HRSJM Test Seeker',
    email: 'seeker@hrsjm.org',
    mobile: '9888880004',
    password: 'SeekerPass#1',
    roleName: 'DONATION_SEEKER',
  },
];

async function seedTestUsers(): Promise<void> {
  console.log('--- Initializing database connection for test user seeding ---');
  await dataSource.initialize();

  try {
    const summary: Array<{
      Role: string;
      Email: string;
      Mobile: string;
      Password: string;
      UserId: string;
      RoleId: string;
    }> = [];

    for (const testUser of TEST_USERS) {
      // 1. Fetch the role ID dynamically by name
      const roleResult = await dataSource.query(
        `SELECT id, name FROM roles WHERE name = $1`,
        [testUser.roleName],
      );

      if (!roleResult || roleResult.length === 0) {
        console.error(`Role "${testUser.roleName}" not found in database! Make sure migrations have run.`);
        continue;
      }
      const roleId = roleResult[0].id;

      // 2. Hash the password
      const passwordHash = await bcrypt.hash(testUser.password, 10);

      // 3. Insert or update the user
      const userResult = await dataSource.query(
        `INSERT INTO "users" ("full_name", "email", "mobile_number", "password_hash", "status")
         VALUES ($1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT ("mobile_number") DO UPDATE
         SET "full_name" = EXCLUDED."full_name",
             "email" = EXCLUDED."email",
             "password_hash" = EXCLUDED."password_hash",
             "status" = 'ACTIVE'
         RETURNING "id"`,
        [testUser.fullName, testUser.email, testUser.mobile, passwordHash],
      );
      const userId = userResult[0].id;

      // 4. Assign role in user_roles
      await dataSource.query(
        `INSERT INTO "user_roles" ("user_id", "role_id")
         VALUES ($1, $2)
         ON CONFLICT ("user_id", "role_id") DO NOTHING`,
        [userId, roleId],
      );

      summary.push({
        Role: testUser.roleName,
        Email: testUser.email,
        Mobile: testUser.mobile,
        Password: testUser.password,
        UserId: userId,
        RoleId: roleId,
      });
    }

    console.log('\n================ TEST USERS SEEDED SUCCESSFULLY ================');
    console.table(summary);
    console.log('=================================================================\n');
  } catch (error) {
    console.error('Failed to seed test users:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

seedTestUsers();
