import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ReceiptEntryEntity } from '../../receipt-entries/entities/receipt-entry.entity';
import { ExpenseEntryEntity } from '../../expense-entries/entities/expense-entry.entity';
import { DonationEntity } from '../../donations/entities/donation.entity';
import { MembershipPaymentEntity } from '../../membership-payments/entities/membership-payment.entity';
import {
  PassbookExportFormat,
  PassbookExportQueryDto,
  PassbookTransactionType,
} from '../dto/passbook-export.dto';

export interface PassbookExportRow {
  date: string; // YYYY-MM-DD
  dateTime: Date;
  voucherNumber: string;
  type: 'PAYMENT_IN' | 'PAYMENT_OUT';
  typeLabel: string;
  partyName: string;
  accountName: string;
  paymentMethod: string;
  referenceNumber: string;
  narration: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface PassbookExportDataset {
  periodLabel: string;
  fromDate: string | null;
  toDate: string | null;
  transactionType: PassbookTransactionType;
  generatedAt: string;
  openingBalance: number;
  totalCredit: number;
  totalDebit: number;
  netChange: number;
  closingBalance: number;
  totalCount: number;
  transactions: PassbookExportRow[];
}

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function cleanPayerName(name?: string | null): string {
  if (!name) return '';
  return name
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function formatINR(val: number): string {
  const num = Number(val) || 0;
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

@Injectable()
export class PassbookExportService {
  private readonly logger = new Logger(PassbookExportService.name);

  constructor(
    @InjectRepository(ReceiptEntryEntity)
    private readonly receiptRepo: Repository<ReceiptEntryEntity>,
    @InjectRepository(ExpenseEntryEntity)
    private readonly expenseRepo: Repository<ExpenseEntryEntity>,
    @InjectRepository(DonationEntity)
    private readonly donationRepo: Repository<DonationEntity>,
    @InjectRepository(MembershipPaymentEntity)
    private readonly paymentRepo: Repository<MembershipPaymentEntity>,
  ) {}

  /**
   * Main export handler: aggregates transactions, calculates balances,
   * generates the requested file format, and returns the binary buffer.
   */
  async exportPassbook(dto: PassbookExportQueryDto): Promise<ExportResult> {
    if (dto.fromDate && dto.toDate && dto.fromDate > dto.toDate) {
      throw new BadRequestException({
        message: 'fromDate cannot be after toDate',
        code: 'INVALID_DATE_RANGE',
        details: { fromDate: dto.fromDate, toDate: dto.toDate },
      });
    }

    const dataset = await this.compileDataset(dto);
    const format = dto.format || PassbookExportFormat.PDF;
    const cleanPeriod = (dataset.periodLabel || 'All_Time')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    const typeTag = dataset.transactionType.toLowerCase();

    switch (format) {
      case PassbookExportFormat.CSV: {
        const buffer = this.generateCsv(dataset);
        return {
          buffer,
          contentType: 'text/csv; charset=utf-8',
          filename: `HRSJM_Passbook_${typeTag}_${cleanPeriod}.csv`,
        };
      }
      case PassbookExportFormat.XLSX: {
        const buffer = await this.generateExcel(dataset);
        return {
          buffer,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          filename: `HRSJM_Passbook_${typeTag}_${cleanPeriod}.xlsx`,
        };
      }
      case PassbookExportFormat.PDF:
      default: {
        const buffer = await this.generatePdf(dataset);
        return {
          buffer,
          contentType: 'application/pdf',
          filename: `HRSJM_Passbook_${typeTag}_${cleanPeriod}.pdf`,
        };
      }
    }
  }

  /**
   * Compiles and deduplicates financial transactions across all authoritative sources.
   */
  async compileDataset(dto: PassbookExportQueryDto): Promise<PassbookExportDataset> {
    const fromDate = dto.fromDate ? dto.fromDate.slice(0, 10) : null;
    const toDate = dto.toDate ? dto.toDate.slice(0, 10) : null;
    const txType = dto.transactionType || PassbookTransactionType.ALL;

    const includeInflow =
      txType === PassbookTransactionType.ALL ||
      txType === PassbookTransactionType.PAYMENT_IN;
    const includeOutflow =
      txType === PassbookTransactionType.ALL ||
      txType === PassbookTransactionType.PAYMENT_OUT;

    // Fetch Receipts (Inflow)
    let receipts: ReceiptEntryEntity[] = [];
    if (includeInflow) {
      receipts = await this.receiptRepo
        .createQueryBuilder('receipt')
        .leftJoinAndSelect('receipt.income_account', 'income_account')
        .leftJoinAndSelect('receipt.received_in_account', 'received_in_account')
        .where('receipt.status != :cancelled', { cancelled: 'CANCELLED' })
        .orderBy('receipt.receipt_date', 'ASC')
        .getMany();
    }

    // Fetch Expenses (Outflow)
    let expenses: ExpenseEntryEntity[] = [];
    if (includeOutflow) {
      expenses = await this.expenseRepo
        .createQueryBuilder('expense')
        .leftJoinAndSelect('expense.expense_account', 'expense_account')
        .leftJoinAndSelect('expense.paid_from_account', 'paid_from_account')
        .where('expense.status != :cancelled', { cancelled: 'CANCELLED' })
        .orderBy('expense.expense_date', 'ASC')
        .getMany();
    }

    // Fetch Verified Donations (Inflow)
    let donations: DonationEntity[] = [];
    if (includeInflow) {
      donations = await this.donationRepo
        .createQueryBuilder('donation')
        .where('donation.status IN (:...statuses)', {
          statuses: ['SUCCESS', 'PAID', 'COMPLETED', 'VERIFIED'],
        })
        .orderBy('donation.created_at', 'ASC')
        .getMany();
    }

    // Fetch Verified Membership Payments (Inflow)
    let payments: MembershipPaymentEntity[] = [];
    if (includeInflow) {
      payments = await this.paymentRepo
        .createQueryBuilder('payment')
        .leftJoinAndSelect('payment.user', 'user')
        .where('payment.payment_status IN (:...statuses)', {
          statuses: ['SUCCESS', 'PAID', 'COMPLETED', 'VERIFIED'],
        })
        .orderBy('payment.created_at', 'ASC')
        .getMany();
    }

    // Cross-source Deduplication
    const seenVouchers = new Set<string>();
    const seenReferences = new Set<string>();
    interface CoveredReceipt {
      amount: number;
      dateKey: string;
      cleanPayer: string;
      rawPayer: string;
      ref: string;
      descLower: string;
      isDonation: boolean;
      isMembership: boolean;
      used: boolean;
    }
    const coveredReceipts: CoveredReceipt[] = [];
    const allRaw: PassbookExportRow[] = [];

    // 1. Process Expenses (Payment Out)
    for (const exp of expenses) {
      const vNum = exp.voucher_number || `EXP-${exp.id.slice(0, 8).toUpperCase()}`;
      const dStr = exp.expense_date
        ? new Date(exp.expense_date).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const amt = Number(exp.amount) || 0;

      seenVouchers.add(vNum.toLowerCase());
      if (exp.reference_number) {
        seenReferences.add(exp.reference_number.trim().toLowerCase());
      }

      allRaw.push({
        date: dStr,
        dateTime: new Date(exp.expense_date || exp.created_at),
        voucherNumber: vNum,
        type: 'PAYMENT_OUT',
        typeLabel: 'Payment Out (Expense)',
        partyName: exp.paid_to || 'Beneficiary / Vendor',
        accountName: exp.expense_account?.account_name || 'Operating Expense',
        paymentMethod: (exp.payment_method || 'CASH').replace(/_/g, ' '),
        referenceNumber: exp.reference_number || vNum,
        narration: exp.description || `Paid to ${exp.paid_to}`,
        debit: amt,
        credit: 0,
        runningBalance: 0,
      });
    }

    // 2. Process Receipts (Payment In)
    for (const rec of receipts) {
      const vNum = rec.voucher_number || `REC-${rec.id.slice(0, 8).toUpperCase()}`;
      const dStr = rec.receipt_date
        ? new Date(rec.receipt_date).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const amt = Number(rec.amount) || 0;
      const refNum = (rec.reference_number || '').trim().toLowerCase();
      const descLower = (rec.description || '').toLowerCase();

      seenVouchers.add(vNum.toLowerCase());
      if (refNum && !refNum.startsWith('ref-rec') && refNum !== 'n/a') {
        seenReferences.add(refNum);
      }
      const payMatch = descLower.match(/payment id:\s*([^\s|]+)/);
      if (payMatch && payMatch[1]) {
        seenReferences.add(payMatch[1].trim().toLowerCase());
      }

      const isDonation =
        rec.income_account?.account_code === '4003' ||
        (rec.income_account?.account_name || '').toLowerCase().includes('donation') ||
        descLower.includes('donation');

      const isMembership =
        rec.income_account?.account_code === '4001' ||
        rec.income_account?.account_code === '4002' ||
        (rec.income_account?.account_name || '').toLowerCase().includes('membership') ||
        descLower.includes('membership') ||
        descLower.includes('renewal');

      coveredReceipts.push({
        amount: amt,
        dateKey: dStr,
        cleanPayer: cleanPayerName(rec.received_from),
        rawPayer: (rec.received_from || '').trim().toLowerCase(),
        ref: refNum,
        descLower,
        isDonation,
        isMembership,
        used: false,
      });

      allRaw.push({
        date: dStr,
        dateTime: new Date(rec.receipt_date || rec.created_at),
        voucherNumber: vNum,
        type: 'PAYMENT_IN',
        typeLabel: 'Payment In (Receipt)',
        partyName: rec.received_from || 'Donor / Member',
        accountName: rec.income_account?.account_name || 'Income Receipt',
        paymentMethod: (rec.payment_method || 'BANK_TRANSFER').replace(/_/g, ' '),
        referenceNumber: rec.reference_number || vNum,
        narration: rec.description || `From ${rec.received_from}`,
        debit: 0,
        credit: amt,
        runningBalance: 0,
      });
    }

    // 3. Deduplicate and Add Standalone Donations (Payment In)
    for (const don of donations) {
      const donId = (don.id || '').toLowerCase();
      const vNum = `DON-${don.id.slice(0, 8).toUpperCase()}`;
      if (seenVouchers.has(vNum.toLowerCase()) || seenReferences.has(donId)) {
        continue;
      }
      const amt = Number(don.amount) || 0;
      const dStr = don.created_at
        ? new Date(don.created_at).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const cleanDonor = cleanPayerName(don.donor_name);

      const matchIdx = coveredReceipts.findIndex((rec) => {
        if (rec.used || !rec.isDonation) return false;
        if (Math.abs(rec.amount - amt) > 0.01) return false;
        if (rec.ref && (rec.ref.includes(donId) || rec.descLower.includes(donId))) return true;
        const payerMatches =
          (cleanDonor && rec.cleanPayer && (rec.cleanPayer.includes(cleanDonor) || cleanDonor.includes(rec.cleanPayer))) ||
          (don.donor_name && rec.descLower.includes(don.donor_name.trim().toLowerCase()));
        return payerMatches;
      });

      if (matchIdx !== -1) {
        coveredReceipts[matchIdx].used = true;
        continue;
      }

      seenVouchers.add(vNum.toLowerCase());
      allRaw.push({
        date: dStr,
        dateTime: new Date(don.created_at),
        voucherNumber: vNum,
        type: 'PAYMENT_IN',
        typeLabel: 'Payment In (Donation)',
        partyName: don.donor_name || 'Anonymous Donor',
        accountName: don.cause ? `Donation · ${don.cause}` : 'General Public Donation',
        paymentMethod: 'ONLINE',
        referenceNumber: vNum,
        narration: don.remark || `Donation towards ${don.cause || 'NGO Mission'}`,
        debit: 0,
        credit: amt,
        runningBalance: 0,
      });
    }

    // 4. Deduplicate and Add Standalone Membership Payments (Payment In)
    for (const pay of payments) {
      const payId = (pay.id || '').toLowerCase();
      const vNum = `MEM-${pay.id.slice(0, 8).toUpperCase()}`;
      const txId = (pay.gateway_payment_id || pay.gateway_order_id || '').toLowerCase();

      if (
        seenVouchers.has(vNum.toLowerCase()) ||
        seenReferences.has(payId) ||
        (txId && seenReferences.has(txId))
      ) {
        continue;
      }

      const amt = Number(pay.amount) || 0;
      const dStr = pay.created_at
        ? new Date(pay.created_at).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const cleanUser = cleanPayerName(pay.user?.full_name);

      const matchIdx = coveredReceipts.findIndex((rec) => {
        if (rec.used || !rec.isMembership) return false;
        if (Math.abs(rec.amount - amt) > 0.01) return false;
        if (payId && (rec.ref.includes(payId) || rec.descLower.includes(payId))) return true;
        if (txId && (rec.ref.includes(txId) || rec.descLower.includes(txId))) return true;
        const payerMatches =
          (cleanUser && rec.cleanPayer && (rec.cleanPayer.includes(cleanUser) || cleanUser.includes(rec.cleanPayer))) ||
          (pay.user?.full_name && rec.descLower.includes(pay.user.full_name.trim().toLowerCase()));
        return payerMatches;
      });

      if (matchIdx !== -1) {
        coveredReceipts[matchIdx].used = true;
        continue;
      }

      seenVouchers.add(vNum.toLowerCase());
      allRaw.push({
        date: dStr,
        dateTime: new Date(pay.created_at),
        voucherNumber: vNum,
        type: 'PAYMENT_IN',
        typeLabel: 'Payment In (Membership)',
        partyName: pay.user?.full_name || 'Member',
        accountName: 'Membership Fee',
        paymentMethod: (pay.payment_method || 'ONLINE').replace(/_/g, ' '),
        referenceNumber: pay.gateway_payment_id || vNum,
        narration: `Membership fee received from ${pay.user?.full_name || 'Member'}`,
        debit: 0,
        credit: amt,
        runningBalance: 0,
      });
    }

    // Sort chronologically ascending for opening and running balance
    allRaw.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

    // Calculate Opening Balance (everything strictly before fromDate)
    let openingBalance = 0;
    if (fromDate) {
      for (const row of allRaw) {
        if (row.date < fromDate) {
          if (txType === PassbookTransactionType.ALL) {
            openingBalance += row.credit - row.debit;
          } else if (txType === PassbookTransactionType.PAYMENT_IN) {
            openingBalance += row.credit;
          } else if (txType === PassbookTransactionType.PAYMENT_OUT) {
            openingBalance += row.debit;
          }
        }
      }
    }

    // Filter by Date Range and Transaction Type
    let filtered = allRaw.filter((row) => {
      if (fromDate && row.date < fromDate) return false;
      if (toDate && row.date > toDate) return false;
      if (txType === PassbookTransactionType.PAYMENT_IN && row.type !== 'PAYMENT_IN') return false;
      if (txType === PassbookTransactionType.PAYMENT_OUT && row.type !== 'PAYMENT_OUT') return false;
      return true;
    });

    // Compute continuous running balance for the filtered transactions
    let running = openingBalance;
    let totalCredit = 0;
    let totalDebit = 0;

    const computedTransactions = filtered.map((row) => {
      totalCredit += row.credit;
      totalDebit += row.debit;
      if (txType === PassbookTransactionType.ALL) {
        running += row.credit - row.debit;
      } else if (txType === PassbookTransactionType.PAYMENT_IN) {
        running += row.credit;
      } else if (txType === PassbookTransactionType.PAYMENT_OUT) {
        running += row.debit;
      }
      return {
        ...row,
        runningBalance: running,
      };
    });

    // Period Label
    let periodLabel = 'Complete Lifetime Statement';
    if (fromDate && toDate) {
      periodLabel = `${fromDate} to ${toDate}`;
    } else if (fromDate) {
      periodLabel = `From ${fromDate}`;
    } else if (toDate) {
      periodLabel = `Up to ${toDate}`;
    }

    return {
      periodLabel,
      fromDate,
      toDate,
      transactionType: txType,
      generatedAt: new Date().toISOString(),
      openingBalance,
      totalCredit,
      totalDebit,
      netChange: totalCredit - totalDebit,
      closingBalance: running,
      totalCount: computedTransactions.length,
      transactions: computedTransactions,
    };
  }

  /**
   * Generates RFC 4180 CSV export with UTF-8 BOM.
   */
  generateCsv(data: PassbookExportDataset): Buffer {
    const lines: string[] = [];

    // Header block
    lines.push(`"HUMAN RIGHTS & SOCIAL JUSTICE MISSION"`);
    lines.push(`"Official Passbook & Financial Statement"`);
    lines.push(`"Statement Period:","${data.periodLabel}"`);
    lines.push(`"Transaction Filter:","${data.transactionType}"`);
    lines.push(`"Generated On:","${new Date(data.generatedAt).toLocaleString('en-IN')}"`);
    lines.push(`"Opening Balance (INR):","${formatINR(data.openingBalance)}"`);
    lines.push(`"Total Inflow / Credits (INR):","${formatINR(data.totalCredit)}"`);
    lines.push(`"Total Outflow / Debits (INR):","${formatINR(data.totalDebit)}"`);
    lines.push(`"Net Change (INR):","${formatINR(data.netChange)}"`);
    lines.push(`"Closing Balance (INR):","${formatINR(data.closingBalance)}"`);
    lines.push(`"Total Transactions:","${data.totalCount}"`);
    lines.push('');

    // Table Header
    lines.push(
      [
        '"Date"',
        '"Voucher No"',
        '"Transaction Type"',
        '"Party / Particulars"',
        '"Category / Account"',
        '"Payment Mode"',
        '"Reference / Narration"',
        '"Debit Outflow (INR)"',
        '"Credit Inflow (INR)"',
        '"Running Balance (INR)"',
      ].join(','),
    );

    // Data rows
    for (const t of data.transactions) {
      const escape = (str?: string) => `"${(str || '').replace(/"/g, '""')}"`;
      lines.push(
        [
          escape(t.date),
          escape(t.voucherNumber),
          escape(t.typeLabel),
          escape(t.partyName),
          escape(t.accountName),
          escape(t.paymentMethod),
          escape(t.narration),
          t.debit > 0 ? t.debit.toFixed(2) : '0.00',
          t.credit > 0 ? t.credit.toFixed(2) : '0.00',
          t.runningBalance.toFixed(2),
        ].join(','),
      );
    }

    // Totals row
    lines.push('');
    lines.push(
      [
        '"TOTALS"',
        '""',
        '""',
        '""',
        '""',
        '""',
        `"${data.totalCount} Transactions"`,
        data.totalDebit.toFixed(2),
        data.totalCredit.toFixed(2),
        data.closingBalance.toFixed(2),
      ].join(','),
    );

    // UTF-8 BOM (\uFEFF) ensures Excel opens special characters and INR correctly
    const csvContent = '\uFEFF' + lines.join('\r\n');
    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Generates formatted Excel (XLSX) workbook matching HRSJM Brand Design.
   */
  async generateExcel(data: PassbookExportDataset): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HRSJM Financial Engine';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Passbook Statement', {
      views: [{ showGridLines: true }],
    });

    // 1. Organization Header Bar
    sheet.mergeCells('A1:J1');
    const headerCell = sheet.getCell('A1');
    headerCell.value = 'HUMAN RIGHTS & SOCIAL JUSTICE MISSION';
    headerCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2860' } };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    // Subtitle Bar
    sheet.mergeCells('A2:J2');
    const subCell = sheet.getCell('A2');
    subCell.value = 'Registered National Public Charitable NGO • Financial Passbook Statement';
    subCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFC9A227' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2860' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 18;

    // Gold separator strip
    sheet.mergeCells('A3:J3');
    const stripCell = sheet.getCell('A3');
    stripCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC9A227' } };
    sheet.getRow(3).height = 4;

    // Metadata Block
    sheet.addRow([]);
    sheet.addRow(['Statement Period:', data.periodLabel, '', 'Opening Balance:', data.openingBalance]);
    sheet.addRow(['Transaction Scope:', data.transactionType, '', 'Total Inflow (Credits):', data.totalCredit]);
    sheet.addRow(['Generated Date:', new Date(data.generatedAt).toLocaleString('en-IN'), '', 'Total Outflow (Debits):', data.totalDebit]);
    sheet.addRow(['Total Transactions:', data.totalCount, '', 'Closing Balance:', data.closingBalance]);
    sheet.addRow([]);

    // Style metadata cells
    [5, 6, 7, 8].forEach((rNum) => {
      const row = sheet.getRow(rNum);
      row.getCell(1).font = { bold: true, color: { argb: 'FF475569' } };
      row.getCell(4).font = { bold: true, color: { argb: 'FF0F2860' } };
      row.getCell(5).font = { bold: true };
      row.getCell(5).numFmt = '₹#,##0.00';
    });

    // 2. Data Table Column Headers
    const headers = [
      'Date',
      'Voucher No',
      'Type',
      'Party / Particulars',
      'Category / Account',
      'Payment Mode',
      'Narration / Reference',
      'Debit Outflow (₹)',
      'Credit Inflow (₹)',
      'Running Balance (₹)',
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2860' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    // 3. Data Rows
    data.transactions.forEach((tx, idx) => {
      const row = sheet.addRow([
        tx.date,
        tx.voucherNumber,
        tx.typeLabel,
        tx.partyName,
        tx.accountName,
        tx.paymentMethod,
        tx.narration,
        tx.debit > 0 ? tx.debit : 0,
        tx.credit > 0 ? tx.credit : 0,
        tx.runningBalance,
      ]);

      const isEven = idx % 2 === 0;
      const bg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      row.eachCell((cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        cell.alignment = { vertical: 'middle' };

        // Debit Col (8)
        if (colNum === 8) {
          cell.numFmt = '₹#,##0.00';
          cell.alignment = { horizontal: 'right' };
          if (tx.debit > 0) {
            cell.font = { color: { argb: 'FFDC2626' }, bold: true };
          }
        }
        // Credit Col (9)
        if (colNum === 9) {
          cell.numFmt = '₹#,##0.00';
          cell.alignment = { horizontal: 'right' };
          if (tx.credit > 0) {
            cell.font = { color: { argb: 'FF16A34A' }, bold: true };
          }
        }
        // Balance Col (10)
        if (colNum === 10) {
          cell.numFmt = '₹#,##0.00';
          cell.alignment = { horizontal: 'right' };
          cell.font = { bold: true, color: { argb: 'FF0F2860' } };
        }
      });
    });

    // 4. Totals Row
    const totalRow = sheet.addRow([
      'TOTALS',
      '',
      '',
      '',
      '',
      '',
      `${data.totalCount} Transactions`,
      data.totalDebit,
      data.totalCredit,
      data.closingBalance,
    ]);
    totalRow.height = 24;
    totalRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, color: { argb: 'FF0F2860' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'double', color: { argb: 'FF0F2860' } },
      };
      if (colNum >= 8) {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    });

    // Set Column Widths
    sheet.columns = [
      { width: 13 }, // Date
      { width: 22 }, // Voucher
      { width: 24 }, // Type
      { width: 32 }, // Party
      { width: 26 }, // Account
      { width: 16 }, // Mode
      { width: 36 }, // Narration
      { width: 18 }, // Debit
      { width: 18 }, // Credit
      { width: 20 }, // Balance
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generates Executive-Grade PDF Document using PDFKit.
   */
  async generatePdf(data: PassbookExportDataset): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margin: 30,
          info: {
            Title: 'HRSJM Passbook Statement',
            Author: 'Human Rights & Social Justice Mission',
            Subject: 'Financial Passbook Statement',
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        const pageW = doc.page.width;
        const pageH = doc.page.height;
        const margin = 30;
        const printW = pageW - margin * 2;

        // Top Brand Header Banner (Navy #0F2860)
        doc.rect(0, 0, pageW, 46).fill('#0F2860');
        // Gold Accent Strip
        doc.rect(0, 46, pageW, 3).fill('#C9A227');

        // Banner Text
        doc.fontSize(14).fillColor('#FFFFFF').text('HUMAN RIGHTS & SOCIAL JUSTICE MISSION', margin, 12, {
          bold: true,
        } as any);
        doc
          .fontSize(8.5)
          .fillColor('#C9A227')
          .text('Regd. National Public Charitable NGO • Financial Passbook & Live Ledger Statement', margin, 28);

        // Document Meta on right of header
        doc.fontSize(8).fillColor('#FFFFFF').text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, pageW - margin - 150, 14, {
          align: 'right',
          width: 150,
        });
        doc.fontSize(8).fillColor('#CBD5E1').text(`Filter: ${data.transactionType}`, pageW - margin - 150, 26, {
          align: 'right',
          width: 150,
        });

        let y = 62;

        // Title and Scope Box
        doc.fontSize(14).fillColor('#0F2860').text('PASSBOOK STATEMENT', margin, y, { bold: true } as any);
        doc.fontSize(9).fillColor('#64748B').text(`Period: ${data.periodLabel}   •   Total Transactions: ${data.totalCount}`, margin, y + 18);

        y += 40;

        // KPI Summary Cards
        const cardW = (printW - 24) / 4;
        const cardH = 42;
        const cards = [
          { title: 'Opening Balance', amt: `Rs. ${formatINR(data.openingBalance)}`, color: '#1E293B', bg: '#F8FAFC' },
          { title: 'Total Inflow (Credits)', amt: `+ Rs. ${formatINR(data.totalCredit)}`, color: '#15803D', bg: '#F0FDF4' },
          { title: 'Total Outflow (Debits)', amt: `- Rs. ${formatINR(data.totalDebit)}`, color: '#DC2626', bg: '#FEF2F2' },
          { title: 'Closing Balance', amt: `Rs. ${formatINR(data.closingBalance)}`, color: '#0F2860', bg: '#EFF6FF' },
        ];

        cards.forEach((c, idx) => {
          const cx = margin + idx * (cardW + 8);
          doc.roundedRect(cx, y, cardW, cardH, 4).fillAndStroke(c.bg, '#E2E8F0');
          doc.fontSize(7.5).fillColor('#64748B').text(c.title, cx + 8, y + 8);
          doc.fontSize(10.5).fillColor(c.color).text(c.amt, cx + 8, y + 22, { bold: true } as any);
        });

        y += cardH + 16;

        // Table Column Config (Total width = printW = ~782 pt in A4 landscape)
        const cols = [
          { label: 'Date', width: 68, align: 'left' },
          { label: 'Voucher No', width: 95, align: 'left' },
          { label: 'Type', width: 85, align: 'left' },
          { label: 'Party / Particulars', width: 150, align: 'left' },
          { label: 'Mode', width: 65, align: 'left' },
          { label: 'Debit (Rs.)', width: 90, align: 'right' },
          { label: 'Credit (Rs.)', width: 95, align: 'right' },
          { label: 'Balance (Rs.)', width: 134, align: 'right' },
        ];

        const drawTableHeader = (posY: number) => {
          doc.rect(margin, posY, printW, 20).fill('#0F2860');
          let cx = margin + 4;
          cols.forEach((col) => {
            doc.fontSize(8).fillColor('#FFFFFF').text(col.label, cx, posY + 6, {
              width: col.width - 8,
              align: col.align as any,
              bold: true,
            } as any);
            cx += col.width;
          });
          return posY + 20;
        };

        y = drawTableHeader(y);

        // Data Rows
        const rowH = 18;
        data.transactions.forEach((tx, idx) => {
          if (y + rowH > pageH - 45) {
            doc.addPage();
            // Header bar on continuation page
            doc.rect(0, 0, pageW, 20).fill('#0F2860');
            doc.fontSize(8).fillColor('#FFFFFF').text('HUMAN RIGHTS & SOCIAL JUSTICE MISSION — PASSBOOK STATEMENT (Contd.)', margin, 6);
            y = drawTableHeader(32);
          }

          const isEven = idx % 2 === 0;
          if (!isEven) {
            doc.rect(margin, y, printW, rowH).fill('#F8FAFC');
          }

          let cx = margin + 4;

          // 1. Date
          doc.fontSize(7.5).fillColor('#334155').text(tx.date, cx, y + 5, { width: cols[0].width - 8 });
          cx += cols[0].width;

          // 2. Voucher No
          doc.fontSize(7.5).fillColor('#0F2860').text(tx.voucherNumber, cx, y + 5, { width: cols[1].width - 8, bold: true } as any);
          cx += cols[1].width;

          // 3. Type
          const typeColor = tx.type === 'PAYMENT_IN' ? '#15803D' : '#DC2626';
          doc.fontSize(7.5).fillColor(typeColor).text(tx.typeLabel.replace('Payment ', ''), cx, y + 5, { width: cols[2].width - 8 });
          cx += cols[2].width;

          // 4. Party Name
          doc.fontSize(7.5).fillColor('#0F172A').text(tx.partyName.slice(0, 32), cx, y + 5, { width: cols[3].width - 8 });
          cx += cols[3].width;

          // 5. Payment Mode
          doc.fontSize(7.5).fillColor('#475569').text(tx.paymentMethod, cx, y + 5, { width: cols[4].width - 8 });
          cx += cols[4].width;

          // 6. Debit
          doc.fontSize(7.5).fillColor(tx.debit > 0 ? '#DC2626' : '#94A3B8').text(
            tx.debit > 0 ? formatINR(tx.debit) : '—',
            cx,
            y + 5,
            { width: cols[5].width - 8, align: 'right' },
          );
          cx += cols[5].width;

          // 7. Credit
          doc.fontSize(7.5).fillColor(tx.credit > 0 ? '#15803D' : '#94A3B8').text(
            tx.credit > 0 ? formatINR(tx.credit) : '—',
            cx,
            y + 5,
            { width: cols[6].width - 8, align: 'right', bold: tx.credit > 0 } as any,
          );
          cx += cols[6].width;

          // 8. Running Balance
          doc.fontSize(7.5).fillColor('#0F2860').text(
            formatINR(tx.runningBalance),
            cx,
            y + 5,
            { width: cols[7].width - 8, align: 'right', bold: true } as any,
          );

          // Row bottom border
          doc.rect(margin, y + rowH, printW, 0.4).fill('#E2E8F0');
          y += rowH;
        });

        // Totals summary row
        if (y + 24 > pageH - 40) {
          doc.addPage();
          y = 30;
        }

        doc.rect(margin, y, printW, 20).fill('#F1F5F9');
        doc.fontSize(8).fillColor('#0F2860').text('TOTALS', margin + 8, y + 6, { bold: true } as any);
        doc.fontSize(7.5).fillColor('#64748B').text(`${data.totalCount} items`, margin + 60, y + 6);

        // Debit Total
        doc.fontSize(8).fillColor('#DC2626').text(
          formatINR(data.totalDebit),
          margin + cols[0].width + cols[1].width + cols[2].width + cols[3].width + cols[4].width,
          y + 6,
          { width: cols[5].width - 8, align: 'right', bold: true } as any,
        );

        // Credit Total
        doc.fontSize(8).fillColor('#15803D').text(
          formatINR(data.totalCredit),
          margin + cols[0].width + cols[1].width + cols[2].width + cols[3].width + cols[4].width + cols[5].width,
          y + 6,
          { width: cols[6].width - 8, align: 'right', bold: true } as any,
        );

        // Closing Balance
        doc.fontSize(8).fillColor('#0F2860').text(
          formatINR(data.closingBalance),
          margin + cols[0].width + cols[1].width + cols[2].width + cols[3].width + cols[4].width + cols[5].width + cols[6].width,
          y + 6,
          { width: cols[7].width - 8, align: 'right', bold: true } as any,
        );

        // Footer note
        doc.fontSize(7).fillColor('#94A3B8').text(
          'This is a system-generated financial document issued by Human Rights & Social Justice Mission.',
          margin,
          pageH - 22,
          { align: 'center', width: printW },
        );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

