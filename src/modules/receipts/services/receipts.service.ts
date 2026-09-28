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

  async getByMembershipPaymentId(paymentId: string): Promise<ReceiptEntity> {
    const receipt = await this.receiptsRepo.findOne({
      where: { membership_payment_id: paymentId },
      relations: ['user', 'membership_payment'],
    });

    if (!receipt) {
      throw new NotFoundException({
        message: 'Receipt not found for this membership payment',
        code: 'RECEIPT_NOT_FOUND',
        details: { paymentId },
      });
    }

    if (receipt.user) {
      delete (receipt.user as { password_hash?: string }).password_hash;
    }

    return receipt;
  }

  async getByDonationPaymentId(donationId: string): Promise<ReceiptEntity> {
    const receipt = await this.receiptsRepo.findOne({
      where: { donation_payment_id: donationId },
      relations: ['user'],
    });

    if (!receipt) {
      throw new NotFoundException({
        message: 'Receipt not found for this donation',
        code: 'RECEIPT_NOT_FOUND',
        details: { donationId },
      });
    }

    if (receipt.user) {
      delete (receipt.user as { password_hash?: string }).password_hash;
    }

    return receipt;
  }

  async listAll(page = 1, limit = 20): Promise<{
    items: ReceiptEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const [items, total] = await this.receiptsRepo.findAndCount({
      relations: ['user'],
      order: { receipt_date: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((r) => {
        if (r.user) {
          delete (r.user as { password_hash?: string }).password_hash;
        }
        return r;
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
