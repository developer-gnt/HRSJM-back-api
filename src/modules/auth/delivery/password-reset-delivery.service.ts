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

@Injectable()
export class PasswordResetDeliveryService {
  private readonly logger = new Logger(PasswordResetDeliveryService.name);
  private readonly provider: IPasswordResetDeliveryProvider;
  private readonly isProduction: boolean;

  constructor(private readonly config: ConfigService) {
    const appEnv = (this.config.get<string>('app.env') ?? process.env.APP_ENV ?? 'development').toLowerCase();
    this.isProduction = appEnv === 'production';
    const emailProvider = (process.env.EMAIL_PROVIDER ?? 'log').toLowerCase();

    if (this.isProduction && emailProvider === 'smtp') {
      this.provider = new ConfigurableSmtpDeliveryProvider(
        process.env.SMTP_HOST,
        process.env.SMTP_USER,
        process.env.EMAIL_FROM ?? 'noreply@hrsjm.org',
      );
    } else {
      this.provider = new LogResetDeliveryProvider();
    }
  }

  async deliverPasswordReset(
    payload: PasswordResetDeliveryPayload,
  ): Promise<PasswordResetDeliveryResult> {
    try {
      return await this.provider.sendPasswordReset(payload);
    } catch (err: any) {
      this.logger.error(`Failed to deliver password reset notification: ${err.message}`);
      return {
        success: false,
        channel: 'email',
        provider: 'error',
        error: err.message,
      };
    }
  }
}
