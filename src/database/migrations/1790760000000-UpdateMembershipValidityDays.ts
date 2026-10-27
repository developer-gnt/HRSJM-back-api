import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateMembershipValidityDays1790760000000 implements MigrationInterface {
  name = 'UpdateMembershipValidityDays1790760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Update official categories with exact plan durations:
    // State Unit: 2 Years = 730 days
    await queryRunner.query(`
      UPDATE "membership_categories"
      SET "validity_days" = 730, "updated_at" = now()
      WHERE "code" = 'STATE_UNIT' OR "name" ILIKE '%State Unit%'
    `);

    // Lion, Counselor or Ambassador of State: 5 Years = 1825 days
    await queryRunner.query(`
      UPDATE "membership_categories"
      SET "validity_days" = 1825, "updated_at" = now()
      WHERE "code" = 'LION_COUNSELOR_AMBASSADOR' OR "name" ILIKE '%Lion%' OR "name" ILIKE '%Counselor%' OR "name" ILIKE '%Ambassador%'
    `);

    // State Director: 10 Years = 3650 days
    await queryRunner.query(`
      UPDATE "membership_categories"
      SET "validity_days" = 3650, "updated_at" = now()
      WHERE "code" = 'STATE_DIRECTOR' OR "name" ILIKE '%Director%'
    `);

    // National Council Cell: 10 Years = 3650 days
    await queryRunner.query(`
      UPDATE "membership_categories"
      SET "validity_days" = 3650, "updated_at" = now()
      WHERE "code" = 'NATIONAL_COUNCIL_CELL' OR "name" ILIKE '%National Council%'
    `);

    // District Unit / District Active Member: 1 Year = 365 days
    await queryRunner.query(`
      UPDATE "membership_categories"
      SET "validity_days" = 365, "updated_at" = now()
      WHERE "code" = 'DISTRICT_UNIT' OR "name" ILIKE '%District%'
    `);

    // 2. Synchronize existing memberships expiry dates to match their plan category / application data
    // If State Unit -> expiry_date = start_date + INTERVAL '730 days'
    await queryRunner.query(`
      UPDATE "memberships" m
      SET "expiry_date" = COALESCE(m.start_date, m.created_at) + INTERVAL '730 days', "updated_at" = now()
      FROM "membership_categories" c
      WHERE m.category_id = c.id
        AND (c.code = 'STATE_UNIT' OR (m.application_data->>'membership_type') ILIKE '%State Unit%')
        AND m.start_date IS NOT NULL
    `);

    // If Lion / Counselor / Ambassador -> expiry_date = start_date + INTERVAL '1825 days'
    await queryRunner.query(`
      UPDATE "memberships" m
      SET "expiry_date" = COALESCE(m.start_date, m.created_at) + INTERVAL '1825 days', "updated_at" = now()
      FROM "membership_categories" c
      WHERE m.category_id = c.id
        AND (c.code = 'LION_COUNSELOR_AMBASSADOR' OR (m.application_data->>'membership_type') ILIKE '%Lion%' OR (m.application_data->>'membership_type') ILIKE '%Counselor%' OR (m.application_data->>'membership_type') ILIKE '%Ambassador%')
        AND m.start_date IS NOT NULL
    `);

    // If Director / Council -> expiry_date = start_date + INTERVAL '3650 days'
    await queryRunner.query(`
      UPDATE "memberships" m
      SET "expiry_date" = COALESCE(m.start_date, m.created_at) + INTERVAL '3650 days', "updated_at" = now()
      FROM "membership_categories" c
      WHERE m.category_id = c.id
        AND (c.code IN ('STATE_DIRECTOR', 'NATIONAL_COUNCIL_CELL') OR (m.application_data->>'membership_type') ILIKE '%Director%' OR (m.application_data->>'membership_type') ILIKE '%Council%')
        AND m.start_date IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback to default 365 days
    await queryRunner.query(`
      UPDATE "membership_categories"
      SET "validity_days" = 365, "updated_at" = now()
    `);
  }
}
