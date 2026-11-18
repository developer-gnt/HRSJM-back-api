import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReceiptEntity } from '../../membership-payments/entities/receipt.entity';

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(ReceiptEntity)
    private readonly receiptsRepo: Repository<ReceiptEntity>,
  ) {}

  private enrichReceiptWithCause(r: ReceiptEntity): any {
    if (r.user) {
      delete (r.user as { password_hash?: string }).password_hash;
    }

    let cause: string | null = null;
    const isDonation =
      r.receipt_type === 'DONATION' || Boolean(r.donation_payment_id);
    const isMembership =
      r.receipt_type === 'MEMBERSHIP' || Boolean(r.membership_payment_id);
    const isRenewal = r.receipt_type === 'RENEWAL';

    if (isDonation) {
      cause = r.donation_payment?.donation?.cause || null;
    } else if (isMembership) {
      cause =
        r.membership_payment?.membership?.category?.name ||
        'Annual Membership Fee';
    } else if (isRenewal) {
      cause = r.membership_payment?.membership?.category?.name
        ? `${r.membership_payment.membership.category.name} Renewal`
        : 'Membership Renewal Fee';
    }

    // Fallback: if notes contains a meaningful cause title (not generic payment verified text)
    if (!cause) {
      if (
        r.notes &&
        !r.notes.toLowerCase().startsWith('payment verified') &&
        !r.notes.toLowerCase().startsWith('donation payment verified')
      ) {
        cause = r.notes;
      } else {
        cause = isDonation ? 'General Donation' : 'Annual Membership Fee';
      }
    }

    return {
      ...r,
      cause,
      cause_name: cause,
    };
  }

  async getByMembershipPaymentId(paymentId: string): Promise<ReceiptEntity> {
    const receipt = await this.receiptsRepo.findOne({
      where: { membership_payment_id: paymentId },
      relations: [
        'user',
        'membership_payment',
        'membership_payment.membership',
        'membership_payment.membership.category',
      ],
    });

    if (!receipt) {
      throw new NotFoundException({
        message: 'Receipt not found for this membership payment',
        code: 'RECEIPT_NOT_FOUND',
        details: { paymentId },
      });
    }

    return this.enrichReceiptWithCause(receipt);
  }

  async getByDonationPaymentId(donationId: string): Promise<ReceiptEntity> {
    const receipt = await this.receiptsRepo.findOne({
      where: { donation_payment_id: donationId },
      relations: ['user', 'donation_payment', 'donation_payment.donation'],
    });

    if (!receipt) {
      throw new NotFoundException({
        message: 'Receipt not found for this donation',
        code: 'RECEIPT_NOT_FOUND',
        details: { donationId },
      });
    }

    return this.enrichReceiptWithCause(receipt);
  }

  async listAll(page = 1, limit = 20): Promise<{
    items: ReceiptEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const [items, total] = await this.receiptsRepo.findAndCount({
      relations: [
        'user',
        'membership_payment',
        'membership_payment.membership',
        'membership_payment.membership.category',
        'donation_payment',
        'donation_payment.donation',
      ],
      order: { receipt_date: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((r) => this.enrichReceiptWithCause(r)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async listByUser(
    userId: string,
    page = 1,
    limit = 50,
    type?: string,
  ): Promise<{
    items: ReceiptEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const where: any = { user_id: userId };
    if (type && type !== 'ALL') {
      where.receipt_type = type.toUpperCase();
    }

    const [items, total] = await this.receiptsRepo.findAndCount({
      where,
      relations: [
        'user',
        'membership_payment',
        'membership_payment.membership',
        'membership_payment.membership.category',
        'donation_payment',
        'donation_payment.donation',
      ],
      order: { receipt_date: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((r) => this.enrichReceiptWithCause(r)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getByIdOrNumber(
    idOrNumber: string,
    userId: string,
    isAdmin = false,
  ): Promise<ReceiptEntity> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrNumber,
      );

    const query = this.receiptsRepo
      .createQueryBuilder('receipt')
      .leftJoinAndSelect('receipt.user', 'user')
      .leftJoinAndSelect('receipt.membership_payment', 'payment')
      .leftJoinAndSelect('payment.membership', 'membership')
      .leftJoinAndSelect('membership.category', 'category')
      .leftJoinAndSelect('receipt.donation_payment', 'donation_payment')
      .leftJoinAndSelect('donation_payment.donation', 'donation');

    if (isUuid) {
      query.where('receipt.id = :id', { id: idOrNumber });
    } else {
      query.where('receipt.receipt_number = :num', { num: idOrNumber });
    }

    if (!isAdmin) {
      query.andWhere('receipt.user_id = :userId', { userId });
    }

    const receipt = await query.getOne();

    if (!receipt) {
      throw new NotFoundException({
        message: 'Receipt not found',
        code: 'RECEIPT_NOT_FOUND',
        details: { idOrNumber },
      });
    }

    return this.enrichReceiptWithCause(receipt);
  }
}
