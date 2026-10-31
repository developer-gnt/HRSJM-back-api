import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PassbookExportService } from './passbook-export.service';
import { ReceiptEntryEntity } from '../../receipt-entries/entities/receipt-entry.entity';
import { ExpenseEntryEntity } from '../../expense-entries/entities/expense-entry.entity';
import { DonationEntity } from '../../donations/entities/donation.entity';
import { MembershipPaymentEntity } from '../../membership-payments/entities/membership-payment.entity';
import {
  PassbookExportFormat,
  PassbookTransactionType,
} from '../dto/passbook-export.dto';

describe('PassbookExportService', () => {
  let service: PassbookExportService;

  const mockReceiptQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockExpenseQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockDonationQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockPaymentQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockReceiptRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockReceiptQueryBuilder),
  };
  const mockExpenseRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockExpenseQueryBuilder),
  };
  const mockDonationRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockDonationQueryBuilder),
  };
  const mockPaymentRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockPaymentQueryBuilder),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PassbookExportService,
        { provide: getRepositoryToken(ReceiptEntryEntity), useValue: mockReceiptRepo },
        { provide: getRepositoryToken(ExpenseEntryEntity), useValue: mockExpenseRepo },
        { provide: getRepositoryToken(DonationEntity), useValue: mockDonationRepo },
        { provide: getRepositoryToken(MembershipPaymentEntity), useValue: mockPaymentRepo },
      ],
    }).compile();

    service = module.get<PassbookExportService>(PassbookExportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const sampleReceipt = {
    id: 'r1',
    voucher_number: 'REC-20261010-00001',
    receipt_date: new Date('2026-10-10T10:00:00Z'),
    received_from: 'Ramesh Patel',
    amount: 5000,
    payment_method: 'UPI',
    reference_number: 'REF-REC-1',
    description: 'Public Donation received',
    income_account: { account_name: 'Donation Income', account_code: '4003' },
  } as ReceiptEntryEntity;

  const sampleExpense = {
    id: 'e1',
    voucher_number: 'EXP-20261012-00001',
    expense_date: new Date('2026-10-12T14:30:00Z'),
    paid_to: 'City Electricity Board',
    amount: 1200,
    payment_method: 'BANK_TRANSFER',
    reference_number: 'REF-EXP-1',
    description: 'Office electricity bill payment',
    expense_account: { account_name: 'Utilities Expense', account_code: '5002' },
  } as ExpenseEntryEntity;

  describe('Validation & Date Range', () => {
    it('throws BadRequestException if fromDate is after toDate', async () => {
      await expect(
        service.exportPassbook({
          fromDate: '2026-10-20',
          toDate: '2026-10-10',
          format: PassbookExportFormat.CSV,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Transaction Type Filtering', () => {
    beforeEach(() => {
      mockReceiptQueryBuilder.getMany.mockResolvedValue([sampleReceipt]);
      mockExpenseQueryBuilder.getMany.mockResolvedValue([sampleExpense]);
      mockDonationQueryBuilder.getMany.mockResolvedValue([]);
      mockPaymentQueryBuilder.getMany.mockResolvedValue([]);
    });

    it('ALL transactions includes both Payment In and Payment Out', async () => {
      const dataset = await service.compileDataset({
        transactionType: PassbookTransactionType.ALL,
      });

      expect(dataset.transactions).toHaveLength(2);
      expect(dataset.totalCredit).toBe(5000);
      expect(dataset.totalDebit).toBe(1200);
      expect(dataset.netChange).toBe(3800);
      expect(dataset.closingBalance).toBe(3800);

      const hasIn = dataset.transactions.some((t) => t.type === 'PAYMENT_IN');
      const hasOut = dataset.transactions.some((t) => t.type === 'PAYMENT_OUT');
      expect(hasIn).toBe(true);
      expect(hasOut).toBe(true);
    });

    it('PAYMENT_IN includes ONLY incoming transactions (never contains Payment Out)', async () => {
      const dataset = await service.compileDataset({
        transactionType: PassbookTransactionType.PAYMENT_IN,
      });

      expect(dataset.transactions).toHaveLength(1);
      expect(dataset.transactions[0].type).toBe('PAYMENT_IN');
      expect(dataset.totalCredit).toBe(5000);
      expect(dataset.totalDebit).toBe(0);

      const hasOut = dataset.transactions.some((t) => t.type === 'PAYMENT_OUT');
      expect(hasOut).toBe(false);
    });

    it('PAYMENT_OUT includes ONLY outgoing transactions (never contains Payment In)', async () => {
      const dataset = await service.compileDataset({
        transactionType: PassbookTransactionType.PAYMENT_OUT,
      });

      expect(dataset.transactions).toHaveLength(1);
      expect(dataset.transactions[0].type).toBe('PAYMENT_OUT');
      expect(dataset.totalDebit).toBe(1200);
      expect(dataset.totalCredit).toBe(0);

      const hasIn = dataset.transactions.some((t) => t.type === 'PAYMENT_IN');
      expect(hasIn).toBe(false);
    });
  });

  describe('Export File Generation Formats', () => {
    beforeEach(() => {
      mockReceiptQueryBuilder.getMany.mockResolvedValue([sampleReceipt]);
      mockExpenseQueryBuilder.getMany.mockResolvedValue([sampleExpense]);
      mockDonationQueryBuilder.getMany.mockResolvedValue([]);
      mockPaymentQueryBuilder.getMany.mockResolvedValue([]);
    });

    it('generates a valid CSV file with UTF-8 BOM, headers, and correct totals', async () => {
      const result = await service.exportPassbook({
        transactionType: PassbookTransactionType.ALL,
        format: PassbookExportFormat.CSV,
      });

      expect(result.contentType).toBe('text/csv; charset=utf-8');
      expect(result.filename).toMatch(/\.csv$/);
      expect(result.buffer).toBeInstanceOf(Buffer);

      const csvString = result.buffer.toString('utf-8');
      expect(csvString.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
      expect(csvString).toContain('HUMAN RIGHTS & SOCIAL JUSTICE MISSION');
      expect(csvString).toContain('REC-20261010-00001');
      expect(csvString).toContain('EXP-20261012-00001');
      expect(csvString).toContain('TOTALS');
    });

    it('generates a valid Excel (.xlsx) file buffer', async () => {
      const result = await service.exportPassbook({
        transactionType: PassbookTransactionType.ALL,
        format: PassbookExportFormat.XLSX,
      });

      expect(result.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(result.filename).toMatch(/\.xlsx$/);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(100);
    });

    it('generates a valid PDF file buffer', async () => {
      const result = await service.exportPassbook({
        transactionType: PassbookTransactionType.ALL,
        format: PassbookExportFormat.PDF,
      });

      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toMatch(/\.pdf$/);
      expect(result.buffer).toBeInstanceOf(Buffer);
      // PDF header signature check (%PDF-)
      const signature = result.buffer.slice(0, 5).toString('ascii');
      expect(signature).toBe('%PDF-');
    });

    it('handles empty results cleanly without errors across all formats', async () => {
      mockReceiptQueryBuilder.getMany.mockResolvedValue([]);
      mockExpenseQueryBuilder.getMany.mockResolvedValue([]);

      const csvRes = await service.exportPassbook({
        transactionType: PassbookTransactionType.ALL,
        format: PassbookExportFormat.CSV,
      });
      expect(csvRes.buffer.length).toBeGreaterThan(0);

      const xlsxRes = await service.exportPassbook({
        transactionType: PassbookTransactionType.ALL,
        format: PassbookExportFormat.XLSX,
      });
      expect(xlsxRes.buffer.length).toBeGreaterThan(0);

      const pdfRes = await service.exportPassbook({
        transactionType: PassbookTransactionType.ALL,
        format: PassbookExportFormat.PDF,
      });
      expect(pdfRes.buffer.length).toBeGreaterThan(0);
    });
  });
});

