import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRole1790730000000 implements MigrationInterface {
  name = 'AddUserRole1790730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "description")
      VALUES (uuid_generate_v4(), 'USER', 'General user / public portal access')
      ON CONFLICT ("name") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "roles" WHERE "name" = 'USER';
    `);
  }
}
