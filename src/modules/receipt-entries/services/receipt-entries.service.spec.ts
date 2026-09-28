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
import { ReceiptEntryEntity } from '../entities/receipt-entry.entity';
import {
  ReceiptPaymentMethod,
  ReceiptStatus,
} from '../enums/receipt-entry.enums';
import { ReceiptEntriesService } from './receipt-entries.service';

describe('ReceiptEntriesService', () => {
  let service: ReceiptEntriesService;
  let receiptRepo: jest.Mocked<Partial<Repository<ReceiptEntryEntity>>>;
  let accountRepo: jest.Mocked<Partial<Repository<AccountEntity>>>;
  let postingService: jest.Mocked<Partial<AccountingPostingService>>;
  let auditService: jest.Mocked<Partial<AuditService>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;
  let manager: jest.Mocked<Partial<EntityManager>>;

  const mockIncomeAccount: AccountEntity = {
    id: '00000000-0000-4000-8000-000000000756',
    account_code: '4004',
    account_name: 'Other Income',
    account_type: AccountType.INCOME,
    parent_account_id: null,
    description: 'Miscellaneous income',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
  };

  const mockReceivedInAccount: AccountEntity = {
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
    reference_type: ReferenceType.MANUAL_RECEIPT,
    reference_id: '44444444-4444-4000-8000-444444444444',
    description: 'Receipt voucher REC-20260928-00001',
    reversal_of_entry_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
  };

  beforeEach(() => {
    receiptRepo = {
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
        id: '55555555-5555-4000-8000-555555555555',
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
        id: '44444444-4444-4000-8000-444444444444',
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

    service = new ReceiptEntriesService(
      receiptRepo as Repository<ReceiptEntryEntity>,
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
          receipt_date: '2026-09-28T00:00:00Z',
          received_from: 'Donor',
          income_account_id: mockIncomeAccount.id,
          received_in_account_id: mockReceivedInAccount.id,
          amount: 0,
          payment_method: ReceiptPaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid date string', async () => {
      await expect(
        service.create({
          receipt_date: 'invalid-date',
          received_from: 'Donor',
          income_account_id: mockIncomeAccount.id,
          received_in_account_id: mockReceivedInAccount.id,
          amount: 1000,
          payment_method: ReceiptPaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-existent income account', async () => {
      (manager.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.create({
          receipt_date: '2026-09-28T00:00:00Z',
          received_from: 'Donor',
          income_account_id: 'unknown-id',
          received_in_account_id: mockReceivedInAccount.id,
          amount: 1000,
          payment_method: ReceiptPaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects inactive income account', async () => {
      (manager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockIncomeAccount,
        is_active: false,
      });

      await expect(
        service.create({
          receipt_date: '2026-09-28T00:00:00Z',
          received_from: 'Donor',
          income_account_id: mockIncomeAccount.id,
          received_in_account_id: mockReceivedInAccount.id,
          amount: 1000,
          payment_method: ReceiptPaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-INCOME account type for income account', async () => {
      (manager.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockIncomeAccount,
        account_type: AccountType.EXPENSE,
      });

      await expect(
        service.create({
          receipt_date: '2026-09-28T00:00:00Z',
          received_from: 'Donor',
          income_account_id: mockIncomeAccount.id,
          received_in_account_id: mockReceivedInAccount.id,
          amount: 1000,
          payment_method: ReceiptPaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-existent received-in account', async () => {
      (manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockIncomeAccount)
        .mockResolvedValueOnce(null);

      await expect(
        service.create({
          receipt_date: '2026-09-28T00:00:00Z',
          received_from: 'Donor',
          income_account_id: mockIncomeAccount.id,
          received_in_account_id: 'unknown-id',
          amount: 1000,
          payment_method: ReceiptPaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects inactive received-in account', async () => {
      (manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockIncomeAccount)
        .mockResolvedValueOnce({
          ...mockReceivedInAccount,
          is_active: false,
        });

      await expect(
        service.create({
          receipt_date: '2026-09-28T00:00:00Z',
          received_from: 'Donor',
          income_account_id: mockIncomeAccount.id,
          received_in_account_id: mockReceivedInAccount.id,
          amount: 1000,
          payment_method: ReceiptPaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-ASSET account type for received-in account', async () => {
      (manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockIncomeAccount)
        .mockResolvedValueOnce({
          ...mockReceivedInAccount,
          account_type: AccountType.LIABILITY,
        });

      await expect(
        service.create({
          receipt_date: '2026-09-28T00:00:00Z',
          received_from: 'Donor',
          income_account_id: mockIncomeAccount.id,
          received_in_account_id: mockReceivedInAccount.id,
          amount: 1000,
          payment_method: ReceiptPaymentMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates receipt voucher and posts balanced double-entry', async () => {
      (manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockIncomeAccount)
        .mockResolvedValueOnce(mockReceivedInAccount);

      const result = await service.create(
        {
          receipt_date: '2026-09-28T00:00:00Z',
          received_from: 'Dr. Tariq Khan',
          income_account_id: mockIncomeAccount.id,
          received_in_account_id: mockReceivedInAccount.id,
          amount: 25000,
          payment_method: ReceiptPaymentMethod.BANK_TRANSFER,
          reference_number: 'UTR-8832',
          description: 'Community hall donation',
        },
        '00000000-0000-4000-8000-000000000001',
      );

      expect(result).toBeDefined();
      expect(result.voucher_number).toBe('REC-20260928-00001');
      expect(result.status).toBe(ReceiptStatus.POSTED);
      expect(result.amount).toBe(25000);

      // Verify posting service called with Dr ReceivedIn / Cr Income lines
      expect(postingService.postEntry).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          reference_type: ReferenceType.MANUAL_RECEIPT,
          reference_id: '44444444-4444-4000-8000-444444444444',
          lines: [
            {
              account_id: mockReceivedInAccount.id,
              debit_amount: 25000,
              line_description: 'Received via BANK_TRANSFER',
            },
            {
              account_id: mockIncomeAccount.id,
              credit_amount: 25000,
              line_description: 'Income: Dr. Tariq Khan',
            },
          ],
        }),
      );

      // Verify audit log recorded
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'RECEIPT_ENTRY_CREATED',
          entityType: 'receipt_entries',
        }),
      );
    });
  });

  describe('getById', () => {
    it('returns receipt entry when found', async () => {
      const mockReceipt: ReceiptEntryEntity = {
        id: '44444444-4444-4000-8000-444444444444',
        voucher_number: 'REC-20260928-00001',
        receipt_date: new Date(),
        received_from: 'Dr. Tariq Khan',
        income_account_id: mockIncomeAccount.id,
        received_in_account_id: mockReceivedInAccount.id,
        amount: 25000,
        payment_method: ReceiptPaymentMethod.BANK_TRANSFER,
        reference_number: null,
        description: 'General support',
        attachment_url: null,
        status: ReceiptStatus.POSTED,
        accounting_entry_id: mockJournalEntry.id,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };

      (receiptRepo.findOne as jest.Mock).mockResolvedValueOnce(mockReceipt);

      const res = await service.getById(mockReceipt.id);
      expect(res.id).toBe(mockReceipt.id);
      expect(res.amount).toBe(25000);
    });

    it('throws NotFoundException when entry does not exist', async () => {
      (receiptRepo.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.getById('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates metadata fields on an active receipt', async () => {
      const mockReceipt: ReceiptEntryEntity = {
        id: '44444444-4444-4000-8000-444444444444',
        voucher_number: 'REC-20260928-00001',
        receipt_date: new Date(),
        received_from: 'Payer',
        income_account_id: mockIncomeAccount.id,
        received_in_account_id: mockReceivedInAccount.id,
        amount: 5000,
        payment_method: ReceiptPaymentMethod.CASH,
        reference_number: null,
        description: 'Donation',
        attachment_url: null,
        status: ReceiptStatus.POSTED,
        accounting_entry_id: mockJournalEntry.id,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };

      (receiptRepo.findOne as jest.Mock).mockResolvedValue(mockReceipt);
      (receiptRepo.save as jest.Mock).mockImplementation((e) =>
        Promise.resolve(e),
      );

      const updated = await service.update(
        mockReceipt.id,
        {
          received_from: 'New Payer Name',
          description: 'Updated donation description',
          reference_number: 'REC-01',
        },
        '00000000-0000-4000-8000-000000000001',
      );

      expect(updated.received_from).toBe('New Payer Name');
      expect(updated.description).toBe('Updated donation description');
      expect(updated.reference_number).toBe('REC-01');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'RECEIPT_ENTRY_UPDATED' }),
      );
    });

    it('rejects update if receipt is CANCELLED', async () => {
      const mockReceipt: ReceiptEntryEntity = {
        id: '44444444-4444-4000-8000-444444444444',
        voucher_number: 'REC-20260928-00001',
        receipt_date: new Date(),
        received_from: 'Payer',
        income_account_id: mockIncomeAccount.id,
        received_in_account_id: mockReceivedInAccount.id,
        amount: 5000,
        payment_method: ReceiptPaymentMethod.CASH,
        reference_number: null,
        description: 'Donation',
        attachment_url: null,
        status: ReceiptStatus.CANCELLED,
        accounting_entry_id: mockJournalEntry.id,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };

      (receiptRepo.findOne as jest.Mock).mockResolvedValue(mockReceipt);

      await expect(
        service.update(mockReceipt.id, { received_from: 'Something else' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('cancels receipt entry and reverses the accounting journal', async () => {
      const mockReceipt: ReceiptEntryEntity = {
        id: '44444444-4444-4000-8000-444444444444',
        voucher_number: 'REC-20260928-00001',
        receipt_date: new Date(),
        received_from: 'Payer',
        income_account_id: mockIncomeAccount.id,
        received_in_account_id: mockReceivedInAccount.id,
        amount: 5000,
        payment_method: ReceiptPaymentMethod.CASH,
        reference_number: null,
        description: 'Donation',
        attachment_url: null,
        status: ReceiptStatus.POSTED,
        accounting_entry_id: mockJournalEntry.id,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };

      (receiptRepo.findOne as jest.Mock).mockResolvedValue(mockReceipt);
      (manager.findOne as jest.Mock).mockResolvedValueOnce(mockJournalEntry);

      await service.updateStatus(
        mockReceipt.id,
        {
          status: ReceiptStatus.CANCELLED,
          cancellation_reason: 'Cheque bounced',
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
          event: 'RECEIPT_ENTRY_CANCELLED',
        }),
      );
    });

    it('rejects reactivation of a cancelled receipt entry', async () => {
      const mockReceipt: ReceiptEntryEntity = {
        id: '44444444-4444-4000-8000-444444444444',
        voucher_number: 'REC-20260928-00001',
        receipt_date: new Date(),
        received_from: 'Payer',
        income_account_id: mockIncomeAccount.id,
        received_in_account_id: mockReceivedInAccount.id,
        amount: 5000,
        payment_method: ReceiptPaymentMethod.CASH,
        reference_number: null,
        description: 'Donation',
        attachment_url: null,
        status: ReceiptStatus.CANCELLED,
        accounting_entry_id: mockJournalEntry.id,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
        deleted_at: null,
        deleted_by: null,
      };

      (receiptRepo.findOne as jest.Mock).mockResolvedValue(mockReceipt);

      await expect(
        service.updateStatus(mockReceipt.id, {
          status: 'SOME_STATUS' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
