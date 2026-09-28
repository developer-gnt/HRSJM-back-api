import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAccountingSchema1790576732843 implements MigrationInterface {
    name = 'CreateAccountingSchema1790576732843'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "account_code" character varying(20), "account_name" character varying(100) NOT NULL, "account_type" character varying(20) NOT NULL, "parent_account_id" uuid, "description" text, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_accounts_parent" ON "accounts" ("parent_account_id") `);
        await queryRunner.query(`CREATE INDEX "idx_accounts_type" ON "accounts" ("account_type") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_accounts_account_code" ON "accounts" ("account_code") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_accounts_account_name" ON "accounts" ("account_name") `);
        await queryRunner.query(`CREATE TABLE "accounting_entry_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "accounting_entry_id" uuid NOT NULL, "account_id" uuid NOT NULL, "debit_amount" numeric(12,2) NOT NULL DEFAULT '0', "credit_amount" numeric(12,2) NOT NULL DEFAULT '0', "line_description" text, "line_number" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_78a04e50fcecdeb369837bc5157" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_accounting_entry_lines_account_id" ON "accounting_entry_lines" ("account_id") `);
        await queryRunner.query(`CREATE INDEX "idx_accounting_entry_lines_entry_id" ON "accounting_entry_lines" ("accounting_entry_id") `);
        await queryRunner.query(`CREATE TABLE "accounting_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "entry_number" character varying(30) NOT NULL, "entry_date" TIMESTAMP WITH TIME ZONE NOT NULL, "entry_type" character varying(20) NOT NULL DEFAULT 'JOURNAL', "reference_type" character varying(30) NOT NULL, "reference_id" uuid NOT NULL, "description" text NOT NULL, "reversal_of_entry_id" uuid, CONSTRAINT "PK_8dcbcc1f2a74f3cd60630422e44" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_accounting_entries_reversal" ON "accounting_entries" ("reversal_of_entry_id") WHERE "reversal_of_entry_id" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_accounting_entries_reference_journal" ON "accounting_entries" ("reference_type", "reference_id") WHERE "entry_type" = 'JOURNAL'`);
        await queryRunner.query(`CREATE INDEX "idx_accounting_entries_reversal_of" ON "accounting_entries" ("reversal_of_entry_id") `);
        await queryRunner.query(`CREATE INDEX "idx_accounting_entries_type" ON "accounting_entries" ("entry_type") `);
        await queryRunner.query(`CREATE INDEX "idx_accounting_entries_reference" ON "accounting_entries" ("reference_type", "reference_id") `);
        await queryRunner.query(`CREATE INDEX "idx_accounting_entries_date" ON "accounting_entries" ("entry_date") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_accounting_entries_entry_number" ON "accounting_entries" ("entry_number") `);
        await queryRunner.query(`ALTER TABLE "accounts" ADD CONSTRAINT "FK_82655922433e50df4fd451d5240" FOREIGN KEY ("parent_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "accounting_entry_lines" ADD CONSTRAINT "FK_496ee44916652a783daaf24c332" FOREIGN KEY ("accounting_entry_id") REFERENCES "accounting_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "accounting_entry_lines" ADD CONSTRAINT "FK_18c5385035d45ee4a2e32f93488" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "accounting_entries" ADD CONSTRAINT "FK_f2c1ae43d3811b48aeccf038500" FOREIGN KEY ("reversal_of_entry_id") REFERENCES "accounting_entries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

        // Sequence backing entry numbers (JE-YYYYMMDD-#####)
        await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "accounting_entry_number_seq" START 1`);

        // Baseline Chart of Accounts (minimal money-flow set — the final
        // HRSJM chart is TBC; see memory.md open questions). Fixed UUIDs,
        // 7xx ID block: permissions 701-707, accounts 751-757.
        await queryRunner.query(`INSERT INTO "accounts" ("id", "account_code", "account_name", "account_type", "description", "is_active") VALUES
            ('00000000-0000-4000-8000-000000000751', '1001', 'Bank', 'ASSET', 'Bank account for all online/gateway receipts and payments', true),
            ('00000000-0000-4000-8000-000000000752', '1002', 'Cash', 'ASSET', 'Cash-in-hand account for offline receipts and payments', true),
            ('00000000-0000-4000-8000-000000000753', '4001', 'Membership Income', 'INCOME', 'Income from new membership fees', true),
            ('00000000-0000-4000-8000-000000000754', '4002', 'Renewal Income', 'INCOME', 'Income from membership renewal fees', true),
            ('00000000-0000-4000-8000-000000000755', '4003', 'Donation Income', 'INCOME', 'Income from donations', true),
            ('00000000-0000-4000-8000-000000000756', '4004', 'Other Income', 'INCOME', 'Miscellaneous income (manual receipts)', true),
            ('00000000-0000-4000-8000-000000000757', '5001', 'Other Expenses', 'EXPENSE', 'General operational expenses', true)
            ON CONFLICT ("id") DO NOTHING`);

        // Seed permissions for the accounting module
        await queryRunner.query(`INSERT INTO "permissions" ("id", "name", "description") VALUES
            ('00000000-0000-4000-8000-000000000701', 'account.read', 'View and list chart of accounts'),
            ('00000000-0000-4000-8000-000000000702', 'account.create', 'Create accounts in the chart of accounts'),
            ('00000000-0000-4000-8000-000000000703', 'account.update', 'Update chart of accounts details'),
            ('00000000-0000-4000-8000-000000000704', 'account.manage_status', 'Activate/deactivate accounts'),
            ('00000000-0000-4000-8000-000000000705', 'accounting_entry.read', 'View accounting entries and their lines'),
            ('00000000-0000-4000-8000-000000000706', 'accounting_entry.reverse', 'Reverse posted accounting entries'),
            ('00000000-0000-4000-8000-000000000707', 'ledger.read', 'View ledger reports with running balances')
            ON CONFLICT ("name") DO NOTHING`);

        // Grant newly added permissions to the baseline ADMIN role
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id")
            SELECT '00000000-0000-4000-8000-000000000004', "id" FROM "permissions"
            WHERE "id" IN (
                '00000000-0000-4000-8000-000000000701',
                '00000000-0000-4000-8000-000000000702',
                '00000000-0000-4000-8000-000000000703',
                '00000000-0000-4000-8000-000000000704',
                '00000000-0000-4000-8000-000000000705',
                '00000000-0000-4000-8000-000000000706',
                '00000000-0000-4000-8000-000000000707'
            )
            ON CONFLICT ("role_id", "permission_id") DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_id" IN (
            '00000000-0000-4000-8000-000000000701',
            '00000000-0000-4000-8000-000000000702',
            '00000000-0000-4000-8000-000000000703',
            '00000000-0000-4000-8000-000000000704',
            '00000000-0000-4000-8000-000000000705',
            '00000000-0000-4000-8000-000000000706',
            '00000000-0000-4000-8000-000000000707'
        )`);
        await queryRunner.query(`DELETE FROM "permissions" WHERE "id" IN (
            '00000000-0000-4000-8000-000000000701',
            '00000000-0000-4000-8000-000000000702',
            '00000000-0000-4000-8000-000000000703',
            '00000000-0000-4000-8000-000000000704',
            '00000000-0000-4000-8000-000000000705',
            '00000000-0000-4000-8000-000000000706',
            '00000000-0000-4000-8000-000000000707'
        )`);
        await queryRunner.query(`DELETE FROM "accounts" WHERE "id" IN (
            '00000000-0000-4000-8000-000000000751',
            '00000000-0000-4000-8000-000000000752',
            '00000000-0000-4000-8000-000000000753',
            '00000000-0000-4000-8000-000000000754',
            '00000000-0000-4000-8000-000000000755',
            '00000000-0000-4000-8000-000000000756',
            '00000000-0000-4000-8000-000000000757'
        )`);
        await queryRunner.query(`DROP SEQUENCE IF EXISTS "accounting_entry_number_seq"`);
        await queryRunner.query(`ALTER TABLE "accounting_entries" DROP CONSTRAINT "FK_f2c1ae43d3811b48aeccf038500"`);
        await queryRunner.query(`ALTER TABLE "accounting_entry_lines" DROP CONSTRAINT "FK_18c5385035d45ee4a2e32f93488"`);
        await queryRunner.query(`ALTER TABLE "accounting_entry_lines" DROP CONSTRAINT "FK_496ee44916652a783daaf24c332"`);
        await queryRunner.query(`ALTER TABLE "accounts" DROP CONSTRAINT "FK_82655922433e50df4fd451d5240"`);
        await queryRunner.query(`DROP INDEX "public"."uq_accounting_entries_entry_number"`);
        await queryRunner.query(`DROP INDEX "public"."idx_accounting_entries_date"`);
        await queryRunner.query(`DROP INDEX "public"."idx_accounting_entries_reference"`);
        await queryRunner.query(`DROP INDEX "public"."idx_accounting_entries_type"`);
        await queryRunner.query(`DROP INDEX "public"."idx_accounting_entries_reversal_of"`);
        await queryRunner.query(`DROP INDEX "public"."uq_accounting_entries_reference_journal"`);
        await queryRunner.query(`DROP INDEX "public"."uq_accounting_entries_reversal"`);
        await queryRunner.query(`DROP TABLE "accounting_entries"`);
        await queryRunner.query(`DROP INDEX "public"."idx_accounting_entry_lines_entry_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_accounting_entry_lines_account_id"`);
        await queryRunner.query(`DROP TABLE "accounting_entry_lines"`);
        await queryRunner.query(`DROP INDEX "public"."uq_accounts_account_name"`);
        await queryRunner.query(`DROP INDEX "public"."uq_accounts_account_code"`);
        await queryRunner.query(`DROP INDEX "public"."idx_accounts_type"`);
        await queryRunner.query(`DROP INDEX "public"."idx_accounts_parent"`);
        await queryRunner.query(`DROP TABLE "accounts"`);
    }

}
