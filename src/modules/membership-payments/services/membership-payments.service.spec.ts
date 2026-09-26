import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MembershipPaymentsService } from './membership-payments.service';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';

describe('MembershipPaymentsService', () => {
  let service: MembershipPaymentsService;
  let paymentsRepo: Record<string, jest.Mock>;
  let receiptsRepo: Record<string, jest.Mock>;
  let transactionsRepo: Record<string, jest.Mock>;
  let membershipsRepo: Record<string, jest.Mock>;
  let dataSource: { transaction: jest.Mock };
  let audit: Record<string, jest.Mock>;

  const mockMembership = {
    id: 'mem-1',
    user_id: 'user-1',
    status: MembershipStatus.PENDING,
    category: { id: 'cat-1', fee: 1000, validity_days: 365 },
    user: { id: 'user-1', full_name: 'Test Member' },
  };

  beforeEach(() => {
    paymentsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'pay-1', ...x })),
    };
    receiptsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'rec-1', ...x })),
    };
    transactionsRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'tx-1', ...x })),
    };
    membershipsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    dataSource = {
      transaction: jest.fn(),
    };
    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    service = new MembershipPaymentsService(
      paymentsRepo as never,
      receiptsRepo as never,
      transactionsRepo as never,
      membershipsRepo as never,
      dataSource as never,
      audit as never,
    );
  });

  describe('create', () => {
    it('creates payment and transaction in PENDING/INITIATED status', async () => {
      membershipsRepo.findOne.mockResolvedValue(mockMembership);

      const result = await service.create(
        { membership_id: 'mem-1' },
        'user-1',
        false,
      );

      expect(paymentsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          membership_id: 'mem-1',
          user_id: 'user-1',
          amount: 1000,
          payment_status: PaymentStatus.PENDING,
        }),
      );
      expect(result.id).toBe('pay-1');
      expect(transactionsRepo.save).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'membership_payment.initiated' }),
      );
    });

    it('throws NotFoundException when membership not found', async () => {
      membershipsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ membership_id: 'mem-unknown' }, 'user-1', false),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-admin creates payment for other user', async () => {
      membershipsRepo.findOne.mockResolvedValue(mockMembership);

      await expect(
        service.create({ membership_id: 'mem-1' }, 'other-user', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if calculated amount is 0 or negative', async () => {
      membershipsRepo.findOne.mockResolvedValue({
        ...mockMembership,
        category: { fee: 0 },
      });

      await expect(
        service.create({ membership_id: 'mem-1', amount: 0 }, 'user-1', false),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getById', () => {
    it('returns payment for owner', async () => {
      paymentsRepo.findOne.mockResolvedValue({
        id: 'pay-1',
        user_id: 'user-1',
        amount: 1000,
      });

      const result = await service.getById('pay-1', 'user-1', false);
      expect(result.id).toBe('pay-1');
    });

    it('throws ForbiddenException for unauthorized user', async () => {
      paymentsRepo.findOne.mockResolvedValue({
        id: 'pay-1',
        user_id: 'user-1',
        amount: 1000,
      });

      await expect(
        service.getById('pay-1', 'user-2', false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('verify', () => {
    it('returns existing payment & receipt if already verified (idempotency)', async () => {
      const existingReceipt = { id: 'rec-1', receipt_number: 'HRSJM-REC-2026-00001' };
      const alreadySuccessPayment = {
        id: 'pay-1',
        user_id: 'user-1',
        payment_status: PaymentStatus.SUCCESS,
        receipt: existingReceipt,
      };
      paymentsRepo.findOne.mockResolvedValue(alreadySuccessPayment);

      const result = await service.verify(
        'pay-1',
        { gateway_payment_id: 'pay_xyz123' },
        'user-1',
        false,
      );

      expect(result.payment.payment_status).toBe(PaymentStatus.SUCCESS);
      expect(result.receipt).toEqual(existingReceipt);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('executes verification inside transaction and activates membership', async () => {
      const pendingPayment = {
        id: 'pay-1',
        user_id: 'user-1',
        membership_id: 'mem-1',
        amount: 1000,
        payment_method: 'ONLINE',
        payment_status: PaymentStatus.PENDING,
        user: { full_name: 'Test Member' },
      };
      paymentsRepo.findOne.mockResolvedValue(pendingPayment);

      const savedReceipt = {
        id: 'rec-1',
        receipt_number: 'HRSJM-REC-2026-12345',
        amount: 1000,
      };

      dataSource.transaction.mockImplementation(async (callback) => {
        const mockManager = {
          save: jest.fn().mockImplementation(async (entity) => entity),
          create: jest.fn((entityClass, data) => ({ id: 'mock-id', ...data })),
          findOne: jest.fn().mockResolvedValue({
            id: 'mem-1',
            status: MembershipStatus.PENDING,
            category: { validity_days: 365 },
          }),
        };
        return callback(mockManager);
      });

      const result = await service.verify(
        'pay-1',
        { gateway_payment_id: 'pay_gateway_001' },
        'user-1',
        false,
      );

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'membership_payment.verified' }),
      );
    });
  });

  describe('getReceipt', () => {
    it('returns receipt for verified payment', async () => {
      paymentsRepo.findOne.mockResolvedValue({
        id: 'pay-1',
        user_id: 'user-1',
      });
      receiptsRepo.findOne.mockResolvedValue({
        id: 'rec-1',
        membership_payment_id: 'pay-1',
        receipt_number: 'HRSJM-REC-2026-12345',
      });

      const result = await service.getReceipt('pay-1', 'user-1', false);
      expect(result.receipt_number).toBe('HRSJM-REC-2026-12345');
    });

    it('throws NotFoundException if receipt not found', async () => {
      paymentsRepo.findOne.mockResolvedValue({
        id: 'pay-1',
        user_id: 'user-1',
      });
      receiptsRepo.findOne.mockResolvedValue(null);

      await expect(service.getReceipt('pay-1', 'user-1', false)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
