import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePermissionsSchema1790417442685 implements MigrationInterface {
    name = 'CreatePermissionsSchema1790417442685'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "name" character varying(100) NOT NULL, "description" character varying(255), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_permissions_name" ON "permissions" ("name") `);
        await queryRunner.query(`CREATE TABLE "role_permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid, "updated_by" uuid, "deleted_at" TIMESTAMP WITH TIME ZONE, "deleted_by" uuid, "role_id" uuid NOT NULL, "permission_id" uuid NOT NULL, CONSTRAINT "uq_role_permissions_role_id_permission_id" UNIQUE ("role_id", "permission_id"), CONSTRAINT "PK_84059017c90bfcb701b8fa42297" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_178199805b901ccd220ab7740ec" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_17022daf3f885f7d35423e9971e" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        // Seed the permissions used by the RBAC endpoints (module.action format)
        await queryRunner.query(`INSERT INTO "permissions" ("id", "name", "description") VALUES
            (uuid_generate_v4(), 'user.read', 'View and list users'),
            (uuid_generate_v4(), 'user.update', 'Update user profile fields'),
            (uuid_generate_v4(), 'user.manage_status', 'Activate/deactivate user accounts'),
            (uuid_generate_v4(), 'role.read', 'View roles and permissions catalog'),
            (uuid_generate_v4(), 'role.create', 'Create roles'),
            (uuid_generate_v4(), 'role.update', 'Update roles and role-permission mappings'),
            (uuid_generate_v4(), 'role.delete', 'Delete roles'),
            (uuid_generate_v4(), 'role.assign', 'Assign/remove roles to users'),
            (uuid_generate_v4(), 'permission.read', 'List permissions')
            ON CONFLICT ("name") DO NOTHING`);
        // Grant every admin permission to the baseline ADMIN role (dynamically resolved)
        await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id")
            SELECT r.id, p.id FROM "roles" r, "permissions" p
            WHERE r.name = 'ADMIN'
            ON CONFLICT ("role_id", "permission_id") DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_17022daf3f885f7d35423e9971e"`);
        await queryRunner.query(`ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_178199805b901ccd220ab7740ec"`);
        await queryRunner.query(`DROP TABLE "role_permissions"`);
        await queryRunner.query(`DROP INDEX "public"."uq_permissions_name"`);
        await queryRunner.query(`DROP TABLE "permissions"`);
    }

}
