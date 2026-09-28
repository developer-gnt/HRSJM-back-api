import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RenewalsService } from './renewals.service';
import { RenewalRequestEntity, RenewalStatus } from '../entities/renewal-request.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import { AuditService } from '../../audit/services/audit.service';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';

describe('RenewalsService', () => {
  let service: RenewalsService;

  const mockRenewalsRepo = {
    create: jest.fn().mockImplementation((dto) => ({ id: 'ren-1', ...dto })),
    save: jest.fn().mockImplementation((r) => Promise.resolve({ id: 'ren-1', ...r })),
    findOne: jest.fn(),
    find: jest.fn(),
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
          provide: AuditService,
          useValue: mockAudit,
        },
      ],
    }).compile();

    service = module.get<RenewalsService>(RenewalsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('apply', () => {
    it('should create renewal for active membership', async () => {
      mockMembershipsRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        status: MembershipStatus.ACTIVE,
        category: { fee: 1000 },
        expiry_date: new Date('2027-01-01'),
      });

      const res = await service.apply(
        { membership_id: 'mem-1', period_years: 2 },
        'user-1',
      );

      expect(res).toBeDefined();
      expect(mockRenewalsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          membership_id: 'mem-1',
          period_years: 2,
          amount: 2000,
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
