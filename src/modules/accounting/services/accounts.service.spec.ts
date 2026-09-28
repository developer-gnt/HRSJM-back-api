import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';

describe('AccountsService', () => {
  let service: AccountsService;
  let accounts: Record<string, jest.Mock>;
  let audit: Record<string, jest.Mock>;

  const qb = () => {
    const mockQb: Record<string, jest.Mock> = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    return mockQb;
  };

  let mockQb: Record<string, jest.Mock>;

  const mockAccount = {
    id: 'acc-1',
    account_name: 'Bank',
    account_code: '1001',
    account_type: 'ASSET',
    parent_account_id: null,
    description: null,
    is_active: true,
  };

  beforeEach(() => {
    mockQb = qb();
    accounts = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneOrFail: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'acc-new', ...x })),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };
    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    service = new AccountsService(accounts as never, audit as never);
  });

  describe('list', () => {
    it('returns paginated items with meta', async () => {
      const qb2 = qb();
      qb2.getManyAndCount.mockResolvedValue([[mockAccount], 1]);
      accounts.createQueryBuilder.mockReturnValue(qb2);

      const result = await service.list({} as never);

      expect(result.items).toEqual([mockAccount]);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('applies filters (account_type, search) to the query', async () => {
      const qb2 = qb();
      accounts.createQueryBuilder.mockReturnValue(qb2);

      await service.list({
        account_type: 'ASSET',
        search: 'bank',
        page: 2,
        limit: 5,
      } as never);

      expect(qb2.andWhere).toHaveBeenCalledWith(
        'account.account_type = :type',
        { type: 'ASSET' },
      );
      expect(qb2.skip).toHaveBeenCalledWith(5);
      expect(qb2.take).toHaveBeenCalledWith(5);
    });
  });

  describe('getById', () => {
    it('returns the account with its parent', async () => {
      accounts.findOne.mockResolvedValue({ ...mockAccount, parent: null });

      const result = await service.getById('acc-1');

      expect(result.id).toBe('acc-1');
      expect(accounts.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'acc-1' } }),
      );
    });

    it('throws NotFoundException when account not found', async () => {
      await expect(service.getById('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('seeds the account, uppercases the code and audits the event', async () => {
      const result = await service.create(
        {
          account_name: 'Donation Income',
          account_code: 'don-inc',
          account_type: 'INCOME',
        } as never,
        'user-1',
      );

      expect(accounts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          account_name: 'Donation Income',
          account_code: 'DON-INC',
          account_type: 'INCOME',
          is_active: true,
          created_by: 'user-1',
        }),
      );
      expect(result.id).toBe('acc-new');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'account.created' }),
      );
    });

    it('audits and rejects when the parent is missing', async () => {
      await expect(
        service.create(
          {
            account_name: 'Child',
            account_type: 'ASSET',
            parent_account_id: 'acc-unknown',
          } as never,
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when the parent is of a different account type', async () => {
      accounts.findOne.mockResolvedValue({ ...mockAccount, account_type: 'INCOME' });

      await expect(
        service.create(
          {
            account_name: 'Child',
            account_type: 'ASSET',
            parent_account_id: 'acc-1',
          } as never,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate account name', async () => {
      const qb2 = qb();
      qb2.getOne.mockResolvedValueOnce({ ...mockAccount, id: 'acc-99' });
      accounts.createQueryBuilder.mockReturnValue(qb2);

      await expect(
        service.create({ account_name: 'Bank', account_type: 'ASSET' } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a duplicate account code', async () => {
      const qb2 = qb();
      // First getOne (name check) returns nothing, second (code check) returns the duplicate.
      qb2.getOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...mockAccount, id: 'acc-99' });
      accounts.createQueryBuilder.mockReturnValue(qb2);

      await expect(
        service.create({
          account_name: 'New Account',
          account_code: '1001',
          account_type: 'ASSET',
        } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('converts a concurrent unique violation (23505) into a 409', async () => {
      accounts.save.mockRejectedValueOnce({
        code: '23505',
        constraint: 'account_code_unique',
        driverError: { code: '23505', constraint: 'account_code_unique' },
      });

      await expect(
        service.create({
          account_name: 'New Account',
          account_code: '9999',
          account_type: 'ASSET',
        } as never),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('seeds the account and audits the update', async () => {
      accounts.findOne.mockResolvedValue(mockAccount);

      const result = await service.update(
        'acc-1',
        { description: 'Main bank account' } as never,
        'user-1',
      );

      expect(result.description).toBe('Main bank account');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'account.updated' }),
      );
    });

    it('rejects when an account cannot be its own parent', async () => {
      accounts.findOne.mockResolvedValue(mockAccount);

      await expect(
        service.update('acc-1', { parent_account_id: 'acc-1' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate name scoped to other accounts', async () => {
      accounts.findOne.mockResolvedValue(mockAccount);
      const qb2 = qb();
      qb2.getOne.mockResolvedValueOnce({ ...mockAccount, id: 'acc-99' });
      accounts.createQueryBuilder.mockReturnValue(qb2);

      await expect(
        service.update('acc-1', { account_name: 'Other Account' } as never),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateStatus', () => {
    it('deactivates an account with no active children', async () => {
      accounts.findOne.mockResolvedValue(mockAccount);
      accounts.count.mockResolvedValue(0);

      const result = await service.updateStatus(
        'acc-1',
        { is_active: false } as never,
        'user-1',
      );

      expect(result.is_active).toBe(false);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'account.status_updated' }),
      );
    });

    it('rejects deactivation when active children exist', async () => {
      accounts.findOne.mockResolvedValue(mockAccount);
      accounts.count.mockResolvedValue(2);

      await expect(
        service.updateStatus('acc-1', { is_active: false } as never),
      ).rejects.toThrow(ConflictException);
    });

    it('activates an account without the children check', async () => {
      accounts.findOne.mockResolvedValue({ ...mockAccount, is_active: false });

      const result = await service.updateStatus(
        'acc-1',
        { is_active: true } as never,
        'user-1',
      );

      expect(result.is_active).toBe(true);
      expect(accounts.count).not.toHaveBeenCalled();
    });
  });
});
