import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { MembershipPaymentEntity } from '../entities/membership-payment.entity';
import { ReceiptEntity } from '../entities/receipt.entity';
import { PaymentTransactionEntity } from '../entities/payment-transaction.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
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

@Injectable()
export class MembershipPaymentsService {
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
  ) {}

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
      gateway_name: 'RAZORPAY',
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

      // Activate membership
      const membership = await manager.findOne(MembershipEntity, {
        where: { id: payment.membership_id },
        relations: ['category'],
      });

      if (membership) {
        membership.status = MembershipStatus.ACTIVE;
        if (!membership.start_date) {
          membership.start_date = now;
        }
        if (!membership.approval_date) {
          membership.approval_date = now;
        }
        const validityDays = membership.category?.validity_days || 365;
        if (!membership.expiry_date) {
          membership.expiry_date = new Date(
            now.getTime() + validityDays * 24 * 60 * 60 * 1000,
          );
        }
        if (!membership.membership_number) {
          membership.membership_number = `HRSJM-MEM-${year}-${rand}`;
        }
        membership.updated_by = actingUserId;
        await manager.save(membership);
      }

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

    // Real-time notification to payer
    await this.notifications.sendToUser(
      result.payment.user_id,
      'Payment Received & Receipt Generated 🧾',
      `Payment of ₹${result.payment.amount} was verified successfully. Receipt #${result.receipt.receipt_number} has been issued.`,
      actingUserId,
    );

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
}
