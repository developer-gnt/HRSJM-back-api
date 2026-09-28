import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDonationsSchema1790585028688 implements MigrationInterface {
    name = 'CreateDonationsSchema1790585028688'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "receipt_entries" DROP CONSTRAINT "FK_receipt_entries_income_account"`);
        await queryRunner.query(`ALTER TABLE "receipt_entries" DROP CONSTRAINT "FK_receipt_entries_received_in_account"`);
        await queryRunner.query(`ALTER TABLE "receipt_entries" DROP CONSTRAINT "FK_receipt_entries_accounting_entry"`);
        await queryRunner.query(`ALTER TABLE "expense_entries" DROP CONSTRAINT "FK_expense_entries_expense_account"`);
        await queryRunner.query(`ALTER TABLE "expense_entries" DROP CONSTRAINT "FK_expense_entries_paid_from_account"`);
        await queryRunner.query(`ALTER TABLE "expense_entries" DROP CONSTRAINT "FK_expense_entries_accounting_entry"`);
        await queryRunner.query(`CREATE TABLE "donations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "donor_name" character varying(150) NOT NULL, "donor_mobile" character varying(15) NOT NULL, "donor_email" character varying(150), "cause" character varying(255) NOT NULL, "amount" numeric(12,2) NOT NULL, "status" character varying(30) NOT NULL DEFAULT 'PENDING', "remark" text, CONSTRAINT "PK_c01355d6f6f50fc6d1b4a946abf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_donations_donor_mobile" ON "donations" ("donor_mobile") `);
        await queryRunner.query(`CREATE INDEX "idx_donations_status" ON "donations" ("status") `);
        await queryRunner.query(`CREATE TABLE "donation_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "donation_id" uuid NOT NULL, "user_id" uuid, "amount" numeric(12,2) NOT NULL, "payment_method" character varying(50) NOT NULL DEFAULT 'ONLINE', "payment_status" character varying(30) NOT NULL DEFAULT 'PENDING', "gateway_order_id" character varying(150), "gateway_payment_id" character varying(150), "gateway_signature" character varying(255), "gateway_response" jsonb, "payment_date" TIMESTAMP WITH TIME ZONE, "notes" text, CONSTRAINT "PK_2d335742967df82db7faef1a8b5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_donation_payments_status" ON "donation_payments" ("payment_status") `);
        await queryRunner.query(`CREATE INDEX "idx_donation_payments_user_id" ON "donation_payments" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_donation_payments_donation_id" ON "donation_payments" ("donation_id") `);
        await queryRunner.query(`CREATE TABLE "donation_refunds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "donation_payment_id" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "reason" text, "reversed_entry_id" uuid, "refunded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5b030b0a721fdb46cf14f2d4d41" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_donation_refunds_payment_id" ON "donation_refunds" ("donation_payment_id") `);
        await queryRunner.query(`ALTER TABLE "receipt_entries" ADD CONSTRAINT "FK_539bab14bb627f3285059783027" FOREIGN KEY ("income_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "receipt_entries" ADD CONSTRAINT "FK_d32789fef1ab8bbf3c81b953c52" FOREIGN KEY ("received_in_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "receipt_entries" ADD CONSTRAINT "FK_a960127a84a490eca2486f45109" FOREIGN KEY ("accounting_entry_id") REFERENCES "accounting_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense_entries" ADD CONSTRAINT "FK_00fd8414ad814aac62bd906d475" FOREIGN KEY ("expense_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense_entries" ADD CONSTRAINT "FK_b7c1a53e70bf5273d7bf93708d8" FOREIGN KEY ("paid_from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense_entries" ADD CONSTRAINT "FK_213828a65dcedc787ad3b9b2850" FOREIGN KEY ("accounting_entry_id") REFERENCES "accounting_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "donation_payments" ADD CONSTRAINT "FK_319750077f0ec5b10a870683166" FOREIGN KEY ("donation_id") REFERENCES "donations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "donation_refunds" ADD CONSTRAINT "FK_c723632fbda1a551ffddcc617c8" FOREIGN KEY ("donation_payment_id") REFERENCES "donation_payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

        // Wire the pre-existing donation seams on receipts / payment transactions
        await queryRunner.query(`ALTER TABLE "payment_transactions" ADD CONSTRAINT "FK_donation_payments_tx" FOREIGN KEY ("donation_payment_id") REFERENCES "donation_payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_receipts_donation_payment_id" ON "receipts" ("donation_payment_id") WHERE "donation_payment_id" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "receipts" ADD CONSTRAINT "FK_receipts_donation_payment" FOREIGN KEY ("donation_payment_id") REFERENCES "donation_payments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

        // Seed permissions for the donation financial layer (8xx block:
        // donation.read/create/manage reserved for Arshad's CRUD)
        await queryRunner.query(`INSERT INTO "permissions" ("id", "name", "description") VALUES
            ('00000000-0000-4000-8000-000000000901', 'donation.read', 'View donations and donation payments'),
            ('00000000-0000-4000-8000-000000000902', 'donation.create', 'Create donations (Arshad CRUD, seeded ready)'),
            ('00000000-0000-4000-8000-000000000903', 'donation.manage', 'Manage donation records (Arshad CRUD, seeded ready)'),
            ('00000000-0000-4000-8000-000000000904', 'donation.refund', 'Refund verified donations with accounting reversal')
            ON CONFLICT ("name") DO NOTHING`);

        // Grant newly added permissions to the baseline ADMIN role
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id")
            SELECT '00000000-0000-4000-8000-000000000004', "id" FROM "permissions"
            WHERE "id" IN (
                '00000000-0000-4000-8000-000000000901',
                '00000000-0000-4000-8000-000000000902',
                '00000000-0000-4000-8000-000000000903',
                '00000000-0000-4000-8000-000000000904'
            )
            ON CONFLICT ("role_id", "permission_id") DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_id" IN (
            '00000000-0000-4000-8000-000000000901',
            '00000000-0000-4000-8000-000000000902',
            '00000000-0000-4000-8000-000000000903',
            '00000000-0000-4000-8000-000000000904'
        )`);
        await queryRunner.query(`DELETE FROM "permissions" WHERE "id" IN (
            '00000000-0000-4000-8000-000000000901',
            '00000000-0000-4000-8000-000000000902',
            '00000000-0000-4000-8000-000000000903',
            '00000000-0000-4000-8000-000000000904'
        )`);
        await queryRunner.query(`ALTER TABLE "receipts" DROP CONSTRAINT "FK_receipts_donation_payment"`);
        await queryRunner.query(`DROP INDEX "public"."uq_receipts_donation_payment_id"`);
        await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT "FK_donation_payments_tx"`);
        await queryRunner.query(`ALTER TABLE "donation_refunds" DROP CONSTRAINT "FK_c723632fbda1a551ffddcc617c8"`);
        await queryRunner.query(`ALTER TABLE "donation_payments" DROP CONSTRAINT "FK_319750077f0ec5b10a870683166"`);
        await queryRunner.query(`ALTER TABLE "expense_entries" DROP CONSTRAINT "FK_213828a65dcedc787ad3b9b2850"`);
        await queryRunner.query(`ALTER TABLE "expense_entries" DROP CONSTRAINT "FK_b7c1a53e70bf5273d7bf93708d8"`);
        await queryRunner.query(`ALTER TABLE "expense_entries" DROP CONSTRAINT "FK_00fd8414ad814aac62bd906d475"`);
        await queryRunner.query(`ALTER TABLE "receipt_entries" DROP CONSTRAINT "FK_a960127a84a490eca2486f45109"`);
        await queryRunner.query(`ALTER TABLE "receipt_entries" DROP CONSTRAINT "FK_d32789fef1ab8bbf3c81b953c52"`);
        await queryRunner.query(`ALTER TABLE "receipt_entries" DROP CONSTRAINT "FK_539bab14bb627f3285059783027"`);
        await queryRunner.query(`DROP INDEX "public"."idx_donation_refunds_payment_id"`);
        await queryRunner.query(`DROP TABLE "donation_refunds"`);
        await queryRunner.query(`DROP INDEX "public"."idx_donation_payments_donation_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_donation_payments_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_donation_payments_status"`);
        await queryRunner.query(`DROP TABLE "donation_payments"`);
        await queryRunner.query(`DROP INDEX "public"."idx_donations_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_donations_donor_mobile"`);
        await queryRunner.query(`DROP TABLE "donations"`);
        await queryRunner.query(`ALTER TABLE "expense_entries" ADD CONSTRAINT "FK_expense_entries_accounting_entry" FOREIGN KEY ("accounting_entry_id") REFERENCES "accounting_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense_entries" ADD CONSTRAINT "FK_expense_entries_paid_from_account" FOREIGN KEY ("paid_from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expense_entries" ADD CONSTRAINT "FK_expense_entries_expense_account" FOREIGN KEY ("expense_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "receipt_entries" ADD CONSTRAINT "FK_receipt_entries_accounting_entry" FOREIGN KEY ("accounting_entry_id") REFERENCES "accounting_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "receipt_entries" ADD CONSTRAINT "FK_receipt_entries_received_in_account" FOREIGN KEY ("received_in_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "receipt_entries" ADD CONSTRAINT "FK_receipt_entries_income_account" FOREIGN KEY ("income_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

}
