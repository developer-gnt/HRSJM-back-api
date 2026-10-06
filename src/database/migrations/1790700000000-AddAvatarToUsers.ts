import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAvatarToUsers1790700000000 implements MigrationInterface {
    name = 'AddAvatarToUsers1790700000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar"`);
    }
}
