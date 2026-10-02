import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEventsSchema1790670000000 implements MigrationInterface {
  name = 'CreateEventsSchema1790670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by" uuid,
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "short_information" character varying(500),
        "category" character varying(100) NOT NULL DEFAULT 'Seminar',
        "event_type" character varying(50) NOT NULL DEFAULT 'IN_PERSON',
        "cover_image_url" text,
        "start_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "end_at" TIMESTAMP WITH TIME ZONE,
        "all_day" boolean NOT NULL DEFAULT false,
        "location" character varying(255) NOT NULL,
        "address" text,
        "organized_by" character varying(255),
        "registration_required" boolean NOT NULL DEFAULT true,
        "capacity" integer NOT NULL DEFAULT 100,
        "registrations" integer NOT NULL DEFAULT 0,
        "per_person_limit" integer NOT NULL DEFAULT 1,
        "target_audience" character varying(100),
        "language" character varying(50),
        "tags" text,
        "status" character varying(30) NOT NULL DEFAULT 'UPCOMING',
        CONSTRAINT "PK_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_events_status" ON "events" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_events_category" ON "events" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_events_start_at" ON "events" ("start_at")`,
    );

    // Seed permissions for events
    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "name", "description") VALUES
        (uuid_generate_v4(), 'events.read', 'View events and activities'),
        (uuid_generate_v4(), 'events.create', 'Create new events'),
        (uuid_generate_v4(), 'events.manage', 'Edit, publish or delete events')
      ON CONFLICT ("name") DO NOTHING
    `);

    // Seed initial events matching UI reference
    await queryRunner.query(`
      INSERT INTO "events" (
        "id", "title", "description", "short_information", "category", "event_type",
        "cover_image_url", "start_at", "end_at", "location", "address",
        "organized_by", "capacity", "registrations", "status"
      ) VALUES
      (
        '10000000-0000-0000-0000-000000000001',
        'Human Rights Awareness Seminar',
        'Comprehensive community seminar covering fundamental human rights, constitutional protections, and accessible legal aid mechanisms for citizens.',
        'Interactive human rights education workshop for youth and community leaders.',
        'Seminar',
        'IN_PERSON',
        'https://picsum.photos/seed/hrsjm-event-01/400/300',
        '2026-10-15 10:00:00+05:30',
        '2026-10-15 13:00:00+05:30',
        'Kurla, Mumbai',
        'Community Hall, Near Kurla Station West, Mumbai 400070',
        'HRSJM Awareness Team',
        150,
        120,
        'UPCOMING'
      ),
      (
        '10000000-0000-0000-0000-000000000002',
        'Food Distribution Drive',
        'Essential ration and nutritional food kit distribution targeting low-income and vulnerable families across eastern suburbs.',
        'Weekly relief package distribution drive by HRSJM relief volunteers.',
        'Relief Activity',
        'IN_PERSON',
        'https://picsum.photos/seed/hrsjm-event-02/400/300',
        '2026-10-10 09:00:00+05:30',
        '2026-10-10 12:00:00+05:30',
        'Govandi, Mumbai',
        'HRSJM Relief Center, Shivaji Nagar, Govandi, Mumbai 400043',
        'HRSJM Relief Team',
        100,
        85,
        'UPCOMING'
      ),
      (
        '10000000-0000-0000-0000-000000000003',
        'Legal Awareness Camp',
        'Free legal consultation camp staffed by volunteer advocates covering tenancy rights, consumer protection, and police procedures.',
        'Free walk-in legal aid desk with volunteer advocates.',
        'Awareness Camp',
        'IN_PERSON',
        'https://picsum.photos/seed/hrsjm-event-03/400/300',
        '2026-09-28 11:00:00+05:30',
        '2026-09-28 14:00:00+05:30',
        'Mankhurd, Kurla',
        'Transit Camp Ground, PMGP Colony, Mankhurd, Mumbai 400043',
        'HRSJM Legal Team',
        80,
        60,
        'UPCOMING'
      ),
      (
        '10000000-0000-0000-0000-000000000004',
        'Free Medical Checkup Camp',
        'General health screening, diabetes check, blood pressure monitoring, eye exams, and basic medicine distribution for residents.',
        'Comprehensive health checkup camp conducted by panel doctors.',
        'Health Camp',
        'IN_PERSON',
        'https://picsum.photos/seed/hrsjm-event-04/400/300',
        '2026-10-08 09:00:00+05:30',
        '2026-10-08 16:00:00+05:30',
        'Dharavi, Mumbai',
        'Municipal School Ground, 90 Feet Road, Dharavi, Mumbai 400017',
        'HRSJM Health Team',
        200,
        95,
        'UPCOMING'
      )
      ON CONFLICT ("id") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "events"`);
  }
}
