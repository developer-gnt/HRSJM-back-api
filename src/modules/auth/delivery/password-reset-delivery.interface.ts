export interface PasswordResetDeliveryPayload {
  to: string;
  recipientName: string;
  resetToken: string;
  expiresInMinutes: number;
}

export interface PasswordResetDeliveryResult {
  success: boolean;
  channel: 'email' | 'sms' | 'log';
  provider: string;
  messageId?: string;
  error?: string;
}

export interface IPasswordResetDeliveryProvider {
  sendPasswordReset(
    payload: PasswordResetDeliveryPayload,
  ): Promise<PasswordResetDeliveryResult>;
}
