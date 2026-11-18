import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipPaymentEntity } from '../../membership-payments/entities/membership-payment.entity';
import { DonationPaymentEntity } from '../../donation-payments/entities/donation-payment.entity';
import { ReceiptEntity } from '../../membership-payments/entities/receipt.entity';
import { DonationEntity } from '../../donations/entities/donation.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { ListTransactionsDto } from '../dto/list-transactions.dto';

export interface UserTransactionItem {
  id: string;
  transaction_id: string;
  payment_reference: string;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  category: 'Membership' | 'Donation' | 'Events' | 'Other';
  category_code: 'MEMBERSHIP' | 'DONATION' | 'EVENTS' | 'OTHER';
  title: string;
  purpose: string;
  amount: number;
  direction: 'OUTGOING';
  status: 'Success' | 'Pending' | 'Failed' | 'Refunded';
  status_code: string;
  payment_method: string;
  created_at: string;
  payment_date: string;
  receipt_id: string | null;
  receipt_number: string | null;
  receipt_available: boolean;
  related_info: {
    campaign_name?: string | null;
    membership_id?: string | null;
    event_name?: string | null;
    receipt_id?: string | null;
    receipt_number?: string | null;
    receipt_date?: string | null;
    receipt_status?: string | null;
    notes?: string | null;
  };
}

export interface UserTransactionsSummary {
  total_amount_paid: number;
  total_transactions: number;
  successful_count: number;
  pending_count: number;
  failed_count: number;
  refunded_count: number;
}

export interface UserTransactionsResponse {
  summary: UserTransactionsSummary;
  items: UserTransactionItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(MembershipPaymentEntity)
    private readonly membershipPaymentsRepo: Repository<MembershipPaymentEntity>,
    @InjectRepository(DonationPaymentEntity)
    private readonly donationPaymentsRepo: Repository<DonationPaymentEntity>,
    @InjectRepository(ReceiptEntity)
    private readonly receiptsRepo: Repository<ReceiptEntity>,
    @InjectRepository(DonationEntity)
    private readonly donationsRepo: Repository<DonationEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  /**
   * Normalize payment status from various internal formats to standard display status.
   */
  private normalizeStatus(statusRaw: string | null | undefined): 'Success' | 'Pending' | 'Failed' | 'Refunded' {
    const s = (statusRaw || '').toUpperCase();
    if (s === 'SUCCESS' || s === 'COMPLETED' || s === 'PAID') return 'Success';
    if (s === 'PENDING' || s === 'INITIATED' || s === 'PROCESSING') return 'Pending';
    if (s === 'REFUNDED') return 'Refunded';
    return 'Failed';
  }

  /**
   * Retrieve all unified transactions for a user with summary, filters, search, and pagination.
   */
  async listUserTransactions(
    userId: string,
    dto: ListTransactionsDto,
  ): Promise<UserTransactionsResponse> {
    // 1. Fetch user to check mobile number for matching guest/unlinked donations
    let userMobile = '';
    try {
      const user = await this.usersRepo.findOne({ where: { id: userId } });
      if (user?.mobile_number) {
        userMobile = user.mobile_number.trim();
      }
    } catch {}

    // 2. Fetch membership payments
    const mpQb = this.membershipPaymentsRepo
      .createQueryBuilder('mp')
      .leftJoinAndSelect('mp.membership', 'm')
      .leftJoinAndSelect('mp.receipt', 'r')
      .where('mp.user_id = :userId', { userId })
      .orderBy('mp.created_at', 'DESC');

    const membershipPayments = await mpQb.getMany();

    // 3. Fetch donation payments
    const dpQb = this.donationPaymentsRepo
      .createQueryBuilder('dp')
      .leftJoinAndSelect('dp.donation', 'd')
      .where('dp.user_id = :userId', { userId });

    if (userMobile) {
      dpQb.orWhere('(dp.user_id IS NULL AND d.donor_mobile = :userMobile)', { userMobile });
    }

    dpQb.orderBy('dp.created_at', 'DESC');
    const donationPayments = await dpQb.getMany();

    // 4. Fetch receipts linked to donation payments
    const donationPaymentIds = donationPayments.map((p) => p.id).filter(Boolean);
    let donationReceipts: ReceiptEntity[] = [];
    if (donationPaymentIds.length > 0) {
      donationReceipts = await this.receiptsRepo
        .createQueryBuilder('rec')
        .where('rec.donation_payment_id IN (:...donationPaymentIds)', { donationPaymentIds })
        .getMany();
    }
    const donationReceiptMap = new Map<string, ReceiptEntity>();
    for (const r of donationReceipts) {
      if (r.donation_payment_id) {
        donationReceiptMap.set(r.donation_payment_id, r);
      }
    }

    // 5. Transform all payments into unified UserTransactionItem
    const allItems: UserTransactionItem[] = [];

    // Transform Membership Payments
    for (const mp of membershipPayments) {
      const status = this.normalizeStatus(mp.payment_status);
      const receipt = mp.receipt || null;
      const amount = typeof mp.amount === 'string' ? parseFloat(mp.amount) : Number(mp.amount) || 0;
      const refId = mp.gateway_payment_id || mp.gateway_order_id || mp.transaction_id || `MP-${mp.id.slice(0, 8).toUpperCase()}`;

      allItems.push({
        id: mp.id,
        transaction_id: mp.transaction_id || mp.gateway_order_id || `HRSJM-TXN-${mp.id.slice(0, 8).toUpperCase()}`,
        payment_reference: refId,
        gateway_order_id: mp.gateway_order_id || null,
        gateway_payment_id: mp.gateway_payment_id || null,
        category: 'Membership',
        category_code: 'MEMBERSHIP',
        title: 'Membership Fee Payment',
        purpose: 'Annual Membership Registration / Subscription to HRSJM',
        amount,
        direction: 'OUTGOING',
        status,
        status_code: mp.payment_status || status.toUpperCase(),
        payment_method: mp.payment_method || 'Online Gateway',
        created_at: (mp.created_at || new Date()).toISOString(),
        payment_date: (mp.payment_date || mp.created_at || new Date()).toISOString(),
        receipt_id: receipt ? receipt.id : null,
        receipt_number: receipt ? receipt.receipt_number : null,
        receipt_available: Boolean(receipt && status === 'Success'),
        related_info: {
          membership_id: mp.membership?.membership_number || mp.membership_id,
          receipt_id: receipt ? receipt.id : null,
          receipt_number: receipt ? receipt.receipt_number : null,
          receipt_date: receipt?.receipt_date ? receipt.receipt_date.toISOString() : null,
          receipt_status: receipt ? 'Issued' : (status === 'Success' ? 'Generating' : 'Unavailable'),
          notes: mp.notes || null,
        },
      });
    }

    // Transform Donation Payments
    for (const dp of donationPayments) {
      const status = this.normalizeStatus(dp.payment_status);
      const receipt = donationReceiptMap.get(dp.id) || null;
      const amount = typeof dp.amount === 'string' ? parseFloat(dp.amount) : Number(dp.amount) || 0;
      const cause = dp.donation?.cause || 'General Human Rights and Social Justice Fund';
      const refId = dp.gateway_payment_id || dp.gateway_order_id || `DON-${dp.id.slice(0, 8).toUpperCase()}`;

      allItems.push({
        id: dp.id,
        transaction_id: dp.gateway_order_id || `HRSJM-DON-${dp.id.slice(0, 8).toUpperCase()}`,
        payment_reference: refId,
        gateway_order_id: dp.gateway_order_id || null,
        gateway_payment_id: dp.gateway_payment_id || null,
        category: 'Donation',
        category_code: 'DONATION',
        title: cause,
        purpose: dp.donation?.remark || `Contribution towards ${cause}`,
        amount,
        direction: 'OUTGOING',
        status,
        status_code: dp.payment_status || status.toUpperCase(),
        payment_method: dp.payment_method || 'Online (Cashfree)',
        created_at: (dp.created_at || new Date()).toISOString(),
        payment_date: (dp.payment_date || dp.created_at || new Date()).toISOString(),
        receipt_id: receipt ? receipt.id : null,
        receipt_number: receipt ? receipt.receipt_number : null,
        receipt_available: Boolean(receipt && status === 'Success'),
        related_info: {
          campaign_name: cause,
          receipt_id: receipt ? receipt.id : null,
          receipt_number: receipt ? receipt.receipt_number : null,
          receipt_date: receipt?.receipt_date ? receipt.receipt_date.toISOString() : null,
          receipt_status: receipt ? 'Issued (80G Eligible)' : (status === 'Success' ? 'Generating' : 'Unavailable'),
          notes: dp.notes || dp.donation?.remark || null,
        },
      });
    }

    // 6. Calculate Summary Metrics (always calculated over all user records, ignoring pagination)
    let totalAmountPaid = 0;
    let successfulCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let refundedCount = 0;

    for (const item of allItems) {
      if (item.status === 'Success') {
        totalAmountPaid += item.amount;
        successfulCount++;
      } else if (item.status === 'Pending') {
        pendingCount++;
      } else if (item.status === 'Failed') {
        failedCount++;
      } else if (item.status === 'Refunded') {
        refundedCount++;
      }
    }

    const summary: UserTransactionsSummary = {
      total_amount_paid: Math.round(totalAmountPaid * 100) / 100,
      total_transactions: successfulCount,
      successful_count: successfulCount,
      pending_count: pendingCount,
      failed_count: failedCount,
      refunded_count: refundedCount,
    };

    // 7. Apply Filters to items
    let filteredItems = [...allItems];

    // Filter by Category
    if (dto.category && dto.category.toUpperCase() !== 'ALL') {
      const catUpper = dto.category.toUpperCase();
      filteredItems = filteredItems.filter((it) => it.category_code === catUpper || it.category.toUpperCase() === catUpper);
    }

    // Filter by Status
    if (dto.status && dto.status.toUpperCase() !== 'ALL') {
      const statusUpper = dto.status.toUpperCase();
      filteredItems = filteredItems.filter((it) => it.status.toUpperCase() === statusUpper || it.status_code === statusUpper);
    }

    // Filter by Search Query
    if (dto.search && dto.search.trim()) {
      const query = dto.search.trim().toLowerCase();
      filteredItems = filteredItems.filter((it) => {
        const matchTxn = it.transaction_id?.toLowerCase().includes(query);
        const matchRef = it.payment_reference?.toLowerCase().includes(query);
        const matchOrder = it.gateway_order_id?.toLowerCase().includes(query);
        const matchPay = it.gateway_payment_id?.toLowerCase().includes(query);
        const matchTitle = it.title?.toLowerCase().includes(query);
        const matchPurpose = it.purpose?.toLowerCase().includes(query);
        const matchAmt = it.amount.toString().includes(query);
        const matchReceipt = it.receipt_number?.toLowerCase().includes(query);
        return matchTxn || matchRef || matchOrder || matchPay || matchTitle || matchPurpose || matchAmt || matchReceipt;
      });
    }

    // Filter by Date Range
    if (dto.fromDate) {
      const fromTime = new Date(dto.fromDate).getTime();
      if (!isNaN(fromTime)) {
        filteredItems = filteredItems.filter((it) => new Date(it.payment_date).getTime() >= fromTime);
      }
    }
    if (dto.toDate) {
      const toDateObj = new Date(dto.toDate);
      toDateObj.setHours(23, 59, 59, 999);
      const toTime = toDateObj.getTime();
      if (!isNaN(toTime)) {
        filteredItems = filteredItems.filter((it) => new Date(it.payment_date).getTime() <= toTime);
      }
    }

    // Sort by payment_date DESC
    filteredItems.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());

    // 8. Apply Pagination
    const page = Math.max(1, dto.page || 1);
    const limit = Math.max(1, Math.min(100, dto.limit || 20));
    const total = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const paginatedItems = filteredItems.slice((page - 1) * limit, page * limit);

    return {
      summary,
      items: paginatedItems,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Retrieve a single transaction by its ID (membership payment ID or donation payment ID).
   */
  async getTransactionById(
    transactionId: string,
    userId: string,
    isAdmin = false,
  ): Promise<UserTransactionItem> {
    // 1. Try finding in membership payments
    const mp = await this.membershipPaymentsRepo.findOne({
      where: { id: transactionId },
      relations: ['membership', 'receipt', 'transactions'],
    });

    if (mp) {
      if (!isAdmin && mp.user_id !== userId) {
        throw new NotFoundException({
          message: 'Transaction not found or access denied',
          code: 'TRANSACTION_NOT_FOUND',
        });
      }
      const status = this.normalizeStatus(mp.payment_status);
      const receipt = mp.receipt || null;
      const amount = typeof mp.amount === 'string' ? parseFloat(mp.amount) : Number(mp.amount) || 0;
      const refId = mp.gateway_payment_id || mp.gateway_order_id || mp.transaction_id || `MP-${mp.id.slice(0, 8).toUpperCase()}`;

      return {
        id: mp.id,
        transaction_id: mp.transaction_id || mp.gateway_order_id || `HRSJM-TXN-${mp.id.slice(0, 8).toUpperCase()}`,
        payment_reference: refId,
        gateway_order_id: mp.gateway_order_id || null,
        gateway_payment_id: mp.gateway_payment_id || null,
        category: 'Membership',
        category_code: 'MEMBERSHIP',
        title: 'Membership Fee Payment',
        purpose: 'Annual Membership Registration / Subscription to HRSJM',
        amount,
        direction: 'OUTGOING',
        status,
        status_code: mp.payment_status || status.toUpperCase(),
        payment_method: mp.payment_method || 'Online Gateway',
        created_at: (mp.created_at || new Date()).toISOString(),
        payment_date: (mp.payment_date || mp.created_at || new Date()).toISOString(),
        receipt_id: receipt ? receipt.id : null,
        receipt_number: receipt ? receipt.receipt_number : null,
        receipt_available: Boolean(receipt && status === 'Success'),
        related_info: {
          membership_id: mp.membership?.membership_number || mp.membership_id,
          receipt_id: receipt ? receipt.id : null,
          receipt_number: receipt ? receipt.receipt_number : null,
          receipt_date: receipt?.receipt_date ? receipt.receipt_date.toISOString() : null,
          receipt_status: receipt ? 'Issued' : (status === 'Success' ? 'Generating' : 'Unavailable'),
          notes: mp.notes || null,
        },
      };
    }

    // 2. Try finding in donation payments
    const dp = await this.donationPaymentsRepo.findOne({
      where: { id: transactionId },
      relations: ['donation'],
    });

    if (dp) {
      if (!isAdmin && dp.user_id && dp.user_id !== userId) {
        throw new NotFoundException({
          message: 'Transaction not found or access denied',
          code: 'TRANSACTION_NOT_FOUND',
        });
      }
      const status = this.normalizeStatus(dp.payment_status);
      const receipt = await this.receiptsRepo.findOne({ where: { donation_payment_id: dp.id } });
      const amount = typeof dp.amount === 'string' ? parseFloat(dp.amount) : Number(dp.amount) || 0;
      const cause = dp.donation?.cause || 'General Human Rights and Social Justice Fund';
      const refId = dp.gateway_payment_id || dp.gateway_order_id || `DON-${dp.id.slice(0, 8).toUpperCase()}`;

      return {
        id: dp.id,
        transaction_id: dp.gateway_order_id || `HRSJM-DON-${dp.id.slice(0, 8).toUpperCase()}`,
        payment_reference: refId,
        gateway_order_id: dp.gateway_order_id || null,
        gateway_payment_id: dp.gateway_payment_id || null,
        category: 'Donation',
        category_code: 'DONATION',
        title: cause,
        purpose: dp.donation?.remark || `Contribution towards ${cause}`,
        amount,
        direction: 'OUTGOING',
        status,
        status_code: dp.payment_status || status.toUpperCase(),
        payment_method: dp.payment_method || 'Online (Cashfree)',
        created_at: (dp.created_at || new Date()).toISOString(),
        payment_date: (dp.payment_date || dp.created_at || new Date()).toISOString(),
        receipt_id: receipt ? receipt.id : null,
        receipt_number: receipt ? receipt.receipt_number : null,
        receipt_available: Boolean(receipt && status === 'Success'),
        related_info: {
          campaign_name: cause,
          receipt_id: receipt ? receipt.id : null,
          receipt_number: receipt ? receipt.receipt_number : null,
          receipt_date: receipt?.receipt_date ? receipt.receipt_date.toISOString() : null,
          receipt_status: receipt ? 'Issued (80G Eligible)' : (status === 'Success' ? 'Generating' : 'Unavailable'),
          notes: dp.notes || dp.donation?.remark || null,
        },
      };
    }

    throw new NotFoundException({
      message: 'Transaction not found',
      code: 'TRANSACTION_NOT_FOUND',
      details: { transactionId },
    });
  }
}

