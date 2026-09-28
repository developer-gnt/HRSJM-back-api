/**
 * Receipt module enums.
 * Stored as varchar per project convention.
 */

export const ReceiptStatus = {
  POSTED: 'POSTED',
  CANCELLED: 'CANCELLED',
} as const;
export type ReceiptStatus = (typeof ReceiptStatus)[keyof typeof ReceiptStatus];

export const ReceiptPaymentMethod = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CHEQUE: 'CHEQUE',
  UPI: 'UPI',
  CARD: 'CARD',
  OTHER: 'OTHER',
} as const;
export type ReceiptPaymentMethod =
  (typeof ReceiptPaymentMethod)[keyof typeof ReceiptPaymentMethod];
