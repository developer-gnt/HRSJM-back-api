import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DonationEntity } from '../entities/donation.entity';
import { DonationRefundEntity } from '../entities/donation-refund.entity';
import { DonationPaymentEntity } from '../../donation-payments/entities/donation-payment.entity';
import { AccountingEntryEntity } from '../../accounting/entities/accounting-entry.entity';
import {
  EntryType,
  ReferenceType,
} from '../../accounting/enums/accounting.enums';
import { AccountingPostingService } from '../../accounting/services/accounting-posting.service';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';
import { RefundDonationDto } from '../dto/refund-donation.dto';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class DonationsService {
  constructor(
    @InjectRepository(DonationEntity)
    private readonly donations: Repository<DonationEntity>,
    @InjectRepository(DonationPaymentEntity)
    private readonly payments: Repository<DonationPaymentEntity>,
    @InjectRepository(DonationRefundEntity)
    private readonly refunds: Repository<DonationRefundEntity>,
    private readonly posting: AccountingPostingService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /**
   * Full refund of a verified donation (partial refunds are TBC — BRD §54 #21).
   * Reverses the original journal with a mirrored REVERSAL entry, marks the
   * payment and donation REFUNDED, and records the refund — all in one
   * transaction. Posted entries are immutable (never edited or deleted).
   */
  async refund(
    donationId: string,
    dto: RefundDonationDto,
    actingUserId: string,
  ): Promise<{
    donation: DonationEntity;
    payment: DonationPaymentEntity;
    refund: DonationRefundEntity;
    reversal_entry_number: string;
  }> {
    const donation = await this.donations.findOne({ where: { id: donationId } });
    if (!donation) {
      throw new NotFoundException({
        message: 'Donation not found',
        code: 'DONATION_NOT_FOUND',
        details: { donation_id: donationId },
      });
    }

    if (donation.status === 'REFUNDED') {
      throw new ConflictException({
        message: 'Donation has already been refunded',
        code: 'DONATION_ALREADY_REFUNDED',
        details: { donation_id: donationId },
      });
    }

    const payment = await this.payments.findOne({
      where: { donation_id: donationId, payment_status: PaymentStatus.SUCCESS },
      order: { payment_date: 'DESC' },
    });
    if (!payment) {
      throw new BadRequestException({
        message: 'Donation has no verified payment to refund',
        code: 'DONATION_NOT_REFUNDABLE',
        details: { donation_id: donationId },
      });
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const journal = await manager.findOne(AccountingEntryEntity, {
        where: {
          reference_type: ReferenceType.DONATION_PAYMENT,
          reference_id: payment.id,
          entry_type: EntryType.JOURNAL,
        },
      });

      if (!journal) {
        throw new BadRequestException({
          message: 'No accounting journal found for this donation payment',
          code: 'DONATION_PAYMENT_JOURNAL_MISSING',
          details: { donation_id: donationId },
        });
      }

      const reversal = await this.posting.reverse(
        manager,
        journal.id,
        actingUserId,
      );

      payment.payment_status = PaymentStatus.REFUNDED;
      payment.updated_by = actingUserId;
      const savedPayment = await manager.save(DonationPaymentEntity, payment);

      donation.status = 'REFUNDED';
      donation.updated_by = actingUserId;
      const savedDonation = await manager.save(DonationEntity, donation);

      const refund = manager.create(DonationRefundEntity, {
        donation_payment_id: payment.id,
        amount: payment.amount,
        reason: dto.reason ?? null,
        reversed_entry_id: reversal.id,
        refunded_at: new Date(),
        created_by: actingUserId,
        updated_by: actingUserId,
      });
      const savedRefund = await manager.save(DonationRefundEntity, refund);

      return {
        donation: savedDonation,
        payment: savedPayment,
        refund: savedRefund,
        reversal,
      };
    });

    await this.audit.record({
      event: 'donation.refunded',
      actorId: actingUserId,
      entityType: 'donations',
      entityId: result.donation.id,
      metadata: {
        paymentId: result.payment.id,
        amount: result.payment.amount,
        reason: dto.reason ?? null,
        reversalEntryNumber: result.reversal.entry_number,
      },
    });

    return {
      donation: result.donation,
      payment: result.payment,
      refund: result.refund,
      reversal_entry_number: result.reversal.entry_number,
    };
  }
}
