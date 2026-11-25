import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTestEntriesFromMembershipsComplaintsDonations1790860000000 implements MigrationInterface {
  name = 'RemoveTestEntriesFromMembershipsComplaintsDonations1790860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Remove test Complaints (Support Tickets & Messages)
    await queryRunner.query(`
      DELETE FROM support_ticket_messages 
      WHERE ticket_id IN (
        SELECT st.id FROM support_tickets st
        LEFT JOIN users u ON st.user_id = u.id
        WHERE st.subject ILIKE '%test%' 
           OR st.subject ILIKE '%asdf%' 
           OR st.subject ILIKE '%qwerty%'
           OR st.description ILIKE '%test%'
           OR u.email ILIKE '%test%'
           OR u.full_name ILIKE '%test%'
           OR u.full_name ILIKE '%sahil%'
      );
    `);

    await queryRunner.query(`
      DELETE FROM support_tickets 
      WHERE id IN (
        SELECT st.id FROM support_tickets st
        LEFT JOIN users u ON st.user_id = u.id
        WHERE st.subject ILIKE '%test%' 
           OR st.subject ILIKE '%asdf%' 
           OR st.subject ILIKE '%qwerty%'
           OR st.description ILIKE '%test%'
           OR u.email ILIKE '%test%'
           OR u.full_name ILIKE '%test%'
           OR u.full_name ILIKE '%sahil%'
      );
    `);

    // 2. Remove test Donations (Donations, Payments, Refunds)
    await queryRunner.query(`
      DELETE FROM donation_refunds 
      WHERE donation_payment_id IN (
        SELECT dp.id FROM donation_payments dp
        JOIN donations d ON dp.donation_id = d.id
        WHERE d.donor_name ILIKE '%test%' 
           OR d.donor_email ILIKE '%test%' 
           OR d.donor_name ILIKE '%sahil%' 
           OR d.remark ILIKE '%test%'
           OR d.donor_name ILIKE '%Cashfree Verification%'
      );
    `);

    await queryRunner.query(`
      DELETE FROM donation_payments 
      WHERE donation_id IN (
        SELECT id FROM donations 
        WHERE donor_name ILIKE '%test%' 
           OR donor_email ILIKE '%test%' 
           OR donor_name ILIKE '%sahil%' 
           OR remark ILIKE '%test%'
           OR donor_name ILIKE '%Cashfree Verification%'
      );
    `);

    await queryRunner.query(`
      DELETE FROM donations 
      WHERE donor_name ILIKE '%test%' 
         OR donor_email ILIKE '%test%' 
         OR donor_name ILIKE '%sahil%' 
         OR remark ILIKE '%test%'
         OR donor_name ILIKE '%Cashfree Verification%';
    `);

    // 3. Remove test Memberships (preserving all ~5,510 official historical roster memberships)
    await queryRunner.query(`
      DELETE FROM membership_payments 
      WHERE membership_id IN (
        SELECT m.id FROM memberships m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.membership_number LIKE 'HRSJM-000%'
           OR m.membership_number IS NULL
           OR m.membership_number = 'HRSJM-MEM-4974'
           OR u.email ILIKE '%test%'
           OR u.full_name ILIKE '%test%'
           OR m.application_data->>'full_name' ILIKE '%test%'
           OR m.application_data->>'full_name' IN ('qwertyuiop', 'Regular User', 'Test User', 'Test Applicant', 'Test Big')
      );
    `);

    await queryRunner.query(`
      DELETE FROM membership_renewals 
      WHERE membership_id IN (
        SELECT m.id FROM memberships m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.membership_number LIKE 'HRSJM-000%'
           OR m.membership_number IS NULL
           OR m.membership_number = 'HRSJM-MEM-4974'
           OR u.email ILIKE '%test%'
           OR u.full_name ILIKE '%test%'
           OR m.application_data->>'full_name' ILIKE '%test%'
           OR m.application_data->>'full_name' IN ('qwertyuiop', 'Regular User', 'Test User', 'Test Applicant', 'Test Big')
      );
    `);

    await queryRunner.query(`
      DELETE FROM memberships 
      WHERE id IN (
        SELECT m.id FROM memberships m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.membership_number LIKE 'HRSJM-000%'
           OR m.membership_number IS NULL
           OR m.membership_number = 'HRSJM-MEM-4974'
           OR u.email ILIKE '%test%'
           OR u.full_name ILIKE '%test%'
           OR m.application_data->>'full_name' ILIKE '%test%'
           OR m.application_data->>'full_name' IN ('qwertyuiop', 'Regular User', 'Test User', 'Test Applicant', 'Test Big')
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Test data cleanup does not need rollback restoration
  }
}
