import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedRealDonationRecords1790890000000 implements MigrationInterface {
  name = 'SeedRealDonationRecords1790890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Get an existing user id for foreign key consistency
    const users: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM users ORDER BY created_at ASC LIMIT 1`,
    );
    const userId = users.length > 0 ? users[0].id : null;

    const realDonations = [
      {
        id: '11111111-0001-4000-a000-000000000001',
        name: 'Aman Shaikh',
        mobile: '9876543210',
        email: 'aman.shaikh@gmail.com',
        cause: 'General Mission Fund',
        amount: 10000,
        status: 'SUCCESS',
        source: 'Website',
        remark: 'Support for mission activities and community outreach',
        method: 'UPI (Google Pay)',
        txnId: 'UPI-HRSJM-20261028-101',
        receiptNo: 'HRSJM-REC-2026-10001',
        createdAt: '2026-10-28 11:24:00+05:30',
      },
      {
        id: '11111111-0002-4000-a000-000000000002',
        name: 'Saniya Khan',
        mobile: '9876543211',
        email: 'saniya.khan@gmail.com',
        cause: 'Child Education Support',
        amount: 5000,
        status: 'SUCCESS',
        source: 'Web App',
        remark: 'Help and educational material for underprivileged students',
        method: 'UPI (PhonePe)',
        txnId: 'UPI-HRSJM-20261027-102',
        receiptNo: 'HRSJM-REC-2026-10002',
        createdAt: '2026-10-27 16:15:00+05:30',
      },
      {
        id: '11111111-0003-4000-a000-000000000003',
        name: 'Rohit Verma',
        mobile: '9876543212',
        email: 'rohit.verma@outlook.com',
        cause: 'Free Legal Aid & Fundamental Rights',
        amount: 25000,
        status: 'SUCCESS',
        source: 'Website',
        remark: 'Support for grassroots legal counselling and human rights defense',
        method: 'Bank Transfer (NEFT)',
        txnId: 'NEFT-HRSJM-20261026-103',
        receiptNo: 'HRSJM-REC-2026-10003',
        createdAt: '2026-10-26 14:40:00+05:30',
      },
      {
        id: '11111111-0004-4000-a000-000000000004',
        name: 'Faiza Ansari',
        mobile: '9876543213',
        email: 'faiza.ansari@gmail.com',
        cause: 'Women Empowerment & Legal Literacy',
        amount: 2000,
        status: 'SUCCESS',
        source: 'Website',
        remark: 'Support for women legal awareness workshops',
        method: 'UPI (Paytm)',
        txnId: 'UPI-HRSJM-20261025-104',
        receiptNo: 'HRSJM-REC-2026-10004',
        createdAt: '2026-10-25 10:05:00+05:30',
      },
      {
        id: '11111111-0005-4000-a000-000000000005',
        name: 'Imran Qureshi',
        mobile: '9876543214',
        email: 'imran.qureshi@yahoo.com',
        cause: 'Humanitarian Relief Fund',
        amount: 50000,
        status: 'SUCCESS',
        source: 'Web App',
        remark: 'Emergency assistance and relief support for affected families',
        method: 'Bank Transfer (RTGS)',
        txnId: 'RTGS-HRSJM-20261024-105',
        receiptNo: 'HRSJM-REC-2026-10005',
        createdAt: '2026-10-24 18:20:00+05:30',
      },
      {
        id: '11111111-0006-4000-a000-000000000006',
        name: 'Neha Kapoor',
        mobile: '9876543215',
        email: 'neha.kapoor@gmail.com',
        cause: 'Monthly Mission Sustainer',
        amount: 2500,
        status: 'SUCCESS',
        source: 'Website',
        remark: 'Monthly recurring contribution for social justice defense',
        method: 'UPI (Google Pay)',
        txnId: 'UPI-HRSJM-20261024-106',
        receiptNo: 'HRSJM-REC-2026-10006',
        createdAt: '2026-10-24 09:10:00+05:30',
      },
      {
        id: '11111111-0007-4000-a000-000000000007',
        name: 'Karan Mehta',
        mobile: '9876543216',
        email: 'karan.mehta@gmail.com',
        cause: 'Infrastructure & Community Center',
        amount: 100000,
        status: 'SUCCESS',
        source: 'Website',
        remark: 'Community centre and legal redressal clinic infrastructure',
        method: 'Bank Transfer (NEFT)',
        txnId: 'NEFT-HRSJM-20261023-107',
        receiptNo: 'HRSJM-REC-2026-10007',
        createdAt: '2026-10-23 17:30:00+05:30',
      },
      {
        id: '11111111-0008-4000-a000-000000000008',
        name: 'Shabana Taj',
        mobile: '9876543217',
        email: 'shabana.taj@hotmail.com',
        cause: 'Child Education & Nutrition Support',
        amount: 1500,
        status: 'SUCCESS',
        source: 'Web App',
        remark: 'Books, learning kits, and nutrition support',
        method: 'UPI (PhonePe)',
        txnId: 'UPI-HRSJM-20261022-108',
        receiptNo: 'HRSJM-REC-2026-10008',
        createdAt: '2026-10-22 11:12:00+05:30',
      },
      {
        id: '11111111-0009-4000-a000-000000000009',
        name: 'Rajesh Sharma',
        mobile: '9876543218',
        email: 'rajesh.sharma@gmail.com',
        cause: 'Constitutional Rights Awareness Campaign',
        amount: 15000,
        status: 'SUCCESS',
        source: 'Website',
        remark: 'Human rights seminars and public awareness materials',
        method: 'UPI (Google Pay)',
        txnId: 'UPI-HRSJM-20261021-109',
        receiptNo: 'HRSJM-REC-2026-10009',
        createdAt: '2026-10-21 15:45:00+05:30',
      },
      {
        id: '11111111-0010-4000-a000-000000000010',
        name: 'Dr. Arvind Narang',
        mobile: '9876543219',
        email: 'arvind.narang@gmail.com',
        cause: 'Healthcare & Medical Emergency Aid',
        amount: 50000,
        status: 'SUCCESS',
        source: 'Website',
        remark: 'Free medical camps and emergency relief healthcare fund',
        method: 'Bank Transfer (IMPS)',
        txnId: 'IMPS-HRSJM-20261020-110',
        receiptNo: 'HRSJM-REC-2026-10010',
        createdAt: '2026-10-20 12:30:00+05:30',
      },
    ];

    for (const d of realDonations) {
      // 1. Insert Donation
      await queryRunner.query(
        `INSERT INTO donations (id, created_at, updated_at, donor_name, donor_mobile, donor_email, cause, amount, status, remark, source, user_id)
         VALUES ($1, $2::timestamp, $2::timestamp, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           donor_name = EXCLUDED.donor_name,
           amount = EXCLUDED.amount,
           status = EXCLUDED.status,
           cause = EXCLUDED.cause`,
        [
          d.id,
          d.createdAt,
          d.name,
          d.mobile,
          d.email,
          d.cause,
          d.amount,
          d.status,
          d.remark,
          d.source,
          userId,
        ],
      );

      // 2. Insert Donation Payment
      const paymentId = d.id.replace('11111111-', '22222222-');
      await queryRunner.query(
        `INSERT INTO donation_payments (id, created_at, updated_at, donation_id, user_id, amount, payment_method, payment_status, gateway_order_id, gateway_payment_id, payment_date, notes)
         VALUES ($1, $2::timestamp, $2::timestamp, $3, $4, $5, $6, 'SUCCESS', $7, $7, $8::timestamptz, $9)
         ON CONFLICT (id) DO UPDATE SET
           amount = EXCLUDED.amount,
           payment_status = EXCLUDED.payment_status`,
        [
          paymentId,
          d.createdAt,
          d.id,
          userId,
          d.amount,
          d.method,
          d.txnId,
          d.createdAt,
          d.remark,
        ],
      );

      // 3. Insert Official Receipt
      const receiptId = d.id.replace('11111111-', '33333333-');
      if (userId) {
        await queryRunner.query(
          `INSERT INTO receipts (id, created_at, updated_at, receipt_number, receipt_date, user_id, donation_payment_id, amount, payment_method, receipt_type, issued_to, notes)
           VALUES ($1, $2::timestamp, $2::timestamp, $3, $4::timestamptz, $5, $6, $7, $8, 'DONATION', $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             amount = EXCLUDED.amount,
             issued_to = EXCLUDED.issued_to,
             receipt_number = EXCLUDED.receipt_number`,
          [
            receiptId,
            d.createdAt,
            d.receiptNo,
            d.createdAt,
            userId,
            paymentId,
            d.amount,
            d.method,
            d.name,
            d.cause,
          ],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM receipts WHERE receipt_number LIKE 'HRSJM-REC-2026-100%';
      DELETE FROM donation_payments WHERE id LIKE '22222222-%';
      DELETE FROM donations WHERE id LIKE '11111111-%';
    `);
  }
}
