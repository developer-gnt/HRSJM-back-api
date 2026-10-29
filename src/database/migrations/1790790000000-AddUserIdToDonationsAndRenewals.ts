import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdToDonationsAndRenewals1790790000000 implements MigrationInterface {
  name = 'AddUserIdToDonationsAndRenewals1790790000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add user_id column and foreign key to donations table
    await queryRunner.query(
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "user_id" uuid;`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_donations_user_id" ON "donations" ("user_id");`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_donations_user'
        ) THEN
          ALTER TABLE "donations"
          ADD CONSTRAINT "FK_donations_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // 2. Add user_id column and foreign key to membership_renewals table
    await queryRunner.query(
      `ALTER TABLE "membership_renewals" ADD COLUMN IF NOT EXISTS "user_id" uuid;`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_membership_renewals_user_id" ON "membership_renewals" ("user_id");`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_renewals_user'
        ) THEN
          ALTER TABLE "membership_renewals"
          ADD CONSTRAINT "FK_renewals_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Synchronize membership_renewals user_id from requested_by
    await queryRunner.query(
      `UPDATE "membership_renewals" SET "user_id" = "requested_by" WHERE "user_id" IS NULL AND "requested_by" IS NOT NULL;`,
    );

    // 3. Backfill donations.user_id from donation_payments
    await queryRunner.query(`
      UPDATE "donations" d
      SET "user_id" = dp.user_id
      FROM "donation_payments" dp
      WHERE dp.donation_id = d.id AND dp.user_id IS NOT NULL AND d.user_id IS NULL;
    `);

    // 4. Backfill donations.user_id by matching donor_mobile with users.mobile_number
    await queryRunner.query(`
      UPDATE "donations" d
      SET "user_id" = u.id
      FROM "users" u
      WHERE d.user_id IS NULL
        AND d.donor_mobile IS NOT NULL
        AND (u.mobile_number = d.donor_mobile OR RIGHT(u.mobile_number, 10) = RIGHT(d.donor_mobile, 10));
    `);

    // 5. Backfill donation_payments.user_id from matched donations
    await queryRunner.query(`
      UPDATE "donation_payments" dp
      SET "user_id" = d.user_id
      FROM "donations" d
      WHERE dp.donation_id = d.id AND dp.user_id IS NULL AND d.user_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "membership_renewals" DROP CONSTRAINT IF EXISTS "FK_renewals_user";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_membership_renewals_user_id";`);
    await queryRunner.query(`ALTER TABLE "membership_renewals" DROP COLUMN IF EXISTS "user_id";`);

    await queryRunner.query(`ALTER TABLE "donations" DROP CONSTRAINT IF EXISTS "FK_donations_user";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_donations_user_id";`);
    await queryRunner.query(`ALTER TABLE "donations" DROP COLUMN IF EXISTS "user_id";`);
  }
}

