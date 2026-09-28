import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccountEntity } from '../../accounting/entities/account.entity';
import { AccountingEntryEntity } from '../../accounting/entities/accounting-entry.entity';
import {
  AccountType,
  ReferenceType,
} from '../../accounting/enums/accounting.enums';
import { AccountingPostingService } from '../../accounting/services/accounting-posting.service';
import { AuditService } from '../../audit/services/audit.service';
import { CreateExpenseEntryDto } from '../dto/create-expense-entry.dto';
import { ListExpenseEntriesDto } from '../dto/list-expense-entries.dto';
import { UpdateExpenseEntryDto } from '../dto/update-expense-entry.dto';
import { UpdateExpenseStatusDto } from '../dto/update-expense-status.dto';
import { ExpenseEntryEntity } from '../entities/expense-entry.entity';
import { ExpenseStatus } from '../enums/expense-entry.enums';

function formatVoucherNumber(expenseDate: Date, seq: number): string {
  const y = expenseDate.getUTCFullYear();
  const m = String(expenseDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(expenseDate.getUTCDate()).padStart(2, '0');
  return `EXP-${y}${m}${d}-${String(seq).padStart(5, '0')}`;
}

@Injectable()
export class ExpenseEntriesService {
  constructor(
    @InjectRepository(ExpenseEntryEntity)
    private readonly expenseRepository: Repository<ExpenseEntryEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    private readonly postingService: AccountingPostingService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates an expense entry and atomically posts the double-entry journal.
   * Dr Expense Account / Cr Bank-Cash Asset Account.
   */
  async create(
    dto: CreateExpenseEntryDto,
    actingUserId?: string | null,
  ): Promise<ExpenseEntryEntity> {
    if (dto.amount <= 0) {
      throw new BadRequestException({
        message: 'Expense amount must be greater than zero',
        code: 'EXPENSE_INVALID_AMOUNT',
        details: { amount: dto.amount },
      });
    }

    const expenseDate = new Date(dto.expense_date);
    if (isNaN(expenseDate.getTime())) {
      throw new BadRequestException({
        message: 'Invalid expense date provided',
        code: 'EXPENSE_INVALID_DATE',
        details: { expense_date: dto.expense_date },
      });
    }

    return this.dataSource.transaction(async (manager) => {
      // 1. Validate Expense Account
      const expenseAccount = await manager.findOne(AccountEntity, {
        where: { id: dto.expense_account_id },
      });
      if (!expenseAccount) {
        throw new NotFoundException({
          message: 'Expense account not found',
          code: 'EXPENSE_ACCOUNT_NOT_FOUND',
          details: { id: dto.expense_account_id },
        });
      }
      if (!expenseAccount.is_active) {
        throw new BadRequestException({
          message: 'Selected expense account is inactive',
          code: 'EXPENSE_ACCOUNT_INACTIVE',
          details: { id: dto.expense_account_id },
        });
      }
      if (expenseAccount.account_type !== AccountType.EXPENSE) {
        throw new BadRequestException({
          message: 'Selected expense account must have account type EXPENSE',
          code: 'INVALID_EXPENSE_ACCOUNT_TYPE',
          details: {
            id: dto.expense_account_id,
            account_type: expenseAccount.account_type,
          },
        });
      }

      // 2. Validate Paid From (Asset) Account
      const paidFromAccount = await manager.findOne(AccountEntity, {
        where: { id: dto.paid_from_account_id },
      });
      if (!paidFromAccount) {
        throw new NotFoundException({
          message: 'Paid-from payment account not found',
          code: 'PAID_FROM_ACCOUNT_NOT_FOUND',
          details: { id: dto.paid_from_account_id },
        });
      }
      if (!paidFromAccount.is_active) {
        throw new BadRequestException({
          message: 'Selected paid-from account is inactive',
          code: 'PAID_FROM_ACCOUNT_INACTIVE',
          details: { id: dto.paid_from_account_id },
        });
      }
      if (paidFromAccount.account_type !== AccountType.ASSET) {
        throw new BadRequestException({
          message:
            'Selected paid-from payment account must have account type ASSET (Bank/Cash)',
          code: 'INVALID_PAID_FROM_ACCOUNT_TYPE',
          details: {
            id: dto.paid_from_account_id,
            account_type: paidFromAccount.account_type,
          },
        });
      }

      // 3. Generate Voucher Number
      const result: { seq: string }[] = await manager.query(
        `SELECT nextval('expense_voucher_number_seq') AS seq`,
      );
      const seq = parseInt(result[0]?.seq ?? '1', 10);
      const voucherNumber = formatVoucherNumber(expenseDate, seq);

      // 4. Create and persist initial expense entry
      const expense = manager.create(ExpenseEntryEntity, {
        voucher_number: voucherNumber,
        expense_date: expenseDate,
        paid_to: dto.paid_to.trim(),
        expense_account_id: dto.expense_account_id,
        paid_from_account_id: dto.paid_from_account_id,
        amount: dto.amount,
        payment_method: dto.payment_method,
        reference_number: dto.reference_number?.trim() || null,
        description: dto.description?.trim() || null,
        attachment_url: dto.attachment_url?.trim() || null,
        status: ExpenseStatus.POSTED,
        created_by: actingUserId ?? null,
        updated_by: actingUserId ?? null,
      });

      const savedExpense = await manager.save(ExpenseEntryEntity, expense);

      // 5. Post double-entry accounting entry (Dr Expense, Cr Paid From)
      const postedJournal = await this.postingService.postEntry(manager, {
        entry_date: expenseDate,
        reference_type: ReferenceType.MANUAL_EXPENSE,
        reference_id: savedExpense.id,
        description:
          dto.description?.trim() ||
          `Expense voucher ${voucherNumber} paid to ${dto.paid_to.trim()}`,
        lines: [
          {
            account_id: dto.expense_account_id,
            debit_amount: dto.amount,
            line_description: `Expense: ${dto.paid_to.trim()}`,
          },
          {
            account_id: dto.paid_from_account_id,
            credit_amount: dto.amount,
            line_description: `Paid via ${dto.payment_method}`,
          },
        ],
        acting_user_id: actingUserId,
      });

      // 6. Link accounting entry ID and save
      savedExpense.accounting_entry_id = postedJournal.id;
      savedExpense.accounting_entry = postedJournal;
      await manager.update(ExpenseEntryEntity, savedExpense.id, {
        accounting_entry_id: postedJournal.id,
      });

      // 7. Audit log
      await this.auditService.record({
        event: 'EXPENSE_ENTRY_CREATED',
        actorId: actingUserId,
        entityType: 'expense_entries',
        entityId: savedExpense.id,
        metadata: {
          voucher_number: voucherNumber,
          amount: dto.amount,
          paid_to: dto.paid_to,
          expense_account_id: dto.expense_account_id,
          paid_from_account_id: dto.paid_from_account_id,
          accounting_entry_id: postedJournal.id,
        },
      });

      savedExpense.expense_account = expenseAccount;
      savedExpense.paid_from_account = paidFromAccount;
      return savedExpense;
    });
  }

  /**
   * Paginated list of expense entries with comprehensive filtering.
   */
  async list(dto: ListExpenseEntriesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.expenseRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.expense_account', 'expense_account')
      .leftJoinAndSelect('expense.paid_from_account', 'paid_from_account')
      .leftJoinAndSelect('expense.accounting_entry', 'accounting_entry');

    if (dto.start_date) {
      qb.andWhere('expense.expense_date >= :startDate', {
        startDate: new Date(dto.start_date),
      });
    }

    if (dto.end_date) {
      qb.andWhere('expense.expense_date <= :endDate', {
        endDate: new Date(dto.end_date),
      });
    }

    if (dto.expense_account_id) {
      qb.andWhere('expense.expense_account_id = :expenseAccountId', {
        expenseAccountId: dto.expense_account_id,
      });
    }

    if (dto.paid_from_account_id) {
      qb.andWhere('expense.paid_from_account_id = :paidFromAccountId', {
        paidFromAccountId: dto.paid_from_account_id,
      });
    }

    if (dto.status) {
      qb.andWhere('expense.status = :status', { status: dto.status });
    }

    if (dto.payment_method) {
      qb.andWhere('expense.payment_method = :paymentMethod', {
        paymentMethod: dto.payment_method,
      });
    }

    if (dto.search) {
      const term = `%${dto.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(expense.voucher_number) LIKE :term OR LOWER(expense.paid_to) LIKE :term OR LOWER(expense.reference_number) LIKE :term OR LOWER(expense.description) LIKE :term)',
        { term },
      );
    }

    qb.orderBy('expense.expense_date', 'DESC')
      .addOrderBy('expense.created_at', 'DESC')
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
   * Retrieve a single expense entry with its accounts and journal lines.
   */
  async getById(id: string): Promise<ExpenseEntryEntity> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: [
        'expense_account',
        'paid_from_account',
        'accounting_entry',
        'accounting_entry.lines',
        'accounting_entry.lines.account',
      ],
    });

    if (!expense) {
      throw new NotFoundException({
        message: 'Expense entry not found',
        code: 'EXPENSE_ENTRY_NOT_FOUND',
        details: { id },
      });
    }

    return expense;
  }

  /**
   * Updates metadata on an active/posted expense entry.
   */
  async update(
    id: string,
    dto: UpdateExpenseEntryDto,
    actingUserId?: string | null,
  ): Promise<ExpenseEntryEntity> {
    const expense = await this.getById(id);

    if (expense.status === ExpenseStatus.CANCELLED) {
      throw new BadRequestException({
        message: 'Cannot update a cancelled expense entry',
        code: 'EXPENSE_ENTRY_ALREADY_CANCELLED',
        details: { id },
      });
    }

    if (dto.paid_to !== undefined) {
      expense.paid_to = dto.paid_to.trim();
    }
    if (dto.reference_number !== undefined) {
      expense.reference_number = dto.reference_number?.trim() || null;
    }
    if (dto.description !== undefined) {
      expense.description = dto.description?.trim() || null;
    }
    if (dto.attachment_url !== undefined) {
      expense.attachment_url = dto.attachment_url?.trim() || null;
    }
    expense.updated_by = actingUserId ?? null;

    const saved = await this.expenseRepository.save(expense);

    await this.auditService.record({
      event: 'EXPENSE_ENTRY_UPDATED',
      actorId: actingUserId,
      entityType: 'expense_entries',
      entityId: id,
      metadata: { ...dto },
    });

    return saved;
  }

  /**
   * Updates status (cancellation) and reverses the linked accounting journal.
   */
  async updateStatus(
    id: string,
    dto: UpdateExpenseStatusDto,
    actingUserId?: string | null,
  ): Promise<ExpenseEntryEntity> {
    const expense = await this.getById(id);

    if (expense.status === dto.status) {
      return expense;
    }

    if (expense.status === ExpenseStatus.CANCELLED) {
      throw new BadRequestException({
        message: 'A cancelled expense entry cannot be reactivated',
        code: 'EXPENSE_ENTRY_CANNOT_REACTIVATE',
        details: { id },
      });
    }

    if (dto.status === ExpenseStatus.CANCELLED) {
      await this.dataSource.transaction(async (manager) => {
        // Find existing accounting journal for this expense
        const journal = await manager.findOne(AccountingEntryEntity, {
          where: {
            reference_type: ReferenceType.MANUAL_EXPENSE,
            reference_id: expense.id,
          },
        });

        if (journal) {
          await this.postingService.reverse(manager, journal.id, actingUserId);
        }

        expense.status = ExpenseStatus.CANCELLED;
        expense.updated_by = actingUserId ?? null;
        await manager.save(ExpenseEntryEntity, expense);

        await this.auditService.record({
          event: 'EXPENSE_ENTRY_CANCELLED',
          actorId: actingUserId,
          entityType: 'expense_entries',
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
