import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedOfficialMembershipCategories1790690000000 implements MigrationInterface {
  name = 'SeedOfficialMembershipCategories1790690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Insert/Update the official membership categories
    const categories = [
      {
        name: 'District Unit',
        code: 'DISTRICT_UNIT',
        description: 'Qualification Required: 10th Pass (10 TH) | Referral Benefit: 1 Year Free Renewal',
        fee: 3000.0,
        validity_days: 365,
      },
      {
        name: 'State Unit',
        code: 'STATE_UNIT',
        description: 'Qualification Required: 10th Pass (10 TH) | Referral Benefit: 2 Years Free Renewal',
        fee: 3000.0,
        validity_days: 365,
      },
      {
        name: 'Lion, Counselor or Ambassador of State',
        code: 'LION_COUNSELOR_AMBASSADOR',
        description: 'Qualification Required: 12th Pass (12 TH) | Referral Benefit: 3 Years Free Renewal',
        fee: 3000.0,
        validity_days: 365,
      },
      {
        name: "Hon'ble State Director",
        code: 'STATE_DIRECTOR',
        description: 'Qualification Required: Graduate (GRADUATES) | Referral Benefit: 4 Years Free Renewal',
        fee: 3000.0,
        validity_days: 365,
      },
      {
        name: 'National Council Cell',
        code: 'NATIONAL_COUNCIL_CELL',
        description: 'Lawyers, Women or Minority | Qualification: Graduate (GRADUATES) | Referral Benefit: 5 Years Free Renewal',
        fee: 3000.0,
        validity_days: 365,
      },
      {
        name: '1st Year Renewal',
        code: 'RENEWAL_1ST_YEAR',
        description: '1st Year ID Renewal Fees for Existing Members',
        fee: 500.0,
        validity_days: 365,
      },
      {
        name: '2nd Year Renewal',
        code: 'RENEWAL_2ND_YEAR',
        description: '2nd Year ID Renewal Fees for Existing Members',
        fee: 400.0,
        validity_days: 365,
      },
      {
        name: '3rd Year Renewal',
        code: 'RENEWAL_3RD_YEAR',
        description: '3rd Year ID Renewal Fees (Rs. 300 for 3+ years continuous renewal)',
        fee: 300.0,
        validity_days: 365,
      },
    ];

    for (const cat of categories) {
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
    await queryRunner.query(
      `DELETE FROM "membership_categories" WHERE "code" IN (
        'DISTRICT_UNIT',
        'STATE_UNIT',
        'LION_COUNSELOR_AMBASSADOR',
        'STATE_DIRECTOR',
        'NATIONAL_COUNCIL_CELL',
        'RENEWAL_1ST_YEAR',
        'RENEWAL_2ND_YEAR',
        'RENEWAL_3RD_YEAR'
      )`,
    );
  }
}
