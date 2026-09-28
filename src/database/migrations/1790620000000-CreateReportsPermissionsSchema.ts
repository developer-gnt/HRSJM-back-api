import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReportsPermissionsSchema1790620000000
  implements MigrationInterface
{
  name = 'CreateReportsPermissionsSchema1790620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Seed permissions for reports module (Trial Balance, P&L, Balance Sheet)
    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "name", "description") VALUES
        (uuid_generate_v4(), 'trial_balance.read', 'View trial balance report and summary'),
        (uuid_generate_v4(), 'report.read', 'View financial reports')
      ON CONFLICT ("name") DO NOTHING
    `);

    // Grant newly added permissions to the baseline ADMIN role
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id FROM "roles" r, "permissions" p
      WHERE r.name = 'ADMIN'
        AND p.name IN (
        'trial_balance.read',
        'report.read'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "name" IN (
          'trial_balance.read',
          'report.read'
        )
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "name" IN (
        'trial_balance.read',
        'report.read'
      )
    `);
  }
}
