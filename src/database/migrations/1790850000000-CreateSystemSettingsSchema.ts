import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemSettingsSchema1790850000000 implements MigrationInterface {
  name = 'CreateSystemSettingsSchema1790850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "system_settings" (
        "key" character varying(100) NOT NULL,
        "value" jsonb NOT NULL DEFAULT '{}',
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_system_settings_key" PRIMARY KEY ("key")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "system_settings";`);
  }
}

