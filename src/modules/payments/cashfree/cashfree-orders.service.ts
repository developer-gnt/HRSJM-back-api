import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';
import { DonationEntity } from '../../donations/entities/donation.entity';
import { DonationPaymentEntity } from '../../donation-payments/entities/donation-payment.entity';
import { DonationPaymentsService } from '../../donation-payments/services/donation-payments.service';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import { MembershipPaymentEntity } from '../../membership-payments/entities/membership-payment.entity';
import { PaymentTransactionEntity } from '../../membership-payments/entities/payment-transaction.entity';
import { ReceiptEntity } from '../../membership-payments/entities/receipt.entity';
import { MembershipPaymentsService } from '../../membership-payments/services/membership-payments.service';
import { CashfreeService } from './cashfree.service';
import { CreateCashfreeOrderDto } from './dto/create-cashfree-order.dto';
import { CreateCashfreeSubscriptionDto } from './dto/create-cashfree-subscription.dto';
import { SubscriptionEntity } from './entities/subscription.entity';
import { RenewalRequestEntity } from '../../renewals/entities/renewal-request.entity';
import { RenewalCalculationService } from '../../renewals/services/renewal-calculation.service';
import { UserEntity } from '../../users/entities/user.entity';
import { EventEntity } from '../../events/entities/event.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function toValidUuid(val?: string | null): string | undefined {
  return val && UUID_REGEX.test(val) ? val : undefined;
}

@Injectable()
export class CashfreeOrdersService {
  private readonly logger = new Logger(CashfreeOrdersService.name);

  private async getDbUser(userId?: string | null): Promise<UserEntity | null> {
    const validId = toValidUuid(userId);
    if (!validId || !this.dataSource) return null;
    try {
      const usersRepo = this.dataSource.getRepository(UserEntity);
      return await usersRepo.findOne({ where: { id: validId } });
    } catch (err: any) {
      this.logger.warn(`Could not lookup user ${validId}: ${err?.message}`);
      return null;
    }
  }

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
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionsRepo: Repository<SubscriptionEntity>,
    private readonly dataSource: DataSource,
    @Optional()
    @InjectRepository(DonationEntity)
    private readonly donationsRepo?: Repository<DonationEntity>,
    @Optional()
    @InjectRepository(MembershipEntity)
    private readonly membershipsRepo?: Repository<MembershipEntity>,
    @Optional()
    @InjectRepository(RenewalRequestEntity)
    private readonly renewalsRepo?: Repository<RenewalRequestEntity>,
    @Optional()
    private readonly renewalCalculationService?: RenewalCalculationService,
  ) {}

  private getDonationsRepo(): Repository<DonationEntity> | null {
    if (this.donationsRepo) return this.donationsRepo;
    if (this.dataSource && typeof this.dataSource.getRepository === 'function') {
      try {
        return this.dataSource.getRepository(DonationEntity);
      } catch {
        return null;
      }
    }
    return null;
  }

  private getMembershipsRepo(): Repository<MembershipEntity> | null {
    if (this.membershipsRepo) return this.membershipsRepo;
    if (this.dataSource && typeof this.dataSource.getRepository === 'function') {
      try {
        return this.dataSource.getRepository(MembershipEntity);
      } catch {
        return null;
      }
    }
    return null;
  }

  private getRenewalsRepo(): Repository<RenewalRequestEntity> | null {
    if (this.renewalsRepo) return this.renewalsRepo;
    if (this.dataSource && typeof this.dataSource.getRepository === 'function') {
      try {
        return this.dataSource.getRepository(RenewalRequestEntity);
      } catch {
        return null;
      }
    }
    return null;
  }

  private toValidUuidOrNull(val?: string | null): string | null {
    if (!val) return null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(val) ? val : null;
  }

  async createOrder(dto: CreateCashfreeOrderDto, actingUserId?: string, idempotencyKey?: string) {
    if (dto.purpose === 'donation') {
      return this.createDonationOrder(dto, actingUserId, idempotencyKey, dto.return_url);
    } else if (dto.purpose === 'membership') {
      return this.createMembershipOrder(dto, actingUserId, idempotencyKey, dto.return_url);
    } else {
      throw new BadRequestException(`Unsupported payment purpose: ${dto.purpose}`);
    }
  }

  private async createDonationOrder(
    dto: CreateCashfreeOrderDto,
    actingUserId?: string,
    idempotencyKey?: string,
    returnUrl?: string,
  ) {
    let payment: DonationPaymentEntity | null = null;
    const paymentId = dto.reference_id?.trim();
    const validActingUserId = this.toValidUuidOrNull(actingUserId) || this.toValidUuidOrNull(dto.user_id);

    if (paymentId) {
      payment = await this.donationPaymentsRepo.findOne({
        where: { id: paymentId },
        relations: ['donation'],
      });

      // If not a donation payment ID, check if it's a DonationEntity ID
      if (!payment) {
        const donationsRepo = this.getDonationsRepo();
        if (donationsRepo) {
          const donation = await donationsRepo.findOne({
            where: { id: paymentId },
          });

          if (donation) {
            payment = await this.donationPaymentsRepo.findOne({
              where: { donation_id: donation.id, payment_status: PaymentStatus.PENDING },
              relations: ['donation'],
            });

            if (!payment) {
              const amount = Number(dto.amount !== undefined && dto.amount > 0 ? dto.amount : donation.amount);
              payment = this.donationPaymentsRepo.create({
                donation_id: donation.id,
                user_id: this.toValidUuidOrNull(donation.created_by) || validActingUserId,
                amount,
                payment_method: 'CASHFREE',
                payment_status: PaymentStatus.PENDING,
                created_by: validActingUserId,
                updated_by: validActingUserId,
              });
              payment = await this.donationPaymentsRepo.save(payment);
              payment.donation = donation;
            }
          }
        }
      }
    }

    // Direct donation checkout when amount is supplied without prior record
    if (!payment) {
      const donationAmount = Number(dto.amount);
      if (!Number.isFinite(donationAmount) || donationAmount <= 0) {
        if (paymentId) {
          throw new NotFoundException(`Donation payment record ${paymentId} not found`);
        }
        throw new BadRequestException('Donation payment order requires a valid positive amount');
      }

      const donationsRepo = this.getDonationsRepo();
      if (donationsRepo) {
        if (dto.event_id && this.dataSource) {
          try {
            const eventsRepo = this.dataSource.getRepository(EventEntity);
            const ev = await eventsRepo.findOne({ where: { id: dto.event_id } });
            if (ev && !ev.is_donation_enabled) {
              throw new BadRequestException(
                `Donations are currently disabled for event "${ev.title}".`,
              );
            }
          } catch (err: any) {
            if (err instanceof BadRequestException) throw err;
          }
        }

        const dbUser = await this.getDbUser(validActingUserId);
        const remarkParts: string[] = [];
        if (dto.event_id) remarkParts.push(`Event ID: ${dto.event_id}`);
        if (dto.pan_number) remarkParts.push(`80G PAN: ${dto.pan_number}`);
        const finalRemark = remarkParts.length > 0 ? remarkParts.join(' | ') : 'Donation from Website';

        const newDonation = donationsRepo.create({
          user_id: validActingUserId,
          donor_name: dbUser?.full_name || dto.customer_name || 'Kind Citizen',
          donor_mobile: dbUser?.mobile_number || dto.customer_phone || '',
          donor_email: dbUser?.email || dto.customer_email || null,
          cause: dto.order_note || (dto.event_id ? `Event Donation: ${dto.event_id}` : 'General Support & Human Rights Protection'),
          amount: donationAmount,
          status: 'PENDING',
          remark: finalRemark,
          source: dto.event_id ? 'Event' : 'Website',
          created_by: validActingUserId,
          updated_by: validActingUserId,
        });
        const savedDonation = await donationsRepo.save(newDonation);

        payment = this.donationPaymentsRepo.create({
          donation_id: savedDonation.id,
          user_id: validActingUserId,
          amount: donationAmount,
          payment_method: 'CASHFREE',
          payment_status: PaymentStatus.PENDING,
          created_by: validActingUserId,
          updated_by: validActingUserId,
        });
        payment = await this.donationPaymentsRepo.save(payment);
        payment.donation = savedDonation;
      }
    }

    if (!payment) {
      throw new NotFoundException(`Donation payment ${paymentId || ''} not found`);
    }

    if (payment.payment_status === PaymentStatus.SUCCESS) {
      throw new BadRequestException('Donation payment has already been completed');
    }

    const safeActingUuid = toValidUuid(actingUserId) || validActingUserId;
    if (payment.user_id && actingUserId && payment.user_id !== actingUserId) {
      throw new ForbiddenException('You do not own this donation payment');
    }

    // Authoritatively fetch current user's profile from database
    const dbUser = await this.getDbUser(safeActingUuid || payment.user_id);

    const orderAmount = Number(dto.amount !== undefined && dto.amount > 0 ? dto.amount : payment.amount);
    // Cashfree order_id max length is 45 chars
    const orderId = `hrsjm_don_${payment.id.replace(/-/g, '').slice(0, 16)}_${Date.now().toString(36)}`;

    // Prioritize mobile number fetched from current user's database record
    const rawPhone = dbUser?.mobile_number || dto.customer_phone || payment.donation?.donor_mobile || '';
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    const customerPhone = cleanPhone.length === 10 ? cleanPhone : '70210578530';

    const customerId = (payment.user_id || safeActingUuid || payment.id).replace(/-/g, '').slice(0, 45);
    const rawName = dbUser?.full_name || dto.customer_name || payment.donation?.donor_name || 'HRSJM Donor';
    const customerName = rawName.replace(/[^a-zA-Z0-9 ]/g, ' ').slice(0, 50).trim() || 'HRSJM Donor';
    const customerEmail = dbUser?.email || dto.customer_email || payment.donation?.donor_email || 'donor@hrsjm.org';
    const cleanCause = (dto.order_note || payment.donation?.cause || 'Donation').replace(/&amp;/g, '&').replace(/[^a-zA-Z0-9 -]/g, ' ').slice(0, 40);

    const cfOrder = await this.cashfreeService.createOrder({
      orderId,
      amount: orderAmount,
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      purpose: `Donation: ${cleanCause}`.slice(0, 80),
      idempotencyKey,
      returnUrl,
    });

    // Save gateway_order_id on payment
    payment.gateway_order_id = cfOrder.order_id;
    payment.payment_method = 'CASHFREE';
    payment.amount = orderAmount;
    await this.donationPaymentsRepo.save(payment);

    // Record initial transaction
    const tx = this.transactionsRepo.create({
      donation_payment_id: payment.id,
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
      purpose: 'donation',
      reference_id: payment.id,
      environment: this.cashfreeService.environment,
    };
  }

  private async createMembershipOrder(
    dto: CreateCashfreeOrderDto,
    actingUserId?: string,
    idempotencyKey?: string,
    returnUrl?: string,
  ) {
    let payment: MembershipPaymentEntity | null = null;
    const refId = dto.reference_id?.trim();
    const validActingUserId = this.toValidUuidOrNull(actingUserId) || this.toValidUuidOrNull(dto.user_id);

    if (refId) {
      payment = await this.membershipPaymentsRepo.findOne({
        where: { id: refId },
        relations: ['user', 'membership'],
      });

      // If not a membership payment ID, check if it's a MembershipEntity ID
      if (!payment) {
        const membershipsRepo = this.getMembershipsRepo();
        if (membershipsRepo) {
          const membership = await membershipsRepo.findOne({
            where: { id: refId },
            relations: ['category', 'user'],
          });

          if (membership) {
            payment = await this.membershipPaymentsRepo.findOne({
              where: { membership_id: membership.id, payment_status: PaymentStatus.PENDING },
              relations: ['user', 'membership'],
            });

            if (!payment) {
              const amount = Number(
                dto.amount !== undefined && dto.amount > 0
                  ? dto.amount
                  : (membership.category?.fee || 3000),
              );
              payment = this.membershipPaymentsRepo.create({
                membership_id: membership.id,
                user_id: this.toValidUuidOrNull(membership.user_id) || validActingUserId || membership.id,
                amount,
                payment_method: 'CASHFREE',
                payment_status: PaymentStatus.PENDING,
                created_by: validActingUserId || undefined,
                updated_by: validActingUserId || undefined,
              });
              payment = await this.membershipPaymentsRepo.save(payment);
              payment.membership = membership;
              payment.user = membership.user;
            }
          }
        }
      }
    }

    const safeActingUuid = toValidUuid(actingUserId);
    if (payment) {
      if (payment.payment_status === PaymentStatus.SUCCESS) {
        throw new BadRequestException('Membership payment has already been completed');
      }

      if (payment.user_id && actingUserId && payment.user_id !== actingUserId) {
        throw new ForbiddenException('You do not own this membership payment');
      }

      // Authoritatively fetch current user's profile from database
      const dbUser = await this.getDbUser(safeActingUuid || payment.user_id);

      // Check if renewal payment and recalculate authoritative quote on server (Test 9)
      let renewalQuote: any = null;
      const mem =
        payment.membership ||
        (this.getMembershipsRepo()
          ? await this.getMembershipsRepo()!.findOne({ where: { id: payment.membership_id } })
          : null);

      const isRenewal =
        dto.order_note?.toLowerCase().includes('renewal') ||
        (mem && mem.status === MembershipStatus.EXPIRED) ||
        (mem && mem.expiry_date && new Date(mem.expiry_date).getTime() < Date.now());

      if (isRenewal && mem) {
        if (mem.expiry_date) {
          const now = new Date();
          const currentExpiry = new Date(mem.expiry_date);
          const isOverdue = currentExpiry.getTime() < now.getTime();
          const daysRemaining = !isOverdue
            ? Math.ceil((currentExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          if (!isOverdue && daysRemaining > 30) {
            throw new BadRequestException({
              message: 'Membership renewal is allowed only within 30 days before the expiry date.',
              code: 'RENEWAL_WINDOW_NOT_OPEN',
              details: { daysRemaining, expiryDate: mem.expiry_date },
            });
          }
        }

        if (this.renewalCalculationService) {
          const renewalsRepo = this.getRenewalsRepo();
          const pastRenewals = renewalsRepo
            ? await renewalsRepo.find({
                where: { membership_id: mem.id },
                order: { created_at: 'ASC' },
              })
            : [];

          renewalQuote = this.renewalCalculationService.calculateQuote({
            membership: mem,
            successfulRenewals: pastRenewals,
          });

          if (renewalQuote.requires_verification) {
            throw new BadRequestException({
              message: `Membership renewal requires administrative verification: ${renewalQuote.verification_reason}`,
              code: 'MEMBERSHIP_VERIFICATION_REQUIRED',
              details: { reason: renewalQuote.verification_reason },
            });
          }

          if (!renewalQuote.is_eligible_for_renewal) {
            throw new BadRequestException({
              message: renewalQuote.renewal_validation_message || 'Membership renewal is allowed only within 30 days before the expiry date.',
              code: 'RENEWAL_WINDOW_NOT_OPEN',
              details: { daysRemaining: renewalQuote.days_remaining },
            });
          }

          // Validate amount against authoritative quote (Test 9)
          if (dto.amount !== undefined && Math.abs(dto.amount - renewalQuote.total_payable) > 0.01) {
            throw new BadRequestException({
              message: `Payable amount mismatch: server quoted INR ${renewalQuote.total_payable}, but received INR ${dto.amount}`,
              code: 'RENEWAL_AMOUNT_MISMATCH',
              details: { expected: renewalQuote.total_payable, provided: dto.amount },
            });
          }
        }
      }

      const orderAmount = renewalQuote
        ? renewalQuote.total_payable
        : Number(dto.amount !== undefined && dto.amount > 0 ? dto.amount : payment.amount);
      const orderId = `hrsjm_mem_${payment.id.replace(/-/g, '').slice(0, 16)}_${Date.now().toString(36)}`;

      // Prioritize mobile number fetched from current user's database record
      const rawPhone = dbUser?.mobile_number || dto.customer_phone || payment.user?.mobile_number || '';
      const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
      const customerPhone = cleanPhone.length === 10 ? cleanPhone : '70210578530';

      const customerId = (payment.user_id || safeActingUuid || validActingUserId || 'applicant').replace(/-/g, '').slice(0, 45);
      const rawName = dbUser?.full_name || dto.customer_name || payment.user?.full_name || 'HRSJM Member';
      const customerName = rawName.replace(/[^a-zA-Z0-9 ]/g, ' ').slice(0, 50).trim() || 'HRSJM Member';
      const customerEmail = dbUser?.email || dto.customer_email || payment.user?.email || 'member@hrsjm.org';
      const purposeNote = `Membership Fee ${payment.membership_id.slice(0, 8)}`.slice(0, 50);

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
      if (renewalQuote) {
        payment.notes = JSON.stringify({
          type: 'MEMBERSHIP_RENEWAL',
          periods_count: renewalQuote.periods.length,
          unpaid_periods_count: renewalQuote.unpaid_periods_count,
          total_payable: renewalQuote.total_payable,
          renewal_subtotal: renewalQuote.renewal_subtotal,
        });
      }
      await this.membershipPaymentsRepo.save(payment);

      const tx = this.transactionsRepo.create({
        membership_payment_id: payment.id,
        gateway_name: 'CASHFREE',
        gateway_order_id: cfOrder.order_id,
        amount: orderAmount,
        status: 'INITIATED',
        raw_payload: cfOrder as Record<string, unknown>,
        created_by: safeActingUuid || validActingUserId || undefined,
        updated_by: safeActingUuid || validActingUserId || undefined,
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
    const customerPhone = cleanPhone.length === 10 ? cleanPhone : '70210578530';

    const customerId = (validActingUserId || `cust_${Date.now()}`).replace(/-/g, '').slice(0, 45);
    const customerName = (dto.customer_name || 'HRSJM Member Applicant').replace(/[^a-zA-Z0-9 ]/g, ' ').slice(0, 50).trim() || 'HRSJM Member Applicant';
    const customerEmail = dto.customer_email || 'member@hrsjm.org';
    const purposeNote = (dto.order_note || 'Membership Registration Fee').replace(/[^a-zA-Z0-9 -]/g, ' ').slice(0, 50);

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
      created_by: toValidUuid(actingUserId) || validActingUserId || undefined,
      updated_by: toValidUuid(actingUserId) || validActingUserId || undefined,
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
    const validActingUserId = this.toValidUuidOrNull(actingUserId);

    // 1. Identify which payment belongs to this orderId
    let donationPayment = await this.donationPaymentsRepo.findOne({
      where: { gateway_order_id: orderId },
      relations: ['donation'],
    });

    // Fallback: If donation payment not found by gateway_order_id, resolve by orderId prefix/reference
    if (!donationPayment && orderId.startsWith('hrsjm_don_')) {
      const parts = orderId.split('_');
      const cleanRef = parts[2] || '';
      if (cleanRef.length >= 8) {
        donationPayment = await this.donationPaymentsRepo
          .createQueryBuilder('dp')
          .leftJoinAndSelect('dp.donation', 'donation')
          .where('REPLACE(dp.id, "-", "") LIKE :ref', { ref: `${cleanRef}%` })
          .orWhere('REPLACE(dp.donation_id, "-", "") LIKE :ref', { ref: `${cleanRef}%` })
          .orderBy('dp.created_at', 'DESC')
          .getOne();

        if (donationPayment) {
          donationPayment.gateway_order_id = orderId;
          await this.donationPaymentsRepo.save(donationPayment);
        } else {
          const donationsRepo = this.getDonationsRepo();
          if (donationsRepo) {
            const donation = await donationsRepo
              .createQueryBuilder('d')
              .where('REPLACE(d.id, "-", "") LIKE :ref', { ref: `${cleanRef}%` })
              .getOne();

            if (donation) {
              donationPayment = this.donationPaymentsRepo.create({
                donation_id: donation.id,
                user_id: donation.user_id,
                amount: donation.amount,
                payment_method: 'CASHFREE',
                payment_status: PaymentStatus.PENDING,
                gateway_order_id: orderId,
              });
              donationPayment = await this.donationPaymentsRepo.save(donationPayment);
              donationPayment.donation = donation;
            }
          }
        }
      }
    }

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
      // Direct Cashfree lookup fallback before failing (e.g. registration order created without DB record)
      try {
        const cfOrder = await this.cashfreeService.getOrder(orderId);
        if (cfOrder) {
          const attempts = (await this.cashfreeService.getPaymentAttempts(orderId)) || [];
          const successfulAttempt =
            attempts.find((att: any) => att.payment_status === 'SUCCESS') ||
            (cfOrder.order_status === 'PAID'
              ? ({
                  cf_payment_id: Date.now(),
                  order_id: orderId,
                  payment_status: 'SUCCESS',
                  payment_amount: cfOrder.order_amount || 0,
                  payment_currency: 'INR',
                  payment_message: 'Confirmed via Cashfree order status',
                  payment_time: new Date().toISOString(),
                } as any)
              : null);

          if (successfulAttempt && (orderId.startsWith('hrsjm_don_') || String(cfOrder.order_note || '').toLowerCase().includes('donation'))) {
            const donationsRepo = this.getDonationsRepo();
            const donorName = (cfOrder.customer_details as any)?.customer_name || 'Website Donor';
            const donorPhone = (cfOrder.customer_details as any)?.customer_phone || '';
            const donorEmail = (cfOrder.customer_details as any)?.customer_email || null;
            const amount = Number(successfulAttempt.payment_amount || cfOrder.order_amount || 0);

            let donation: DonationEntity | null = null;
            if (donationsRepo) {
              donation = donationsRepo.create({
                donor_name: donorName,
                donor_mobile: donorPhone,
                donor_email: donorEmail,
                cause: String(cfOrder.order_note || 'General Support & Human Rights Protection'),
                amount,
                status: 'PENDING',
                remark: 'Donation verified via Cashfree direct order',
                source: 'Website',
              });
              donation = await donationsRepo.save(donation);
            }

            donationPayment = this.donationPaymentsRepo.create({
              donation_id: donation?.id,
              amount,
              payment_method: 'CASHFREE',
              payment_status: PaymentStatus.PENDING,
              gateway_order_id: orderId,
            });
            donationPayment = await this.donationPaymentsRepo.save(donationPayment);
            if (donation) {
              donationPayment.donation = donation;
            }
          } else if (successfulAttempt) {
            const newTx = this.transactionsRepo.create({
              gateway_name: 'CASHFREE',
              gateway_order_id: orderId,
              gateway_payment_id: String(successfulAttempt.cf_payment_id),
              amount: Number(successfulAttempt.payment_amount || cfOrder.order_amount || 0),
              status: 'SUCCESS',
              raw_payload: cfOrder as Record<string, unknown>,
            });
            await this.transactionsRepo.save(newTx);

            return {
              status: 'SUCCESS',
              order_id: orderId,
              message: 'Membership registration payment confirmed via gateway',
              payment: {
                id: newTx.id,
                amount: Number(newTx.amount),
                gateway_order_id: orderId,
                gateway_payment_id: String(successfulAttempt.cf_payment_id),
                payment_status: 'SUCCESS',
              },
            };
          }
        }
      } catch (directErr: any) {
        this.logger.warn(`Gateway fallback lookup for ${orderId}: ${directErr.message}`);
      }

      throw new NotFoundException(`No payment record found with gateway_order_id: ${orderId}`);
    }

    const isDonation = !!donationPayment;
    const payment = isDonation ? donationPayment : membershipPayment;

    // Optional ownership check when called from authenticated user endpoint
    if (actingUserId && payment?.user_id && payment.user_id !== actingUserId) {
      throw new ForbiddenException('You do not have permission to verify this order');
    }

    // Idempotency: if already SUCCESS, return safely with receipt attached
    if (payment && payment.payment_status === PaymentStatus.SUCCESS) {
      let receipt: any = null;
      try {
        const receiptsRepo = this.dataSource.getRepository(ReceiptEntity);
        if (isDonation) {
          receipt = await receiptsRepo.findOne({
            where: { donation_payment_id: payment.id },
          });
        } else {
          receipt = (payment as any).receipt || (await receiptsRepo.findOne({
            where: { membership_payment_id: payment.id },
          }));
        }
      } catch (receiptLookupErr) {
        this.logger.warn(`Could not lookup receipt for already verified payment ${payment.id}: ${receiptLookupErr}`);
      }

      return {
        status: 'SUCCESS',
        message: 'Payment has already been verified',
        order_id: orderId,
        payment,
        receipt,
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

    // 2. Query Cashfree for actual payment attempts and order status with brief retry tolerance
    let attempts: any[] = [];
    let cfOrder: any = null;
    let successfulAttempt: any = null;

    const maxQueryAttempts = 3;
    for (let tryCount = 1; tryCount <= maxQueryAttempts; tryCount++) {
      try {
        attempts = (await this.cashfreeService.getPaymentAttempts(orderId)) || [];
      } catch (err) {
        this.logger.warn(`Could not fetch attempts for order ${orderId} (attempt ${tryCount}): ${(err as Error).message}`);
      }

      try {
        cfOrder = await this.cashfreeService.getOrder(orderId);
      } catch (err) {
        this.logger.warn(`Could not fetch order details for ${orderId} (attempt ${tryCount}): ${(err as Error).message}`);
      }

      successfulAttempt = attempts.find((att: any) => att.payment_status === 'SUCCESS');

      // If order was marked PAID by Cashfree directly, treat as successful
      if (!successfulAttempt && cfOrder?.order_status === 'PAID') {
        successfulAttempt = {
          cf_payment_id: Date.now(),
          order_id: orderId,
          payment_status: 'SUCCESS',
          payment_amount: cfOrder.order_amount || (payment ? Number(payment.amount) : 0),
          payment_currency: 'INR',
          payment_message: 'Confirmed via Cashfree order status',
          payment_time: new Date().toISOString(),
        } as any;
      }

      if (successfulAttempt) {
        break;
      }

      // If user arrives immediately after checkout, allow brief delay for Cashfree cluster to index attempt
      if (tryCount < maxQueryAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    if (!successfulAttempt) {
      const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
      const failureReason =
        (latestAttempt as any)?.payment_message ||
        (cfOrder?.order_status === 'EXPIRED'
          ? 'Payment session expired'
          : cfOrder?.order_status === 'TERMINATED'
          ? 'Payment session terminated'
          : 'Payment cancelled or not completed on Cashfree');

      this.logger.warn(`Verification for order ${orderId}: no SUCCESS confirmed. Updating status to FAILED.`);

      if (isDonation && donationPayment) {
        donationPayment.payment_status = PaymentStatus.FAILED;
        donationPayment.notes = failureReason;
        await this.donationPaymentsRepo.save(donationPayment);
      } else if (membershipPayment) {
        membershipPayment.payment_status = PaymentStatus.FAILED;
        membershipPayment.notes = failureReason;
        await this.membershipPaymentsRepo.save(membershipPayment);
      }

      if (existingTx) {
        existingTx.status = 'FAILED';
        await this.transactionsRepo.save(existingTx);
      }

      return {
        status: 'FAILED',
        message: failureReason,
        order_id: orderId,
        attempts_count: attempts.length,
        latest_status: (latestAttempt?.payment_status as string) || cfOrder?.order_status || 'FAILED',
        latest_message: failureReason,
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

    // 4. Delegate atomically to the verified service contract with webhook concurrency resilience
    const fallbackActorId = '6b481b29-d4ec-4bad-8bde-4e21d8bb2d26';
    const actorId = validActingUserId || this.toValidUuidOrNull(payment!.user_id) || fallbackActorId;

    if (isDonation) {
      let verifyResult: any;
      try {
        verifyResult = await this.donationPaymentsService.verify(
          payment!.id,
          {
            gateway_payment_id: cfPaymentId,
            gateway_order_id: orderId,
            gateway_signature: String(successfulAttempt.payment_time || 'CASHFREE_VERIFIED'),
            gateway_payload: successfulAttempt as Record<string, unknown>,
          },
          actorId,
          true,
        );
      } catch (verifyErr: any) {
        this.logger.warn(
          `Donation payment verify caught exception (${verifyErr?.message}). Checking if concurrently processed by webhook...`,
        );
        const recheckPayment = await this.donationPaymentsRepo.findOne({
          where: { id: payment!.id },
          relations: ['donation'],
        });
        if (recheckPayment && recheckPayment.payment_status === PaymentStatus.SUCCESS) {
          let receipt: any = null;
          try {
            receipt = await this.dataSource.getRepository(ReceiptEntity).findOne({
              where: { donation_payment_id: recheckPayment.id },
            });
          } catch {}
          return {
            status: 'SUCCESS',
            order_id: orderId,
            message: 'Payment has already been verified',
            payment: recheckPayment,
            receipt,
          };
        }
        throw verifyErr;
      }

      // Update transaction status
      try {
        await this.transactionsRepo.update(
          { gateway_order_id: orderId },
          {
            gateway_payment_id: cfPaymentId,
            status: 'SUCCESS',
            raw_payload: successfulAttempt as any,
          },
        );
      } catch (txErr: any) {
        this.logger.warn(`Could not update transaction status for order ${orderId}: ${txErr?.message}`);
      }

      return {
        status: 'SUCCESS',
        order_id: orderId,
        payment: verifyResult.payment,
        receipt: verifyResult.receipt,
      };
    } else {
      let verifyResult: any;
      try {
        verifyResult = await this.membershipPaymentsService.verify(
          payment!.id,
          {
            gateway_payment_id: cfPaymentId,
            gateway_order_id: orderId,
            gateway_signature: String(successfulAttempt.payment_time || 'CASHFREE_VERIFIED'),
            gateway_payload: successfulAttempt as Record<string, unknown>,
          },
          actorId,
          true,
        );
      } catch (verifyErr: any) {
        this.logger.warn(
          `Membership payment verify caught exception (${verifyErr?.message}). Checking if concurrently processed by webhook...`,
        );
        const recheckPayment = await this.membershipPaymentsRepo.findOne({
          where: { id: payment!.id },
          relations: ['receipt', 'membership'],
        });
        if (recheckPayment && recheckPayment.payment_status === PaymentStatus.SUCCESS) {
          return {
            status: 'SUCCESS',
            order_id: orderId,
            message: 'Payment has already been verified',
            payment: recheckPayment,
            receipt: recheckPayment.receipt,
          };
        }
        throw verifyErr;
      }

      // Update transaction status
      try {
        await this.transactionsRepo.update(
          { gateway_order_id: orderId },
          {
            gateway_payment_id: cfPaymentId,
            status: 'SUCCESS',
            raw_payload: successfulAttempt as any,
          },
        );
      } catch (txErr: any) {
        this.logger.warn(`Could not update transaction status for order ${orderId}: ${txErr?.message}`);
      }

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

    // Check if this is a subscription webhook
    const subObj =
      (dataObj?.subscription as Record<string, unknown>) ||
      (payload?.subscription as Record<string, unknown>) ||
      {};
    const subscriptionId =
      (subObj.subscription_id as string) ||
      (dataObj.subscription_id as string) ||
      (payload.subscription_id as string) ||
      (payload.sub_id as string);

    if (subscriptionId && !orderId) {
      this.logger.log(`Processing Cashfree webhook for subscription_id: ${subscriptionId}`);
      try {
        const subResult = await this.getSubscriptionStatus(subscriptionId);
        return { received: true, subscription: subResult };
      } catch (err: any) {
        this.logger.warn(`Failed to process subscription webhook: ${err?.message}`);
        return { received: true, error: err?.message };
      }
    }

    if (!orderId) {
      this.logger.warn(`Cashfree webhook received with no detectable order_id or subscription_id: ${JSON.stringify(payload)}`);
      return { received: true, ignored: true, reason: 'missing_id' };
    }

    this.logger.log(`Processing Cashfree webhook for order_id: ${orderId}`);
    const result = await this.verifyOrder(orderId);
    return { received: true, ...result };
  }

  /**
   * Create a recurring AutoPay subscription in Cashfree
   */
  async createSubscription(
    dto: CreateCashfreeSubscriptionDto,
    actingUserId?: string,
  ) {
    const validActingUserId = this.toValidUuidOrNull(actingUserId) || this.toValidUuidOrNull(dto.user_id);
    const dbUser = await this.getDbUser(validActingUserId);

    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Subscription requires a valid positive recurring amount');
    }

    const frequency = dto.frequency || 'MONTHLY';
    const purpose = (dto.purpose || 'donation').toUpperCase() as 'DONATION' | 'MEMBERSHIP';

    const customerName = (dbUser?.full_name || dto.customer_name || 'HRSJM Supporter')
      .replace(/[^a-zA-Z0-9 ]/g, ' ')
      .slice(0, 100)
      .trim();
    const rawPhone = dbUser?.mobile_number || dto.customer_phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    const customerPhone = cleanPhone.length === 10 ? cleanPhone : '9876543210';
    const customerEmail = (dbUser?.email || dto.customer_email || 'donor@hrsjm.org').toLowerCase().trim();
    const customerId = (validActingUserId || `cust_${Date.now()}`).replace(/-/g, '').slice(0, 45);

    // Subscription ID (Cashfree requires <= 45 chars alphanumeric/underscore/hyphen)
    const subPrefix = purpose === 'MEMBERSHIP' ? 'sub_mem' : 'sub_don';
    const subscriptionId = `${subPrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    const maxAmount = Number(dto.max_amount || Math.max(amount * 2, 5000));
    const planName = `HRSJM_${frequency}_${Math.round(amount)}`;

    const cfSub = await this.cashfreeService.createSubscription({
      subscriptionId,
      amount,
      maxAmount,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      frequency,
      planName,
      planNote: dto.plan_note || `${frequency} Recurring ${purpose === 'DONATION' ? 'Donation' : 'Membership'} - HRSJM`,
      authAmount: 1,
      returnUrl: dto.return_url,
    });

    const subscription = this.subscriptionsRepo.create({
      user_id: validActingUserId,
      subscription_id: subscriptionId,
      subscription_session_id: cfSub.subscription_session_id || null,
      purpose,
      reference_id: dto.reference_id || null,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      plan_name: planName,
      plan_type: 'PERIODIC',
      frequency,
      currency: 'INR',
      amount,
      max_amount: maxAmount,
      auth_amount: 1,
      status: 'INITIALIZED',
      payment_methods: ['upi', 'card', 'enach'],
      raw_details: cfSub as any,
      metadata: {
        event_id: dto.event_id || null,
        pan_number: dto.pan_number || null,
        plan_note: dto.plan_note || null,
        sandbox_profile_inactive: (cfSub as any)?.sandbox_profile_inactive || false,
      },
    });

    const saved = await this.subscriptionsRepo.save(subscription);

    return {
      success: true,
      subscription_id: saved.subscription_id,
      subscription_session_id: saved.subscription_session_id,
      amount: saved.amount,
      currency: saved.currency,
      frequency: saved.frequency,
      purpose: saved.purpose,
      status: saved.status,
      sandbox_profile_inactive: (cfSub as any)?.sandbox_profile_inactive || false,
    };
  }

  /**
   * Get subscription status and synchronize with Cashfree
   */
  async getSubscriptionStatus(subscriptionId: string, actingUserId?: string) {
    const sub = await this.subscriptionsRepo.findOne({
      where: { subscription_id: subscriptionId },
    });

    if (!sub) {
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);
    }

    const safeActingUuid = this.toValidUuidOrNull(actingUserId);
    if (sub.user_id && safeActingUuid && sub.user_id !== safeActingUuid) {
      throw new ForbiddenException('You do not own this subscription');
    }

    try {
      const cfSub = await this.cashfreeService.getSubscription(subscriptionId);
      const cfStatus = (cfSub.subscription_status || '').toUpperCase();
      if (cfStatus && cfStatus !== sub.status) {
        if (
          ['ACTIVE', 'INITIALIZED', 'BANK_APPROVAL_PENDING', 'ON_HOLD', 'CANCELLED', 'COMPLETED'].includes(
            cfStatus,
          )
        ) {
          sub.status = cfStatus as any;
          sub.raw_details = cfSub as any;
          await this.subscriptionsRepo.save(sub);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not sync subscription ${subscriptionId} from Cashfree: ${err?.message}`);
    }

    return {
      success: true,
      subscription_id: sub.subscription_id,
      status: sub.status,
      amount: sub.amount,
      frequency: sub.frequency,
      purpose: sub.purpose,
      customer_name: sub.customer_name,
      customer_email: sub.customer_email,
      created_at: sub.created_at,
    };
  }

  /**
   * Cancel an active AutoPay subscription
   */
  async cancelSubscription(subscriptionId: string, actingUserId?: string) {
    const sub = await this.subscriptionsRepo.findOne({
      where: { subscription_id: subscriptionId },
    });

    if (!sub) {
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);
    }

    const safeActingUuid = this.toValidUuidOrNull(actingUserId);
    if (sub.user_id && safeActingUuid && sub.user_id !== safeActingUuid) {
      throw new ForbiddenException('You do not have permission to cancel this subscription');
    }

    try {
      await this.cashfreeService.cancelSubscription(subscriptionId);
    } catch (err: any) {
      this.logger.warn(`Cashfree cancel subscription notice: ${err?.message}`);
    }
    sub.status = 'CANCELLED';
    await this.subscriptionsRepo.save(sub);

    return {
      success: true,
      message: 'Subscription cancelled successfully',
      subscription_id: subscriptionId,
      status: 'CANCELLED',
    };
  }
}
