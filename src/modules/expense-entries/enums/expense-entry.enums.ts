/**
 * Expense module enums.
 * Stored as varchar per project convention.
 */

export const ExpenseStatus = {
  POSTED: 'POSTED',
  CANCELLED: 'CANCELLED',
} as const;
export type ExpenseStatus = (typeof ExpenseStatus)[keyof typeof ExpenseStatus];

export const ExpensePaymentMethod = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CHEQUE: 'CHEQUE',
  UPI: 'UPI',
  CARD: 'CARD',
  OTHER: 'OTHER',
} as const;
export type ExpensePaymentMethod =
  (typeof ExpensePaymentMethod)[keyof typeof ExpensePaymentMethod];
