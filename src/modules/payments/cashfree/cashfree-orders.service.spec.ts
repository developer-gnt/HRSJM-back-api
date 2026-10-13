import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';
import { CashfreeOrdersService } from './cashfree-orders.service';

describe('CashfreeOrdersService', () => {
  let service: CashfreeOrdersService;
  let mockCashfreeService: any;
  let mockDonationPaymentsService: any;
  let mockMembershipPaymentsService: any;
  let mockDonationPaymentsRepo: any;
  let mockMembershipPaymentsRepo: any;
  let mockTransactionsRepo: any;
  let mockDataSource: any;

  beforeEach(() => {
    mockCashfreeService = {
      createOrder: jest.fn(),
      getPaymentAttempts: jest.fn(),
      getOrder: jest.fn(),
    };
    mockDonationPaymentsService = {
      verify: jest.fn(),
    };
    mockMembershipPaymentsService = {
      verify: jest.fn(),
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
    mockDataSource = {};

    service = new CashfreeOrdersService(
      mockCashfreeService,
      mockDonationPaymentsService,
      mockMembershipPaymentsService,
      mockDonationPaymentsRepo,
      mockMembershipPaymentsRepo,
      mockTransactionsRepo,
      mockDataSource,
    );
  });

  describe('createOrder', () => {
    it('should throw NotFoundException if payment record does not exist', async () => {
      mockDonationPaymentsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createOrder({ purpose: 'donation', reference_id: 'non-existent' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if payment is already SUCCESS', async () => {
      mockDonationPaymentsRepo.findOne.mockResolvedValue({
        id: 'p-1',
        payment_status: PaymentStatus.SUCCESS,
        amount: 500,
      });
      await expect(
        service.createOrder({ purpose: 'donation', reference_id: 'p-1' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if payment belongs to a different user', async () => {
      mockDonationPaymentsRepo.findOne.mockResolvedValue({
        id: 'p-1',
        user_id: 'other-user',
        payment_status: PaymentStatus.PENDING,
        amount: 500,
      });
      await expect(
        service.createOrder({ purpose: 'donation', reference_id: 'p-1' }, 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create order successfully and persist transaction', async () => {
      mockDonationPaymentsRepo.findOne.mockResolvedValue({
        id: 'p-12345678-abcd-1234-abcd-1234567890ab',
        user_id: 'user-1',
        payment_status: PaymentStatus.PENDING,
        amount: 500,
        donation: { cause: 'Education', donor_name: 'John Doe', donor_email: 'john@example.com', donor_mobile: '9876543210' },
      });
      mockCashfreeService.createOrder.mockResolvedValue({
        order_id: 'hrsjm_don_test_1',
        payment_session_id: 'session_123',
        order_status: 'ACTIVE',
      });

      const res = await service.createOrder(
        { purpose: 'donation', reference_id: 'p-12345678-abcd-1234-abcd-1234567890ab' },
        'user-1',
      );

      expect(res.order_id).toBe('hrsjm_don_test_1');
      expect(res.payment_session_id).toBe('session_123');
      expect(mockTransactionsRepo.save).toHaveBeenCalled();
    });
  });

  describe('verifyOrder', () => {
    it('should return idempotent status if payment was already verified', async () => {
      mockDonationPaymentsRepo.findOne.mockResolvedValue({
        id: 'p-1',
        gateway_order_id: 'order_1',
        payment_status: PaymentStatus.SUCCESS,
        amount: 500,
      });

      const res = await service.verifyOrder('order_1', 'user-1');
      expect(res.status).toBe('SUCCESS');
      expect(mockCashfreeService.getPaymentAttempts).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if paid amount does not match expected amount', async () => {
      mockDonationPaymentsRepo.findOne.mockResolvedValue({
        id: 'p-1',
        gateway_order_id: 'order_1',
        payment_status: PaymentStatus.PENDING,
        amount: 500,
      });
      mockCashfreeService.getPaymentAttempts.mockResolvedValue([
        { cf_payment_id: 111, payment_status: 'SUCCESS', payment_amount: 300, payment_currency: 'INR' },
      ]);

      await expect(service.verifyOrder('order_1')).rejects.toThrow(BadRequestException);
    });

    it('should complete verification and invoke donationPaymentsService.verify on SUCCESS attempt', async () => {
      mockDonationPaymentsRepo.findOne.mockResolvedValue({
        id: 'p-1',
        gateway_order_id: 'order_1',
        payment_status: PaymentStatus.PENDING,
        amount: 500,
      });
      mockCashfreeService.getPaymentAttempts.mockResolvedValue([
        { cf_payment_id: 999, payment_status: 'SUCCESS', payment_amount: 500, payment_currency: 'INR' },
      ]);
      mockDonationPaymentsService.verify.mockResolvedValue({
        payment: { id: 'p-1', payment_status: PaymentStatus.SUCCESS },
        receipt: { id: 'r-1', receipt_number: 'REC-1' },
      });

      const res = await service.verifyOrder('order_1');
      expect(res.status).toBe('SUCCESS');
      expect(mockDonationPaymentsService.verify).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({ gateway_payment_id: '999', gateway_order_id: 'order_1' }),
        expect.any(String),
        true,
      );
      expect(mockTransactionsRepo.update).toHaveBeenCalledWith(
        { gateway_order_id: 'order_1' },
        expect.objectContaining({ status: 'SUCCESS', gateway_payment_id: '999' }),
      );
    });

    it('should return PENDING if no successful attempt exists', async () => {
      mockDonationPaymentsRepo.findOne.mockResolvedValue({
        id: 'p-1',
        gateway_order_id: 'order_1',
        payment_status: PaymentStatus.PENDING,
        amount: 500,
      });
      mockCashfreeService.getPaymentAttempts.mockResolvedValue([
        { cf_payment_id: 888, payment_status: 'PENDING', payment_amount: 500, payment_currency: 'INR' },
      ]);

      const res = await service.verifyOrder('order_1');
      expect(res.status).toBe('PENDING');
      expect(mockDonationPaymentsService.verify).not.toHaveBeenCalled();
    });
  });
});
