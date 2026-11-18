import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferralSystemAndCodes1790810000000 implements MigrationInterface {
  name = 'AddReferralSystemAndCodes1790810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add referral columns to memberships table
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "referral_code" varchar(10)`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "referred_by_id" uuid REFERENCES "memberships"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "referred_by_code" varchar(10)`,
    );

    // Create unique constraint and indexes on memberships
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_memberships_referral_code" ON "memberships" ("referral_code") WHERE "referral_code" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_memberships_referred_by_id" ON "memberships" ("referred_by_id")`,
    );

    // 2. Create membership_referrals table to track referral records and free renewal status
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "membership_referrals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "referrer_membership_id" uuid NOT NULL,
        "referrer_user_id" uuid NOT NULL,
        "referred_membership_id" uuid NOT NULL,
        "referral_code" varchar(10) NOT NULL,
        "category_name" varchar(255),
        "reward_years" integer NOT NULL DEFAULT 1,
        "status" varchar(30) NOT NULL DEFAULT 'PENDING',
        "free_renewal_applied" boolean NOT NULL DEFAULT false,
        "renewal_id" uuid,
        "reward_applied_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_membership_referrals" PRIMARY KEY ("id"),
        CONSTRAINT "fk_referrals_referrer_membership" FOREIGN KEY ("referrer_membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_referrals_referrer_user" FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_referrals_referred_membership" FOREIGN KEY ("referred_membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_referrals_renewal" FOREIGN KEY ("renewal_id") REFERENCES "membership_renewals"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_referrals_referrer_membership_id" ON "membership_referrals" ("referrer_membership_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_referrals_referrer_user_id" ON "membership_referrals" ("referrer_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_referrals_referred_membership_id" ON "membership_referrals" ("referred_membership_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_referrals_referral_code" ON "membership_referrals" ("referral_code")`,
    );

    // 3. Generate unique 6-digit numeric referral codes for any existing active/approved memberships without one
    await queryRunner.query(`
      DO $$
      DECLARE
        rec RECORD;
        new_code TEXT;
      BEGIN
        FOR rec IN SELECT id FROM "memberships" WHERE "referral_code" IS NULL AND "status" IN ('ACTIVE', 'APPROVED') LOOP
          LOOP
            new_code := (FLOOR(100000 + RANDOM() * 900000))::TEXT;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM "memberships" WHERE "referral_code" = new_code);
          END LOOP;
          UPDATE "memberships" SET "referral_code" = new_code WHERE "id" = rec.id;
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "membership_referrals"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_memberships_referral_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_memberships_referred_by_id"`);
    await queryRunner.query(`ALTER TABLE "memberships" DROP COLUMN IF EXISTS "referred_by_code"`);
    await queryRunner.query(`ALTER TABLE "memberships" DROP COLUMN IF EXISTS "referred_by_id"`);
    await queryRunner.query(`ALTER TABLE "memberships" DROP COLUMN IF EXISTS "referral_code"`);
  }
}

