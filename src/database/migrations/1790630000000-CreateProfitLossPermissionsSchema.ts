import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProfitLossPermissionsSchema1790630000000
  implements MigrationInterface
{
  name = 'CreateProfitLossPermissionsSchema1790630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Seed permissions for Profit & Loss reporting
    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "name", "description") VALUES
        (uuid_generate_v4(), 'profit_loss.read', 'View profit and loss report and summary')
      ON CONFLICT ("name") DO NOTHING
    `);

    // Grant newly added permissions to the baseline ADMIN role
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id FROM "roles" r, "permissions" p
      WHERE r.name = 'ADMIN'
        AND p.name IN (
        'profit_loss.read'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "name" IN (
          'profit_loss.read'
        )
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "name" IN (
        'profit_loss.read'
      )
    `);
  }
}
