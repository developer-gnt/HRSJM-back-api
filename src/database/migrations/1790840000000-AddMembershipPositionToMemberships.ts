import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMembershipPositionToMemberships1790840000000 implements MigrationInterface {
  name = 'AddMembershipPositionToMemberships1790840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "membership_position" character varying(100) DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP COLUMN IF EXISTS "membership_position"`,
    );
  }
}
