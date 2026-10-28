import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { MembershipPaymentEntity } from '../entities/membership-payment.entity';
import { ReceiptEntity } from '../entities/receipt.entity';
import { PaymentTransactionEntity } from '../entities/payment-transaction.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { AccountEntity } from '../../accounting/entities/account.entity';
import { AccountType } from '../../accounting/enums/accounting.enums';
import { ReceiptEntryEntity } from '../../receipt-entries/entities/receipt-entry.entity';
import {
  ReceiptPaymentMethod,
  ReceiptStatus,
} from '../../receipt-entries/enums/receipt-entry.enums';
import { CreateMembershipPaymentDto } from '../dto/create-membership-payment.dto';
import { VerifyMembershipPaymentDto } from '../dto/verify-membership-payment.dto';
import { UpdateMembershipPaymentStatusDto } from '../dto/update-membership-payment-status.dto';
import { ListMembershipPaymentsDto } from '../dto/list-membership-payments.dto';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';
import { AuditService } from '../../audit/services/audit.service';
import { AccountingPostingService } from '../../accounting/services/accounting-posting.service';
import { ACCOUNT_CODES } from '../../accounting/accounting.constants';
import { ReferenceType } from '../../accounting/enums/accounting.enums';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  RenewalPaymentStatus,
  RenewalRequestEntity,
  RenewalStatus,
} from '../../renewals/entities/renewal-request.entity';
import { addYearsSafe } from '../../renewals/services/renewal-calculation.service';
import { MailService } from '../../mail/mail.service';
import { resolveMembershipValidityDays } from '../../memberships/utils/membership-validity.util';

function formatVoucherNumber(receiptDate: Date, seq: number): string {
  const y = receiptDate.getUTCFullYear();
  const m = String(receiptDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(receiptDate.getUTCDate()).padStart(2, '0');
  return `REC-${y}${m}${d}-${String(seq).padStart(5, '0')}`;
}

@Injectable()
export class MembershipPaymentsService implements OnModuleInit {
  private readonly logger = new Logger(MembershipPaymentsService.name);

  constructor(
    @InjectRepository(MembershipPaymentEntity)
    private readonly payments: Repository<MembershipPaymentEntity>,
    @InjectRepository(ReceiptEntity)
    private readonly receipts: Repository<ReceiptEntity>,
    @InjectRepository(PaymentTransactionEntity)
    private readonly transactions: Repository<PaymentTransactionEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly notifications: NotificationsService,
    @Optional()
    private readonly mailService?: MailService,
  ) {}

  async onModuleInit() {
    await this.syncMissingReceiptEntries();
  }

  async create(
    dto: CreateMembershipPaymentDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<MembershipPaymentEntity> {
    const membership = await this.memberships.findOne({
      where: { id: dto.membership_id },
      relations: ['category', 'user'],
    });

    if (!membership) {
      throw new NotFoundException({
        message: 'Membership not found',
        code: 'MEMBERSHIP_NOT_FOUND',
        details: { membership_id: dto.membership_id },
      });
    }

    if (!isAdmin && membership.user_id !== actingUserId) {
      throw new ForbiddenException({
        message: 'You are not authorized to create payment for this membership',
        code: 'PAYMENT_ACCESS_DENIED',
        details: null,
      });
    }

    const amount = dto.amount !== undefined ? dto.amount : (membership.category?.fee ?? 0);

    if (amount <= 0) {
      throw new BadRequestException({
        message: 'Payment amount must be greater than zero',
        code: 'INVALID_PAYMENT_AMOUNT',
        details: { amount },
      });
    }

    const payment = this.payments.create({
      membership_id: membership.id,
      user_id: membership.user_id,
      amount,
      payment_method: dto.payment_method ?? 'ONLINE',
      payment_status: PaymentStatus.PENDING,
      transaction_id: dto.transaction_id ?? null,
      notes: dto.notes ?? null,
      created_by: actingUserId,
      updated_by: actingUserId,
    });

    const savedPayment = await this.payments.save(payment);

    const transaction = this.transactions.create({
      membership_payment_id: savedPayment.id,
      gateway_name: 'CASHFREE',
      amount,
      status: 'INITIATED',
      created_by: actingUserId,
      updated_by: actingUserId,
    });
    await this.transactions.save(transaction);

    await this.audit.record({
      event: 'membership_payment.initiated',
      actorId: actingUserId,
      entityType: 'membership_payments',
      entityId: savedPayment.id,
      metadata: {
        membershipId: membership.id,
        amount: savedPayment.amount,
        method: savedPayment.payment_method,
      },
    });

    return savedPayment;
  }

  async list(
    dto: ListMembershipPaymentsDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<{
    items: MembershipPaymentEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.payments
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.membership', 'membership')
      .leftJoinAndSelect('membership.category', 'category')
      .leftJoinAndSelect('payment.user', 'user')
      .leftJoinAndSelect('payment.receipt', 'receipt')
      .orderBy('payment.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (!isAdmin) {
      qb.andWhere('payment.user_id = :userId', { userId: actingUserId });
    } else if (dto.user_id) {
      qb.andWhere('payment.user_id = :userId', { userId: dto.user_id });
    }

    if (dto.membership_id) {
      qb.andWhere('payment.membership_id = :memId', { memId: dto.membership_id });
    }
    if (dto.status) {
      qb.andWhere('payment.payment_status = :status', { status: dto.status });
    }

    if (dto.search) {
      const term = `%${dto.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(payment.transaction_id) LIKE :term')
            .orWhere('LOWER(payment.gateway_payment_id) LIKE :term')
            .orWhere('LOWER(user.full_name) LIKE :term')
            .orWhere('user.mobile_number LIKE :term');
        }),
      ).setParameter('term', term);
    }

    const [rawItems, total] = await qb.getManyAndCount();

    const items = rawItems.map((p) => {
      if (p.user) {
        delete (p.user as { password_hash?: string }).password_hash;
      }
      return p;
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(
    id: string,
    actingUserId: string,
    isAdmin = false,
  ): Promise<MembershipPaymentEntity> {
    const payment = await this.payments.findOne({
      where: { id },
      relations: ['membership', 'membership.category', 'user', 'receipt', 'transactions'],
    });

    if (!payment) {
      throw new NotFoundException({
        message: 'Membership payment not found',
        code: 'PAYMENT_NOT_FOUND',
        details: { id },
      });
    }

    if (!isAdmin && payment.user_id !== actingUserId) {
      throw new ForbiddenException({
        message: 'You are not authorized to view this payment',
        code: 'PAYMENT_ACCESS_DENIED',
        details: null,
      });
    }

    if (payment.user) {
      delete (payment.user as { password_hash?: string }).password_hash;
    }

    return payment;
  }

  async findByMembershipId(membershipId: string): Promise<MembershipPaymentEntity[]> {
    return this.payments.find({
      where: { membership_id: membershipId },
      relations: ['receipt'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Idempotent server-side payment verification.
   * Wraps status update + receipt + membership activation inside a DB transaction.
   */
  async verify(
    id: string,
    dto: VerifyMembershipPaymentDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<{ payment: MembershipPaymentEntity; receipt: ReceiptEntity }> {
    const payment = await this.getById(id, actingUserId, isAdmin);

    // Idempotency: if already verified, return existing record safely
    if (payment.payment_status === PaymentStatus.SUCCESS && payment.receipt) {
      return { payment, receipt: payment.receipt };
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const now = new Date();
      payment.payment_status = PaymentStatus.SUCCESS;
      payment.gateway_payment_id = dto.gateway_payment_id;
      if (dto.gateway_order_id) {
        payment.gateway_order_id = dto.gateway_order_id;
      }
      if (dto.gateway_signature) {
        payment.gateway_signature = dto.gateway_signature;
      }
      if (dto.gateway_payload) {
        payment.gateway_response = dto.gateway_payload;
      }
      payment.payment_date = now;
      payment.updated_by = actingUserId;

      const savedPayment = await manager.save(payment);

      // Record transaction line
      const tx = manager.create(PaymentTransactionEntity, {
        membership_payment_id: savedPayment.id,
        gateway_name: 'CASHFREE',
        gateway_order_id: dto.gateway_order_id ?? null,
        gateway_payment_id: dto.gateway_payment_id,
        amount: savedPayment.amount,
        status: 'SUCCESS',
        raw_payload: dto.gateway_payload ?? null,
        created_by: actingUserId,
        updated_by: actingUserId,
      });
      await manager.save(tx);

      // Generate Receipt
      const year = now.getFullYear();
      const rand = Math.floor(10000 + Math.random() * 90000);
      const receiptNumber = `HRSJM-REC-${year}-${rand}`;

      // Post accounting entry: Dr Bank/Cash, Cr Membership Income (same tx)
      const entry = await this.posting.postEntry(manager, {
        entry_date: now,
        reference_type: ReferenceType.MEMBERSHIP_PAYMENT,
        reference_id: payment.id,
        description: `Membership payment verified via ${payment.payment_method}`,
        lines: [
          {
            account_code:
              payment.payment_method === 'CASH'
                ? ACCOUNT_CODES.CASH
                : ACCOUNT_CODES.BANK,
            debit_amount: payment.amount,
            credit_amount: 0,
            line_description: `Membership payment received (${payment.payment_method})`,
          },
          {
            account_code: ACCOUNT_CODES.MEMBERSHIP_INCOME,
            debit_amount: 0,
            credit_amount: payment.amount,
            line_description: 'Membership fee income',
          },
        ],
        acting_user_id: actingUserId,
      });

      const receipt = manager.create(ReceiptEntity, {
        receipt_number: receiptNumber,
        receipt_date: now,
        user_id: payment.user_id,
        membership_payment_id: payment.id,
        amount: payment.amount,
        payment_method: payment.payment_method,
        receipt_type: 'MEMBERSHIP',
        issued_to: payment.user?.full_name ?? 'Member',
        notes: `Payment verified via ${payment.payment_method}`,
        accounting_entry_id: entry.id,
        created_by: actingUserId,
        updated_by: actingUserId,
      });
      const savedReceipt = await manager.save(receipt);

      // Activate or renew membership
      const membership = await manager.findOne(MembershipEntity, {
        where: { id: payment.membership_id },
        relations: ['category', 'user'],
      });

      if (membership) {
        membership.status = MembershipStatus.ACTIVE;
        if (!membership.start_date) {
          membership.start_date = now;
        }
        if (!membership.approval_date) {
          membership.approval_date = now;
        }
        const appData = (membership.application_data || {}) as Record<string, any>;
        const validityInfo = resolveMembershipValidityDays(
          membership.category?.name,
          appData.membership_type,
          appData.validity,
          membership.category?.validity_days || 365,
        );
        if (!membership.expiry_date) {
          membership.expiry_date = new Date(
            membership.start_date.getTime() + validityInfo.validityDays * 24 * 60 * 60 * 1000,
          );
        }
        if (!membership.membership_number) {
          const count =
            typeof manager.getRepository === 'function'
              ? await manager.getRepository(MembershipEntity).count()
              : 0;
          membership.membership_number = `HRSJM-${String(count + 1).padStart(5, '0')}`;
        }

        // Determine if renewal payment or overdue arrears payment
        let renewalMeta: any = null;
        if (payment.notes) {
          try {
            renewalMeta = JSON.parse(payment.notes);
          } catch {}
        }

        const isRenewalPayment =
          renewalMeta?.type === 'MEMBERSHIP_RENEWAL' ||
          (membership.expiry_date && new Date(membership.expiry_date).getTime() < now.getTime());

        if (isRenewalPayment) {
          const coveredPeriods = Number(renewalMeta?.periods_count) || 1;
          const currentExp = membership.expiry_date ? new Date(membership.expiry_date) : now;
          const newExp = addYearsSafe(currentExp, coveredPeriods);

          membership.expiry_date = newExp;

          // Record covered renewal periods inside the same transaction
          const renewalRepo = manager.getRepository(RenewalRequestEntity);
          if (renewalRepo) {
            const renewalRecord = renewalRepo.create({
              membership_id: membership.id,
              requested_by: payment.user_id,
              period_years: coveredPeriods,
              amount: payment.amount,
              payment_method: payment.payment_method || 'CASHFREE',
              transaction_id: dto.gateway_payment_id || null,
              payment_status: RenewalPaymentStatus.SUCCESS,
              status: RenewalStatus.ACTIVE,
              receipt_number: receiptNumber,
              previous_expiry: currentExp,
              new_expiry: newExp,
              reviewed_by: actingUserId,
              reviewed_at: now,
              created_by: actingUserId,
              updated_by: actingUserId,
            });
            await renewalRepo.save(renewalRecord);
          }
        } else {
          const validityDays = membership.category?.validity_days || 365;
          if (!membership.expiry_date) {
            membership.expiry_date = new Date(
              now.getTime() + validityDays * 24 * 60 * 60 * 1000,
            );
          }
        }

        membership.updated_by = actingUserId;
        await manager.save(membership);
      }

      // Generate Income Receipts entry (receipt_entries)
      await this.createReceiptVoucherForMembership(
        manager,
        savedPayment,
        membership,
        entry.id,
        actingUserId,
        now,
      );

      return { payment: savedPayment, receipt: savedReceipt };
    });

    await this.audit.record({
      event: 'membership_payment.verified',
      actorId: actingUserId,
      entityType: 'membership_payments',
      entityId: result.payment.id,
      metadata: {
        receiptNumber: result.receipt.receipt_number,
        amount: result.payment.amount,
        gatewayPaymentId: dto.gateway_payment_id,
      },
    });

    // Real-time notification to payer and administrators
    await this.notifications.sendToUser(
      result.payment.user_id,
      'Payment Received & Receipt Generated 🧾',
      `Payment of ₹${result.payment.amount} was verified successfully. Receipt #${result.receipt.receipt_number} has been issued.`,
      actingUserId,
    );
    await this.notifications.sendToAdmins(
      'New Membership Payment Received 💳',
      `Membership payment of ₹${result.payment.amount} verified (Receipt #${result.receipt.receipt_number}).`,
      actingUserId,
    );

    // Send Payment Success & Application Receipt Email asynchronously
    if (this.mailService) {
      this.memberships
        .findOne({
          where: { id: result.payment.membership_id },
          relations: ['user', 'category'],
        })
        .then((fullMembership) => {
          const recipientEmail = fullMembership?.user?.email || (fullMembership as any)?.email;
          if (recipientEmail && recipientEmail.includes('@')) {
            this.mailService!
              .sendMembershipPaymentSuccessEmail({
                applicantName:
                  fullMembership?.user?.full_name ||
                  'Valued Member',
                applicantEmail: recipientEmail,
                applicantPhone:
                  fullMembership?.user?.mobile_number ||
                  undefined,
                applicationRef:
                  fullMembership?.membership_number ||
                  result.receipt.receipt_number,
                categoryName: fullMembership?.category?.name || 'General Membership',
                amount: Number(result.payment.amount),
                transactionId: dto.gateway_payment_id || result.payment.transaction_id || undefined,
                paymentMethod: result.payment.payment_method || 'Online Payment',
                paymentDate: result.receipt.receipt_date,
                status: fullMembership?.status || 'APPROVED',
              })
              .catch((err) => {
                this.logger.error(
                  `Error sending membership payment email to ${recipientEmail}: ${err.message}`,
                );
              });
          }
        })
        .catch((err) => {
          this.logger.error(`Error loading membership for payment email: ${err.message}`);
        });
    }

    return result;
  }

  async updateStatus(
    id: string,
    dto: UpdateMembershipPaymentStatusDto,
    actingUserId: string,
  ): Promise<MembershipPaymentEntity> {
    const payment = await this.payments.findOne({
      where: { id },
      relations: ['membership', 'membership.category', 'user', 'receipt'],
    });

    if (!payment) {
      throw new NotFoundException({
        message: 'Membership payment not found',
        code: 'PAYMENT_NOT_FOUND',
        details: { id },
      });
    }

    if (dto.status === PaymentStatus.SUCCESS && payment.payment_status !== PaymentStatus.SUCCESS) {
      const verified = await this.verify(
        id,
        { gateway_payment_id: payment.transaction_id || `MANUAL-${Date.now()}` },
        actingUserId,
        true,
      );
      return verified.payment;
    }

    payment.payment_status = dto.status;
    if (dto.notes !== undefined) {
      payment.notes = dto.notes;
    }
    payment.updated_by = actingUserId;

    const saved = await this.payments.save(payment);

    await this.audit.record({
      event: 'membership_payment.status_updated',
      actorId: actingUserId,
      entityType: 'membership_payments',
      entityId: saved.id,
      metadata: { status: saved.payment_status },
    });

    return saved;
  }

  async getReceipt(
    id: string,
    actingUserId: string,
    isAdmin = false,
  ): Promise<ReceiptEntity> {
    const payment = await this.getById(id, actingUserId, isAdmin);

    const receipt = await this.receipts.findOne({
      where: { membership_payment_id: payment.id },
      relations: ['user'],
    });

    if (!receipt) {
      throw new NotFoundException({
        message: 'Receipt not found for this payment',
        code: 'RECEIPT_NOT_FOUND',
        details: { payment_id: id },
      });
    }

    if (receipt.user) {
      delete (receipt.user as { password_hash?: string }).password_hash;
    }

    return receipt;
  }

  /**
   * Internal helper to create a posted receipt voucher in `receipt_entries`
   * linked to the membership payment and its accounting entry.
   * Ensures every successful membership payment appears in Admin Income Receipts.
   */
  async createReceiptVoucherForMembership(
    manager: EntityManager,
    savedPayment: MembershipPaymentEntity,
    membership: MembershipEntity | null,
    accountingEntryId: string,
    actingUserId?: string | null,
    receiptDate: Date = new Date(),
  ): Promise<ReceiptEntryEntity | null> {
    try {
      const existing = await manager.findOne(ReceiptEntryEntity, {
        where: { accounting_entry_id: accountingEntryId },
      });
      if (existing) return existing;

      // 1. Resolve Membership Income Account (4001)
      let membershipIncomeAccount = await manager.findOne(AccountEntity, {
        where: { account_code: ACCOUNT_CODES.MEMBERSHIP_INCOME },
      });
      if (!membershipIncomeAccount) {
        membershipIncomeAccount = await manager.findOne(AccountEntity, {
          where: { account_type: AccountType.INCOME },
        });
      }

      // 2. Resolve Receiving Account (1001 Bank / 1002 Cash)
      const isCash = savedPayment.payment_method === 'CASH';
      const receivingCode = isCash ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
      let receivedInAccount = await manager.findOne(AccountEntity, {
        where: { account_code: receivingCode },
      });
      if (!receivedInAccount) {
        receivedInAccount = await manager.findOne(AccountEntity, {
          where: { account_type: AccountType.ASSET },
        });
      }

      if (!membershipIncomeAccount || !receivedInAccount) {
        this.logger.warn('Unable to create receipt voucher: missing accounting accounts');
        return null;
      }

      // 3. Resolve member / user details
      let memberUser: UserEntity | null | undefined = savedPayment.user;
      if (!memberUser && savedPayment.user_id) {
        memberUser = await manager.findOne(UserEntity, {
          where: { id: savedPayment.user_id },
        });
      }

      const memberName = memberUser?.full_name || 'Member';
      const donorPhone = memberUser?.mobile_number || '';
      const donorEmail = memberUser?.email || '';
      const contactParts = [donorPhone, donorEmail].filter(Boolean).join(' / ');
      const memberNumber = membership?.membership_number || 'Pending';
      const categoryName = membership?.category?.name || 'Annual Membership';
      const receivedFrom = `${memberName} (Member: ${memberNumber})`.slice(0, 150).trim();

      const isRenewal = savedPayment.notes?.toLowerCase().includes('renewal') || false;
      const refNum =
        savedPayment.gateway_payment_id ||
        savedPayment.transaction_id ||
        savedPayment.gateway_order_id ||
        'N/A';

      let description: string;
      if (isRenewal) {
        description = `Membership Renewal | Member: ${memberName}${contactParts ? ` (${contactParts})` : ''} | Status: Renewed Member (ID: ${memberNumber}) | Category: ${categoryName} | Payment ID: ${refNum}`;
      } else {
        description = `New Membership Registration | Member: ${memberName}${contactParts ? ` (${contactParts})` : ''} | Status: New Member (ID: ${memberNumber}) | Category: ${categoryName} | Payment ID: ${refNum}`;
      }

      // 4. Map payment method
      let receiptPaymentMethod: ReceiptPaymentMethod = ReceiptPaymentMethod.BANK_TRANSFER;
      const rawMethod = String(savedPayment.payment_method || '').toUpperCase();
      if (rawMethod === 'CASH') {
        receiptPaymentMethod = ReceiptPaymentMethod.CASH;
      } else if (rawMethod === 'CHEQUE') {
        receiptPaymentMethod = ReceiptPaymentMethod.CHEQUE;
      } else if (rawMethod === 'CARD') {
        receiptPaymentMethod = ReceiptPaymentMethod.CARD;
      } else if (rawMethod === 'UPI' || rawMethod === 'CASHFREE' || rawMethod.includes('ONLINE')) {
        receiptPaymentMethod = ReceiptPaymentMethod.UPI;
      }

      // 5. Generate Voucher Number
      let seq = 1;
      try {
        const result: { seq: string }[] = await manager.query(
          `SELECT nextval('receipt_voucher_number_seq') AS seq`,
        );
        seq = parseInt(result?.[0]?.seq ?? '1', 10);
      } catch {
        seq = Math.floor(1000 + Math.random() * 9000);
      }
      const voucherNumber = formatVoucherNumber(receiptDate, seq);

      const receiptEntry = manager.create(ReceiptEntryEntity, {
        voucher_number: voucherNumber,
        receipt_date: receiptDate,
        received_from: receivedFrom,
        income_account_id: membershipIncomeAccount.id,
        received_in_account_id: receivedInAccount.id,
        amount: savedPayment.amount,
        payment_method: receiptPaymentMethod,
        reference_number: (refNum !== 'N/A' ? refNum : `REF-${voucherNumber}`).slice(0, 100),
        description,
        attachment_url: null,
        status: ReceiptStatus.POSTED,
        accounting_entry_id: accountingEntryId,
        created_by: actingUserId ?? null,
        updated_by: actingUserId ?? null,
      });

      return await manager.save(receiptEntry);
    } catch (err) {
      this.logger.warn(`Failed to create receipt voucher for membership payment: ${err}`);
      return null;
    }
  }

  /**
   * Backfills receipt vouchers for any verified membership payments that do not
   * yet have an entry in `receipt_entries`.
   */
  async syncMissingReceiptEntries(): Promise<void> {
    try {
      const verifiedPayments = await this.payments.find({
        where: { payment_status: PaymentStatus.SUCCESS },
        relations: ['user', 'membership', 'membership.category'],
      });

      if (!verifiedPayments || verifiedPayments.length === 0) return;

      for (const payment of verifiedPayments) {
        const journals = await this.dataSource.query(
          `SELECT id, entry_date FROM accounting_entries WHERE reference_type = 'MEMBERSHIP_PAYMENT' AND reference_id = $1 AND entry_type = 'JOURNAL' LIMIT 1`,
          [payment.id],
        );
        const journal = journals?.[0];
        if (!journal?.id) continue;

        const exists = await this.dataSource.query(
          `SELECT id FROM receipt_entries WHERE accounting_entry_id = $1 LIMIT 1`,
          [journal.id],
        );
        if (exists && exists.length > 0) continue;

        const entryDate = journal.entry_date
          ? new Date(journal.entry_date)
          : payment.payment_date || new Date();

        await this.dataSource.transaction(async (manager) => {
          await this.createReceiptVoucherForMembership(
            manager,
            payment,
            payment.membership || null,
            journal.id,
            payment.updated_by || payment.created_by,
            entryDate,
          );
        });
      }
    } catch (err) {
      this.logger.warn(`Failed syncing missing membership receipt vouchers: ${err}`);
    }
  }
}
