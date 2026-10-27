import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateOfficialMembershipCategoryFees1790770000000 implements MigrationInterface {
  name = 'UpdateOfficialMembershipCategoryFees1790770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Update existing/legacy categories with correct official fees and validity days
    await queryRunner.query(`
      UPDATE "membership_categories"
      SET "fee" = 1300.00, "validity_days" = 365, "description" = 'Qualification: Minimum 10th Class · 1 Year Validity'
      WHERE "code" = 'DISTRICT_UNIT' OR "name" ILIKE '%District Unit%'
    `);

    await queryRunner.query(`
      UPDATE "membership_categories"
      SET "fee" = 2300.00, "validity_days" = 730, "description" = 'Qualification: Minimum 10th Class · 2 Years Validity'
      WHERE "code" = 'STATE_UNIT' OR "name" ILIKE '%State Unit%'
    `);

    await queryRunner.query(`
      UPDATE "membership_categories"
      SET "fee" = 5000.00, "validity_days" = 1825, "description" = 'Qualification: Minimum 12th Pass · 5 Years Validity'
      WHERE "code" = 'LION_COUNSELOR_AMBASSADOR' OR "name" ILIKE '%Lion, Counselor%'
    `);

    await queryRunner.query(`
      UPDATE "membership_categories"
      SET "fee" = 10000.00, "validity_days" = 3650, "description" = 'Qualification: Minimum Graduate / Degree · 10 Years Validity'
      WHERE "code" = 'STATE_DIRECTOR' OR "name" ILIKE '%State Director%'
    `);

    await queryRunner.query(`
      UPDATE "membership_categories"
      SET "fee" = 10000.00, "validity_days" = 3650, "description" = 'National Level Post · 10 Years Validity'
      WHERE "code" = 'NATIONAL_COUNCIL_CELL' OR "name" = 'National Council Cell'
    `);

    // 2. Ensure all 12 individual official categories exist with exact fees, validity, and qualification
    const categories = [
      {
        name: 'District Active Member',
        code: 'DISTRICT_ACTIVE_MEMBER',
        description: 'Qualification: Minimum 8th Class · 1 Year Validity',
        fee: 800.00,
        validity_days: 365,
      },
      {
        name: 'State Active Member',
        code: 'STATE_ACTIVE_MEMBER',
        description: 'Qualification: Minimum 8th Class · 1 Year Validity',
        fee: 800.00,
        validity_days: 365,
      },
      {
        name: 'District Unit Post',
        code: 'DISTRICT_UNIT_POST',
        description: 'Qualification: Minimum 10th Class · 1 Year Validity',
        fee: 1300.00,
        validity_days: 365,
      },
      {
        name: 'State Unit Post',
        code: 'STATE_UNIT_POST',
        description: 'Qualification: Minimum 10th Class · 2 Years Validity',
        fee: 2300.00,
        validity_days: 730,
      },
      {
        name: 'Lion of State',
        code: 'LION_OF_STATE',
        description: 'Qualification: Minimum 12th Pass · 5 Years Validity',
        fee: 5000.00,
        validity_days: 1825,
      },
      {
        name: 'Counsellor of State',
        code: 'COUNSELLOR_OF_STATE',
        description: 'Qualification: Minimum 12th Pass · 5 Years Validity',
        fee: 5000.00,
        validity_days: 1825,
      },
      {
        name: 'Ambassador of State',
        code: 'AMBASSADOR_OF_STATE',
        description: 'Qualification: Minimum 12th Pass · 5 Years Validity',
        fee: 5000.00,
        validity_days: 1825,
      },
      {
        name: "Hon'ble State Director",
        code: 'STATE_DIRECTOR',
        description: 'Qualification: Minimum Graduate / Degree · 10 Years Validity',
        fee: 10000.00,
        validity_days: 3650,
      },
      {
        name: 'National Legal Council Cell',
        code: 'NATIONAL_LEGAL_COUNCIL_CELL',
        description: 'Qualification: Advocate / Retd. Judge · 10 Years Validity',
        fee: 10000.00,
        validity_days: 3650,
      },
      {
        name: 'National Minority Council Cell',
        code: 'NATIONAL_MINORITY_COUNCIL_CELL',
        description: 'Qualification: Graduate / Degree (Muslim, Christian, Buddhist, Parsi, Jain & Sikh) · 10 Years Validity',
        fee: 10000.00,
        validity_days: 3650,
      },
      {
        name: 'National Woman Council Cell',
        code: 'NATIONAL_WOMAN_COUNCIL_CELL',
        description: 'Qualification: Graduate / Degree (Only for Women) · 10 Years Validity',
        fee: 10000.00,
        validity_days: 3650,
      },
      {
        name: 'National Political Council Cell',
        code: 'NATIONAL_POLITICAL_COUNCIL_CELL',
        description: 'Qualification: Graduate / Degree (For Politicians) · 10 Years Validity',
        fee: 10000.00,
        validity_days: 3650,
      },
    ];

    for (const cat of categories) {
      await queryRunner.query(`
        INSERT INTO "membership_categories" ("id", "name", "code", "description", "fee", "validity_days", "status", "created_at", "updated_at")
        VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 'ACTIVE', now(), now())
        ON CONFLICT ("name") DO UPDATE SET
          "fee" = $4,
          "validity_days" = $5,
          "description" = $3,
          "code" = $2,
          "updated_at" = now()
      `, [cat.name, cat.code, cat.description, cat.fee, cat.validity_days]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op rollback
  }
}
