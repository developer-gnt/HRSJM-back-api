import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedOfficialExpenseAccounts1790710000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const expenseTypes = [
      {
        code: '5001',
        name: 'Employee & Staff Expenses',
        desc: 'Salaries, wages, staff allowances, bonuses, medical benefits and employee welfare.',
      },
      {
        code: '5002',
        name: 'Office & Administration',
        desc: 'Office stationery, printing, courier, utilities, pantry, cleaning and general admin expenses.',
      },
      {
        code: '5003',
        name: 'Program / Project Expenses',
        desc: 'Field campaigns, human rights workshops, awareness drives, survey & research projects.',
      },
      {
        code: '5004',
        name: 'Travel & Transportation',
        desc: 'Conveyance, fuel, bus/train/flight tickets, local transit, lodging and travel allowances.',
      },
      {
        code: '5005',
        name: 'Communication & Awareness',
        desc: 'Pamphlets, brochures, banners, social media marketing, advertising, press releases and public relations.',
      },
      {
        code: '5006',
        name: 'Events & Activities',
        desc: 'Venue booking, stage setup, audio/visual equipment, catering, guest honorariums and certificates.',
      },
      {
        code: '5007',
        name: 'IT & Technology',
        desc: 'Software licenses, domain/hosting, cloud servers, mobile app/portal maintenance, IT support.',
      },
      {
        code: '5008',
        name: 'Assets & Equipment',
        desc: 'Office furniture, computers, cameras, printers, projectors and electronic apparatus purchases/maintenance.',
      },
      {
        code: '5009',
        name: 'Beneficiary Assistance',
        desc: 'Direct humanitarian aid, medical relief funds, legal aid subsidies, emergency distress grants.',
      },
      {
        code: '5010',
        name: 'Compliance & Governance',
        desc: 'Auditor fees, legal consultancy, ROC filings, 80G/12A renewals, society registration & compliance fees.',
      },
      {
        code: '5011',
        name: 'Fundraising Expenses',
        desc: 'Donation collection drives, fundraising campaigns, donor engagement material, crowdfunding charges.',
      },
      {
        code: '5012',
        name: 'Volunteer Expenses',
        desc: 'Volunteer stipends, refreshment, volunteer badges/t-shirts, training kits and appreciation awards.',
      },
      {
        code: '5013',
        name: 'Premises Expenses',
        desc: 'Office rent, society maintenance charges, electricity, water bills, property repair and lease costs.',
      },
      {
        code: '5014',
        name: 'Financial Expenses',
        desc: 'Bank transaction charges, payment gateway processing fees, cheque bounce fees, interest/charges.',
      },
      {
        code: '5015',
        name: 'Miscellaneous',
        desc: 'Sundry and ad-hoc minor expenses not covered under other defined heads.',
      },
    ];

    for (const exp of expenseTypes) {
      await queryRunner.query(
        `INSERT INTO "accounts" ("id", "account_code", "account_name", "account_type", "description", "is_active")
         VALUES (uuid_generate_v4(), $1, $2, 'EXPENSE', $3, true)
         ON CONFLICT ("account_code")
         DO UPDATE SET
           "account_name" = EXCLUDED."account_name",
           "description" = EXCLUDED."description",
           "is_active" = true`,
        [exp.code, exp.name, exp.desc],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Keep baseline seeded accounts intact
  }
}
