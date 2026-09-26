import { ConflictException, NotFoundException } from '@nestjs/common';
import { MembershipCategoriesService } from './membership-categories.service';
import { CommonStatus } from '../../../common/enums/common-status.enum';

describe('MembershipCategoriesService', () => {
  let service: MembershipCategoriesService;
  let repo: Record<string, jest.Mock>;
  let audit: Record<string, jest.Mock>;
  let qb: Record<string, jest.Mock>;

  beforeEach(() => {
    qb = {
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getOne: jest.fn().mockResolvedValue(null),
    };

    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'cat-1', ...x })),
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    service = new MembershipCategoriesService(repo as never, audit as never);
  });

  describe('list', () => {
    it('returns paginated categories', async () => {
      const mockItems = [
        { id: 'cat-1', name: 'Annual General', fee: 1000, status: CommonStatus.ACTIVE },
      ];
      qb.getManyAndCount.mockResolvedValue([mockItems, 1]);

      const res = await service.list({ page: 1, limit: 10, search: 'Annual', status: CommonStatus.ACTIVE });

      expect(res.items).toEqual(mockItems);
      expect(res.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
      expect(qb.setParameter).toHaveBeenCalledWith('term', '%annual%');
      expect(qb.andWhere).toHaveBeenCalledWith('category.status = :status', { status: CommonStatus.ACTIVE });
    });
  });

  describe('getById', () => {
    it('returns category when found', async () => {
      const mockCategory = { id: 'cat-1', name: 'Annual General', fee: 1000 };
      repo.findOne.mockResolvedValue(mockCategory);

      const res = await service.getById('cat-1');
      expect(res).toEqual(mockCategory);
    });

    it('throws NotFoundException when category does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates and saves new category', async () => {
      qb.getOne.mockResolvedValue(null);

      const dto = {
        name: 'Life Member',
        code: 'LIFE',
        description: 'Lifetime membership',
        fee: 25000,
        validity_days: 3650,
        status: CommonStatus.ACTIVE,
      };

      const result = await service.create(dto, 'admin-1');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Life Member',
          code: 'LIFE',
          fee: 25000,
          created_by: 'admin-1',
        }),
      );
      expect(result.id).toBe('cat-1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'membership_category.created' }),
      );
    });

    it('throws ConflictException on duplicate name', async () => {
      qb.getOne.mockResolvedValue({ id: 'cat-existing', name: 'Life Member' });

      await expect(
        service.create({ name: 'Life Member', fee: 25000 }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException on duplicate code', async () => {
      qb.getOne
        .mockResolvedValueOnce(null) // name check passes
        .mockResolvedValueOnce({ id: 'cat-existing', code: 'LIFE' }); // code check fails

      await expect(
        service.create({ name: 'Life Member', code: 'LIFE', fee: 25000 }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates category details and records audit', async () => {
      const existing = {
        id: 'cat-1',
        name: 'Annual General',
        code: 'ANNUAL',
        description: 'Old desc',
        fee: 1000,
        validity_days: 365,
        status: CommonStatus.ACTIVE,
      };
      repo.findOne.mockResolvedValue(existing);
      qb.getOne.mockResolvedValue(null);

      const result = await service.update(
        'cat-1',
        { name: 'Annual Primary', fee: 1200, description: 'New desc' },
        'admin-1',
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Annual Primary',
          fee: 1200,
          description: 'New desc',
          updated_by: 'admin-1',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'membership_category.updated' }),
      );
    });

    it('throws ConflictException when renaming to existing name', async () => {
      const existing = { id: 'cat-1', name: 'Annual General', code: 'ANNUAL' };
      repo.findOne.mockResolvedValue(existing);
      qb.getOne.mockResolvedValue({ id: 'cat-2', name: 'Life Member' });

      await expect(
        service.update('cat-1', { name: 'Life Member' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when updating to an existing code', async () => {
      const existing = { id: 'cat-1', name: 'Annual General', code: 'ANNUAL' };
      repo.findOne.mockResolvedValue(existing);
      qb.getOne.mockResolvedValue({ id: 'cat-2', code: 'LIFE' });

      await expect(
        service.update('cat-1', { code: 'LIFE' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('maps a concurrent unique-index violation to ConflictException (race)', async () => {
      const existing = { id: 'cat-1', name: 'Annual General', code: 'ANNUAL' };
      repo.findOne.mockResolvedValue(existing);
      qb.getOne.mockResolvedValue(null);
      repo.save.mockRejectedValueOnce({
        code: '23505',
        constraint: 'uq_membership_categories_name',
      });

      await expect(
        service.update('cat-1', { fee: 1500 }, 'admin-1'),
      ).rejects.toMatchObject({ response: { code: 'CATEGORY_NAME_TAKEN' } });
    });
  });

  describe('updateStatus', () => {
    it('updates status and records audit', async () => {
      const existing = { id: 'cat-1', name: 'Annual General', status: CommonStatus.ACTIVE };
      repo.findOne.mockResolvedValue(existing);

      const res = await service.updateStatus('cat-1', { status: CommonStatus.INACTIVE }, 'admin-1');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CommonStatus.INACTIVE,
          updated_by: 'admin-1',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'membership_category.status_updated' }),
      );
    });

    it('throws NotFoundException when category does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus('non-existent', { status: CommonStatus.INACTIVE }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
