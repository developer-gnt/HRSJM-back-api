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
      relations: ['user', 'membership_payment'],
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
      .leftJoinAndSelect('receipt.membership_payment', 'payment');

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

    if (receipt.user) {
      delete (receipt.user as { password_hash?: string }).password_hash;
    }

    return receipt;
  }
}
