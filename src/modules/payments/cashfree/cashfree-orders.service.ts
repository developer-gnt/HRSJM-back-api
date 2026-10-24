import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';
import { DonationPaymentEntity } from '../../donation-payments/entities/donation-payment.entity';
import { DonationPaymentsService } from '../../donation-payments/services/donation-payments.service';
import { MembershipPaymentEntity } from '../../membership-payments/entities/membership-payment.entity';
import { PaymentTransactionEntity } from '../../membership-payments/entities/payment-transaction.entity';
import { MembershipPaymentsService } from '../../membership-payments/services/membership-payments.service';
import { CashfreeService } from './cashfree.service';
import { CreateCashfreeOrderDto } from './dto/create-cashfree-order.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function toValidUuid(val?: string | null): string | undefined {
  return val && UUID_REGEX.test(val) ? val : undefined;
}

@Injectable()
export class CashfreeOrdersService {
  private readonly logger = new Logger(CashfreeOrdersService.name);

  constructor(
    private readonly cashfreeService: CashfreeService,
    private readonly donationPaymentsService: DonationPaymentsService,
    private readonly membershipPaymentsService: MembershipPaymentsService,
    @InjectRepository(DonationPaymentEntity)
    private readonly donationPaymentsRepo: Repository<DonationPaymentEntity>,
    @InjectRepository(MembershipPaymentEntity)
    private readonly membershipPaymentsRepo: Repository<MembershipPaymentEntity>,
    @InjectRepository(PaymentTransactionEntity)
    private readonly transactionsRepo: Repository<PaymentTransactionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async createOrder(dto: CreateCashfreeOrderDto, actingUserId: string, idempotencyKey?: string) {
    if (dto.purpose === 'donation') {
      return this.createDonationOrder(dto.reference_id!, actingUserId, idempotencyKey, dto.return_url);
    } else if (dto.purpose === 'membership') {
      return this.createMembershipOrder(dto, actingUserId, idempotencyKey, dto.return_url);
    } else {
      throw new BadRequestException(`Unsupported payment purpose: ${dto.purpose}`);
    }
  }

  private async createDonationOrder(paymentId: string, actingUserId: string, idempotencyKey?: string, returnUrl?: string) {
    const payment = await this.donationPaymentsRepo.findOne({
      where: { id: paymentId },
      relations: ['donation'],
    });

    if (!payment) {
      throw new NotFoundException(`Donation payment ${paymentId} not found`);
    }

    if (payment.payment_status === PaymentStatus.SUCCESS) {
      throw new BadRequestException('Donation payment has already been completed');
    }

    const safeActingUuid = toValidUuid(actingUserId);
    if (payment.user_id && safeActingUuid && payment.user_id !== safeActingUuid) {
      throw new ForbiddenException('You do not own this donation payment');
    }

    // Cashfree order_id max length is 45 chars
    const orderId = `hrsjm_don_${payment.id.replace(/-/g, '').slice(0, 16)}_${Date.now().toString(36)}`;

    const rawPhone = payment.donation?.donor_mobile || '';
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    const customerPhone = cleanPhone.length === 10 ? cleanPhone : '9999999999';

    const customerId = (payment.user_id || payment.id).replace(/-/g, '').slice(0, 45);
    const customerName = payment.donation?.donor_name || 'HRSJM Donor';
    const customerEmail = payment.donation?.donor_email || 'donor@hrsjm.org';
    const causeNote = payment.donation?.cause || 'Donation';

    const cfOrder = await this.cashfreeService.createOrder({
      orderId,
      amount: Number(payment.amount),
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      purpose: `Donation: ${causeNote}`,
      idempotencyKey,
      returnUrl,
    });

    // Save gateway_order_id on payment
    payment.gateway_order_id = cfOrder.order_id;
    payment.payment_method = 'CASHFREE';
    await this.donationPaymentsRepo.save(payment);

    // Record initial transaction
    const tx = this.transactionsRepo.create({
      donation_payment_id: payment.id,
      gateway_name: 'CASHFREE',
      gateway_order_id: cfOrder.order_id,
      amount: Number(payment.amount),
      status: 'INITIATED',
      raw_payload: cfOrder as Record<string, unknown>,
      created_by: safeActingUuid,
      updated_by: safeActingUuid,
    });
    await this.transactionsRepo.save(tx);

    return {
      order_id: cfOrder.order_id,
      payment_session_id: cfOrder.payment_session_id,
      cf_order_id: cfOrder.cf_order_id,
      order_status: cfOrder.order_status,
      amount: Number(payment.amount),
      currency: 'INR',
      purpose: 'donation',
      reference_id: payment.id,
      environment: this.cashfreeService.environment,
    };
  }

  private async createMembershipOrder(
    dto: CreateCashfreeOrderDto,
    actingUserId: string,
    idempotencyKey?: string,
    returnUrl?: string,
  ) {
    let payment: MembershipPaymentEntity | null = null;
    if (dto.reference_id) {
      payment = await this.membershipPaymentsRepo.findOne({
        where: { id: dto.reference_id },
        relations: ['user', 'membership'],
      });
    }

    const safeActingUuid = toValidUuid(actingUserId);
    if (payment) {
      if (payment.payment_status === PaymentStatus.SUCCESS) {
        throw new BadRequestException('Membership payment has already been completed');
      }

      if (payment.user_id && safeActingUuid && payment.user_id !== safeActingUuid) {
        throw new ForbiddenException('You do not own this membership payment');
      }

      const orderAmount = Number(dto.amount !== undefined && dto.amount > 0 ? dto.amount : payment.amount);
      const orderId = `hrsjm_mem_${payment.id.replace(/-/g, '').slice(0, 16)}_${Date.now().toString(36)}`;

      const rawPhone = dto.customer_phone || payment.user?.mobile_number || '';
      const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
      const customerPhone = cleanPhone.length === 10 ? cleanPhone : '9999999999';

      const customerId = (payment.user_id || safeActingUuid || 'applicant').replace(/-/g, '').slice(0, 45);
      const customerName = dto.customer_name || payment.user?.full_name || 'HRSJM Member';
      const customerEmail = dto.customer_email || payment.user?.email || 'member@hrsjm.org';
      const purposeNote = dto.order_note || `Membership Fee - ${payment.membership_id}`;

      const cfOrder = await this.cashfreeService.createOrder({
        orderId,
        amount: orderAmount,
        customerId,
        customerName,
        customerEmail,
        customerPhone,
        purpose: purposeNote,
        idempotencyKey,
        returnUrl,
      });

      payment.gateway_order_id = cfOrder.order_id;
      payment.payment_method = 'CASHFREE';
      payment.amount = orderAmount;
      await this.membershipPaymentsRepo.save(payment);

      const tx = this.transactionsRepo.create({
        membership_payment_id: payment.id,
        gateway_name: 'CASHFREE',
        gateway_order_id: cfOrder.order_id,
        amount: orderAmount,
        status: 'INITIATED',
        raw_payload: cfOrder as Record<string, unknown>,
        created_by: safeActingUuid,
        updated_by: safeActingUuid,
      });
      await this.transactionsRepo.save(tx);

      return {
        order_id: cfOrder.order_id,
        payment_session_id: cfOrder.payment_session_id,
        cf_order_id: cfOrder.cf_order_id,
        order_status: cfOrder.order_status,
        amount: orderAmount,
        currency: 'INR',
        purpose: 'membership',
        reference_id: payment.id,
        environment: this.cashfreeService.environment,
      };
    }

    // Direct registration checkout with specified amount
    const orderAmount = Number(dto.amount);
    if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
      if (dto.reference_id) {
        throw new NotFoundException(`Membership payment ${dto.reference_id} not found`);
      }
      throw new BadRequestException('Membership payment order requires a valid positive amount');
    }

    const safeRef = (dto.reference_id || `reg_${Date.now()}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
    const orderId = `hrsjm_mem_${safeRef}_${Date.now().toString(36)}`;

    const rawPhone = dto.customer_phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    const customerPhone = cleanPhone.length === 10 ? cleanPhone : '9999999999';

    const customerId = (actingUserId || `cust_${Date.now()}`).replace(/-/g, '').slice(0, 45);
    const customerName = dto.customer_name || 'HRSJM Member Applicant';
    const customerEmail = dto.customer_email || 'member@hrsjm.org';
    const purposeNote = dto.order_note || 'Membership Registration Fee';

    const cfOrder = await this.cashfreeService.createOrder({
      orderId,
      amount: orderAmount,
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      purpose: purposeNote,
      idempotencyKey,
      returnUrl,
    });

    const tx = this.transactionsRepo.create({
      gateway_name: 'CASHFREE',
      gateway_order_id: cfOrder.order_id,
      amount: orderAmount,
      status: 'INITIATED',
      raw_payload: cfOrder as Record<string, unknown>,
      created_by: safeActingUuid,
      updated_by: safeActingUuid,
    });
    await this.transactionsRepo.save(tx);

    return {
      order_id: cfOrder.order_id,
      payment_session_id: cfOrder.payment_session_id,
      cf_order_id: cfOrder.cf_order_id,
      order_status: cfOrder.order_status,
      amount: orderAmount,
      currency: 'INR',
      purpose: 'membership',
      reference_id: dto.reference_id || cfOrder.order_id,
      environment: this.cashfreeService.environment,
    };
  }

  async verifyOrder(orderId: string, actingUserId?: string) {
    // 1. Identify which payment belongs to this orderId
    const donationPayment = await this.donationPaymentsRepo.findOne({
      where: { gateway_order_id: orderId },
      relations: ['donation'],
    });

    const membershipPayment = !donationPayment
      ? await this.membershipPaymentsRepo.findOne({
          where: { gateway_order_id: orderId },
          relations: ['receipt', 'membership'],
        })
      : null;

    const existingTx = (!donationPayment && !membershipPayment)
      ? await this.transactionsRepo.findOne({
          where: { gateway_order_id: orderId },
        })
      : null;

    if (!donationPayment && !membershipPayment && !existingTx) {
      throw new NotFoundException(`No payment record found with gateway_order_id: ${orderId}`);
    }

    const isDonation = !!donationPayment;
    const payment = isDonation ? donationPayment : membershipPayment;

    // Optional ownership check when called from authenticated user endpoint
    if (actingUserId && payment?.user_id && payment.user_id !== actingUserId) {
      throw new ForbiddenException('You do not have permission to verify this order');
    }

    // Idempotency: if already SUCCESS, return safely
    if (payment && payment.payment_status === PaymentStatus.SUCCESS) {
      return {
        status: 'SUCCESS',
        message: 'Payment has already been verified',
        order_id: orderId,
        payment,
      };
    }

    if (existingTx && existingTx.status === 'SUCCESS') {
      return {
        status: 'SUCCESS',
        message: 'Payment has already been verified',
        order_id: orderId,
        payment: {
          id: existingTx.id,
          amount: Number(existingTx.amount),
          gateway_order_id: orderId,
          payment_status: 'SUCCESS',
        },
      };
    }

    // 2. Query Cashfree for actual payment attempts
    const attempts = await this.cashfreeService.getPaymentAttempts(orderId);
    const successfulAttempt = attempts.find((att) => att.payment_status === 'SUCCESS');

    if (!successfulAttempt) {
      this.logger.warn(`Verification called for order ${orderId}, but no SUCCESS attempt found. Status remains PENDING.`);
      const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
      return {
        status: 'PENDING',
        message: 'No successful payment attempt confirmed yet by Cashfree',
        order_id: orderId,
        attempts_count: attempts.length,
        latest_status: (latestAttempt?.payment_status as string) || undefined,
        latest_message: ((latestAttempt as any)?.payment_message as string) || undefined,
      };
    }

    // 3. Amount & Currency checks
    const expectedAmount = payment ? Number(payment.amount) : Number(existingTx?.amount || 0);
    const paidAmount = Number(successfulAttempt.payment_amount);

    if (paidAmount > 0 && Math.abs(paidAmount - expectedAmount) > 0.01) {
      throw new BadRequestException(
        `Payment amount mismatch: expected INR ${expectedAmount}, received INR ${paidAmount}`,
      );
    }

    if (successfulAttempt.payment_currency && successfulAttempt.payment_currency !== 'INR') {
      throw new BadRequestException(`Invalid payment currency: ${successfulAttempt.payment_currency}`);
    }

    const cfPaymentId = String(successfulAttempt.cf_payment_id);

    if (!payment && existingTx) {
      existingTx.status = 'SUCCESS';
      existingTx.gateway_payment_id = cfPaymentId;
      await this.transactionsRepo.save(existingTx);
      return {
        status: 'SUCCESS',
        order_id: orderId,
        message: 'Membership registration payment confirmed',
        payment: {
          id: existingTx.id,
          amount: expectedAmount,
          gateway_order_id: orderId,
          gateway_payment_id: cfPaymentId,
          payment_status: 'SUCCESS',
        },
      };
    }

    // 4. Delegate atomically to the verified service contract
    if (isDonation) {
      const verifyResult = await this.donationPaymentsService.verify(
        payment!.id,
        {
          gateway_payment_id: cfPaymentId,
          gateway_order_id: orderId,
          gateway_signature: String(successfulAttempt.payment_time || 'CASHFREE_VERIFIED'),
          gateway_payload: successfulAttempt as Record<string, unknown>,
        },
        actingUserId || payment!.user_id || 'SYSTEM_CASHFREE',
        true,
      );

      // Update transaction status
      await this.transactionsRepo.update(
        { gateway_order_id: orderId },
        {
          gateway_payment_id: cfPaymentId,
          status: 'SUCCESS',
          raw_payload: successfulAttempt as any,
        },
      );

      return {
        status: 'SUCCESS',
        order_id: orderId,
        payment: verifyResult.payment,
        receipt: verifyResult.receipt,
      };
    } else {
      const verifyResult = await this.membershipPaymentsService.verify(
        payment!.id,
        {
          gateway_payment_id: cfPaymentId,
          gateway_order_id: orderId,
          gateway_signature: String(successfulAttempt.payment_time || 'CASHFREE_VERIFIED'),
          gateway_payload: successfulAttempt as Record<string, unknown>,
        },
        actingUserId || payment!.user_id || 'SYSTEM_CASHFREE',
        true,
      );

      // Update transaction status
      await this.transactionsRepo.update(
        { gateway_order_id: orderId },
        {
          gateway_payment_id: cfPaymentId,
          status: 'SUCCESS',
          raw_payload: successfulAttempt as any,
        },
      );

      return {
        status: 'SUCCESS',
        order_id: orderId,
        payment: verifyResult.payment,
        receipt: verifyResult.receipt,
      };
    }
  }

  async processWebhook(payload: Record<string, unknown>) {
    // Cashfree PG webhook formats: payload.data.order.order_id or payload.order.order_id or payload.data.order_id
    const dataObj = (payload?.data as Record<string, unknown>) || {};
    const orderObj = (dataObj?.order as Record<string, unknown>) || (payload?.order as Record<string, unknown>) || {};
    const orderId =
      (orderObj.order_id as string) ||
      (dataObj.order_id as string) ||
      (payload.order_id as string);

    if (!orderId) {
      this.logger.warn(`Cashfree webhook received with no detectable order_id: ${JSON.stringify(payload)}`);
      return { received: true, ignored: true, reason: 'missing_order_id' };
    }

    this.logger.log(`Processing Cashfree webhook for order_id: ${orderId}`);
    const result = await this.verifyOrder(orderId);
    return { received: true, ...result };
  }
}
