import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RenewalsService } from './renewals.service';
import { RenewalRequestEntity, RenewalStatus } from '../entities/renewal-request.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import { AuditService } from '../../audit/services/audit.service';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';
import { NotificationsService } from '../../notifications/services/notifications.service';

import { ReceiptEntity } from '../../membership-payments/entities/receipt.entity';
import { RenewalCalculationService } from './renewal-calculation.service';

describe('RenewalsService', () => {
  let service: RenewalsService;

  const mockReceiptsRepo = {
    create: jest.fn().mockImplementation((r) => ({ id: 'rec-1', ...r })),
    save: jest.fn().mockImplementation((r) => Promise.resolve({ id: 'rec-1', ...r })),
    findOne: jest.fn(),
  };

  const mockRenewalsRepo = {
    create: jest.fn().mockImplementation((dto) => ({ id: 'ren-1', ...dto })),
    save: jest.fn().mockImplementation((r) => Promise.resolve({ id: 'ren-1', ...r })),
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(),
  };

  const mockMembershipsRepo = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation((m) => Promise.resolve(m)),
  };

  const mockAudit = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RenewalsService,
        {
          provide: getRepositoryToken(RenewalRequestEntity),
          useValue: mockRenewalsRepo,
        },
        {
          provide: getRepositoryToken(MembershipEntity),
          useValue: mockMembershipsRepo,
        },
        {
          provide: getRepositoryToken(ReceiptEntity),
          useValue: mockReceiptsRepo,
        },
        {
          provide: AuditService,
          useValue: mockAudit,
        },
        {
          provide: NotificationsService,
          useValue: {
            sendToUser: jest.fn().mockResolvedValue(undefined),
            sendToAdmins: jest.fn().mockResolvedValue(undefined),
          },
        },
        RenewalCalculationService,
      ],
    }).compile();

    service = module.get<RenewalsService>(RenewalsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('apply', () => {
    it('should create renewal for active membership with sequence fees', async () => {
      mockMembershipsRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        status: MembershipStatus.ACTIVE,
        category: { fee: 1000 },
        expiry_date: new Date('2027-01-01'),
      });
      mockRenewalsRepo.find.mockResolvedValue([]);

      const res = await service.apply(
        { membership_id: 'mem-1', period_years: 2 },
        'user-1',
      );

      expect(res).toBeDefined();
      // Sequence 1 (₹500) + Sequence 2 (₹400) = ₹900
      expect(mockRenewalsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          membership_id: 'mem-1',
          period_years: 2,
          amount: 900,
        }),
      );
    });
  });

  describe('approve & activate', () => {
    it('should approve pending renewal', async () => {
      mockRenewalsRepo.findOne.mockResolvedValue({
        id: 'ren-1',
        status: RenewalStatus.PENDING,
      });

      const res = await service.approve('ren-1', { admin_remark: 'OK' }, 'admin-1');
      expect(res.status).toEqual(RenewalStatus.APPROVED);
    });
  });
});
