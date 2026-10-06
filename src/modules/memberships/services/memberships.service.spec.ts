import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { CommonStatus } from '../../../common/enums/common-status.enum';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';

describe('MembershipsService', () => {
  let service: MembershipsService;
  let membershipsRepo: Record<string, jest.Mock>;
  let categoriesRepo: Record<string, jest.Mock>;
  let audit: Record<string, jest.Mock>;
  let qb: Record<string, jest.Mock>;

  const activeCategory = {
    id: 'cat-1',
    name: 'Annual General',
    fee: 1000,
    validity_days: 365,
    status: CommonStatus.ACTIVE,
  };

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    membershipsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'mem-1', ...x })),
    };

    categoriesRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const paymentsRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    const documentsService = {
      findByRelatedEntity: jest.fn().mockResolvedValue([]),
    };

    const usersService = {
      findByLoginIdentifier: jest.fn().mockResolvedValue(null),
      createUserWithRole: jest.fn().mockResolvedValue({ id: 'new-user-1' }),
    };

    const renewalsRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    const notificationsService = {
      sendToUser: jest.fn().mockResolvedValue(undefined),
      sendToAdmins: jest.fn().mockResolvedValue(undefined),
    };

    service = new MembershipsService(
      membershipsRepo as never,
      categoriesRepo as never,
      paymentsRepo as never,
      renewalsRepo as never,
      audit as never,
      documentsService as never,
      usersService as never,
      notificationsService as never,
    );
  });

  describe('apply', () => {
    it('creates membership application in PENDING status', async () => {
      categoriesRepo.findOne.mockResolvedValue(activeCategory);

      const result = await service.apply(
        { category_id: 'cat-1', application_data: { city: 'Mumbai' } },
        'user-1',
      );

      expect(membershipsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          category_id: 'cat-1',
          status: MembershipStatus.PENDING,
          created_by: 'user-1',
        }),
      );
      expect(result.id).toBe('mem-1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'membership.applied' }),
      );
    });

    it('throws NotFoundException when category does not exist', async () => {
      categoriesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.apply({ category_id: 'cat-unknown' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when applying for inactive category', async () => {
      categoriesRepo.findOne.mockResolvedValue({
        ...activeCategory,
        status: CommonStatus.INACTIVE,
      });

      await expect(
        service.apply({ category_id: 'cat-1' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when applicant already has a pending or active membership', async () => {
      categoriesRepo.findOne.mockResolvedValue(activeCategory);
      membershipsRepo.findOne.mockResolvedValue({
        id: 'existing-mem-1',
        user_id: 'user-1',
        status: MembershipStatus.PENDING,
      });

      await expect(
        service.apply({ category_id: 'cat-1' }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('allows applicant to apply again if previous membership was REJECTED', async () => {
      categoriesRepo.findOne.mockResolvedValue(activeCategory);
      // findOne for active/pending returns null because existing membership is REJECTED
      membershipsRepo.findOne.mockResolvedValue(null);

      const result = await service.apply(
        { category_id: 'cat-1', application_data: { city: 'Delhi' } },
        'user-1',
      );

      expect(result.id).toBe('mem-1');
      expect(membershipsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          status: MembershipStatus.PENDING,
        }),
      );
    });
  });

  describe('getById', () => {
    it('returns membership for owner', async () => {
      const mockMembership = {
        id: 'mem-1',
        user_id: 'user-1',
        status: MembershipStatus.PENDING,
        user: { id: 'user-1', password_hash: 'secret' },
      };
      membershipsRepo.findOne.mockResolvedValue(mockMembership);

      const result = await service.getById('mem-1', 'user-1', false);
      expect(result.id).toBe('mem-1');
      expect((result.user as { password_hash?: string }).password_hash).toBeUndefined();
    });

    it('returns membership for admin even if not owner', async () => {
      const mockMembership = {
        id: 'mem-1',
        user_id: 'user-2',
        status: MembershipStatus.PENDING,
      };
      membershipsRepo.findOne.mockResolvedValue(mockMembership);

      const result = await service.getById('mem-1', 'admin-user', true);
      expect(result.id).toBe('mem-1');
    });

    it('throws ForbiddenException for non-owner non-admin', async () => {
      const mockMembership = {
        id: 'mem-1',
        user_id: 'user-2',
        status: MembershipStatus.PENDING,
      };
      membershipsRepo.findOne.mockResolvedValue(mockMembership);

      await expect(
        service.getById('mem-1', 'user-1', false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('allows owner to update pending application', async () => {
      const mockMembership = {
        id: 'mem-1',
        user_id: 'user-1',
        status: MembershipStatus.PENDING,
        application_data: {},
      };
      membershipsRepo.findOne.mockResolvedValue(mockMembership);

      const result = await service.update(
        'mem-1',
        { application_data: { address: '123 New Road' } },
        'user-1',
        false,
      );

      expect(membershipsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          application_data: { address: '123 New Road' },
          updated_by: 'user-1',
        }),
      );
      expect(result.id).toBe('mem-1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'membership.updated' }),
      );
    });

    it('rejects owner update when status is not PENDING', async () => {
      const mockMembership = {
        id: 'mem-1',
        user_id: 'user-1',
        status: MembershipStatus.APPROVED,
      };
      membershipsRepo.findOne.mockResolvedValue(mockMembership);

      await expect(
        service.update('mem-1', { admin_notes: 'note' }, 'user-1', false),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('approves membership: generates membership number and validity dates', async () => {
      const mockMembership = {
        id: 'mem-1',
        user_id: 'user-1',
        status: MembershipStatus.PENDING,
        category: activeCategory,
      };
      membershipsRepo.findOne.mockResolvedValue(mockMembership);

      const result = await service.updateStatus(
        'mem-1',
        { status: MembershipStatus.APPROVED },
        'admin-1',
      );

      expect(membershipsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: MembershipStatus.APPROVED,
          membership_number: expect.stringMatching(/^HRSJM-(\d{5}|MEM-\d{4}-\d{5})$/),
          approval_date: expect.any(Date),
          start_date: expect.any(Date),
          expiry_date: expect.any(Date),
          updated_by: 'admin-1',
        }),
      );
      expect(result.id).toBe('mem-1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'membership.status_updated' }),
      );
    });

    it('rejects membership and records rejection reason', async () => {
      const mockMembership = {
        id: 'mem-1',
        user_id: 'user-1',
        status: MembershipStatus.PENDING,
        category: activeCategory,
      };
      membershipsRepo.findOne.mockResolvedValue(mockMembership);

      await service.updateStatus(
        'mem-1',
        { status: MembershipStatus.REJECTED, rejection_reason: 'Incomplete KYC' },
        'admin-1',
      );

      expect(membershipsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: MembershipStatus.REJECTED,
          rejection_reason: 'Incomplete KYC',
        }),
      );
    });
  });
});
