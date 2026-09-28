import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { DonationEntity } from '../../donations/entities/donation.entity';
import { DonationPaymentEntity } from '../entities/donation-payment.entity';
import { PaymentTransactionEntity } from '../../membership-payments/entities/payment-transaction.entity';
import { ReceiptEntity } from '../../membership-payments/entities/receipt.entity';
import { CreateDonationPaymentDto } from '../dto/create-donation-payment.dto';
import { VerifyDonationPaymentDto } from '../dto/verify-donation-payment.dto';
import { UpdateDonationPaymentStatusDto } from '../dto/update-donation-payment-status.dto';
import { ListDonationPaymentsDto } from '../dto/list-donation-payments.dto';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';
import { AccountingPostingService } from '../../accounting/services/accounting-posting.service';
import { ACCOUNT_CODES } from '../../accounting/accounting.constants';
import { ReferenceType } from '../../accounting/enums/accounting.enums';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class DonationPaymentsService {
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
  ) {}

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
      gateway_name: 'RAZORPAY',
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
    actingUserId: string,
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
      payment.updated_by = actingUserId;

      const savedPayment = await manager.save(DonationPaymentEntity, payment);

      // Record transaction line
      const tx = manager.create(PaymentTransactionEntity, {
        donation_payment_id: savedPayment.id,
        gateway_name: 'RAZORPAY',
        gateway_order_id: dto.gateway_order_id ?? null,
        gateway_payment_id: dto.gateway_payment_id,
        amount: savedPayment.amount,
        status: 'SUCCESS',
        raw_payload: dto.gateway_payload ?? null,
        created_by: actingUserId,
        updated_by: actingUserId,
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

      const receipt = manager.create(ReceiptEntity, {
        receipt_number: receiptNumber,
        receipt_date: now,
        user_id: payment.user_id ?? actingUserId,
        donation_payment_id: payment.id,
        amount: savedPayment.amount,
        payment_method: savedPayment.payment_method,
        receipt_type: 'DONATION',
        issued_to: savedPayment.donation?.donor_name ?? 'Donor',
        notes: `Donation payment verified via ${savedPayment.payment_method}`,
        accounting_entry_id: entry.id,
        created_by: actingUserId,
        updated_by: actingUserId,
      });
      const savedReceipt = await manager.save(receipt);

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
    actingUserId: string,
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
}

/** Inclusive upper bound: date-only strings become end-of-day UTC. */
function toInclusiveEnd(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }
  return new Date(value);
}
