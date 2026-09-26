import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMembershipsSchema1790420936132 implements MigrationInterface {
    name = 'CreateMembershipsSchema1790420936132'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "user_id" uuid NOT NULL, "category_id" uuid NOT NULL, "membership_number" character varying(50), "status" character varying(30) NOT NULL DEFAULT 'PENDING', "applied_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "start_date" TIMESTAMP WITH TIME ZONE, "expiry_date" TIMESTAMP WITH TIME ZONE, "approval_date" TIMESTAMP WITH TIME ZONE, "rejection_reason" text, "admin_notes" text, "application_data" jsonb, CONSTRAINT "PK_25d28bd932097a9e90495ede7b4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_memberships_user_id" ON "memberships" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_memberships_category_id" ON "memberships" ("category_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_memberships_membership_number" ON "memberships" ("membership_number") `);
        await queryRunner.query(`ALTER TABLE "memberships" ADD CONSTRAINT "FK_7c1e2fdfed4f6838e0c05ae5051" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "memberships" ADD CONSTRAINT "FK_78cdc9d01bf2bc3ec41a1bcb167" FOREIGN KEY ("category_id") REFERENCES "membership_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

        // Seed permissions for memberships
        await queryRunner.query(`INSERT INTO "permissions" ("id", "name", "description") VALUES
            ('00000000-0000-4000-8000-000000000301', 'membership.read', 'View and list memberships'),
            ('00000000-0000-4000-8000-000000000302', 'membership.create', 'Create membership applications'),
            ('00000000-0000-4000-8000-000000000303', 'membership.update', 'Update membership details'),
            ('00000000-0000-4000-8000-000000000304', 'membership.manage_status', 'Approve, reject, or change membership status'),
            ('00000000-0000-4000-8000-000000000305', 'membership.approve', 'Approve membership applications')
            ON CONFLICT ("name") DO NOTHING`);

        // Grant newly added permissions to the baseline ADMIN role
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id")
            SELECT '00000000-0000-4000-8000-000000000004', "id" FROM "permissions"
            WHERE "id" IN (
                '00000000-0000-4000-8000-000000000301',
                '00000000-0000-4000-8000-000000000302',
                '00000000-0000-4000-8000-000000000303',
                '00000000-0000-4000-8000-000000000304',
                '00000000-0000-4000-8000-000000000305'
            )
            ON CONFLICT ("role_id", "permission_id") DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_id" IN (
            '00000000-0000-4000-8000-000000000301',
            '00000000-0000-4000-8000-000000000302',
            '00000000-0000-4000-8000-000000000303',
            '00000000-0000-4000-8000-000000000304',
            '00000000-0000-4000-8000-000000000305'
        )`);
        await queryRunner.query(`DELETE FROM "permissions" WHERE "id" IN (
            '00000000-0000-4000-8000-000000000301',
            '00000000-0000-4000-8000-000000000302',
            '00000000-0000-4000-8000-000000000303',
            '00000000-0000-4000-8000-000000000304',
            '00000000-0000-4000-8000-000000000305'
        )`);
        await queryRunner.query(`ALTER TABLE "memberships" DROP CONSTRAINT "FK_78cdc9d01bf2bc3ec41a1bcb167"`);
        await queryRunner.query(`ALTER TABLE "memberships" DROP CONSTRAINT "FK_7c1e2fdfed4f6838e0c05ae5051"`);
        await queryRunner.query(`DROP INDEX "public"."uq_memberships_membership_number"`);
        await queryRunner.query(`DROP INDEX "public"."idx_memberships_category_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_memberships_user_id"`);
        await queryRunner.query(`DROP TABLE "memberships"`);
    }

}
