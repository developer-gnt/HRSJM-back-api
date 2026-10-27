import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateOfficialMembershipCategoryFees1790770000000 implements MigrationInterface {
  name = 'UpdateOfficialMembershipCategoryFees1790770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "membership_categories" SET "fee" = 1300.00 WHERE "code" = 'DISTRICT_UNIT'`);
    await queryRunner.query(`UPDATE "membership_categories" SET "fee" = 2300.00 WHERE "code" = 'STATE_UNIT'`);
    await queryRunner.query(`UPDATE "membership_categories" SET "fee" = 5000.00 WHERE "code" = 'LION_COUNSELOR_AMBASSADOR'`);
    await queryRunner.query(`UPDATE "membership_categories" SET "fee" = 10000.00 WHERE "code" = 'STATE_DIRECTOR'`);
    await queryRunner.query(`UPDATE "membership_categories" SET "fee" = 10000.00 WHERE "code" = 'NATIONAL_COUNCIL_CELL'`);

    await queryRunner.query(`
      INSERT INTO "membership_categories" ("id", "name", "code", "description", "fee", "validity_days", "status", "created_at", "updated_at")
      VALUES (uuid_generate_v4(), 'District Active Member', 'DISTRICT_ACTIVE_MEMBER', 'Qualification: Minimum 8th Class · 1 Year Validity', 800.00, 365, 'ACTIVE', now(), now())
      ON CONFLICT ("name") DO UPDATE SET "fee" = 800.00, "code" = 'DISTRICT_ACTIVE_MEMBER'
    `);

    await queryRunner.query(`
      INSERT INTO "membership_categories" ("id", "name", "code", "description", "fee", "validity_days", "status", "created_at", "updated_at")
      VALUES (uuid_generate_v4(), 'State Active Member', 'STATE_ACTIVE_MEMBER', 'Qualification: Minimum 8th Class · 1 Year Validity', 900.00, 365, 'ACTIVE', now(), now())
      ON CONFLICT ("name") DO UPDATE SET "fee" = 900.00, "code" = 'STATE_ACTIVE_MEMBER'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op rollback
  }
}
