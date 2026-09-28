import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AccountingPostingService, toPaise } from './accounting-posting.service';
import { EntryType, ReferenceType } from '../enums/accounting.enums';

describe('AccountingPostingService', () => {
  let service: AccountingPostingService;
  let manager: Record<string, jest.Mock>;

  const mockAccount = {
    id: 'acc-1',
    account_code: '1001',
    account_name: 'Bank',
    account_type: 'ASSET',
    is_active: true,
  };

  const balancedLines = () => [
    { account_code: '1001', debit_amount: 1500, credit_amount: 0 },
    { account_code: '4001', debit_amount: 0, credit_amount: 1500 },
  ];

  beforeEach(() => {
    manager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([
        mockAccount,
        {
          ...mockAccount,
          id: 'acc-2',
          account_code: '4001',
          account_name: 'Membership Income',
          account_type: 'INCOME',
        },
      ]),
      // EntityManager.create/save receive (EntityClass, data).
      create: jest.fn((_cls, x) => x),
      save: jest.fn(async (_cls, x) => ({ id: 'je-1', ...x })),
      query: jest.fn().mockResolvedValue([{ seq: '123' }]),
    };
    service = new AccountingPostingService();
  });

  describe('postEntry', () => {
    it('posts a balanced entry with lines inside the caller transaction', async () => {
      const result = await service.postEntry(manager as never, {
        entry_date: new Date('2026-03-05T00:00:00Z'),
        reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
        reference_id: 'pay-1',
        description: 'Membership payment received',
        lines: balancedLines(),
        acting_user_id: 'user-1',
      });

      expect(result.id).toBe('je-1');
      expect(result.entry_number).toBe('JE-20260305-00123');
      expect(result.entry_type).toBe(EntryType.JOURNAL);
      expect(manager.save).toHaveBeenCalledTimes(2);
      expect(manager.query).toHaveBeenCalledWith(
        `SELECT nextval('accounting_entry_number_seq') AS seq`,
      );
      const lineEntities = manager.create.mock.results.filter((r) =>
        Object.prototype.hasOwnProperty.call(r.value, 'accounting_entry_id'),
      );
      expect(lineEntities.length).toBe(2);
    });

    it('is idempotent per (reference_type, reference_id) — returns the existing JOURNAL unchanged', async () => {
      const existing = { id: 'je-99', entry_number: 'JE-20260305-00099', lines: [] };
      manager.findOne.mockResolvedValue(existing);

      const result = await service.postEntry(manager as never, {
        entry_date: new Date('2026-03-05T00:00:00Z'),
        reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
        reference_id: 'pay-1',
        description: 'Membership payment received',
        lines: balancedLines(),
      });

      expect(result).toBe(existing);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when entry has fewer than two lines', async () => {
      await expect(
        service.postEntry(manager as never, {
          entry_date: new Date('2026-03-05T00:00:00Z'),
          reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
          reference_id: 'pay-1',
          description: 'x',
          lines: [{ account_code: '1001', debit_amount: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when entry is unbalanced', async () => {
      await expect(
        service.postEntry(manager as never, {
          entry_date: new Date('2026-03-05T00:00:00Z'),
          reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
          reference_id: 'pay-1',
          description: 'x',
          lines: [
            { account_code: '1001', debit_amount: 1000, credit_amount: 0 },
            { account_code: '4001', debit_amount: 0, credit_amount: 900 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a line has no account', async () => {
      await expect(
        service.postEntry(manager as never, {
          entry_date: new Date('2026-03-05T00:00:00Z'),
          reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
          reference_id: 'pay-1',
          description: 'x',
          lines: [
            { debit_amount: 1000, credit_amount: 0 },
            { account_code: '4001', debit_amount: 0, credit_amount: 1000 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a line has both sides', async () => {
      await expect(
        service.postEntry(manager as never, {
          entry_date: new Date('2026-03-05T00:00:00Z'),
          reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
          reference_id: 'pay-1',
          description: 'x',
          lines: [
            { account_code: '1001', debit_amount: 1000, credit_amount: 500 },
            { account_code: '4001', debit_amount: 0, credit_amount: 1000 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a line is empty', async () => {
      await expect(
        service.postEntry(manager as never, {
          entry_date: new Date('2026-03-05T00:00:00Z'),
          reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
          reference_id: 'pay-1',
          description: 'x',
          lines: [
            { account_code: '1001', debit_amount: 0, credit_amount: 0 },
            { account_code: '4001', debit_amount: 0, credit_amount: 0 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when amounts are negative', async () => {
      await expect(
        service.postEntry(manager as never, {
          entry_date: new Date('2026-03-05T00:00:00Z'),
          reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
          reference_id: 'pay-1',
          description: 'x',
          lines: [
            { account_code: '1001', debit_amount: -100, credit_amount: 0 },
            { account_code: '4001', debit_amount: 0, credit_amount: -100 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when account is unknown', async () => {
      manager.find.mockResolvedValue([]);

      await expect(
        service.postEntry(manager as never, {
          entry_date: new Date('2026-03-05T00:00:00Z'),
          reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
          reference_id: 'pay-1',
          description: 'x',
          lines: balancedLines(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when account is inactive', async () => {
      manager.find.mockResolvedValue([{ ...mockAccount, is_active: false }]);

      await expect(
        service.postEntry(manager as never, {
          entry_date: new Date('2026-03-05T00:00:00Z'),
          reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
          reference_id: 'pay-1',
          description: 'x',
          lines: balancedLines(),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reverse', () => {
    const postedEntry = () => ({
      id: 'je-1',
      entry_number: 'JE-20260305-00123',
      entry_type: EntryType.JOURNAL,
      reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
      reference_id: 'pay-1',
      description: 'Membership payment received',
      reversal_of_entry_id: null,
      lines: [
        {
          id: 'el-1',
          account_id: 'acc-1',
          debit_amount: 1500,
          credit_amount: 0,
          line_description: null,
          account: mockAccount,
        },
        {
          id: 'el-2',
          account_id: 'acc-2',
          debit_amount: 0,
          credit_amount: 1500,
          line_description: null,
          account: { ...mockAccount, id: 'acc-2', account_code: '4001' },
        },
      ],
    });

    it('creates a mirrored REVERSAL entry with swapped sides', async () => {
      manager.findOne
        .mockResolvedValueOnce(postedEntry())
        .mockResolvedValueOnce(null);

      const reversal = await service.reverse(manager as never, 'je-1', 'user-1');

      expect(reversal.entry_type).toBe(EntryType.REVERSAL);
      expect(reversal.reversal_of_entry_id).toBe('je-1');
      expect(reversal.description).toContain('Reversal of JE-20260305-00123');
      const lineEntities = manager.create.mock.results
        .map((r) => r.value)
        .filter((v) => Object.prototype.hasOwnProperty.call(v, 'accounting_entry_id'));
      expect(lineEntities.length).toBe(2);
      expect(lineEntities[0].debit_amount).toBe(0);
      expect(lineEntities[0].credit_amount).toBe(1500);
      expect(lineEntities[1].debit_amount).toBe(1500);
      expect(lineEntities[1].credit_amount).toBe(0);
    });

    it('throws BadRequestException when entry is not found', async () => {
      await expect(
        service.reverse(manager as never, 'unknown', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when entry already reversed', async () => {
      manager.findOne
        .mockResolvedValueOnce(postedEntry())
        .mockResolvedValueOnce({ id: 'je-88', entry_number: 'JE-20260306-00088' });

      await expect(
        service.reverse(manager as never, 'je-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when trying to reverse a reversal entry', async () => {
      manager.findOne.mockResolvedValueOnce({
        ...postedEntry(),
        entry_type: EntryType.REVERSAL,
      });

      await expect(
        service.reverse(manager as never, 'je-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('toPaise', () => {
    it('converts rupees to integer paise rounding half up', () => {
      expect(toPaise(1500)).toBe(150000);
      expect(toPaise(0.1)).toBe(10);
      expect(toPaise(10.005)).toBe(1001);
      expect(toPaise(0)).toBe(0);
    });
  });
});
