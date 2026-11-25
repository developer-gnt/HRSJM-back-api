import { MigrationInterface, QueryRunner } from 'typeorm';

export class PurgePendingIncompleteDonations1790900000000 implements MigrationInterface {
  name = 'PurgePendingIncompleteDonations1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Delete associated payments that are not completed
    await queryRunner.query(`
      DELETE FROM donation_payments
      WHERE donation_id IN (SELECT id FROM donations WHERE status != 'SUCCESS')
         OR payment_status != 'SUCCESS';
    `);

    // 2. Delete all pending, failed, or incomplete donation intents
    await queryRunner.query(`
      DELETE FROM donations
      WHERE status != 'SUCCESS';
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible cleanup of incomplete records
  }
}
