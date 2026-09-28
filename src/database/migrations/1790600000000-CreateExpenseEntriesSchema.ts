import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExpenseEntriesSchema1790600000000
  implements MigrationInterface
{
  name = 'CreateExpenseEntriesSchema1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "expense_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by" uuid,
        "voucher_number" character varying(30) NOT NULL,
        "expense_date" TIMESTAMP WITH TIME ZONE NOT NULL,
        "paid_to" character varying(150) NOT NULL,
        "expense_account_id" uuid NOT NULL,
        "paid_from_account_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "payment_method" character varying(50) NOT NULL DEFAULT 'BANK_TRANSFER',
        "reference_number" character varying(100),
        "description" text,
        "attachment_url" text,
        "status" character varying(20) NOT NULL DEFAULT 'POSTED',
        "accounting_entry_id" uuid,
        CONSTRAINT "PK_expense_entries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_expense_entries_voucher_number" ON "expense_entries" ("voucher_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_expense_entries_date" ON "expense_entries" ("expense_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_expense_entries_expense_account" ON "expense_entries" ("expense_account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_expense_entries_paid_from_account" ON "expense_entries" ("paid_from_account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_expense_entries_status" ON "expense_entries" ("status")`,
    );

    await queryRunner.query(`
      ALTER TABLE "expense_entries"
      ADD CONSTRAINT "FK_expense_entries_expense_account"
      FOREIGN KEY ("expense_account_id") REFERENCES "accounts"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_entries"
      ADD CONSTRAINT "FK_expense_entries_paid_from_account"
      FOREIGN KEY ("paid_from_account_id") REFERENCES "accounts"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_entries"
      ADD CONSTRAINT "FK_expense_entries_accounting_entry"
      FOREIGN KEY ("accounting_entry_id") REFERENCES "accounting_entries"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Sequence for voucher numbers (EXP-YYYYMMDD-#####)
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS "expense_voucher_number_seq" START 1`,
    );

    // Seed permissions for the expense entries module
    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "name", "description") VALUES
        ('00000000-0000-4000-8000-000000000801', 'expense.read', 'View and list expense vouchers'),
        ('00000000-0000-4000-8000-000000000802', 'expense.create', 'Create expense vouchers and post ledger journals'),
        ('00000000-0000-4000-8000-000000000803', 'expense.update', 'Update expense voucher details'),
        ('00000000-0000-4000-8000-000000000804', 'expense.manage_status', 'Cancel/void expense vouchers and reverse ledger entries')
      ON CONFLICT ("name") DO NOTHING
    `);

    // Grant newly added permissions to the baseline ADMIN role
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000004', "id" FROM "permissions"
      WHERE "id" IN (
        '00000000-0000-4000-8000-000000000801',
        '00000000-0000-4000-8000-000000000802',
        '00000000-0000-4000-8000-000000000803',
        '00000000-0000-4000-8000-000000000804'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" WHERE "permission_id" IN (
        '00000000-0000-4000-8000-000000000801',
        '00000000-0000-4000-8000-000000000802',
        '00000000-0000-4000-8000-000000000803',
        '00000000-0000-4000-8000-000000000804'
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "id" IN (
        '00000000-0000-4000-8000-000000000801',
        '00000000-0000-4000-8000-000000000802',
        '00000000-0000-4000-8000-000000000803',
        '00000000-0000-4000-8000-000000000804'
      )
    `);

    await queryRunner.query(`DROP SEQUENCE IF EXISTS "expense_voucher_number_seq"`);
    await queryRunner.query(
      `ALTER TABLE "expense_entries" DROP CONSTRAINT "FK_expense_entries_accounting_entry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_entries" DROP CONSTRAINT "FK_expense_entries_paid_from_account"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_entries" DROP CONSTRAINT "FK_expense_entries_expense_account"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_entries"`);
  }
}
