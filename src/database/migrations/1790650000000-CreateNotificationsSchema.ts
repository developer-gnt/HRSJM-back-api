import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsSchema1790650000000 implements MigrationInterface {
  name = 'CreateNotificationsSchema1790650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by" uuid,
        "title" character varying(150) NOT NULL,
        "body" text NOT NULL,
        "target_audience" character varying(50) NOT NULL DEFAULT 'ALL_USERS',
        "status" character varying(30) NOT NULL DEFAULT 'SCHEDULED',
        "scheduled_at" TIMESTAMP WITH TIME ZONE,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_notifications_status" ON "notifications" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_target_audience" ON "notifications" ("target_audience")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_scheduled_at" ON "notifications" ("scheduled_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "notification_recipients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by" uuid,
        "notification_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "delivery_status" character varying(30) NOT NULL DEFAULT 'SENT',
        "read_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_notification_recipients_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_notification_recipients_user_id" ON "notification_recipients" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notification_recipients_notification_id" ON "notification_recipients" ("notification_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notification_recipients_read_at" ON "notification_recipients" ("read_at")`,
    );

    await queryRunner.query(`
      ALTER TABLE "notification_recipients"
      ADD CONSTRAINT "FK_notification_recipients_notification"
      FOREIGN KEY ("notification_id") REFERENCES "notifications"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "notification_recipients"
      ADD CONSTRAINT "FK_notification_recipients_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Seed permissions for notifications module
    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "name", "description") VALUES
        (uuid_generate_v4(), 'notification.read', 'View notifications catalog and recipient logs'),
        (uuid_generate_v4(), 'notification.create', 'Create and broadcast notifications'),
        (uuid_generate_v4(), 'notification.manage', 'Manage notification schedules and statuses')
      ON CONFLICT ("name") DO NOTHING
    `);

    // Grant newly added permissions to baseline ADMIN role
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id FROM "roles" r, "permissions" p
      WHERE r.name = 'ADMIN'
        AND p.name IN (
          'notification.read',
          'notification.create',
          'notification.manage'
        )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "name" IN (
          'notification.read',
          'notification.create',
          'notification.manage'
        )
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "name" IN (
        'notification.read',
        'notification.create',
        'notification.manage'
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "notification_recipients" DROP CONSTRAINT "FK_notification_recipients_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" DROP CONSTRAINT "FK_notification_recipients_notification"`,
    );
    await queryRunner.query(`DROP TABLE "notification_recipients"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
