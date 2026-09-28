import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DonationPaymentsService } from './donation-payments.service';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';

describe('DonationPaymentsService', () => {
  let service: DonationPaymentsService;
  let paymentsRepo: Record<string, jest.Mock>;
  let receiptsRepo: Record<string, jest.Mock>;
  let transactionsRepo: Record<string, jest.Mock>;
  let donationsRepo: Record<string, jest.Mock>;
  let dataSource: { transaction: jest.Mock };
  let audit: Record<string, jest.Mock>;
  let posting: Record<string, jest.Mock>;

  const mockDonation = {
    id: 'don-1',
    donor_name: 'Test Donor',
    donor_mobile: '9800000001',
    cause: 'Temple renovation',
    amount: 5000,
    status: 'PENDING',
  };

  beforeEach(() => {
    paymentsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'dpay-1', ...x })),
      createQueryBuilder: jest.fn(),
    };
    receiptsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    transactionsRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'dtx-1', ...x })),
    };
    donationsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    dataSource = { transaction: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    posting = {
      postEntry: jest
        .fn()
        .mockResolvedValue({ id: 'je-1', entry_number: 'JE-20260101-00001' }),
    };

    service = new DonationPaymentsService(
      paymentsRepo as never,
      receiptsRepo as never,
      transactionsRepo as never,
      donationsRepo as never,
      dataSource as never,
      posting as never,
      audit as never,
    );
  });

  describe('create', () => {
    it('defaults the amount to the donation amount and creates PENDING payment + INITIATED transaction', async () => {
      donationsRepo.findOne.mockResolvedValue(mockDonation);

      const result = await service.create(
        { donation_id: 'don-1' },
        'user-1',
      );

      expect(paymentsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          donation_id: 'don-1',
          amount: 5000,
          payment_status: PaymentStatus.PENDING,
          user_id: 'user-1',
        }),
      );
      expect(transactionsRepo.save).toHaveBeenCalled();
      expect(result.amount).toBe(5000);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'donation_payment.initiated' }),
      );
    });

    it('throws NotFoundException when donation missing', async () => {
      await expect(
        service.create({ donation_id: 'unknown' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects payments against an already-paid donation', async () => {
      donationsRepo.findOne.mockResolvedValue({ ...mockDonation, status: 'SUCCESS' });

      await expect(
        service.create({ donation_id: 'don-1' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects payments against a refunded donation', async () => {
      donationsRepo.findOne.mockResolvedValue({ ...mockDonation, status: 'REFUNDED' });

      await expect(
        service.create({ donation_id: 'don-1' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-positive amounts', async () => {
      donationsRepo.findOne.mockResolvedValue(mockDonation);

      await expect(
        service.create({ donation_id: 'don-1', amount: 0 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getById', () => {
    it('returns payment for owner', async () => {
      paymentsRepo.findOne.mockResolvedValue({
        id: 'dpay-1',
        user_id: 'user-1',
        amount: 5000,
      });

      const result = await service.getById('dpay-1', 'user-1', false);
      expect(result.id).toBe('dpay-1');
    });

    it('throws ForbiddenException for unauthorized user', async () => {
      paymentsRepo.findOne.mockResolvedValue({
        id: 'dpay-1',
        user_id: 'user-1',
        amount: 5000,
      });

      await expect(
        service.getById('dpay-1', 'other-user', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows viewing guest-donor payments (null user_id) without ownership error', async () => {
      paymentsRepo.findOne.mockResolvedValue({
        id: 'dpay-1',
        user_id: null,
        amount: 5000,
      });

      const result = await service.getById('dpay-1', 'anyone', false);
      expect(result.id).toBe('dpay-1');
    });
  });

  describe('verify', () => {
    it('posts a balanced entry (Dr Bank, Cr Donation Income) and links the receipt', async () => {
      paymentsRepo.findOne.mockResolvedValue({
        id: 'dpay-1',
        donation_id: 'don-1',
        user_id: 'user-1',
        amount: 5000,
        payment_method: 'ONLINE',
        payment_status: PaymentStatus.PENDING,
        donation: mockDonation,
      });

      dataSource.transaction.mockImplementation(async (callback) => {
        const mockManager = {
          save: jest.fn(async (...args) => (args.length > 1 ? args[1] : args[0])),
          create: jest.fn((entityClass, data) => ({ id: 'mock-id', ...data })),
          findOne: jest.fn().mockResolvedValue({ ...mockDonation }),
        };
        return callback(mockManager);
      });

      const result = await service.verify(
        'dpay-1',
        { gateway_payment_id: 'pay_don_001' },
        'user-1',
        false,
      );

      const call = posting.postEntry.mock.calls[0][1];
      expect(call.reference_type).toBe('DONATION_PAYMENT');
      expect(call.reference_id).toBe('dpay-1');
      expect(call.lines).toEqual([
        expect.objectContaining({ account_code: '1001', debit_amount: 5000, credit_amount: 0 }),
        expect.objectContaining({ account_code: '4003', debit_amount: 0, credit_amount: 5000 }),
      ]);
      expect(result.receipt.accounting_entry_id).toBe('je-1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'donation_payment.verified' }),
      );
    });

    it('is idempotent when already verified with a receipt', async () => {
      paymentsRepo.findOne.mockResolvedValue({
        id: 'dpay-1',
        user_id: 'user-1',
        payment_status: PaymentStatus.SUCCESS,
        payment_date: new Date(),
      });
      receiptsRepo.findOne.mockResolvedValue({ id: 'rec-1', receipt_number: 'HRSJM-REC-2026-00001' });

      const result = await service.verify(
        'dpay-1',
        { gateway_payment_id: 'pay_don_001' },
        'user-1',
        false,
      );

      expect(result.payment.payment_status).toBe(PaymentStatus.SUCCESS);
      expect(result.receipt.id).toBe('rec-1');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('propagates posting failure so the transaction rolls back', async () => {
      paymentsRepo.findOne.mockResolvedValue({
        id: 'dpay-1',
        donation_id: 'don-1',
        user_id: 'user-1',
        amount: 5000,
        payment_method: 'ONLINE',
        payment_status: PaymentStatus.PENDING,
        donation: mockDonation,
      });
      posting.postEntry.mockRejectedValue(
        new BadRequestException({
          message: 'Accounting entry is not balanced',
          code: 'ACCOUNTING_ENTRY_UNBALANCED',
          details: null,
        }),
      );

      dataSource.transaction.mockImplementation(async (callback) => {
        const mockManager = {
          save: jest.fn(async (...args) => (args.length > 1 ? args[1] : args[0])),
          create: jest.fn((entityClass, data) => ({ id: 'mock-id', ...data })),
        };
        return callback(mockManager);
      });

      await expect(
        service.verify(
          'dpay-1',
          { gateway_payment_id: 'pay_don_002' },
          'user-1',
          false,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('rejects REFUNDED status — refunds must use the refund endpoint', async () => {
      paymentsRepo.findOne.mockResolvedValue({
        id: 'dpay-1',
        user_id: 'user-1',
        payment_status: PaymentStatus.SUCCESS,
        payment_date: new Date(),
      });

      await expect(
        service.updateStatus(
          'dpay-1',
          { status: PaymentStatus.REFUNDED } as never,
          'admin-1',
          true,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
