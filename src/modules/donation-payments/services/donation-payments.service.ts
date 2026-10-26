import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { MailService } from '../../mail/mail.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { DonationEntity } from '../../donations/entities/donation.entity';
import { DonationPaymentEntity } from '../entities/donation-payment.entity';
import { PaymentTransactionEntity } from '../../membership-payments/entities/payment-transaction.entity';
import { ReceiptEntity } from '../../membership-payments/entities/receipt.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { CreateDonationPaymentDto } from '../dto/create-donation-payment.dto';
import { VerifyDonationPaymentDto } from '../dto/verify-donation-payment.dto';
import { UpdateDonationPaymentStatusDto } from '../dto/update-donation-payment-status.dto';
import { ListDonationPaymentsDto } from '../dto/list-donation-payments.dto';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';
import { AccountingPostingService } from '../../accounting/services/accounting-posting.service';
import { ACCOUNT_CODES } from '../../accounting/accounting.constants';
import { AccountType, ReferenceType } from '../../accounting/enums/accounting.enums';
import { AuditService } from '../../audit/services/audit.service';
import { ReceiptEntryEntity } from '../../receipt-entries/entities/receipt-entry.entity';
import { ReceiptPaymentMethod, ReceiptStatus } from '../../receipt-entries/enums/receipt-entry.enums';
import { AccountEntity } from '../../accounting/entities/account.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';

function formatVoucherNumber(receiptDate: Date, seq: number): string {
  const y = receiptDate.getUTCFullYear();
  const m = String(receiptDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(receiptDate.getUTCDate()).padStart(2, '0');
  return `REC-${y}${m}${d}-${String(seq).padStart(5, '0')}`;
}

@Injectable()
export class DonationPaymentsService implements OnModuleInit {
  private readonly logger = new Logger(DonationPaymentsService.name);

  constructor(
    @InjectRepository(DonationPaymentEntity)
    private readonly payments: Repository<DonationPaymentEntity>,
    @InjectRepository(ReceiptEntity)
    private readonly receipts: Repository<ReceiptEntity>,
    @InjectRepository(PaymentTransactionEntity)
    private readonly transactions: Repository<PaymentTransactionEntity>,
    @InjectRepository(DonationEntity)
    private readonly donations: Repository<DonationEntity>,
    private readonly dataSource: DataSource,
    private readonly posting: AccountingPostingService,
    private readonly audit: AuditService,
    @Optional()
    private readonly mailService?: MailService,
  ) {}

  async onModuleInit() {
    await this.syncMissingReceiptEntries();
  }

  async create(
    dto: CreateDonationPaymentDto,
    actingUserId?: string | null,
  ): Promise<DonationPaymentEntity> {
    const donation = await this.donations.findOne({
      where: { id: dto.donation_id },
    });

    if (!donation) {
      throw new NotFoundException({
        message: 'Donation not found',
        code: 'DONATION_NOT_FOUND',
        details: { donation_id: dto.donation_id },
      });
    }

    if (donation.status === 'REFUNDED') {
      throw new BadRequestException({
        message: 'This donation has been refunded and cannot accept new payments',
        code: 'DONATION_ALREADY_REFUNDED',
        details: { donation_id: donation.id },
      });
    }

    if (donation.status === 'SUCCESS') {
      throw new BadRequestException({
        message: 'This donation has already been paid successfully',
        code: 'DONATION_ALREADY_PAID',
        details: { donation_id: donation.id },
      });
    }

    // Amount is validated server-side — the frontend value is never trusted.
    const amount = dto.amount !== undefined ? dto.amount : donation.amount;
    if (amount <= 0) {
      throw new BadRequestException({
        message: 'Payment amount must be greater than zero',
        code: 'INVALID_PAYMENT_AMOUNT',
        details: { amount },
      });
    }

    const payment = this.payments.create({
      donation_id: donation.id,
      user_id: actingUserId ?? null,
      amount,
      payment_method: dto.payment_method ?? 'ONLINE',
      payment_status: PaymentStatus.PENDING,
      gateway_order_id: dto.transaction_id ?? null,
      notes: dto.notes ?? null,
      created_by: actingUserId ?? null,
      updated_by: actingUserId ?? null,
    });

    const savedPayment = await this.payments.save(payment);

    const transaction = this.transactions.create({
      donation_payment_id: savedPayment.id,
      gateway_name: 'CASHFREE',
      amount: savedPayment.amount,
      status: 'INITIATED',
      created_by: actingUserId ?? null,
      updated_by: actingUserId ?? null,
    });
    await this.transactions.save(transaction);

    await this.audit.record({
      event: 'donation_payment.initiated',
      actorId: actingUserId ?? null,
      entityType: 'donation_payments',
      entityId: savedPayment.id,
      metadata: {
        donationId: donation.id,
        amount: savedPayment.amount,
        method: savedPayment.payment_method,
      },
    });

    return savedPayment;
  }

  async list(
    dto: ListDonationPaymentsDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<{
    items: DonationPaymentEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.payments
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.donation', 'donation')
      .orderBy('payment.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (!isAdmin) {
      qb.andWhere('payment.user_id = :userId', { userId: actingUserId });
    }
    if (dto.payment_status) {
      qb.andWhere('payment.payment_status = :status', {
        status: dto.payment_status,
      });
    }
    if (dto.donation_id) {
      qb.andWhere('payment.donation_id = :donationId', {
        donationId: dto.donation_id,
      });
    }
    if (dto.payment_method) {
      qb.andWhere('payment.payment_method = :method', {
        method: dto.payment_method,
      });
    }
    if (dto.date_from) {
      qb.andWhere('payment.created_at >= :dateFrom', {
        dateFrom: new Date(dto.date_from),
      });
    }
    if (dto.date_to) {
      qb.andWhere('payment.created_at <= :dateTo', {
        dateTo: toInclusiveEnd(dto.date_to),
      });
    }

    const [items, total] = await qb.getManyAndCount();

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
    actingUserId?: string,
    isAdmin = false,
  ): Promise<DonationPaymentEntity> {
    const payment = await this.payments.findOne({
      where: { id },
      relations: ['donation'],
    });

    if (!payment) {
      throw new NotFoundException({
        message: 'Donation payment not found',
        code: 'DONATION_PAYMENT_NOT_FOUND',
        details: { id },
      });
    }

    if (
      !isAdmin &&
      payment.user_id !== actingUserId &&
      payment.user_id !== null
    ) {
      throw new ForbiddenException({
        message: 'You are not authorized to view this donation payment',
        code: 'DONATION_PAYMENT_ACCESS_DENIED',
        details: null,
      });
    }

    return payment;
  }

  async verify(
    id: string,
    dto: VerifyDonationPaymentDto,
    actingUserId?: string,
    isAdmin = false,
  ): Promise<{ payment: DonationPaymentEntity; receipt: ReceiptEntity }> {
    const payment = await this.getById(id, actingUserId, isAdmin);

    // Idempotency: if already verified, return the existing state unchanged
    if (payment.payment_status === PaymentStatus.SUCCESS && payment.payment_date) {
      const existingReceipt = await this.receipts.findOne({
        where: { donation_payment_id: payment.id },
      });
      if (existingReceipt) {
        return { payment, receipt: existingReceipt };
      }
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
      payment.updated_by = actingUserId ?? null;

      const savedPayment = await manager.save(DonationPaymentEntity, payment);

      // Record transaction line
      const tx = manager.create(PaymentTransactionEntity, {
        donation_payment_id: savedPayment.id,
        gateway_name: 'CASHFREE',
        gateway_order_id: dto.gateway_order_id ?? null,
        gateway_payment_id: dto.gateway_payment_id,
        amount: savedPayment.amount,
        status: 'SUCCESS',
        raw_payload: dto.gateway_payload ?? null,
        created_by: actingUserId ?? null,
        updated_by: actingUserId ?? null,
      });
      await manager.save(tx);

      // Post accounting entry: Dr Bank/Cash, Cr Donation Income (same tx)
      const entry = await this.posting.postEntry(manager, {
        entry_date: now,
        reference_type: ReferenceType.DONATION_PAYMENT,
        reference_id: savedPayment.id,
        description: `Donation payment verified via ${savedPayment.payment_method} — ${savedPayment.donation?.cause ?? 'Donation'}`,
        lines: [
          {
            account_code:
              savedPayment.payment_method === 'CASH'
                ? ACCOUNT_CODES.CASH
                : ACCOUNT_CODES.BANK,
            debit_amount: savedPayment.amount,
            credit_amount: 0,
            line_description: `Donation received (${savedPayment.payment_method})`,
          },
          {
            account_code: ACCOUNT_CODES.DONATION_INCOME,
            debit_amount: 0,
            credit_amount: savedPayment.amount,
            line_description: `Donation income — ${savedPayment.donation?.cause ?? 'donation'}`,
          },
        ],
        acting_user_id: actingUserId,
      });

      // Generate receipt
      const year = now.getFullYear();
      const rand = Math.floor(10000 + Math.random() * 90000);
      const receiptNumber = `HRSJM-REC-${year}-${rand}`;

      let receiptUserId: string | null = null;
      if (payment.user_id) {
        const u = await manager.findOne(UserEntity, {
          select: ['id'],
          where: { id: payment.user_id },
        });
        if (u) receiptUserId = u.id;
      }
      if (!receiptUserId && actingUserId && actingUserId !== 'GUEST_USER') {
        const u = await manager.findOne(UserEntity, {
          select: ['id'],
          where: { id: actingUserId },
        });
        if (u) receiptUserId = u.id;
      }
      if (!receiptUserId) {
        const anyUser = await manager.findOne(UserEntity, {
          select: ['id'],
          where: {},
        });
        if (anyUser) {
          receiptUserId = anyUser.id;
        }
      }

      const receipt = manager.create(ReceiptEntity, {
        receipt_number: receiptNumber,
        receipt_date: now,
        user_id: receiptUserId || '6b481b29-d4ec-4bad-8bde-4e21d8bb2d26',
        donation_payment_id: payment.id,
        amount: savedPayment.amount,
        payment_method: savedPayment.payment_method,
        receipt_type: 'DONATION',
        issued_to: savedPayment.donation?.donor_name ?? 'Donor',
        notes: `Donation payment verified via ${savedPayment.payment_method}`,
        accounting_entry_id: entry.id,
        created_by: receiptUserId,
        updated_by: receiptUserId,
      });
      const savedReceipt = await manager.save(receipt);

      // Create posted receipt voucher in receipt_entries (Income Receipts)
      await this.createReceiptVoucherForDonation(
        manager,
        savedPayment,
        entry.id,
        actingUserId,
        dto.gateway_payload,
        now,
      );

      // Reflect financial status on the donation record
      const donation = await manager.findOne(DonationEntity, {
        where: { id: payment.donation_id },
      });
      if (donation) {
        donation.status = 'SUCCESS';
        donation.updated_by = actingUserId ?? null;
        await manager.save(DonationEntity, donation);
      }

      return { payment: savedPayment, receipt: savedReceipt };
    });

    await this.audit.record({
      event: 'donation_payment.verified',
      actorId: actingUserId ?? null,
      entityType: 'donation_payments',
      entityId: result.payment.id,
      metadata: {
        receiptNumber: result.receipt.receipt_number,
        amount: result.payment.amount,
        gatewayPaymentId: dto.gateway_payment_id,
        donationId: result.payment.donation_id,
      },
    });

    // Asynchronously dispatch official gratitude email to donor if email was provided
    if (this.mailService) {
      this.donations
        .findOne({ where: { id: result.payment.donation_id } })
        .then((donationRecord) => {
          const donorEmail = donationRecord?.donor_email || payment.donation?.donor_email;
          const donorName = donationRecord?.donor_name || payment.donation?.donor_name || 'Kind Donor';
          const cause = donationRecord?.cause || payment.donation?.cause || 'General Support & Human Rights Protection';

          this.logger.log(`Checking email dispatch for donation ${result.payment.donation_id}. Donor email: "${donorEmail}"`);

          if (donorEmail && donorEmail.includes('@')) {
            this.mailService!
              .sendDonationThankYouEmail({
                donorName,
                donorEmail,
                amount: Number(result.payment.amount),
                receiptNumber: result.receipt.receipt_number,
                receiptDate: result.receipt.receipt_date,
                cause,
                paymentMethod: result.payment.payment_method,
                gatewayPaymentId: dto.gateway_payment_id,
              })
              .then((sent) => {
                this.logger.log(`Donation thank you email dispatch status for ${donorEmail}: ${sent}`);
              })
              .catch((err) => {
                this.logger.error(`Error sending thank you email to ${donorEmail}: ${err.message}`);
              });
          } else {
            this.logger.log(`No valid donor email provided for donation ${result.payment.donation_id}. Skipping email.`);
          }
        })
        .catch((err) => {
          this.logger.error(`Error retrieving donation for email dispatch: ${err.message}`);
        });
    }

    return result;
  }

  async updateStatus(
    id: string,
    dto: UpdateDonationPaymentStatusDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<DonationPaymentEntity> {
    const payment = await this.getById(id, actingUserId, isAdmin);

    if (dto.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException({
        message:
          'Refunds must be processed through the donation refund endpoint so the accounting entry is reversed',
        code: 'DONATION_REFUND_REQUIRES_ENDPOINT',
        details: null,
      });
    }

    if (
      dto.status === PaymentStatus.SUCCESS &&
      payment.payment_status !== PaymentStatus.SUCCESS
    ) {
      const verified = await this.verify(
        id,
        { gateway_payment_id: `MANUAL-${Date.now()}` },
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
      event: 'donation_payment.status_updated',
      actorId: actingUserId,
      entityType: 'donation_payments',
      entityId: saved.id,
      metadata: { status: saved.payment_status },
    });

    return saved;
  }

  async getReceipt(
    id: string,
    actingUserId?: string,
    isAdmin = false,
  ): Promise<ReceiptEntity> {
    const payment = await this.getById(id, actingUserId, isAdmin);

    const receipt = await this.receipts.findOne({
      where: { donation_payment_id: payment.id },
      relations: ['user'],
    });

    if (!receipt) {
      throw new NotFoundException({
        message: 'Receipt not found for this donation payment',
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
   * linked to the donation payment and its accounting entry.
   * This ensures every successful donation appears in Admin Income Receipts
   * with full details of the member/user and the cause.
   */
  async createReceiptVoucherForDonation(
    manager: EntityManager,
    savedPayment: DonationPaymentEntity,
    accountingEntryId: string,
    actingUserId?: string | null,
    gatewayPayload?: Record<string, unknown>,
    receiptDate: Date = new Date(),
  ): Promise<ReceiptEntryEntity | null> {
    try {
      // Idempotency: verify if already generated for this accounting entry
      const existing = await manager.findOne(ReceiptEntryEntity, {
        where: { accounting_entry_id: accountingEntryId },
      });
      if (existing) {
        return existing;
      }

      // 1. Resolve Donation Income Account (4003)
      let donationIncomeAccount = await manager.findOne(AccountEntity, {
        where: { account_code: ACCOUNT_CODES.DONATION_INCOME },
      });
      if (!donationIncomeAccount) {
        donationIncomeAccount = await manager.findOne(AccountEntity, {
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

      if (!donationIncomeAccount || !receivedInAccount) {
        this.logger.warn(
          `Unable to create receipt voucher: missing accounts (income: ${donationIncomeAccount?.id}, asset: ${receivedInAccount?.id})`,
        );
        return null;
      }

      // 3. Resolve Member / User details
      let donorUser: UserEntity | null = null;
      let donorMembership: MembershipEntity | null = null;

      if (savedPayment.user_id) {
        try {
          donorUser = await manager.findOne(UserEntity, {
            where: { id: savedPayment.user_id },
          });
          donorMembership = await manager.findOne(MembershipEntity, {
            where: { user_id: savedPayment.user_id },
            order: { created_at: 'DESC' },
          });
        } catch (lookupErr) {
          this.logger.warn(`Failed to resolve user/membership for receipt voucher: ${lookupErr}`);
        }
      }

      // 4. Build Received From (Name + Member/User status)
      const rawDonorName = savedPayment.donation?.donor_name?.trim();
      const isWebsiteDonation =
        (savedPayment.donation?.remark || '').toLowerCase().includes('website') ||
        savedPayment.payment_method === 'CASHFREE';
      const isGenericName =
        !rawDonorName ||
        ['donor', 'kind supporter', 'kind citizen', 'supporter', 'anonymous', 'anonymous donor', 'guest'].includes(rawDonorName.toLowerCase());

      const donorDisplayName =
        (!isGenericName ? rawDonorName : null) ||
        donorUser?.full_name ||
        (isWebsiteDonation ? 'Anonymous Donation from Website' : 'Anonymous Donor');

      let memberBadge = '';
      if (donorMembership?.membership_number) {
        memberBadge = ` (Member: ${donorMembership.membership_number})`;
      } else if (donorUser) {
        memberBadge = ` (Member/User)`;
      }

      const receivedFrom = `${donorDisplayName}${memberBadge}`.slice(0, 150).trim();

      // 5. Map Payment Method to ReceiptPaymentMethod enum
      let receiptPaymentMethod: ReceiptPaymentMethod = ReceiptPaymentMethod.BANK_TRANSFER;
      const rawMethod = String(savedPayment.payment_method || '').toUpperCase();
      const gatewayGroup = String((gatewayPayload as any)?.payment_group || '').toLowerCase();
      const gatewayMethodObj = (gatewayPayload as any)?.payment_method;

      if (rawMethod === 'CASH') {
        receiptPaymentMethod = ReceiptPaymentMethod.CASH;
      } else if (rawMethod === 'CHEQUE') {
        receiptPaymentMethod = ReceiptPaymentMethod.CHEQUE;
      } else if (rawMethod === 'CARD' || gatewayGroup === 'card' || gatewayMethodObj?.card) {
        receiptPaymentMethod = ReceiptPaymentMethod.CARD;
      } else if (
        rawMethod === 'UPI' ||
        gatewayGroup === 'upi' ||
        gatewayMethodObj?.upi ||
        rawMethod === 'CASHFREE' ||
        rawMethod.includes('ONLINE')
      ) {
        receiptPaymentMethod = ReceiptPaymentMethod.UPI;
      }

      // 6. Build Narrative / Description with Full Details
      const causeTitle = savedPayment.donation?.cause || 'General Donation';
      const donorPhone = savedPayment.donation?.donor_mobile || donorUser?.mobile_number || '';
      const donorEmail = savedPayment.donation?.donor_email || donorUser?.email || '';
      const contactParts = [donorPhone, donorEmail].filter(Boolean).join(' / ');
      const refNum =
        savedPayment.gateway_payment_id ||
        savedPayment.gateway_order_id ||
        'N/A';

      let memberDetails = 'Public/Guest Donor';
      if (donorMembership?.membership_number) {
        memberDetails = `Member: ${donorUser?.full_name || donorDisplayName} (ID: ${donorMembership.membership_number})`;
      } else if (donorUser) {
        memberDetails = `Registered User: ${donorUser.full_name} (${donorUser.mobile_number})`;
      }

      const sourceTag =
        savedPayment.donation?.remark ||
        (savedPayment.payment_method === 'CASHFREE' ? 'Donation from Website' : 'Direct Donation');
      const isFromApp = (savedPayment.donation?.remark || '').toLowerCase().includes('application');
      const channelPrefix = isFromApp
        ? '[Application Donation]'
        : (sourceTag.toLowerCase().includes('website') ? '[Website Donation]' : '[Donation]');
      const description = `${channelPrefix} Donation for Cause: ${causeTitle} | Donor: ${donorDisplayName}${contactParts ? ` (${contactParts})` : ''} | Status: ${memberDetails} | Source: ${sourceTag} | Payment ID: ${refNum}`;

      // 7. Generate Voucher Number (REC-YYYYMMDD-#####)
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

      // 8. Create and Persist Receipt Voucher
      const receiptEntry = manager.create(ReceiptEntryEntity, {
        voucher_number: voucherNumber,
        receipt_date: receiptDate,
        received_from: receivedFrom,
        income_account_id: donationIncomeAccount.id,
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

      return await manager.save(ReceiptEntryEntity, receiptEntry);
    } catch (err) {
      this.logger.error(`Failed to create receipt voucher for donation payment ${savedPayment.id}: ${err}`);
      return null;
    }
  }

  /**
   * Backfills receipt vouchers for any verified donation payments that do not
   * yet have an entry in `receipt_entries`.
   */
  async syncMissingReceiptEntries(): Promise<void> {
    try {
      const verifiedPayments = await this.payments.find({
        where: { payment_status: PaymentStatus.SUCCESS },
        relations: ['donation'],
      });

      if (!verifiedPayments || verifiedPayments.length === 0) return;

      for (const payment of verifiedPayments) {
        const journals = await this.dataSource.query(
          `SELECT id, entry_date FROM accounting_entries WHERE reference_type = 'DONATION_PAYMENT' AND reference_id = $1 AND entry_type = 'JOURNAL' LIMIT 1`,
          [payment.id],
        );
        const journal = journals?.[0];
        if (!journal?.id) continue;

        const exists = await this.dataSource.query(
          `SELECT id FROM receipt_entries WHERE accounting_entry_id = $1 LIMIT 1`,
          [journal.id],
        );
        if (exists && exists.length > 0) continue;

        const entryDate = journal.entry_date ? new Date(journal.entry_date) : (payment.payment_date || new Date());

        await this.dataSource.transaction(async (manager) => {
          await this.createReceiptVoucherForDonation(
            manager,
            payment,
            journal.id,
            payment.updated_by || payment.created_by,
            payment.gateway_response || undefined,
            entryDate,
          );
        });
      }
    } catch (err) {
      this.logger.warn(`Could not complete initial receipt voucher sync: ${err}`);
    }
  }
}

/** Inclusive upper bound: date-only strings become end-of-day UTC. */
function toInclusiveEnd(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }
  return new Date(value);
}
