import { Injectable, Logger } from '@nestjs/common';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import {
  RenewalPaymentStatus,
  RenewalRequestEntity,
  RenewalStatus,
} from '../entities/renewal-request.entity';

export interface RenewalPeriodQuote {
  sequence: number;
  label: string;
  period_start: string;
  period_end: string;
  fee: number;
  status: 'UNPAID' | 'PAID' | 'WAIVED';
}

export interface RenewalQuoteResult {
  membership_id: string;
  membership_number?: string | null;
  status: string;
  registration_date: string | null;
  current_expiry: string | null;
  projected_expiry: string | null;
  is_overdue: boolean;
  days_overdue: number;
  days_remaining: number;
  is_eligible_for_renewal: boolean;
  renewal_validation_message?: string;
  unpaid_periods_count: number;
  paid_periods_count: number;
  periods: RenewalPeriodQuote[];
  renewal_subtotal: number;
  platform_fee: number;
  taxes: number;
  total_payable: number;
  explanation: string;
  requires_verification: boolean;
  verification_reason?: string;
}

export interface CalculateQuoteOptions {
  membership: Partial<MembershipEntity>;
  successfulRenewals?: Partial<RenewalRequestEntity>[];
  asOfDate?: Date;
  overridePeriodsCount?: number;
}

/**
 * Returns annual renewal fee based on renewal sequence number:
 * Sequence 1: ₹500
 * Sequence 2: ₹400
 * Sequence 3+: ₹300 per year
 */
export function getFeeForRenewalSequence(sequenceNumber: number): number {
  if (!Number.isInteger(sequenceNumber) || sequenceNumber <= 0) {
    throw new Error(`Invalid renewal sequence number: ${sequenceNumber}`);
  }
  if (sequenceNumber === 1) return 500;
  if (sequenceNumber === 2) return 400;
  return 300;
}

/**
 * Safely adds years to a date, accurately preserving day of month
 * and handling Feb 29 on leap years (snapping to Feb 28 on non-leap years).
 */
export function addYearsSafe(date: Date, years: number): Date {
  const d = new Date(date.getTime());
  const targetYear = d.getFullYear() + years;
  const targetMonth = d.getMonth();
  const targetDay = d.getDate();

  const candidate = new Date(
    targetYear,
    targetMonth,
    targetDay,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );

  // If month shifted (e.g., Feb 29 -> March 1 in non-leap year)
  if (candidate.getMonth() !== targetMonth) {
    return new Date(
      targetYear,
      targetMonth + 1,
      0, // last day of target month (Feb 28)
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds(),
    );
  }

  return candidate;
}

export function getDaysDiff(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

@Injectable()
export class RenewalCalculationService {
  private readonly logger = new Logger(RenewalCalculationService.name);

  /**
   * Pure calculation function for renewal arrears and quotation.
   */
  calculateQuote(options: CalculateQuoteOptions): RenewalQuoteResult {
    const {
      membership,
      successfulRenewals = [],
      asOfDate = new Date(),
      overridePeriodsCount,
    } = options;

    const membershipId = membership.id || '';
    const membershipNumber = membership.membership_number;
    const currentStatus = membership.status || 'UNKNOWN';

    // 1. Validate membership date history
    const validation = this.validateMembershipHistory(membership, successfulRenewals);
    if (!validation.isValid) {
      return {
        membership_id: membershipId,
        membership_number: membershipNumber,
        status: currentStatus,
        registration_date: membership.start_date ? new Date(membership.start_date).toISOString() : null,
        current_expiry: membership.expiry_date ? new Date(membership.expiry_date).toISOString() : null,
        projected_expiry: null,
        is_overdue: false,
        days_overdue: 0,
        days_remaining: 0,
        is_eligible_for_renewal: false,
        renewal_validation_message: validation.reason,
        unpaid_periods_count: 0,
        paid_periods_count: 0,
        periods: [],
        renewal_subtotal: 0,
        platform_fee: 0,
        taxes: 0,
        total_payable: 0,
        explanation: 'Membership history is inconsistent or missing required records. Verification is required.',
        requires_verification: true,
        verification_reason: validation.reason,
      };
    }

    const currentExpiry = new Date(membership.expiry_date!);
    const regDate = membership.start_date ? new Date(membership.start_date) : null;

    // 2. Determine number of previously paid/waived renewal periods
    // Only include successful or active renewals (exclude pending, failed, rejected)
    let paidPeriodsCount = 0;
    for (const r of successfulRenewals) {
      const isSuccess =
        r.payment_status === RenewalPaymentStatus.SUCCESS ||
        r.status === RenewalStatus.ACTIVE ||
        r.status === RenewalStatus.APPROVED;

      if (isSuccess) {
        paidPeriodsCount += Number(r.period_years || 1);
      }
    }

    // 3. Determine if overdue and count unpaid periods
    const isOverdue = currentExpiry.getTime() < asOfDate.getTime();
    let unpaidPeriodsCount = 0;

    if (overridePeriodsCount !== undefined) {
      unpaidPeriodsCount = Math.max(0, Math.floor(overridePeriodsCount));
    } else if (isOverdue) {
      // Step forward year by year until expiry covers asOfDate
      let cursor = new Date(currentExpiry.getTime());
      while (cursor.getTime() <= asOfDate.getTime()) {
        cursor = addYearsSafe(cursor, 1);
        unpaidPeriodsCount++;
      }
    } else {
      // Not overdue: standard 1-year renewal
      unpaidPeriodsCount = 1;
    }

    const daysOverdue = isOverdue
      ? Math.max(1, getDaysDiff(currentExpiry, asOfDate))
      : 0;
    const daysRemaining = !isOverdue
      ? Math.max(0, getDaysDiff(asOfDate, currentExpiry))
      : 0;

    // 4. Build sequence breakdown
    const periods: RenewalPeriodQuote[] = [];
    let renewalSubtotal = 0;

    for (let i = 1; i <= unpaidPeriodsCount; i++) {
      const sequence = paidPeriodsCount + i;
      const fee = getFeeForRenewalSequence(sequence);

      const periodStart = addYearsSafe(currentExpiry, i - 1);
      const periodEnd = addYearsSafe(currentExpiry, i);

      periods.push({
        sequence,
        label: `Renewal Year ${sequence}`,
        period_start: periodStart.toISOString().slice(0, 10),
        period_end: periodEnd.toISOString().slice(0, 10),
        fee,
        status: 'UNPAID',
      });

      renewalSubtotal += fee;
    }

    const projectedExpiry = periods.length > 0
      ? addYearsSafe(currentExpiry, periods.length).toISOString()
      : currentExpiry.toISOString();

    const platformFee = 0;
    const taxes = 0;
    const totalPayable = renewalSubtotal + platformFee + taxes;

    let explanation = '';
    if (isOverdue && unpaidPeriodsCount > 1) {
      explanation = `Includes ${unpaidPeriodsCount} unpaid renewal periods totaling ₹${totalPayable.toLocaleString('en-IN')}.`;
    } else if (isOverdue && unpaidPeriodsCount === 1) {
      explanation = `Membership expired. 1 renewal period due totaling ₹${totalPayable.toLocaleString('en-IN')}.`;
    } else {
      explanation = `Normal annual renewal fee for Year ${paidPeriodsCount + 1}.`;
    }

    const isEligibleForRenewal = isOverdue || daysRemaining <= 30;
    const renewalValidationMessage = isEligibleForRenewal
      ? undefined
      : 'Membership renewal is allowed only within 30 days before the expiry date.';

    return {
      membership_id: membershipId,
      membership_number: membershipNumber,
      status: currentStatus,
      registration_date: regDate ? regDate.toISOString() : null,
      current_expiry: currentExpiry.toISOString(),
      projected_expiry: projectedExpiry,
      is_overdue: isOverdue,
      days_overdue: daysOverdue,
      days_remaining: daysRemaining,
      is_eligible_for_renewal: isEligibleForRenewal,
      renewal_validation_message: renewalValidationMessage,
      unpaid_periods_count: isOverdue ? unpaidPeriodsCount : 0,
      paid_periods_count: paidPeriodsCount,
      periods,
      renewal_subtotal: renewalSubtotal,
      platform_fee: platformFee,
      taxes: taxes,
      total_payable: totalPayable,
      explanation,
      requires_verification: false,
    };
  }

  /**
   * Validates membership date history and historical renewals.
   */
  validateMembershipHistory(
    membership: Partial<MembershipEntity>,
    renewals: Partial<RenewalRequestEntity>[] = [],
  ): { isValid: boolean; reason?: string } {
    if (!membership.expiry_date) {
      return {
        isValid: false,
        reason: 'Membership expiry date is missing.',
      };
    }

    const expiryTime = new Date(membership.expiry_date).getTime();
    if (isNaN(expiryTime)) {
      return {
        isValid: false,
        reason: 'Membership expiry date is invalid.',
      };
    }

    if (membership.start_date) {
      const startTime = new Date(membership.start_date).getTime();
      if (isNaN(startTime)) {
        return {
          isValid: false,
          reason: 'Membership registration/start date is invalid.',
        };
      }
      if (expiryTime < startTime) {
        return {
          isValid: false,
          reason: 'Membership expiry date precedes registration start date.',
        };
      }
    }

    // Check renewal history consistency
    for (const r of renewals) {
      if (r.period_years !== undefined && r.period_years !== null) {
        if (!Number.isInteger(r.period_years) || r.period_years <= 0) {
          return {
            isValid: false,
            reason: `Historical renewal record ${r.id || ''} has invalid period_years: ${r.period_years}.`,
          };
        }
      }

      if (r.previous_expiry && r.new_expiry) {
        const prev = new Date(r.previous_expiry).getTime();
        const next = new Date(r.new_expiry).getTime();
        if (isNaN(prev) || isNaN(next) || next < prev) {
          return {
            isValid: false,
            reason: `Historical renewal record ${r.id || ''} has invalid previous/new expiry chronology.`,
          };
        }
      }
    }

    return { isValid: true };
  }
}
