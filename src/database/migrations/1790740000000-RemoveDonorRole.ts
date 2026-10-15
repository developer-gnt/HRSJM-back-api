import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDonorRole1790740000000 implements MigrationInterface {
  name = 'RemoveDonorRole1790740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "user_roles"
      WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'DONOR');
    `);
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'DONOR');
    `);
    await queryRunner.query(`
      DELETE FROM "roles" WHERE "name" = 'DONOR';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "description")
      VALUES (uuid_generate_v4(), 'DONOR', 'Makes donations')
      ON CONFLICT ("name") DO NOTHING;
    `);
  }
}
