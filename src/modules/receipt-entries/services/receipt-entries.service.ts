import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccountEntity } from '../../accounting/entities/account.entity';
import { AccountingEntryEntity } from '../../accounting/entities/accounting-entry.entity';
import { AccountingEntryLineEntity } from '../../accounting/entities/accounting-entry-line.entity';
import {
  AccountType,
  ReferenceType,
} from '../../accounting/enums/accounting.enums';
import { AccountingPostingService } from '../../accounting/services/accounting-posting.service';
import { AuditService } from '../../audit/services/audit.service';
import { CreateReceiptEntryDto } from '../dto/create-receipt-entry.dto';
import { ListReceiptEntriesDto } from '../dto/list-receipt-entries.dto';
import { UpdateReceiptEntryDto } from '../dto/update-receipt-entry.dto';
import { UpdateReceiptStatusDto } from '../dto/update-receipt-status.dto';
import { ReceiptEntryEntity } from '../entities/receipt-entry.entity';
import { ReceiptStatus } from '../enums/receipt-entry.enums';

function formatVoucherNumber(receiptDate: Date, seq: number): string {
  const y = receiptDate.getUTCFullYear();
  const m = String(receiptDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(receiptDate.getUTCDate()).padStart(2, '0');
  return `REC-${y}${m}${d}-${String(seq).padStart(5, '0')}`;
}

@Injectable()
export class ReceiptEntriesService {
  constructor(
    @InjectRepository(ReceiptEntryEntity)
    private readonly receiptRepository: Repository<ReceiptEntryEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    private readonly postingService: AccountingPostingService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates a receipt entry and atomically posts the double-entry journal.
   * Dr Bank-Cash Asset Account / Cr Income Account.
   */
  async create(
    dto: CreateReceiptEntryDto,
    actingUserId?: string | null,
  ): Promise<ReceiptEntryEntity> {
    if (dto.amount <= 0) {
      throw new BadRequestException({
        message: 'Receipt amount must be greater than zero',
        code: 'RECEIPT_INVALID_AMOUNT',
        details: { amount: dto.amount },
      });
    }

    const receiptDate = new Date(dto.receipt_date);
    if (isNaN(receiptDate.getTime())) {
      throw new BadRequestException({
        message: 'Invalid receipt date provided',
        code: 'RECEIPT_INVALID_DATE',
        details: { receipt_date: dto.receipt_date },
      });
    }

    return this.dataSource.transaction(async (manager) => {
      // 1. Validate Income Account
      const incomeAccount = await manager.findOne(AccountEntity, {
        where: { id: dto.income_account_id },
      });
      if (!incomeAccount) {
        throw new NotFoundException({
          message: 'Income account not found',
          code: 'INCOME_ACCOUNT_NOT_FOUND',
          details: { id: dto.income_account_id },
        });
      }
      if (!incomeAccount.is_active) {
        throw new BadRequestException({
          message: 'Selected income account is inactive',
          code: 'INCOME_ACCOUNT_INACTIVE',
          details: { id: dto.income_account_id },
        });
      }
      if (incomeAccount.account_type !== AccountType.INCOME) {
        throw new BadRequestException({
          message: 'Selected income account must have account type INCOME',
          code: 'INVALID_INCOME_ACCOUNT_TYPE',
          details: {
            id: dto.income_account_id,
            account_type: incomeAccount.account_type,
          },
        });
      }

      // 2. Validate Received In (Asset) Account
      const receivedInAccount = await manager.findOne(AccountEntity, {
        where: { id: dto.received_in_account_id },
      });
      if (!receivedInAccount) {
        throw new NotFoundException({
          message: 'Received-in payment account not found',
          code: 'RECEIVED_IN_ACCOUNT_NOT_FOUND',
          details: { id: dto.received_in_account_id },
        });
      }
      if (!receivedInAccount.is_active) {
        throw new BadRequestException({
          message: 'Selected receiving account is inactive',
          code: 'RECEIVED_IN_ACCOUNT_INACTIVE',
          details: { id: dto.received_in_account_id },
        });
      }
      if (receivedInAccount.account_type !== AccountType.ASSET) {
        throw new BadRequestException({
          message:
            'Selected receiving account must have account type ASSET (Bank/Cash)',
          code: 'INVALID_RECEIVED_IN_ACCOUNT_TYPE',
          details: {
            id: dto.received_in_account_id,
            account_type: receivedInAccount.account_type,
          },
        });
      }

      // 3. Generate Voucher Number
      const result: { seq: string }[] = await manager.query(
        `SELECT nextval('receipt_voucher_number_seq') AS seq`,
      );
      const seq = parseInt(result[0]?.seq ?? '1', 10);
      const voucherNumber = formatVoucherNumber(receiptDate, seq);

      // 4. Create and persist receipt entry
      const receipt = manager.create(ReceiptEntryEntity, {
        voucher_number: voucherNumber,
        receipt_date: receiptDate,
        received_from: dto.received_from.trim(),
        income_account_id: dto.income_account_id,
        received_in_account_id: dto.received_in_account_id,
        amount: dto.amount,
        payment_method: dto.payment_method,
        reference_number: dto.reference_number?.trim() || `REF-${voucherNumber}`,
        description: dto.description?.trim() || null,
        attachment_url: dto.attachment_url?.trim() || null,
        status: ReceiptStatus.POSTED,
        created_by: actingUserId ?? null,
        updated_by: actingUserId ?? null,
      });

      const savedReceipt = await manager.save(ReceiptEntryEntity, receipt);

      // 5. Post double-entry accounting entry (Dr Received In Asset, Cr Income)
      const postedJournal = await this.postingService.postEntry(manager, {
        entry_date: receiptDate,
        reference_type: ReferenceType.MANUAL_RECEIPT,
        reference_id: savedReceipt.id,
        description:
          dto.description?.trim() ||
          `Receipt voucher ${voucherNumber} received from ${dto.received_from.trim()}`,
        lines: [
          {
            account_id: dto.received_in_account_id,
            debit_amount: dto.amount,
            line_description: `Received via ${dto.payment_method}`,
          },
          {
            account_id: dto.income_account_id,
            credit_amount: dto.amount,
            line_description: `Income: ${dto.received_from.trim()}`,
          },
        ],
        acting_user_id: actingUserId,
      });

      // 6. Link accounting entry ID and save
      savedReceipt.accounting_entry_id = postedJournal.id;
      savedReceipt.accounting_entry = postedJournal;
      await manager.update(ReceiptEntryEntity, savedReceipt.id, {
        accounting_entry_id: postedJournal.id,
      });

      // 7. Audit log
      await this.auditService.record({
        event: 'RECEIPT_ENTRY_CREATED',
        actorId: actingUserId,
        entityType: 'receipt_entries',
        entityId: savedReceipt.id,
        metadata: {
          voucher_number: voucherNumber,
          amount: dto.amount,
          received_from: dto.received_from,
          income_account_id: dto.income_account_id,
          received_in_account_id: dto.received_in_account_id,
          accounting_entry_id: postedJournal.id,
        },
      });

      savedReceipt.income_account = incomeAccount;
      savedReceipt.received_in_account = receivedInAccount;
      return savedReceipt;
    });
  }

  /**
   * Paginated list of receipt entries with comprehensive filtering.
   */
  async list(dto: ListReceiptEntriesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.receiptRepository
      .createQueryBuilder('receipt')
      .leftJoinAndSelect('receipt.income_account', 'income_account')
      .leftJoinAndSelect('receipt.received_in_account', 'received_in_account')
      .leftJoinAndSelect('receipt.accounting_entry', 'accounting_entry');

    if (dto.start_date) {
      qb.andWhere('receipt.receipt_date >= :startDate', {
        startDate: new Date(dto.start_date),
      });
    }

    if (dto.end_date) {
      qb.andWhere('receipt.receipt_date <= :endDate', {
        endDate: new Date(dto.end_date),
      });
    }

    if (dto.income_account_id) {
      qb.andWhere('receipt.income_account_id = :incomeAccountId', {
        incomeAccountId: dto.income_account_id,
      });
    }

    if (dto.received_in_account_id) {
      qb.andWhere('receipt.received_in_account_id = :receivedInAccountId', {
        receivedInAccountId: dto.received_in_account_id,
      });
    }

    if (dto.status) {
      qb.andWhere('receipt.status = :status', { status: dto.status });
    }

    if (dto.payment_method) {
      qb.andWhere('receipt.payment_method = :paymentMethod', {
        paymentMethod: dto.payment_method,
      });
    }

    if (dto.search) {
      const term = `%${dto.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(receipt.voucher_number) LIKE :term OR LOWER(receipt.received_from) LIKE :term OR LOWER(receipt.reference_number) LIKE :term OR LOWER(receipt.description) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('receipt.receipt_date', 'DESC')
      .addOrderBy('receipt.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  /**
   * Executive KPI statistics for receipt entries.
   */
  async getStats() {
    const raw = await this.receiptRepository
      .createQueryBuilder('receipt')
      .select('COUNT(*)', 'all')
      .addSelect(
        `COUNT(CASE WHEN receipt.status = 'POSTED' THEN 1 END)`,
        'posted',
      )
      .addSelect(
        `COUNT(CASE WHEN receipt.status = 'CANCELLED' THEN 1 END)`,
        'cancelled',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN receipt.status = 'POSTED' THEN CAST(receipt.amount AS numeric) ELSE 0 END), 0)`,
        'total_amount',
      )
      .getRawOne();

    return {
      all: parseInt(raw?.all ?? '0', 10),
      posted: parseInt(raw?.posted ?? '0', 10),
      cancelled: parseInt(raw?.cancelled ?? '0', 10),
      totalAmount: parseFloat(raw?.total_amount ?? '0'),
    };
  }

  /**
   * Retrieve a single receipt entry with its accounts and journal lines.
   */
  async getById(id: string): Promise<ReceiptEntryEntity> {
    const receipt = await this.receiptRepository.findOne({
      where: { id },
      relations: [
        'income_account',
        'received_in_account',
        'accounting_entry',
        'accounting_entry.lines',
        'accounting_entry.lines.account',
      ],
    });

    if (!receipt) {
      throw new NotFoundException({
        message: 'Receipt entry not found',
        code: 'RECEIPT_ENTRY_NOT_FOUND',
        details: { id },
      });
    }

    return receipt;
  }

  /**
   * Updates an active/posted receipt entry and synchronizes the linked journal lines.
   */
  async update(
    id: string,
    dto: UpdateReceiptEntryDto,
    actingUserId?: string | null,
  ): Promise<ReceiptEntryEntity> {
    return this.dataSource.transaction(async (manager) => {
      const receipt = await manager.findOne(ReceiptEntryEntity, {
        where: { id },
        relations: [
          'income_account',
          'received_in_account',
          'accounting_entry',
          'accounting_entry.lines',
          'accounting_entry.lines.account',
        ],
      });

      if (!receipt) {
        throw new NotFoundException({
          message: 'Receipt entry not found',
          code: 'RECEIPT_ENTRY_NOT_FOUND',
          details: { id },
        });
      }

      if (receipt.status === ReceiptStatus.CANCELLED) {
        throw new BadRequestException({
          message: 'Cannot update a cancelled receipt entry',
          code: 'RECEIPT_ENTRY_ALREADY_CANCELLED',
          details: { id },
        });
      }

      // Validate income account if updated
      let incomeAccount = receipt.income_account;
      if (
        dto.income_account_id &&
        dto.income_account_id !== receipt.income_account_id
      ) {
        const acc = await manager.findOne(AccountEntity, {
          where: { id: dto.income_account_id },
        });
        if (!acc) {
          throw new NotFoundException({
            message: 'Income account not found',
            code: 'INCOME_ACCOUNT_NOT_FOUND',
            details: { id: dto.income_account_id },
          });
        }
        if (!acc.is_active) {
          throw new BadRequestException({
            message: 'Selected income account is inactive',
            code: 'INCOME_ACCOUNT_INACTIVE',
            details: { id: dto.income_account_id },
          });
        }
        if (acc.account_type !== AccountType.INCOME) {
          throw new BadRequestException({
            message: 'Selected income account must have account type INCOME',
            code: 'INVALID_INCOME_ACCOUNT_TYPE',
            details: {
              id: dto.income_account_id,
              account_type: acc.account_type,
            },
          });
        }
        receipt.income_account_id = dto.income_account_id;
        incomeAccount = acc;
      }

      // Validate received-in account if updated
      let receivedInAccount = receipt.received_in_account;
      if (
        dto.received_in_account_id &&
        dto.received_in_account_id !== receipt.received_in_account_id
      ) {
        const acc = await manager.findOne(AccountEntity, {
          where: { id: dto.received_in_account_id },
        });
        if (!acc) {
          throw new NotFoundException({
            message: 'Received-in payment account not found',
            code: 'RECEIVED_IN_ACCOUNT_NOT_FOUND',
            details: { id: dto.received_in_account_id },
          });
        }
        if (!acc.is_active) {
          throw new BadRequestException({
            message: 'Selected receiving account is inactive',
            code: 'RECEIVED_IN_ACCOUNT_INACTIVE',
            details: { id: dto.received_in_account_id },
          });
        }
        if (acc.account_type !== AccountType.ASSET) {
          throw new BadRequestException({
            message:
              'Selected receiving account must have account type ASSET (Bank/Cash)',
            code: 'INVALID_RECEIVED_IN_ACCOUNT_TYPE',
            details: {
              id: dto.received_in_account_id,
              account_type: acc.account_type,
            },
          });
        }
        receipt.received_in_account_id = dto.received_in_account_id;
        receivedInAccount = acc;
      }

      if (dto.receipt_date !== undefined && dto.receipt_date.trim()) {
        receipt.receipt_date = new Date(dto.receipt_date.trim());
      }
      if (dto.received_from !== undefined) {
        receipt.received_from = dto.received_from.trim();
      }
      if (dto.amount !== undefined) {
        receipt.amount = dto.amount;
      }
      if (dto.payment_method !== undefined) {
        receipt.payment_method = dto.payment_method;
      }
      if (dto.reference_number !== undefined) {
        receipt.reference_number = dto.reference_number?.trim() || null;
      }
      if (dto.description !== undefined) {
        receipt.description = dto.description?.trim() || null;
      }
      if (dto.attachment_url !== undefined) {
        receipt.attachment_url = dto.attachment_url?.trim() || null;
      }
      receipt.updated_by = actingUserId ?? null;

      const saved = await manager.save(ReceiptEntryEntity, receipt);

      // Update linked accounting journal entry lines if present
      if (receipt.accounting_entry_id) {
        const accountingEntry = await manager.findOne(AccountingEntryEntity, {
          where: { id: receipt.accounting_entry_id },
          relations: ['lines'],
        });

        if (accountingEntry) {
          accountingEntry.entry_date = receipt.receipt_date;
          accountingEntry.description =
            receipt.description ||
            `Receipt voucher ${receipt.voucher_number} received from ${receipt.received_from}`;
          accountingEntry.updated_by = actingUserId ?? null;
          await manager.save(AccountingEntryEntity, accountingEntry);

          if (accountingEntry.lines && accountingEntry.lines.length >= 2) {
            // Line 1: Receiving account (Asset - Debit)
            const debitLine =
              accountingEntry.lines.find((l) => Number(l.debit_amount) > 0) ||
              accountingEntry.lines[0];
            debitLine.account_id = receipt.received_in_account_id;
            debitLine.debit_amount = receipt.amount;
            debitLine.credit_amount = 0;
            debitLine.line_description = `Received via ${receipt.payment_method}`;
            debitLine.updated_by = actingUserId ?? null;

            // Line 2: Income account (Income - Credit)
            const creditLine =
              accountingEntry.lines.find((l) => Number(l.credit_amount) > 0) ||
              accountingEntry.lines[1];
            creditLine.account_id = receipt.income_account_id;
            creditLine.debit_amount = 0;
            creditLine.credit_amount = receipt.amount;
            creditLine.line_description = `Income: ${receipt.received_from}`;
            creditLine.updated_by = actingUserId ?? null;

            await manager.save(AccountingEntryLineEntity, [
              debitLine,
              creditLine,
            ]);
          }
        }
      }

      await this.auditService.record({
        event: 'RECEIPT_ENTRY_UPDATED',
        actorId: actingUserId,
        entityType: 'receipt_entries',
        entityId: id,
        metadata: { ...dto },
      });

      saved.income_account = incomeAccount;
      saved.received_in_account = receivedInAccount;
      return saved;
    });
  }

  /**
   * Updates status (cancellation) and reverses the linked accounting journal.
   */
  async updateStatus(
    id: string,
    dto: UpdateReceiptStatusDto,
    actingUserId?: string | null,
  ): Promise<ReceiptEntryEntity> {
    const receipt = await this.getById(id);

    if (receipt.status === dto.status) {
      return receipt;
    }

    if (receipt.status === ReceiptStatus.CANCELLED) {
      throw new BadRequestException({
        message: 'A cancelled receipt entry cannot be reactivated',
        code: 'RECEIPT_ENTRY_CANNOT_REACTIVATE',
        details: { id },
      });
    }

    if (dto.status === ReceiptStatus.CANCELLED) {
      await this.dataSource.transaction(async (manager) => {
        // Find existing accounting journal for this receipt
        const journal = await manager.findOne(AccountingEntryEntity, {
          where: {
            reference_type: ReferenceType.MANUAL_RECEIPT,
            reference_id: receipt.id,
          },
        });

        if (journal) {
          await this.postingService.reverse(manager, journal.id, actingUserId);
        }

        receipt.status = ReceiptStatus.CANCELLED;
        receipt.updated_by = actingUserId ?? null;
        await manager.save(ReceiptEntryEntity, receipt);

        await this.auditService.record({
          event: 'RECEIPT_ENTRY_CANCELLED',
          actorId: actingUserId,
          entityType: 'receipt_entries',
          entityId: id,
          metadata: {
            cancellation_reason: dto.cancellation_reason,
            reversed_journal_id: journal?.id,
          },
        });
      });
    }

    return this.getById(id);
  }
}
