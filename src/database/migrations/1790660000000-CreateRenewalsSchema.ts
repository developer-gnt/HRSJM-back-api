import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRenewalsSchema1790660000000 implements MigrationInterface {
  name = 'CreateRenewalsSchema1790660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "membership_renewals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by" uuid,
        "membership_id" uuid NOT NULL,
        "requested_by" uuid NOT NULL,
        "period_years" integer NOT NULL DEFAULT 1,
        "amount" numeric(12,2) NOT NULL,
        "payment_method" character varying(50) NOT NULL DEFAULT 'CASH',
        "transaction_id" character varying(100),
        "payment_status" character varying(30) NOT NULL DEFAULT 'PENDING',
        "status" character varying(30) NOT NULL DEFAULT 'PENDING',
        "receipt_number" character varying(50),
        "previous_expiry" date,
        "new_expiry" date,
        "admin_remark" text,
        "member_note" text,
        "reviewed_by" uuid,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_membership_renewals" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_membership_renewals_membership_id" ON "membership_renewals" ("membership_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_membership_renewals_status" ON "membership_renewals" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_membership_renewals_requested_by" ON "membership_renewals" ("requested_by")`,
    );

    await queryRunner.query(`
      ALTER TABLE "membership_renewals"
      ADD CONSTRAINT "FK_renewals_membership"
      FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "membership_renewals"
      ADD CONSTRAINT "FK_renewals_requested_by"
      FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "membership_renewals"
      ADD CONSTRAINT "FK_renewals_reviewed_by"
      FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Seed permissions for renewals
    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "name", "description") VALUES
        (uuid_generate_v4(), 'renewal.read', 'View membership renewal requests'),
        (renewal_create_id: uuid_generate_v4(), 'renewal.create', 'Submit membership renewal requests'),
        (renewal_manage_id: uuid_generate_v4(), 'renewal.manage', 'Approve, reject, or process renewal requests')
      ON CONFLICT ("name") DO NOTHING
    `.replace('renewal_create_id: ', '').replace('renewal_manage_id: ', ''));

    // Grant newly added permissions to the baseline ADMIN role
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id FROM "roles" r, "permissions" p
      WHERE r.name = 'ADMIN'
        AND p.name IN (
          'renewal.read',
          'renewal.create',
          'renewal.manage'
        )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "name" IN (
          'renewal.read',
          'renewal.create',
          'renewal.manage'
        )
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "name" IN (
        'renewal.read',
        'renewal.create',
        'renewal.manage'
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "membership_renewals" DROP CONSTRAINT "FK_renewals_reviewed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "membership_renewals" DROP CONSTRAINT "FK_renewals_requested_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "membership_renewals" DROP CONSTRAINT "FK_renewals_membership"`,
    );
    await queryRunner.query(`DROP TABLE "membership_renewals"`);
  }
}
