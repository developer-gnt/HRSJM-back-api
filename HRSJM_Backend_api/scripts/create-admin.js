/**
 * Creates or promotes a user to ADMIN directly in the database.
 * Usage: node scripts/create-admin.js <email> <password> [fullName]
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

async function main() {
  const [email, password, fullName] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: node scripts/create-admin.js <email> <password> [fullName]");
    process.exit(1);
  }

  const client = new Client({
    host: process.env.DATABASE_HOST || "localhost",
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER || "postgres",
    password: process.env.DATABASE_PASSWORD || "",
    database: process.env.DATABASE_NAME || "hrsjm",
  });
  await client.connect();

  const existing = await client.query("SELECT id, role FROM users WHERE email = $1", [email]);
  const hash = await bcrypt.hash(password, 10);

  if (existing.rows.length > 0) {
    await client.query("UPDATE users SET role = 'ADMIN', password_hash = $2 WHERE email = $1", [
      email,
      hash,
    ]);
    console.log(`Existing user promoted to ADMIN: ${email}`);
  } else {
    await client.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $3, $1, $2, 'ADMIN', 'ACTIVE', now(), now())`,
      [email, hash, fullName || "System Admin"],
    );
    console.log(`Admin created: ${email}`);
  }
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});