import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReportsPermissionsSchema1790620000000
  implements MigrationInterface
{
  name = 'CreateReportsPermissionsSchema1790620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Seed permissions for reports module (Trial Balance, P&L, Balance Sheet)
    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "name", "description") VALUES
        ('00000000-0000-4000-8000-000000000821', 'trial_balance.read', 'View trial balance report and summary'),
        ('00000000-0000-4000-8000-000000000822', 'report.read', 'View financial reports')
      ON CONFLICT ("name") DO NOTHING
    `);

    // Grant newly added permissions to the baseline ADMIN role
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000004', "id" FROM "permissions"
      WHERE "id" IN (
        '00000000-0000-4000-8000-000000000821',
        '00000000-0000-4000-8000-000000000822'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" WHERE "permission_id" IN (
        '00000000-0000-4000-8000-000000000821',
        '00000000-0000-4000-8000-000000000822'
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "id" IN (
        '00000000-0000-4000-8000-000000000821',
        '00000000-0000-4000-8000-000000000822'
      )
    `);
  }
}
