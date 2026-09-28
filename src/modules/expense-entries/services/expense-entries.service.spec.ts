import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AccountEntity } from '../../accounting/entities/account.entity';
import { AccountingEntryEntity } from '../../accounting/entities/accounting-entry.entity';
import {
  AccountType,
  EntryType,
  ReferenceType,
} from '../../accounting/enums/accounting.enums';
import { AccountingPostingService } from '../../accounting/services/accounting-posting.service';
import { AuditService } from '../../audit/services/audit.service';
import { ExpenseEntryEntity } from '../entities/expense-entry.entity';
import {
  ExpensePaymentMethod,
  ExpenseStatus,
} from '../enums/expense-entry.enums';
import { ExpenseEntriesService } from './expense-entries.service';

describe('ExpenseEntriesService', () => {
  let service: ExpenseEntriesService;
  let expenseRepo: jest.Mocked<Partial<Repository<ExpenseEntryEntity>>>;
  let accountRepo: jest.Mocked<Partial<Repository<AccountEntity>>>;
  let postingService: jest.Mocked<Partial<AccountingPostingService>>;
  let auditService: jest.Mocked<Partial<AuditService>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;
  let manager: jest.Mocked<Partial<EntityManager>>;

  const mockExpenseAccount: AccountEntity = {
    id: '00000000-0000-4000-8000-000000000757',
    account_code: '5001',
    account_name: 'Other Expenses',
    account_type: AccountType.EXPENSE,
    parent_account_id: null,
    description: 'Operational expenses',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
  };

  const mockPaidFromAccount: AccountEntity = {
    id: '00000000-0000-4000-8000-000000000751',
    account_code: '1001',
    account_name: 'Bank',
    account_type: AccountType.ASSET,
    parent_account_id: null,
    description: 'Main bank account',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
  };

  const mockJournalEntry: AccountingEntryEntity = {
    id: '11111111-1111-4000-8000-111111111111',
    entry_number: 'JE-20260928-00001',
    entry_date: new Date('2026-09-28T00:00:00Z'),
    entry_type: EntryType.JOURNAL,
    reference_type: ReferenceType.MANUAL_EXPENSE,
    reference_id: '22222222-2222-4000-8000-222222222222',
    description: 'Expense voucher EXP-20260928-00001',
    reversal_of_entry_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
  };

  beforeEach(() => {
    expenseRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    accountRepo = {
      findOne: jest.fn(),
    };
    postingService = {
      postEntry: jest.fn().mockResolvedValue(mockJournalEntry),
      reverse: jest.fn().mockResolvedValue({
        ...mockJournalEntry,
        id: '33333333-3333-4000-8000-333333333333',
        entry_type: EntryType.REVERSAL,
      }),
    };
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    manager = {
      findOne: jest.fn(),
      query: jest.fn().mockResolvedValue([{ seq: '1' }]),
      create: jest.fn().mockImplementation((_, entity) => ({
        id: '22222222-2222-4000-8000-222222222222',
        ...entity,
      })),
      save: jest.fn().mockImplementation((_, entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 } as any),
    };

    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (m: EntityManager) => Promise<any>) =>
          cb(manager as EntityManager),
        ),
    };

    service = new ExpenseEntriesService(
      expenseRepo as Repository<ExpenseEntryEntity>,
      accountRepo as Repository<AccountEntity>,
      postingService as AccountingPostingService,
      auditService as AuditService,
      dataSource as DataSource,
    );
  });

  describe('create', () => {
    it('rejects amount <= 0', async () => {
      await expect(
        service.create({
          expense_date: '2026-09-28T00:00:00Z',
          paid_to: 'Vendor',
          expense_account_id: mockExpenseAccount.id,
          paid_from_account_id: mockPaidFromAccount.id,
          amount: 0,
          payment_method: ExpensePaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid date string', async () => {
      await expect(
        service.create({
          expense_date: 'invalid-date',
          paid_to: 'Vendor',
          expense_account_id: mockExpenseAccount.id,
          paid_from_account_id: mockPaidFromAccount.id,
          amount: 1000,
          payment_method: ExpensePaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-existent expense account', async () => {
      (manager.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.create({
          expense_date: '2026-09-28T00:00:00Z',
          paid_to: 'Vendor',
          expense_account_id: 'unknown-id',
          paid_from_account_id: mockPaidFromAccount.id,
          amount: 1000,
          payment_method: ExpensePaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects inactive expense account', async () => {
      (manager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockExpenseAccount,
        is_active: false,
      });

      await expect(
        service.create({
          expense_date: '2026-09-28T00:00:00Z',
          paid_to: 'Vendor',
          expense_account_id: mockExpenseAccount.id,
          paid_from_account_id: mockPaidFromAccount.id,
          amount: 1000,
          payment_method: ExpensePaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-EXPENSE account type for expense account', async () => {
      (manager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockExpenseAccount,
        account_type: AccountType.INCOME,
      });

      await expect(
        service.create({
          expense_date: '2026-09-28T00:00:00Z',
          paid_to: 'Vendor',
          expense_account_id: mockExpenseAccount.id,
          paid_from_account_id: mockPaidFromAccount.id,
          amount: 1000,
          payment_method: ExpensePaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-existent paid-from account', async () => {
      (manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockExpenseAccount)
        .mockResolvedValueOnce(null);

      await expect(
        service.create({
          expense_date: '2026-09-28T00:00:00Z',
          paid_to: 'Vendor',
          expense_account_id: mockExpenseAccount.id,
          paid_from_account_id: 'unknown-id',
          amount: 1000,
          payment_method: ExpensePaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects inactive paid-from account', async () => {
      (manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockExpenseAccount)
        .mockResolvedValueOnce({
          ...mockPaidFromAccount,
          is_active: false,
        });

      await expect(
        service.create({
          expense_date: '2026-09-28T00:00:00Z',
          paid_to: 'Vendor',
          expense_account_id: mockExpenseAccount.id,
          paid_from_account_id: mockPaidFromAccount.id,
          amount: 1000,
          payment_method: ExpensePaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-ASSET account type for paid-from account', async () => {
      (manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockExpenseAccount)
        .mockResolvedValueOnce({
          ...mockPaidFromAccount,
          account_type: AccountType.LIABILITY,
        });

      await expect(
        service.create({
          expense_date: '2026-09-28T00:00:00Z',
          paid_to: 'Vendor',
          expense_account_id: mockExpenseAccount.id,
          paid_from_account_id: mockPaidFromAccount.id,
          amount: 1000,
          payment_method: ExpensePaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates expense voucher and posts balanced double-entry', async () => {
      (manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockExpenseAccount)
        .mockResolvedValueOnce(mockPaidFromAccount);

      const result = await service.create(
        {
          expense_date: '2026-09-28T00:00:00Z',
          paid_to: 'Apex Office Supplies',
          expense_account_id: mockExpenseAccount.id,
          paid_from_account_id: mockPaidFromAccount.id,
          amount: 5000,
          payment_method: ExpensePaymentMethod.BANK_TRANSFER,
          reference_number: 'INV-9823',
          description: 'Stationery purchase',
        },
        '00000000-0000-4000-8000-000000000001',
      );

      expect(result).toBeDefined();
      expect(result.voucher_number).toBe('EXP-20260928-00001');
      expect(result.status).toBe(ExpenseStatus.POSTED);
      expect(result.amount).toBe(5000);

      // Verify posting service called with correct debit and credit lines
      expect(postingService.postEntry).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          reference_type: ReferenceType.MANUAL_EXPENSE,
          reference_id: '22222222-2222-4000-8000-222222222222',
          lines: [
            {
              account_id: mockExpenseAccount.id,
              debit_amount: 5000,
              line_description: 'Expense: Apex Office Supplies',
            },
            {
              account_id: mockPaidFromAccount.id,
              credit_amount: 5000,
              line_description: 'Paid via BANK_TRANSFER',
            },
          ],
        }),
      );

      // Verify audit log recorded
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'EXPENSE_ENTRY_CREATED',
          entityType: 'expense_entries',
        }),
      );
    });
  });

  describe('getById', () => {
    it('returns expense entry when found', async () => {
      const mockExpense: ExpenseEntryEntity = {
        id: '22222222-2222-4000-8000-222222222222',
        voucher_number: 'EXP-20260928-00001',
        expense_date: new Date(),
        paid_to: 'Vendor',
        expense_account_id: mockExpenseAccount.id,
        paid_from_account_id: mockPaidFromAccount.id,
        amount: 2500,
        payment_method: ExpensePaymentMethod.CASH,
        reference_number: null,
        description: 'Office tea',
        attachment_url: null,
        status: ExpenseStatus.POSTED,
        accounting_entry_id: mockJournalEntry.id,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };

      (expenseRepo.findOne as jest.Mock).mockResolvedValueOnce(mockExpense);

      const res = await service.getById(mockExpense.id);
      expect(res.id).toBe(mockExpense.id);
      expect(res.amount).toBe(2500);
    });

    it('throws NotFoundException when entry does not exist', async () => {
      (expenseRepo.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.getById('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates metadata fields on an active expense', async () => {
      const mockExpense: ExpenseEntryEntity = {
        id: '22222222-2222-4000-8000-222222222222',
        voucher_number: 'EXP-20260928-00001',
        expense_date: new Date(),
        paid_to: 'Vendor',
        expense_account_id: mockExpenseAccount.id,
        paid_from_account_id: mockPaidFromAccount.id,
        amount: 2500,
        payment_method: ExpensePaymentMethod.CASH,
        reference_number: null,
        description: 'Office tea',
        attachment_url: null,
        status: ExpenseStatus.POSTED,
        accounting_entry_id: mockJournalEntry.id,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };

      (expenseRepo.findOne as jest.Mock).mockResolvedValue(mockExpense);
      (expenseRepo.save as jest.Mock).mockImplementation((e) =>
        Promise.resolve(e),
      );

      const updated = await service.update(
        mockExpense.id,
        {
          paid_to: 'New Vendor Name',
          description: 'Updated tea & coffee',
          reference_number: 'BILL-01',
        },
        '00000000-0000-4000-8000-000000000001',
      );

      expect(updated.paid_to).toBe('New Vendor Name');
      expect(updated.description).toBe('Updated tea & coffee');
      expect(updated.reference_number).toBe('BILL-01');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'EXPENSE_ENTRY_UPDATED' }),
      );
    });

    it('rejects update if expense is CANCELLED', async () => {
      const mockExpense: ExpenseEntryEntity = {
        id: '22222222-2222-4000-8000-222222222222',
        voucher_number: 'EXP-20260928-00001',
        expense_date: new Date(),
        paid_to: 'Vendor',
        expense_account_id: mockExpenseAccount.id,
        paid_from_account_id: mockPaidFromAccount.id,
        amount: 2500,
        payment_method: ExpensePaymentMethod.CASH,
        reference_number: null,
        description: 'Office tea',
        attachment_url: null,
        status: ExpenseStatus.CANCELLED,
        accounting_entry_id: mockJournalEntry.id,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };

      (expenseRepo.findOne as jest.Mock).mockResolvedValue(mockExpense);

      await expect(
        service.update(mockExpense.id, { paid_to: 'Something else' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('cancels expense entry and reverses the accounting journal', async () => {
      const mockExpense: ExpenseEntryEntity = {
        id: '22222222-2222-4000-8000-222222222222',
        voucher_number: 'EXP-20260928-00001',
        expense_date: new Date(),
        paid_to: 'Vendor',
        expense_account_id: mockExpenseAccount.id,
        paid_from_account_id: mockPaidFromAccount.id,
        amount: 2500,
        payment_method: ExpensePaymentMethod.CASH,
        reference_number: null,
        description: 'Office tea',
        attachment_url: null,
        status: ExpenseStatus.POSTED,
        accounting_entry_id: mockJournalEntry.id,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };

      (expenseRepo.findOne as jest.Mock).mockResolvedValue(mockExpense);
      (manager.findOne as jest.Mock).mockResolvedValueOnce(mockJournalEntry);

      await service.updateStatus(
        mockExpense.id,
        {
          status: ExpenseStatus.CANCELLED,
          cancellation_reason: 'Duplicate payment voucher',
        },
        '00000000-0000-4000-8000-000000000001',
      );

      // Verify reverse journal was called on accounting posting service
      expect(postingService.reverse).toHaveBeenCalledWith(
        manager,
        mockJournalEntry.id,
        '00000000-0000-4000-8000-000000000001',
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'EXPENSE_ENTRY_CANCELLED',
        }),
      );
    });

    it('rejects reactivation of a cancelled expense entry', async () => {
      const mockExpense: ExpenseEntryEntity = {
        id: '22222222-2222-4000-8000-222222222222',
        voucher_number: 'EXP-20260928-00001',
        expense_date: new Date(),
        paid_to: 'Vendor',
        expense_account_id: mockExpenseAccount.id,
        paid_from_account_id: mockPaidFromAccount.id,
        amount: 2500,
        payment_method: ExpensePaymentMethod.CASH,
        reference_number: null,
        description: 'Office tea',
        attachment_url: null,
        status: ExpenseStatus.CANCELLED,
        accounting_entry_id: mockJournalEntry.id,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };

      (expenseRepo.findOne as jest.Mock).mockResolvedValue(mockExpense);

      await expect(
        service.updateStatus(mockExpense.id, {
          status: 'SOME_STATUS' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
