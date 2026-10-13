import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';
import { CashfreeOrdersService } from './cashfree-orders.service';
import { ACCOUNT_CODES } from '../../accounting/accounting.constants';

describe('Step 3: End-to-End Payment & Accounting Validation Suite', () => {
  let ordersService: CashfreeOrdersService;
  let mockCashfreeService: any;
  let mockDonationPaymentsService: any;
  let mockMembershipPaymentsService: any;
  let mockDonationPaymentsRepo: any;
  let mockMembershipPaymentsRepo: any;
  let mockTransactionsRepo: any;
  let mockDataSource: any;

  // Track accounting postings and receipts to assert exact uniqueness
  let journalEntries: any[] = [];
  let receiptsGenerated: any[] = [];

  beforeEach(() => {
    journalEntries = [];
    receiptsGenerated = [];

    mockCashfreeService = {
      createOrder: jest.fn(),
      getPaymentAttempts: jest.fn(),
      getOrder: jest.fn(),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };

    mockDonationPaymentsService = {
      verify: jest.fn().mockImplementation(async (id, dto, actingUser) => {
        const receipt = {
          id: `rec-${id}`,
          receipt_number: `HRSJM-REC-2026-001`,
          donation_payment_id: id,
          amount: 1000,
        };
        receiptsGenerated.push(receipt);

        journalEntries.push({
          reference_id: id,
          lines: [
            { account_code: ACCOUNT_CODES.BANK, debit_amount: 1000, credit_amount: 0 },
            { account_code: ACCOUNT_CODES.DONATION_INCOME, debit_amount: 0, credit_amount: 1000 },
          ],
        });

        return {
          payment: {
            id,
            payment_status: PaymentStatus.SUCCESS,
            gateway_order_id: dto.gateway_order_id,
            gateway_payment_id: dto.gateway_payment_id,
          },
          receipt,
        };
      }),
    };

    mockMembershipPaymentsService = {
      verify: jest.fn().mockImplementation(async (id, dto, actingUser) => {
        const receipt = {
          id: `rec-mem-${id}`,
          receipt_number: `HRSJM-MEM-REC-2026-001`,
          membership_payment_id: id,
          amount: 2500,
        };
        receiptsGenerated.push(receipt);

        journalEntries.push({
          reference_id: id,
          lines: [
            { account_code: ACCOUNT_CODES.BANK, debit_amount: 2500, credit_amount: 0 },
            { account_code: ACCOUNT_CODES.MEMBERSHIP_INCOME, debit_amount: 0, credit_amount: 2500 },
          ],
        });

        return {
          payment: {
            id,
            payment_status: PaymentStatus.SUCCESS,
            gateway_order_id: dto.gateway_order_id,
            gateway_payment_id: dto.gateway_payment_id,
          },
          receipt,
        };
      }),
    };

    mockDonationPaymentsRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    mockMembershipPaymentsRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    mockTransactionsRepo = {
      create: jest.fn().mockImplementation((val) => val),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockDataSource = {
      transaction: jest.fn((cb) => cb({ save: jest.fn(), create: jest.fn() })),
    };

    ordersService = new CashfreeOrdersService(
      mockCashfreeService,
      mockDonationPaymentsService,
      mockMembershipPaymentsService,
      mockDonationPaymentsRepo,
      mockMembershipPaymentsRepo,
      mockTransactionsRepo,
      mockDataSource,
    );
  });

  // CHECK 1: Successful donation
  describe('Check 1: Successful Donation Flow & Accounting Post', () => {
    it('creates exactly 1 payment, 1 receipt, 1 double-entry journal entry, and updates gateway order', async () => {
      const paymentRecord = {
        id: 'don-pay-101',
        user_id: 'user-1',
        payment_status: PaymentStatus.PENDING,
        amount: 1000,
        donation: { cause: 'Emergency Medical Aid', donor_name: 'Rahul V', donor_mobile: '9876543210', donor_email: 'rahul@test.com' },
      };

      mockDonationPaymentsRepo.findOne.mockResolvedValue(paymentRecord);
      mockCashfreeService.createOrder.mockResolvedValue({
        order_id: 'hrsjm_don_101',
        payment_session_id: 'session_101',
        order_status: 'ACTIVE',
      });

      // 1. Initiate order
      const order = await ordersService.createOrder({ purpose: 'donation', reference_id: 'don-pay-101' }, 'user-1');
      expect(order.order_id).toBe('hrsjm_don_101');
      expect(order.payment_session_id).toBe('session_101');
      expect(mockTransactionsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'INITIATED', amount: 1000 }),
      );

      // 2. Gateway confirms payment attempt
      mockCashfreeService.getPaymentAttempts.mockResolvedValue([
        { cf_payment_id: 55001, payment_status: 'SUCCESS', payment_amount: 1000, payment_currency: 'INR' },
      ]);

      // 3. Verify order
      const verifyRes = await ordersService.verifyOrder('hrsjm_don_101', 'user-1');
      expect(verifyRes.status).toBe('SUCCESS');
      expect(receiptsGenerated.length).toBe(1);
      expect(journalEntries.length).toBe(1);
      expect(journalEntries[0].lines[0].debit_amount).toBe(1000);
      expect(journalEntries[0].lines[1].credit_amount).toBe(1000);
    });
  });

  // CHECK 2: Successful membership payment
  describe('Check 2: Successful Membership Payment & Activation', () => {
    it('activates membership, issues receipt, and posts membership fee income', async () => {
      const memPayment = {
        id: 'mem-pay-202',
        user_id: 'member-user-1',
        membership_id: 'MEM-2026-99',
        payment_status: PaymentStatus.PENDING,
        amount: 2500,
        user: { full_name: 'Anita Desai', email: 'anita@test.com', mobile_number: '9811122233' },
      };

      mockMembershipPaymentsRepo.findOne.mockResolvedValue(memPayment);
      mockCashfreeService.createOrder.mockResolvedValue({
        order_id: 'hrsjm_mem_202',
        payment_session_id: 'session_202',
        order_status: 'ACTIVE',
      });

      await ordersService.createOrder({ purpose: 'membership', reference_id: 'mem-pay-202' }, 'member-user-1');

      mockCashfreeService.getPaymentAttempts.mockResolvedValue([
        { cf_payment_id: 88002, payment_status: 'SUCCESS', payment_amount: 2500, payment_currency: 'INR' },
      ]);

      const verifyRes = await ordersService.verifyOrder('hrsjm_mem_202', 'member-user-1');
      expect(verifyRes.status).toBe('SUCCESS');
      expect(receiptsGenerated.length).toBe(1);
      expect(journalEntries.length).toBe(1);
      expect(journalEntries[0].lines[0].debit_amount).toBe(2500);
      expect(journalEntries[0].lines[1].credit_amount).toBe(2500);
    });
  });

  // CHECK 3: Duplicate webhook and verification replay
  describe('Check 3: Duplicate Webhook & Idempotency Safeguards', () => {
    it('replaying webhook or verification calls does NOT create duplicate receipts or ledger entries', async () => {
      const paymentRecord: any = {
        id: 'don-pay-dup-1',
        gateway_order_id: 'hrsjm_don_dup',
        payment_status: PaymentStatus.PENDING,
        amount: 1000,
      };

      mockDonationPaymentsRepo.findOne.mockResolvedValue(paymentRecord);
      mockCashfreeService.getPaymentAttempts.mockResolvedValue([
        { cf_payment_id: 77001, payment_status: 'SUCCESS', payment_amount: 1000, payment_currency: 'INR' },
      ]);

      // Call 1: First verification
      await ordersService.verifyOrder('hrsjm_don_dup');
      expect(receiptsGenerated.length).toBe(1);
      expect(journalEntries.length).toBe(1);

      // Mutate mock record to SUCCESS (simulating first transaction commit)
      paymentRecord.payment_status = PaymentStatus.SUCCESS;

      // Call 2: Webhook replay 1
      await ordersService.processWebhook({
        data: { order: { order_id: 'hrsjm_don_dup' } },
        event_time: '2026-10-09T16:00:00Z',
        type: 'PAYMENT_SUCCESS_WEBHOOK',
      });

      // Call 3: Webhook replay 2
      await ordersService.processWebhook({
        data: { order: { order_id: 'hrsjm_don_dup' } },
        event_time: '2026-10-09T16:01:00Z',
        type: 'PAYMENT_SUCCESS_WEBHOOK',
      });

      // Assert total receipts and ledger entries remained strictly 1
      expect(receiptsGenerated.length).toBe(1);
      expect(journalEntries.length).toBe(1);
      expect(mockDonationPaymentsService.verify).toHaveBeenCalledTimes(1);
    });
  });

  // CHECK 4: App closed during checkout
  describe('Check 4: App Closed During Checkout (Network Recovery)', () => {
    it('reconciles payment upon app reopening even if SDK callback was missed', async () => {
      const paymentRecord = {
        id: 'don-pay-recovery-1',
        gateway_order_id: 'hrsjm_don_recover',
        payment_status: PaymentStatus.PENDING,
        amount: 1500,
      };

      mockDonationPaymentsRepo.findOne.mockResolvedValue(paymentRecord);

      // Backend queries Cashfree directly
      mockCashfreeService.getPaymentAttempts.mockResolvedValue([
        { cf_payment_id: 99123, payment_status: 'SUCCESS', payment_amount: 1500, payment_currency: 'INR' },
      ]);

      const res = await ordersService.verifyOrder('hrsjm_don_recover', 'user-1');
      expect(res.status).toBe('SUCCESS');
      expect(mockTransactionsRepo.update).toHaveBeenCalledWith(
        { gateway_order_id: 'hrsjm_don_recover' },
        expect.objectContaining({ status: 'SUCCESS', gateway_payment_id: '99123' }),
      );
    });
  });

  // CHECK 5: Amount and ownership mismatch
  describe('Check 5: Amount & Ownership Mismatch Protection', () => {
    it('throws BadRequestException if paid amount is less or more than expected record', async () => {
      mockDonationPaymentsRepo.findOne.mockResolvedValue({
        id: 'don-pay-mismatch',
        gateway_order_id: 'hrsjm_don_bad_amt',
        payment_status: PaymentStatus.PENDING,
        amount: 5000,
      });

      // Attempt for wrong amount (tampered or partial payment)
      mockCashfreeService.getPaymentAttempts.mockResolvedValue([
        { cf_payment_id: 1001, payment_status: 'SUCCESS', payment_amount: 500, payment_currency: 'INR' },
      ]);

      await expect(ordersService.verifyOrder('hrsjm_don_bad_amt')).rejects.toThrow(BadRequestException);
      expect(journalEntries.length).toBe(0);
    });

    it('throws ForbiddenException if another authenticated user attempts to verify or hijack payment', async () => {
      mockDonationPaymentsRepo.findOne.mockResolvedValue({
        id: 'don-pay-owner',
        user_id: 'legitimate-user-id',
        gateway_order_id: 'hrsjm_don_ownership',
        payment_status: PaymentStatus.PENDING,
        amount: 1000,
      });

      await expect(
        ordersService.verifyOrder('hrsjm_don_ownership', 'attacker-user-id'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // CHECK 6: Delayed / Pending states
  describe('Check 6: Delayed / In-Flight Bank States Remain Pending', () => {
    it('does not mark payment as failed when bank response is delayed or in-progress', async () => {
      mockDonationPaymentsRepo.findOne.mockResolvedValue({
        id: 'don-pay-pending',
        gateway_order_id: 'hrsjm_don_inflight',
        payment_status: PaymentStatus.PENDING,
        amount: 1000,
      });

      mockCashfreeService.getPaymentAttempts.mockResolvedValue([
        { cf_payment_id: 2002, payment_status: 'PENDING', payment_amount: 1000, payment_currency: 'INR' },
      ]);

      const res = await ordersService.verifyOrder('hrsjm_don_inflight');
      expect(res.status).toBe('PENDING');
      expect(journalEntries.length).toBe(0);
      expect(receiptsGenerated.length).toBe(0);
    });
  });
});
