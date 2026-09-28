import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReceiptEntriesSchema1790610000000
  implements MigrationInterface
{
  name = 'CreateReceiptEntriesSchema1790610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "receipt_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by" uuid,
        "voucher_number" character varying(30) NOT NULL,
        "receipt_date" TIMESTAMP WITH TIME ZONE NOT NULL,
        "received_from" character varying(150) NOT NULL,
        "income_account_id" uuid NOT NULL,
        "received_in_account_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "payment_method" character varying(50) NOT NULL DEFAULT 'BANK_TRANSFER',
        "reference_number" character varying(100),
        "description" text,
        "attachment_url" text,
        "status" character varying(20) NOT NULL DEFAULT 'POSTED',
        "accounting_entry_id" uuid,
        CONSTRAINT "PK_receipt_entries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_receipt_entries_voucher_number" ON "receipt_entries" ("voucher_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_receipt_entries_date" ON "receipt_entries" ("receipt_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_receipt_entries_income_account" ON "receipt_entries" ("income_account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_receipt_entries_received_in_account" ON "receipt_entries" ("received_in_account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_receipt_entries_status" ON "receipt_entries" ("status")`,
    );

    await queryRunner.query(`
      ALTER TABLE "receipt_entries"
      ADD CONSTRAINT "FK_receipt_entries_income_account"
      FOREIGN KEY ("income_account_id") REFERENCES "accounts"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "receipt_entries"
      ADD CONSTRAINT "FK_receipt_entries_received_in_account"
      FOREIGN KEY ("received_in_account_id") REFERENCES "accounts"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "receipt_entries"
      ADD CONSTRAINT "FK_receipt_entries_accounting_entry"
      FOREIGN KEY ("accounting_entry_id") REFERENCES "accounting_entries"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Sequence for voucher numbers (REC-YYYYMMDD-#####)
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS "receipt_voucher_number_seq" START 1`,
    );

    // Seed permissions for the receipt entries module
    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "name", "description") VALUES
        ('00000000-0000-4000-8000-000000000811', 'receipt_entry.read', 'View and list receipt vouchers'),
        ('00000000-0000-4000-8000-000000000812', 'receipt_entry.create', 'Create receipt vouchers and post ledger journals'),
        ('00000000-0000-4000-8000-000000000813', 'receipt_entry.update', 'Update receipt voucher details'),
        ('00000000-0000-4000-8000-000000000814', 'receipt_entry.manage_status', 'Cancel/void receipt vouchers and reverse ledger entries')
      ON CONFLICT ("name") DO NOTHING
    `);

    // Grant newly added permissions to the baseline ADMIN role
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000004', "id" FROM "permissions"
      WHERE "id" IN (
        '00000000-0000-4000-8000-000000000811',
        '00000000-0000-4000-8000-000000000812',
        '00000000-0000-4000-8000-000000000813',
        '00000000-0000-4000-8000-000000000814'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" WHERE "permission_id" IN (
        '00000000-0000-4000-8000-000000000811',
        '00000000-0000-4000-8000-000000000812',
        '00000000-0000-4000-8000-000000000813',
        '00000000-0000-4000-8000-000000000814'
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "id" IN (
        '00000000-0000-4000-8000-000000000811',
        '00000000-0000-4000-8000-000000000812',
        '00000000-0000-4000-8000-000000000813',
        '00000000-0000-4000-8000-000000000814'
      )
    `);

    await queryRunner.query(`DROP SEQUENCE IF EXISTS "receipt_voucher_number_seq"`);
    await queryRunner.query(
      `ALTER TABLE "receipt_entries" DROP CONSTRAINT "FK_receipt_entries_accounting_entry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_entries" DROP CONSTRAINT "FK_receipt_entries_received_in_account"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_entries" DROP CONSTRAINT "FK_receipt_entries_income_account"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "receipt_entries"`);
  }
}
