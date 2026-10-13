import * as bcrypt from 'bcryptjs';
import dataSource from '../data-source';

interface TestUserDefinition {
  fullName: string;
  email: string;
  mobile: string;
  password: string;
  roleName: 'ADMIN' | 'MEMBER' | 'DONOR' | 'DONATION_SEEKER' | 'USER';
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
    fullName: 'HRSJM Test User',
    email: 'user@hrsjm.org',
    mobile: '9888880005',
    password: 'UserPass#1',
    roleName: 'USER',
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

      // 3. Find if user exists by email or mobile
      const existingUser = await dataSource.query(
        `SELECT id FROM "users" WHERE "email" = $1 OR "mobile_number" = $2 LIMIT 1`,
        [testUser.email, testUser.mobile],
      );

      let userId: string;
      if (existingUser && existingUser.length > 0) {
        userId = existingUser[0].id;
        await dataSource.query(
          `UPDATE "users"
           SET "full_name" = $1,
               "email" = $2,
               "mobile_number" = $3,
               "password_hash" = $4,
               "status" = 'ACTIVE'
           WHERE "id" = $5`,
          [testUser.fullName, testUser.email, testUser.mobile, passwordHash, userId],
        );
      } else {
        const userResult = await dataSource.query(
          `INSERT INTO "users" ("full_name", "email", "mobile_number", "password_hash", "status")
           VALUES ($1, $2, $3, $4, 'ACTIVE')
           RETURNING "id"`,
          [testUser.fullName, testUser.email, testUser.mobile, passwordHash],
        );
        userId = userResult[0].id;
      }

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
