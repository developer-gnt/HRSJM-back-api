import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMembershipCategoriesSchema1790420422144 implements MigrationInterface {
    name = 'CreateMembershipCategoriesSchema1790420422144'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "membership_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "name" character varying(100) NOT NULL, "code" character varying(50), "description" text, "fee" numeric(12,2) NOT NULL, "validity_days" integer NOT NULL DEFAULT '365', "status" character varying(20) NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_8161e16b6dee6e59b58fbec3e5b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_membership_categories_name" ON "membership_categories" ("name") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_membership_categories_code" ON "membership_categories" ("code") `);

        // Seed permissions for membership categories
        await queryRunner.query(`INSERT INTO "permissions" ("id", "name", "description") VALUES
            ('00000000-0000-4000-8000-000000000201', 'membership_category.read', 'View and list membership categories'),
            ('00000000-0000-4000-8000-000000000202', 'membership_category.create', 'Create membership categories'),
            ('00000000-0000-4000-8000-000000000203', 'membership_category.update', 'Update membership categories'),
            ('00000000-0000-4000-8000-000000000204', 'membership_category.manage_status', 'Activate/deactivate membership categories')
            ON CONFLICT ("name") DO NOTHING`);

        // Grant newly added permissions to the baseline ADMIN role
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id")
            SELECT '00000000-0000-4000-8000-000000000004', "id" FROM "permissions"
            WHERE "id" IN (
                '00000000-0000-4000-8000-000000000201',
                '00000000-0000-4000-8000-000000000202',
                '00000000-0000-4000-8000-000000000203',
                '00000000-0000-4000-8000-000000000204'
            )
            ON CONFLICT ("role_id", "permission_id") DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_id" IN (
            '00000000-0000-4000-8000-000000000201',
            '00000000-0000-4000-8000-000000000202',
            '00000000-0000-4000-8000-000000000203',
            '00000000-0000-4000-8000-000000000204'
        )`);
        await queryRunner.query(`DELETE FROM "permissions" WHERE "id" IN (
            '00000000-0000-4000-8000-000000000201',
            '00000000-0000-4000-8000-000000000202',
            '00000000-0000-4000-8000-000000000203',
            '00000000-0000-4000-8000-000000000204'
        )`);
        await queryRunner.query(`DROP INDEX "public"."uq_membership_categories_code"`);
        await queryRunner.query(`DROP INDEX "public"."uq_membership_categories_name"`);
        await queryRunner.query(`DROP TABLE "membership_categories"`);
    }

}
