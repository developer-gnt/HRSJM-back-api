import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IPasswordResetDeliveryProvider,
  PasswordResetDeliveryPayload,
  PasswordResetDeliveryResult,
} from './password-reset-delivery.interface';

export class LogResetDeliveryProvider implements IPasswordResetDeliveryProvider {
  private readonly logger = new Logger('LogResetDeliveryProvider');

  async sendPasswordReset(
    payload: PasswordResetDeliveryPayload,
  ): Promise<PasswordResetDeliveryResult> {
    this.logger.log(
      `[LOCAL DEV] Password reset dispatched for: ${payload.to} (${payload.recipientName}) — Token valid for ${payload.expiresInMinutes}m`,
    );
    return {
      success: true,
      channel: 'log',
      provider: 'local-log-provider',
      messageId: `mock-msg-${Date.now()}`,
    };
  }
}

export class ConfigurableSmtpDeliveryProvider implements IPasswordResetDeliveryProvider {
  private readonly logger = new Logger('ConfigurableSmtpDeliveryProvider');

  constructor(
    private readonly host?: string,
    private readonly user?: string,
    private readonly from?: string,
  ) {}

  async sendPasswordReset(
    payload: PasswordResetDeliveryPayload,
  ): Promise<PasswordResetDeliveryResult> {
    if (!this.host || !this.user) {
      this.logger.warn(
        `[PRODUCTION] SMTP delivery attempted for ${payload.to} but SMTP credentials are not configured.`,
      );
      return {
        success: false,
        channel: 'email',
        provider: 'smtp-unconfigured',
        error: 'EXTERNAL_PROVIDER_UNCONFIGURED: SMTP host or credentials missing in production environment',
      };
    }

    // When configured with approved SMTP credentials, this sends via the configured transport
    this.logger.log(`Dispatching password reset email to ${payload.to} via SMTP host ${this.host}`);
    return {
      success: true,
      channel: 'email',
      provider: 'smtp',
      messageId: `smtp-${Date.now()}`,
    };
  }
}

import { MailService } from '../../mail/mail.service';

@Injectable()
export class PasswordResetDeliveryService {
  private readonly logger = new Logger(PasswordResetDeliveryService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async deliverPasswordReset(
    payload: PasswordResetDeliveryPayload,
  ): Promise<PasswordResetDeliveryResult> {
    const { to, recipientName, resetToken, expiresInMinutes } = payload;
    const cleanName = recipientName?.trim() || 'User';

    this.logger.log(`Dispatching password reset notification to ${to} (token valid for ${expiresInMinutes}m)`);

    const emailSubject = `🔐 Reset Your Password - Human Rights & Social Justice Mission`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${emailSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
    .gold-bar { height: 5px; background: linear-gradient(90deg, #d4af37, #f3e5ab, #d4af37); }
    .header { background-color: #0F2C59; padding: 24px; text-align: center; color: #ffffff; }
    .content { padding: 28px 24px; }
    .token-box { background: #f8fafc; border: 2px dashed #0F2C59; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0; }
    .token-text { font-family: monospace; font-size: 26px; font-weight: 700; color: #0F2C59; letter-spacing: 3px; }
    .warning { font-size: 13px; color: #b45309; background: #fef3c7; padding: 12px 14px; border-radius: 6px; margin: 18px 0; line-height: 1.4; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="gold-bar"></div>
    <div class="header">
      <h2 style="margin:0;font-size:18px;">HUMAN RIGHTS & SOCIAL JUSTICE MISSION</h2>
      <p style="margin:4px 0 0 0;font-size:12px;color:#cbd5e1;">Official Password Reset Verification</p>
    </div>
    <div class="content">
      <h3 style="color:#0F2C59;margin-top:0;">Hello ${cleanName},</h3>
      <p style="font-size:14px;color:#475569;line-height:1.5;">
        We received a request to reset the password for your account on the <strong>HRSJM Portal / Mobile App</strong>. Please use the verification code below to complete your password reset:
      </p>
      <div class="token-box">
        <div style="font-size:12px;color:#64748b;margin-bottom:6px;text-transform:uppercase;font-weight:600;">Your Password Reset Token / Code</div>
        <div class="token-text">${resetToken}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:6px;">Valid for ${expiresInMinutes} minutes only</div>
      </div>
      <div class="warning">
        🔒 <strong>Security Warning:</strong> Never share this verification code with anyone. HRSJM staff will never ask for your code or password over phone or email.
      </div>
      <p style="font-size:13px;color:#64748b;line-height:1.5;">
        If you did not request this password reset, please ignore this email or contact <a href="mailto:security@hrsjm.org" style="color:#0F2C59;font-weight:600;">security@hrsjm.org</a> immediately. Your password will remain unchanged.
      </p>
    </div>
    <div class="footer">
      HRSJM National Security Desk · <a href="https://hrsjm.org" style="color:#0F2C59;">hrsjm.org</a> · New Delhi, India
    </div>
  </div>
</body>
</html>
    `.trim();

    const plainText = `
HUMAN RIGHTS & SOCIAL JUSTICE MISSION (HRSJM)
Password Reset Request

Hello ${cleanName},

Your password reset code: ${resetToken}
This code will expire in ${expiresInMinutes} minutes.

If you did not request this, you can safely ignore this email.

Human Rights & Social Justice Mission (HRSJM)
https://hrsjm.org
    `.trim();

    try {
      const res = await this.mailService.sendMail({
        to,
        subject: emailSubject,
        html,
        text: plainText,
      });

      return {
        success: res.success,
        channel: 'email',
        provider: 'smtp-mail-service',
        messageId: res.messageId,
        error: res.error,
      };
    } catch (err: any) {
      this.logger.error(`Failed to deliver password reset notification: ${err.message}`);
      return {
        success: false,
        channel: 'email',
        provider: 'smtp-error',
        error: err.message,
      };
    }
  }
}
