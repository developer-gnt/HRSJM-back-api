/**
 * Idempotent demo seed for local development and the smoke suite.
 * Usage: node scripts/seed.js
 *
 * Accounts (all ACTIVE):
 *   admin@hrsjm.org      ADMIN             Admin@12345
 *   aisha@example.com    MEMBER            Str0ngP@ss      + ACTIVE REGULAR membership
 *   rahim@example.com    DONOR             D0norP@ss
 *   nasreen@example.com  DONATION_SEEKER   S33kerP@ss
 *
 * Safe to re-run: existing accounts get their role/status/password aligned,
 * and the membership is only created when the member has none.
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

const ACCOUNTS = [
  { email: "admin@hrsjm.org", password: "Admin@12345", fullName: "HRSJM Admin", role: "ADMIN" },
  { email: "aisha@example.com", password: "Str0ngP@ss", fullName: "Aisha Rahman", role: "MEMBER" },
  { email: "rahim@example.com", password: "D0norP@ss", fullName: "Rahim Uddin", role: "DONOR" },
  { email: "nasreen@example.com", password: "S33kerP@ss", fullName: "Nasreen Akter", role: "DONATION_SEEKER" },
];

async function main() {
  const client = new Client({
    host: process.env.DATABASE_HOST || "localhost",
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER || "postgres",
    password: process.env.DATABASE_PASSWORD || "",
    database: process.env.DATABASE_NAME || "hrsjm",
  });
  await client.connect();

  for (const account of ACCOUNTS) {
    const hash = await bcrypt.hash(account.password, 10);
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [account.email]);
    let userId;
    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      await client.query(
        `UPDATE users SET role = $2, status = 'ACTIVE', password_hash = $3, full_name = $4 WHERE id = $1`,
        [userId, account.role, hash, account.fullName],
      );
      console.log(`aligned: ${account.email} (${account.role})`);
    } else {
      const inserted = await client.query(
        `INSERT INTO users (id, full_name, email, password_hash, role, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $2, $1, $3, $4, 'ACTIVE', now(), now()) RETURNING id`,
        [account.email, account.fullName, hash, account.role],
      );
      userId = inserted.rows[0].id;
      console.log(`created: ${account.email} (${account.role})`);
    }

    if (account.role === "MEMBER") {
      const memberships = await client.query("SELECT id FROM memberships WHERE user_id = $1", [userId]);
      if (memberships.rows.length === 0) {
        const year = new Date().getFullYear();
        const serial = await client.query(
          `SELECT entry FROM (
             SELECT COALESCE(MAX(SUBSTRING(membership_number FROM 12)::int), 0) + 1 AS entry
             FROM memberships WHERE membership_number LIKE $1
           ) s`,
          [`HRSJM-${year}-%`],
        );
        const number = `HRSJM-${year}-${String(serial.rows[0].entry).padStart(5, "0")}`;
        const today = new Date().toISOString().slice(0, 10);
        const expiry = `${year}-12-31`;
        await client.query(
          `INSERT INTO memberships (id, membership_number, user_id, category, status, joining_date, expiry_date, fee_amount, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'REGULAR', 'ACTIVE', $3, $4, '500.00', now(), now())`,
          [number, userId, today, expiry],
        );
        console.log(`membership: ${number} for ${account.email}`);
      } else {
        console.log(`membership exists for ${account.email}`);
      }
    }
  }

  await client.end();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});