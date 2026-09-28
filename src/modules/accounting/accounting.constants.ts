/**
 * Canonical baseline Chart of Accounts codes (minimal money-flow set).
 * The final HRSJM chart of accounts is still TBC — these codes are the
 * fixed lookup keys posting flows (Phases 5/7/8/9) use to resolve accounts.
 * Do not change existing codes; new accounts extend the numbering scheme.
 */
export const ACCOUNT_CODES = {
  BANK: '1001',
  CASH: '1002',
  MEMBERSHIP_INCOME: '4001',
  RENEWAL_INCOME: '4002',
  DONATION_INCOME: '4003',
  OTHER_INCOME: '4004',
  OTHER_EXPENSE: '5001',
} as const;

export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];
