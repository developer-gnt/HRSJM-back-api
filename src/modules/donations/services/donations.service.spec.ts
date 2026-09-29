import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DonationsService } from './donations.service';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';

describe('DonationsService (refund)', () => {
  let service: DonationsService;
  let donationsRepo: Record<string, jest.Mock>;
  let paymentsRepo: Record<string, jest.Mock>;
  let refundsRepo: Record<string, jest.Mock>;
  let dataSource: { transaction: jest.Mock };
  let audit: Record<string, jest.Mock>;
  let posting: Record<string, jest.Mock>;

  const makeDonation = () => ({ id: 'don-1', status: 'SUCCESS', amount: 5000 });
  const makePayment = () => ({
    id: 'dpay-1',
    donation_id: 'don-1',
    amount: 5000,
    payment_status: PaymentStatus.SUCCESS,
    payment_date: new Date(),
  });
  const mockJournal = { id: 'je-1', entry_number: 'JE-20260101-00001' };
  const mockReversal = { id: 'je-2', entry_number: 'JE-20260101-00002' };

  beforeEach(() => {
    donationsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'don-new', ...x })),
      createQueryBuilder: jest.fn(),
    };
    paymentsRepo = { findOne: jest.fn().mockResolvedValue(null) };
    refundsRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'ref-1', ...x })),
    };
    dataSource = { transaction: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    posting = { reverse: jest.fn().mockResolvedValue(mockReversal) };

    service = new DonationsService(
      donationsRepo as never,
      paymentsRepo as never,
      refundsRepo as never,
      posting as never,
      dataSource as never,
      audit as never,
    );
  });

  describe('create', () => {
    it('creates a donation intent and audits the event', async () => {
      const result = await service.create({
        donor_name: 'Jane Donor',
        mobile_number: '9876501234',
        email: 'jane@example.com',
        campaign: 'General Medical Aid',
        amount: 2500,
      });

      expect(donationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          donor_name: 'Jane Donor',
          donor_mobile: '9876501234',
          donor_email: 'jane@example.com',
          cause: 'General Medical Aid',
          amount: 2500,
          status: 'PENDING',
        }),
      );
      expect(result.id).toBe('don-new');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'donation.created' }),
      );
    });
  });

  describe('getById', () => {
    it('returns the donation if found', async () => {
      donationsRepo.findOne.mockResolvedValue(makeDonation());
      const result = await service.getById('don-1');
      expect(result.id).toBe('don-1');
    });

    it('throws NotFoundException if donation not found', async () => {
      await expect(service.getById('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('list', () => {
    it('returns paginated list with meta', async () => {
      const mockQb = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[makeDonation()], 1]),
      };
      donationsRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      const result = await service.list({ page: 1, limit: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  it('refunds in full: reverses the journal, marks payment and donation REFUNDED, records the refund', async () => {
    donationsRepo.findOne.mockResolvedValue(makeDonation());
    paymentsRepo.findOne.mockResolvedValue(makePayment());

    dataSource.transaction.mockImplementation(async (callback) => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(mockJournal),
        // manager.save is called both as save(entity) and save(EntityClass, entity)
        save: jest.fn(async (...args) => (args.length > 1 ? args[1] : args[0])),
        create: jest.fn((entityClass, data) => ({ id: 'mock-refund', ...data })),
      };
      return callback(mockManager);
    });

    const result = await service.refund(
      'don-1',
      { reason: 'Donor request' },
      'admin-1',
    );

    expect(posting.reverse).toHaveBeenCalledWith(
      expect.anything(),
      'je-1',
      'admin-1',
    );
    expect(result.payment.payment_status).toBe(PaymentStatus.REFUNDED);
    expect(result.donation.status).toBe('REFUNDED');
    expect(result.refund.reversed_entry_id).toBe('je-2');
    expect(result.reversal_entry_number).toBe('JE-20260101-00002');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'donation.refunded' }),
    );
  });

  it('throws NotFoundException for unknown donation', async () => {
    await expect(
      service.refund('unknown', {}, 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException when already refunded', async () => {
    donationsRepo.findOne.mockResolvedValue({ ...makeDonation(), status: 'REFUNDED' });

    await expect(
      service.refund('don-1', {}, 'admin-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('throws BadRequestException when there is no verified payment', async () => {
    donationsRepo.findOne.mockResolvedValue(makeDonation());

    await expect(
      service.refund('don-1', {}, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when the journal is missing (data inconsistency)', async () => {
    donationsRepo.findOne.mockResolvedValue(makeDonation());
    paymentsRepo.findOne.mockResolvedValue(makePayment());

    dataSource.transaction.mockImplementation(async (callback) => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
        create: jest.fn(),
      };
      return callback(mockManager);
    });

    await expect(
      service.refund('don-1', {}, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
  });
});
