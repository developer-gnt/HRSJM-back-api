import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssistanceService } from './assistance.service';
import { AssistanceRequestStatus } from '../entities/assistance-request.entity';

describe('AssistanceService', () => {
  let service: AssistanceService;
  let repo: Record<string, jest.Mock>;
  let docs: Record<string, jest.Mock>;
  let audit: Record<string, jest.Mock>;

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'asst-1', ...x })),
    };
    docs = { upload: jest.fn().mockResolvedValue({ id: 'doc-1' }) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new AssistanceService(repo as never, docs as never, audit as never);
  });

  describe('create', () => {
    it('creates assistance request in PENDING status', async () => {
      const result = await service.create(
        {
          full_name: 'John Doe',
          mobile: '9888880000',
          requested_amount: 5000,
          reason: 'Medical assistance',
        },
        'u1',
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'u1',
          status: AssistanceRequestStatus.PENDING,
          requested_amount: 5000,
        }),
      );
      expect(result.id).toBe('asst-1');
    });
  });

  describe('getById', () => {
    it('returns request for owner', async () => {
      repo.findOne.mockResolvedValue({ id: 'asst-1', user_id: 'u1' });
      const result = await service.getById('asst-1', 'u1', false);
      expect(result.id).toBe('asst-1');
    });

    it('throws ForbiddenException for unauthorized user', async () => {
      repo.findOne.mockResolvedValue({ id: 'asst-1', user_id: 'u2' });
      await expect(service.getById('asst-1', 'u1', false)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateStatus', () => {
    it('updates status with valid transition', async () => {
      repo.findOne.mockResolvedValue({
        id: 'asst-1',
        status: AssistanceRequestStatus.PENDING,
      });

      const result = await service.updateStatus(
        'asst-1',
        { status: AssistanceRequestStatus.UNDER_REVIEW, admin_remark: 'Under review' },
        'admin-1',
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AssistanceRequestStatus.UNDER_REVIEW,
          admin_remark: 'Under review',
          reviewed_by: 'admin-1',
        }),
      );
      expect(result.id).toBe('asst-1');
    });

    it('rejects invalid status transition', async () => {
      repo.findOne.mockResolvedValue({
        id: 'asst-1',
        status: AssistanceRequestStatus.CLOSED,
      });

      await expect(
        service.updateStatus('asst-1', { status: AssistanceRequestStatus.PENDING }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
