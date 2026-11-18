import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsEnabledToEvents1790830000000 implements MigrationInterface {
  name = 'AddIsEnabledToEvents1790830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "is_enabled" boolean NOT NULL DEFAULT true;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN IF EXISTS "is_enabled";`,
    );
  }
}

