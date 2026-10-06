import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupUnnecessaryMembershipCategories1790695000000 implements MigrationInterface {
  name = 'CleanupUnnecessaryMembershipCategories1790695000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Delete all dummy/test categories that are not the 5 official new membership categories
    const officialCodes = [
      'DISTRICT_UNIT',
      'STATE_UNIT',
      'LION_COUNSELOR_AMBASSADOR',
      'STATE_DIRECTOR',
      'NATIONAL_COUNCIL_CELL',
    ];

    // Delete any memberships or references using test categories if needed, or reassign
    // First, update any existing test memberships to use District Unit if they refer to deleted categories
    const districtCat = await queryRunner.query(
      `SELECT id FROM "membership_categories" WHERE "code" = 'DISTRICT_UNIT' LIMIT 1`,
    );
    const districtId = districtCat?.[0]?.id;

    if (districtId) {
      await queryRunner.query(
        `UPDATE "memberships" SET "category_id" = $1 WHERE "category_id" NOT IN (
          SELECT id FROM "membership_categories" WHERE "code" = ANY($2)
        )`,
        [districtId, officialCodes],
      );
    }

    // Delete all categories that are NOT the 5 official categories
    await queryRunner.query(
      `DELETE FROM "membership_categories" WHERE "code" NOT IN (
        'DISTRICT_UNIT',
        'STATE_UNIT',
        'LION_COUNSELOR_AMBASSADOR',
        'STATE_DIRECTOR',
        'NATIONAL_COUNCIL_CELL'
      ) OR "code" IS NULL`,
    );

    // Ensure the 5 official categories are properly titled, priced, and descriptions are formatted
    const officialCategories = [
      {
        name: 'District Unit',
        code: 'DISTRICT_UNIT',
        description: 'Qualification: 10th Pass (10 TH) · 1 Year Free Renewal',
        fee: 3000.0,
        validity_days: 365,
      },
      {
        name: 'State Unit',
        code: 'STATE_UNIT',
        description: 'Qualification: 10th Pass (10 TH) · 2 Years Free Renewal',
        fee: 3000.0,
        validity_days: 365,
      },
      {
        name: 'Lion, Counselor or Ambassador of State',
        code: 'LION_COUNSELOR_AMBASSADOR',
        description: 'Qualification: 12th Pass (12 TH) · 3 Years Free Renewal',
        fee: 3000.0,
        validity_days: 365,
      },
      {
        name: "Hon'ble State Director",
        code: 'STATE_DIRECTOR',
        description: 'Qualification: Graduate (GRADUATES) · 4 Years Free Renewal',
        fee: 3000.0,
        validity_days: 365,
      },
      {
        name: 'National Council Cell',
        code: 'NATIONAL_COUNCIL_CELL',
        description: 'Lawyers, Women or Minority · Qualification: Graduate · 5 Yrs Free Renewal',
        fee: 3000.0,
        validity_days: 365,
      },
    ];

    for (const cat of officialCategories) {
      await queryRunner.query(
        `INSERT INTO "membership_categories" ("id", "name", "code", "description", "fee", "validity_days", "status", "created_at", "updated_at")
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 'ACTIVE', now(), now())
         ON CONFLICT ("name") DO UPDATE
         SET "code" = EXCLUDED."code",
             "description" = EXCLUDED."description",
             "fee" = EXCLUDED."fee",
             "validity_days" = EXCLUDED."validity_days",
             "status" = 'ACTIVE',
             "updated_at" = now()`,
        [cat.name, cat.code, cat.description, cat.fee, cat.validity_days],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op rollback
  }
}
