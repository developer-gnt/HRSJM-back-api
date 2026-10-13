import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDobToUsers1790720000000 implements MigrationInterface {
  name = 'AddDobToUsers1790720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dob" varchar(30)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "dob"`);
  }
}
