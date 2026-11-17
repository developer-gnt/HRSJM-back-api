import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscriptionsSchema1790840000000 implements MigrationInterface {
  name = 'CreateSubscriptionsSchema1790840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by" uuid,
        "user_id" uuid,
        "subscription_id" character varying(100) NOT NULL UNIQUE,
        "subscription_session_id" character varying(255),
        "purpose" character varying(30) NOT NULL DEFAULT 'DONATION',
        "reference_id" character varying(150),
        "customer_name" character varying(100) NOT NULL,
        "customer_email" character varying(150),
        "customer_phone" character varying(20) NOT NULL,
        "plan_name" character varying(100) NOT NULL,
        "plan_type" character varying(30) NOT NULL DEFAULT 'PERIODIC',
        "frequency" character varying(20) NOT NULL DEFAULT 'MONTHLY',
        "currency" character varying(10) NOT NULL DEFAULT 'INR',
        "amount" numeric(12,2) NOT NULL,
        "max_amount" numeric(12,2) NOT NULL DEFAULT 5000,
        "auth_amount" numeric(12,2) NOT NULL DEFAULT 1,
        "status" character varying(30) NOT NULL DEFAULT 'INITIALIZED',
        "payment_methods" jsonb,
        "next_charge_date" TIMESTAMP WITH TIME ZONE,
        "last_charged_at" TIMESTAMP WITH TIME ZONE,
        "expiry_time" TIMESTAMP WITH TIME ZONE,
        "raw_details" jsonb,
        "metadata" jsonb,
        CONSTRAINT "PK_subscriptions_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_subscriptions_subscription_id" ON "subscriptions" ("subscription_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscriptions_user_id" ON "subscriptions" ("user_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscriptions_status" ON "subscriptions" ("status");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscriptions_purpose" ON "subscriptions" ("purpose");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions";`);
  }
}
