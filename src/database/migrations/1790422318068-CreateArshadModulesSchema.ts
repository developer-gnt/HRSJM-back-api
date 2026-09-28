import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateArshadModulesSchema1790422318068 implements MigrationInterface {
    name = 'CreateArshadModulesSchema1790422318068'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "support_ticket_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "ticket_id" uuid NOT NULL, "author_id" uuid NOT NULL, "body" text NOT NULL, CONSTRAINT "PK_c3e561853b6b303f74fde5a3e1f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_support_ticket_messages_ticket_id" ON "support_ticket_messages" ("ticket_id") `);
        await queryRunner.query(`CREATE TABLE "support_tickets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "user_id" uuid NOT NULL, "subject" character varying(200) NOT NULL, "description" text NOT NULL, "status" character varying(30) NOT NULL DEFAULT 'SUBMITTED', "resolved_by" uuid, "resolved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_942e8d8f5df86100471d2324643" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_support_tickets_status" ON "support_tickets" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_support_tickets_user_id" ON "support_tickets" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "user_id" uuid NOT NULL, "document_name" character varying(150) NOT NULL, "document_type" character varying(50) NOT NULL DEFAULT 'OTHER', "file_name" character varying(255) NOT NULL, "original_file_name" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "file_size" integer NOT NULL, "storage_path" character varying(255) NOT NULL, "related_entity_type" character varying(50), "related_entity_id" uuid, "description" text, "is_archived" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_documents_related" ON "documents" ("related_entity_type", "related_entity_id") `);
        await queryRunner.query(`CREATE INDEX "idx_documents_user_id" ON "documents" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "assistance_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "user_id" uuid NOT NULL, "full_name" character varying(150) NOT NULL, "mobile" character varying(20) NOT NULL, "email" character varying(255), "requested_amount" numeric(12,2) NOT NULL, "reason" text NOT NULL, "description" text, "status" character varying(30) NOT NULL DEFAULT 'PENDING', "admin_remark" text, "reviewed_by" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_944a7bc065921be9d453c8d4957" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_assistance_requests_status" ON "assistance_requests" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_assistance_requests_user_id" ON "assistance_requests" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "FK_4339162c880269e72a10a4e08ad" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "FK_3cbe4f47d5d6c28a34ebff6e71d" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_0b1eb4f1f984aab3c481c48468a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_43b381d23f7ba57e56b6a4e0d4c" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "FK_c7481daf5059307842edef74d73" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "assistance_requests" ADD CONSTRAINT "FK_bc923e7678f65eb3a2ec9d83cc1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "assistance_requests" ADD CONSTRAINT "FK_7f96e66653e1a0360318ba295dd" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

        // Seed permissions for assistance and support
        await queryRunner.query(`INSERT INTO "permissions" ("id", "name", "description") VALUES
            (uuid_generate_v4(), 'assistance.review', 'Review and manage assistance requests'),
            (uuid_generate_v4(), 'support.manage', 'Manage and resolve support tickets')
            ON CONFLICT ("name") DO NOTHING`);

        // Grant newly added permissions to the baseline ADMIN role
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id")
            SELECT r.id, p.id FROM "roles" r, "permissions" p
            WHERE r.name = 'ADMIN'
              AND p.name IN (
                'assistance.review',
                'support.manage'
            )
            ON CONFLICT ("role_id", "permission_id") DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_id" IN (
            SELECT "id" FROM "permissions" WHERE "name" IN (
                'assistance.review',
                'support.manage'
            )
        )`);
        await queryRunner.query(`DELETE FROM "permissions" WHERE "name" IN (
            'assistance.review',
            'support.manage'
        )`);
        await queryRunner.query(`ALTER TABLE "assistance_requests" DROP CONSTRAINT "FK_7f96e66653e1a0360318ba295dd"`);
        await queryRunner.query(`ALTER TABLE "assistance_requests" DROP CONSTRAINT "FK_bc923e7678f65eb3a2ec9d83cc1"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT "FK_c7481daf5059307842edef74d73"`);
        await queryRunner.query(`ALTER TABLE "support_tickets" DROP CONSTRAINT "FK_43b381d23f7ba57e56b6a4e0d4c"`);
        await queryRunner.query(`ALTER TABLE "support_tickets" DROP CONSTRAINT "FK_0b1eb4f1f984aab3c481c48468a"`);
        await queryRunner.query(`ALTER TABLE "support_ticket_messages" DROP CONSTRAINT "FK_3cbe4f47d5d6c28a34ebff6e71d"`);
        await queryRunner.query(`ALTER TABLE "support_ticket_messages" DROP CONSTRAINT "FK_4339162c880269e72a10a4e08ad"`);
        await queryRunner.query(`DROP INDEX "public"."idx_assistance_requests_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_assistance_requests_status"`);
        await queryRunner.query(`DROP TABLE "assistance_requests"`);
        await queryRunner.query(`DROP INDEX "public"."idx_documents_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_documents_related"`);
        await queryRunner.query(`DROP TABLE "documents"`);
        await queryRunner.query(`DROP INDEX "public"."idx_support_tickets_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_support_tickets_status"`);
        await queryRunner.query(`DROP TABLE "support_tickets"`);
        await queryRunner.query(`DROP INDEX "public"."idx_support_ticket_messages_ticket_id"`);
        await queryRunner.query(`DROP TABLE "support_ticket_messages"`);
    }

}
