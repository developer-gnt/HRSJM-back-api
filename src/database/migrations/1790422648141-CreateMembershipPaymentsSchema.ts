import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMembershipPaymentsSchema1790422648141 implements MigrationInterface {
    name = 'CreateMembershipPaymentsSchema1790422648141'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "payment_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "membership_payment_id" uuid, "donation_payment_id" uuid, "gateway_name" character varying(50) NOT NULL DEFAULT 'RAZORPAY', "gateway_order_id" character varying(150), "gateway_payment_id" character varying(150), "amount" numeric(12,2) NOT NULL, "status" character varying(30) NOT NULL DEFAULT 'INITIATED', "raw_payload" jsonb, CONSTRAINT "PK_d32b3c6b0d2c1d22604cbcc8c49" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_payment_transactions_order_id" ON "payment_transactions" ("gateway_order_id") `);
        await queryRunner.query(`CREATE INDEX "idx_payment_transactions_membership_payment_id" ON "payment_transactions" ("membership_payment_id") `);
        await queryRunner.query(`CREATE TABLE "membership_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "membership_id" uuid NOT NULL, "user_id" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "payment_method" character varying(50) NOT NULL DEFAULT 'ONLINE', "payment_status" character varying(30) NOT NULL DEFAULT 'PENDING', "transaction_id" character varying(150), "gateway_order_id" character varying(150), "gateway_payment_id" character varying(150), "gateway_signature" character varying(255), "gateway_response" jsonb, "payment_date" TIMESTAMP WITH TIME ZONE, "notes" text, CONSTRAINT "PK_52b7d19d02434346f8eaa6cdd04" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_membership_payments_status" ON "membership_payments" ("payment_status") `);
        await queryRunner.query(`CREATE INDEX "idx_membership_payments_user_id" ON "membership_payments" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_membership_payments_membership_id" ON "membership_payments" ("membership_id") `);
        await queryRunner.query(`CREATE TABLE "receipts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "receipt_number" character varying(50) NOT NULL, "receipt_date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "membership_payment_id" uuid, "donation_payment_id" uuid, "amount" numeric(12,2) NOT NULL, "payment_method" character varying(50) NOT NULL DEFAULT 'ONLINE', "receipt_type" character varying(50) NOT NULL DEFAULT 'MEMBERSHIP', "issued_to" character varying(255) NOT NULL, "notes" text, "accounting_entry_id" uuid, CONSTRAINT "REL_12861fb78713bfc251ed9e466e" UNIQUE ("membership_payment_id"), CONSTRAINT "PK_5e8182d7c29e023da6e1ff33bfe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_receipts_membership_payment_id" ON "receipts" ("membership_payment_id") `);
        await queryRunner.query(`CREATE INDEX "idx_receipts_user_id" ON "receipts" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_receipts_receipt_number" ON "receipts" ("receipt_number") `);
        await queryRunner.query(`ALTER TABLE "payment_transactions" ADD CONSTRAINT "FK_c5d8716eecfa9b9e9c3b8109bee" FOREIGN KEY ("membership_payment_id") REFERENCES "membership_payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "membership_payments" ADD CONSTRAINT "FK_8c5ed1a1c20d4a5e991a97b440f" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "membership_payments" ADD CONSTRAINT "FK_3f62cfe4a325bb39b2bae8b6b92" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "receipts" ADD CONSTRAINT "FK_6f5a711d2591ddf19f9519900e9" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "receipts" ADD CONSTRAINT "FK_12861fb78713bfc251ed9e466e6" FOREIGN KEY ("membership_payment_id") REFERENCES "membership_payments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

        // Seed permissions for payments
        await queryRunner.query(`INSERT INTO "permissions" ("id", "name", "description") VALUES
            (uuid_generate_v4(), 'payment.read', 'View and list membership and donation payments'),
            (uuid_generate_v4(), 'payment.create', 'Initiate payment orders'),
            (uuid_generate_v4(), 'payment.verify', 'Verify gateway signatures and complete payments'),
            (uuid_generate_v4(), 'payment.manage_status', 'Update payment status, offline marks, or notes')
            ON CONFLICT ("name") DO NOTHING`);

        // Grant newly added permissions to the baseline ADMIN role
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id")
            SELECT r.id, p.id FROM "roles" r, "permissions" p
            WHERE r.name = 'ADMIN'
              AND p.name IN (
                'payment.read',
                'payment.create',
                'payment.verify',
                'payment.manage_status'
            )
            ON CONFLICT ("role_id", "permission_id") DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_id" IN (
            SELECT "id" FROM "permissions" WHERE "name" IN (
                'payment.read',
                'payment.create',
                'payment.verify',
                'payment.manage_status'
            )
        )`);
        await queryRunner.query(`DELETE FROM "permissions" WHERE "name" IN (
            'payment.read',
            'payment.create',
            'payment.verify',
            'payment.manage_status'
        )`);
        await queryRunner.query(`ALTER TABLE "receipts" DROP CONSTRAINT "FK_12861fb78713bfc251ed9e466e6"`);
        await queryRunner.query(`ALTER TABLE "receipts" DROP CONSTRAINT "FK_6f5a711d2591ddf19f9519900e9"`);
        await queryRunner.query(`ALTER TABLE "membership_payments" DROP CONSTRAINT "FK_3f62cfe4a325bb39b2bae8b6b92"`);
        await queryRunner.query(`ALTER TABLE "membership_payments" DROP CONSTRAINT "FK_8c5ed1a1c20d4a5e991a97b440f"`);
        await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT "FK_c5d8716eecfa9b9e9c3b8109bee"`);
        await queryRunner.query(`DROP INDEX "public"."uq_receipts_receipt_number"`);
        await queryRunner.query(`DROP INDEX "public"."idx_receipts_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_receipts_membership_payment_id"`);
        await queryRunner.query(`DROP TABLE "receipts"`);
        await queryRunner.query(`DROP INDEX "public"."idx_membership_payments_membership_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_membership_payments_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_membership_payments_status"`);
        await queryRunner.query(`DROP TABLE "membership_payments"`);
        await queryRunner.query(`DROP INDEX "public"."idx_payment_transactions_membership_payment_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_payment_transactions_order_id"`);
        await queryRunner.query(`DROP TABLE "payment_transactions"`);
    }

}
