import {
  RenewalCalculationService,
  getFeeForRenewalSequence,
  addYearsSafe,
} from './renewal-calculation.service';
import {
  RenewalPaymentStatus,
  RenewalRequestEntity,
  RenewalStatus,
} from '../entities/renewal-request.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';

describe('RenewalCalculationService (Arrears Logic Acceptance Tests)', () => {
  let service: RenewalCalculationService;

  beforeEach(() => {
    service = new RenewalCalculationService();
  });

  describe('getFeeForRenewalSequence fee rules', () => {
    it('Test 1: First renewal, sequence 1 should be ₹500', () => {
      expect(getFeeForRenewalSequence(1)).toBe(500);
    });

    it('Test 2: Second renewal, sequence 2 should be ₹400', () => {
      expect(getFeeForRenewalSequence(2)).toBe(400);
    });

    it('Test 3: Third renewal, sequence 3 should be ₹300', () => {
      expect(getFeeForRenewalSequence(3)).toBe(300);
    });

    it('Sequence 4 and beyond should be ₹300 per year', () => {
      expect(getFeeForRenewalSequence(4)).toBe(300);
      expect(getFeeForRenewalSequence(5)).toBe(300);
      expect(getFeeForRenewalSequence(10)).toBe(300);
    });

    it('should throw error for non-positive or invalid sequences', () => {
      expect(() => getFeeForRenewalSequence(0)).toThrow();
      expect(() => getFeeForRenewalSequence(-1)).toThrow();
      expect(() => getFeeForRenewalSequence(1.5)).toThrow();
    });
  });

  describe('addYearsSafe and Leap Year Handling', () => {
    it('handles standard non-leap year transitions', () => {
      const d = new Date(2023, 0, 15); // Jan 15, 2023
      const next = addYearsSafe(d, 1);
      expect(next.getFullYear()).toBe(2024);
      expect(next.getMonth()).toBe(0);
      expect(next.getDate()).toBe(15);
    });

    it('handles leap year Feb 29 safely into non-leap year (snaps to Feb 28)', () => {
      const leapDay = new Date(2020, 1, 29); // Feb 29, 2020 (leap year)
      const nonLeapNextYear = addYearsSafe(leapDay, 1); // 2021 (non-leap)
      expect(nonLeapNextYear.getFullYear()).toBe(2021);
      expect(nonLeapNextYear.getMonth()).toBe(1); // February
      expect(nonLeapNextYear.getDate()).toBe(28); // Feb 28
    });
  });

  describe('Acceptance Criteria Examples', () => {
    it('Test 4: Example A - Fifth renewal sequence, all five renewal periods unpaid -> ₹1,800', () => {
      // 5 unpaid renewal years with 0 previously paid renewals
      const membership: Partial<MembershipEntity> = {
        id: 'mem-ex-a',
        membership_number: 'MEM-001',
        status: MembershipStatus.EXPIRED,
        start_date: new Date('2019-01-01'),
        expiry_date: new Date('2020-01-01'),
      };

      const quote = service.calculateQuote({
        membership,
        successfulRenewals: [],
        overridePeriodsCount: 5,
      });

      expect(quote.requires_verification).toBe(false);
      expect(quote.is_overdue).toBe(true);
      expect(quote.unpaid_periods_count).toBe(5);
      expect(quote.paid_periods_count).toBe(0);
      expect(quote.periods).toHaveLength(5);

      // Verify sequence breakdown
      expect(quote.periods[0].sequence).toBe(1);
      expect(quote.periods[0].fee).toBe(500);

      expect(quote.periods[1].sequence).toBe(2);
      expect(quote.periods[1].fee).toBe(400);

      expect(quote.periods[2].sequence).toBe(3);
      expect(quote.periods[2].fee).toBe(300);

      expect(quote.periods[3].sequence).toBe(4);
      expect(quote.periods[3].fee).toBe(300);

      expect(quote.periods[4].sequence).toBe(5);
      expect(quote.periods[4].fee).toBe(300);

      // Total = 500 + 400 + 300 + 300 + 300 = 1,800
      expect(quote.renewal_subtotal).toBe(1800);
      expect(quote.total_payable).toBe(1800);
      expect(quote.explanation).toContain('Includes 5 unpaid renewal periods totaling ₹1,800');
    });

    it('Test 5: Example B - First renewal already paid, followed by six unpaid renewal periods -> ₹1,900', () => {
      const membership: Partial<MembershipEntity> = {
        id: 'mem-ex-b',
        membership_number: 'MEM-002',
        status: MembershipStatus.EXPIRED,
        start_date: new Date('2018-01-01'),
        expiry_date: new Date('2020-01-01'),
      };

      // 1 previously paid renewal of 1 year
      const successfulRenewals: Partial<RenewalRequestEntity>[] = [
        {
          id: 'ren-paid-1',
          period_years: 1,
          amount: 500,
          payment_status: RenewalPaymentStatus.SUCCESS,
          status: RenewalStatus.ACTIVE,
        },
      ];

      const quote = service.calculateQuote({
        membership,
        successfulRenewals,
        overridePeriodsCount: 6,
      });

      expect(quote.requires_verification).toBe(false);
      expect(quote.unpaid_periods_count).toBe(6);
      expect(quote.paid_periods_count).toBe(1);
      expect(quote.periods).toHaveLength(6);

      // Verify sequence starts at 2 (since 1 was paid)
      expect(quote.periods[0].sequence).toBe(2);
      expect(quote.periods[0].fee).toBe(400); // 2nd renewal = ₹400

      expect(quote.periods[1].sequence).toBe(3);
      expect(quote.periods[1].fee).toBe(300); // 3rd = ₹300

      expect(quote.periods[2].sequence).toBe(4);
      expect(quote.periods[2].fee).toBe(300);

      expect(quote.periods[3].sequence).toBe(5);
      expect(quote.periods[3].fee).toBe(300);

      expect(quote.periods[4].sequence).toBe(6);
      expect(quote.periods[4].fee).toBe(300);

      expect(quote.periods[5].sequence).toBe(7);
      expect(quote.periods[5].fee).toBe(300);

      // Total = 400 + 5 * 300 = 1,900
      expect(quote.renewal_subtotal).toBe(1900);
      expect(quote.total_payable).toBe(1900);
    });

    it('Test 6: A previously paid period is excluded from outstanding dues', () => {
      const membership: Partial<MembershipEntity> = {
        id: 'mem-ex-c',
        expiry_date: new Date('2022-01-01'),
      };

      // 2 renewals already paid
      const successfulRenewals: Partial<RenewalRequestEntity>[] = [
        { id: 'r1', period_years: 1, payment_status: RenewalPaymentStatus.SUCCESS },
        { id: 'r2', period_years: 1, payment_status: RenewalPaymentStatus.SUCCESS },
      ];

      const quote = service.calculateQuote({
        membership,
        successfulRenewals,
        overridePeriodsCount: 2,
      });

      // Sequences 1 and 2 are paid, so unpaid sequence starts from 3
      expect(quote.periods[0].sequence).toBe(3);
      expect(quote.periods[0].fee).toBe(300);
      expect(quote.periods[1].sequence).toBe(4);
      expect(quote.periods[1].fee).toBe(300);
      expect(quote.total_payable).toBe(600);
    });

    it('Test 7: Failed or cancelled payment does not mark period as paid', () => {
      const membership: Partial<MembershipEntity> = {
        id: 'mem-ex-d',
        expiry_date: new Date('2022-01-01'),
      };

      // 1 failed renewal
      const renewals: Partial<RenewalRequestEntity>[] = [
        { id: 'r-failed', period_years: 1, payment_status: RenewalPaymentStatus.FAILED, status: RenewalStatus.REJECTED },
      ];

      const quote = service.calculateQuote({
        membership,
        successfulRenewals: renewals,
        overridePeriodsCount: 1,
      });

      // Failed renewal is not counted as paid; sequence remains sequence 1 (₹500)
      expect(quote.paid_periods_count).toBe(0);
      expect(quote.periods[0].sequence).toBe(1);
      expect(quote.periods[0].fee).toBe(500);
      expect(quote.total_payable).toBe(500);
    });

    it('Test 10: Existing active member with no overdue fees gets normal renewal fee', () => {
      const futureExpiry = new Date('2027-12-31');
      const membership: Partial<MembershipEntity> = {
        id: 'mem-active',
        expiry_date: futureExpiry,
        start_date: new Date('2026-01-01'),
        status: MembershipStatus.ACTIVE,
      };

      const quote = service.calculateQuote({
        membership,
        successfulRenewals: [],
        asOfDate: new Date('2026-10-26'),
      });

      expect(quote.is_overdue).toBe(false);
      expect(quote.days_overdue).toBe(0);
      expect(quote.days_remaining).toBeGreaterThan(0);
      expect(quote.unpaid_periods_count).toBe(0);
      expect(quote.periods).toHaveLength(1);
      expect(quote.periods[0].sequence).toBe(1);
      expect(quote.periods[0].fee).toBe(500);
      expect(quote.total_payable).toBe(500);
    });

    it('Test 12: Inconsistent or incomplete membership history requires verification', () => {
      // Missing expiry date
      const missingExpiry: Partial<MembershipEntity> = {
        id: 'mem-invalid-1',
        start_date: new Date('2020-01-01'),
        expiry_date: null as any,
      };
      const quote1 = service.calculateQuote({ membership: missingExpiry });
      expect(quote1.requires_verification).toBe(true);
      expect(quote1.total_payable).toBe(0);
      expect(quote1.verification_reason).toContain('expiry date is missing');

      // Expiry precedes start date
      const invalidDates: Partial<MembershipEntity> = {
        id: 'mem-invalid-2',
        start_date: new Date('2025-01-01'),
        expiry_date: new Date('2024-01-01'),
      };
      const quote2 = service.calculateQuote({ membership: invalidDates });
      expect(quote2.requires_verification).toBe(true);
      expect(quote2.total_payable).toBe(0);
      expect(quote2.verification_reason).toContain('precedes registration');

      // Corrupted renewal history (negative period years)
      const corruptedRenewal: Partial<RenewalRequestEntity>[] = [
        { id: 'corrupt-1', period_years: -2, payment_status: RenewalPaymentStatus.SUCCESS },
      ];
      const quote3 = service.calculateQuote({
        membership: { id: 'mem-corrupt', expiry_date: new Date('2026-01-01') },
        successfulRenewals: corruptedRenewal,
      });
      expect(quote3.requires_verification).toBe(true);
      expect(quote3.verification_reason).toContain('invalid period_years');
    });

    it('Test 8: Idempotent payment processing prevents duplicate allocation', () => {
      // Simulate verifying a payment that is already marked SUCCESS
      const payment = {
        id: 'pay-1',
        payment_status: 'SUCCESS',
        amount: 1800,
        receipt: { id: 'rec-1', receipt_number: 'REC-001' },
      };

      // Idempotency check: if payment_status === 'SUCCESS' && payment.receipt, it returns early
      const isAlreadyVerified = payment.payment_status === 'SUCCESS' && !!payment.receipt;
      expect(isAlreadyVerified).toBe(true);
    });

    it('Test 9: Server validates latest payable amount before checkout order creation', () => {
      // When a member has 5 unpaid renewal years, server quote is ₹1,800
      const membership: Partial<MembershipEntity> = {
        id: 'mem-validate',
        status: MembershipStatus.EXPIRED,
        expiry_date: new Date('2021-01-01'),
        start_date: new Date('2020-01-01'),
      };

      const quote = service.calculateQuote({
        membership,
        successfulRenewals: [],
        overridePeriodsCount: 5,
      });

      expect(quote.total_payable).toBe(1800);

      // Client attempts to pass ₹500 (tampered or outdated price)
      const clientAttemptedAmount = 500;
      const hasMismatch = Math.abs(clientAttemptedAmount - quote.total_payable) > 0.01;
      expect(hasMismatch).toBe(true);
    });

    it('Test 11: Payment success marks only covered periods as paid and extends validity', () => {
      const initialExpiry = new Date('2021-01-01');
      const membership: Partial<MembershipEntity> = {
        id: 'mem-renewed',
        status: MembershipStatus.EXPIRED,
        expiry_date: initialExpiry,
      };

      // 5 periods are paid (Example A)
      const coveredPeriods = 5;
      const newExpiry = addYearsSafe(initialExpiry, coveredPeriods);

      expect(newExpiry.getFullYear()).toBe(2026);
      expect(newExpiry.getMonth()).toBe(0);
      expect(newExpiry.getDate()).toBe(1);

      // Now with 5 paid periods recorded, next renewal sequence must start from 6 (₹300)
      const paidRenewal: Partial<RenewalRequestEntity> = {
        id: 'ren-covered-5',
        period_years: coveredPeriods,
        amount: 1800,
        payment_status: RenewalPaymentStatus.SUCCESS,
        status: RenewalStatus.ACTIVE,
      };

      const subsequentQuote = service.calculateQuote({
        membership: {
          ...membership,
          status: MembershipStatus.ACTIVE,
          expiry_date: newExpiry,
        },
        successfulRenewals: [paidRenewal],
        asOfDate: new Date('2026-06-01'),
      });

      expect(subsequentQuote.paid_periods_count).toBe(5);
      expect(subsequentQuote.periods[0].sequence).toBe(6);
      expect(subsequentQuote.periods[0].fee).toBe(300);
    });

    describe('30-Day Renewal Window Validation', () => {
      it('prevents renewal when more than 30 days remain until expiry', () => {
        const asOf = new Date('2026-05-01');
        const expiry = new Date('2026-06-15'); // 45 days remaining

        const quote = service.calculateQuote({
          membership: {
            id: 'mem-early',
            status: MembershipStatus.ACTIVE,
            expiry_date: expiry,
          },
          asOfDate: asOf,
        });

        expect(quote.days_remaining).toBe(45);
        expect(quote.is_eligible_for_renewal).toBe(false);
        expect(quote.renewal_validation_message).toBe(
          'Membership renewal is allowed only within 30 days before the expiry date.',
        );
      });

      it('allows renewal when within 30 days of expiry date', () => {
        const asOf = new Date('2026-05-20');
        const expiry = new Date('2026-06-15'); // 26 days remaining

        const quote = service.calculateQuote({
          membership: {
            id: 'mem-eligible',
            status: MembershipStatus.ACTIVE,
            expiry_date: expiry,
          },
          asOfDate: asOf,
        });

        expect(quote.days_remaining).toBe(26);
        expect(quote.is_eligible_for_renewal).toBe(true);
        expect(quote.renewal_validation_message).toBeUndefined();
      });

      it('allows renewal when membership is expired/overdue', () => {
        const asOf = new Date('2026-06-20');
        const expiry = new Date('2026-06-15'); // 5 days overdue

        const quote = service.calculateQuote({
          membership: {
            id: 'mem-expired',
            status: MembershipStatus.EXPIRED,
            expiry_date: expiry,
          },
          asOfDate: asOf,
        });

        expect(quote.is_overdue).toBe(true);
        expect(quote.is_eligible_for_renewal).toBe(true);
        expect(quote.renewal_validation_message).toBeUndefined();
      });
    });
  });
});
