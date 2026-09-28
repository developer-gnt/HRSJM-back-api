/**
 * Accounting module enums.
 * Stored as varchar (no PG enum types) per project convention.
 */

export const AccountType = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  FUND_EQUITY: 'FUND_EQUITY',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const EntryType = {
  JOURNAL: 'JOURNAL',
  REVERSAL: 'REVERSAL',
} as const;
export type EntryType = (typeof EntryType)[keyof typeof EntryType];

export const ReferenceType = {
  MEMBERSHIP_PAYMENT: 'MEMBERSHIP_PAYMENT',
  RENEWAL_PAYMENT: 'RENEWAL_PAYMENT',
  DONATION_PAYMENT: 'DONATION_PAYMENT',
  MANUAL_RECEIPT: 'MANUAL_RECEIPT',
  MANUAL_EXPENSE: 'MANUAL_EXPENSE',
} as const;
export type ReferenceType = (typeof ReferenceType)[keyof typeof ReferenceType];
