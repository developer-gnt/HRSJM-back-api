import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSourceToDonations1790780000000 implements MigrationInterface {
  name = 'AddSourceToDonations1790780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "source" varchar(50) DEFAULT 'Website'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "donations" DROP COLUMN IF EXISTS "source"`,
    );
  }
}

