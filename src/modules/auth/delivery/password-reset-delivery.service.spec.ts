import { ConfigService } from '@nestjs/config';
import {
  PasswordResetDeliveryService,
  LogResetDeliveryProvider,
  ConfigurableSmtpDeliveryProvider,
} from './password-reset-delivery.service';

describe('PasswordResetDeliveryService', () => {
  describe('LogResetDeliveryProvider', () => {
    it('should log and return success in local development', async () => {
      const provider = new LogResetDeliveryProvider();
      const result = await provider.sendPasswordReset({
        to: 'user@example.com',
        recipientName: 'Test User',
        resetToken: 'test-token-12345',
        expiresInMinutes: 30,
      });

      expect(result.success).toBe(true);
      expect(result.channel).toBe('log');
      expect(result.provider).toBe('local-log-provider');
      expect(result.messageId).toBeDefined();
    });
  });

  describe('ConfigurableSmtpDeliveryProvider', () => {
    it('should return unconfigured status when SMTP host/user is missing in production', async () => {
      const provider = new ConfigurableSmtpDeliveryProvider(undefined, undefined);
      const result = await provider.sendPasswordReset({
        to: 'prod-user@example.com',
        recipientName: 'Prod User',
        resetToken: 'prod-secret-token',
        expiresInMinutes: 30,
      });

      expect(result.success).toBe(false);
      expect(result.channel).toBe('email');
      expect(result.error).toContain('EXTERNAL_PROVIDER_UNCONFIGURED');
    });

    it('should succeed when valid SMTP host and user are provided', async () => {
      const provider = new ConfigurableSmtpDeliveryProvider(
        'smtp.sendgrid.net',
        'apikey',
        'noreply@hrsjm.org',
      );
      const result = await provider.sendPasswordReset({
        to: 'prod-user@example.com',
        recipientName: 'Prod User',
        resetToken: 'prod-secret-token',
        expiresInMinutes: 30,
      });

      expect(result.success).toBe(true);
      expect(result.channel).toBe('email');
      expect(result.provider).toBe('smtp');
    });
  });

  describe('PasswordResetDeliveryService Dispatch', () => {
    it('should use LogResetDeliveryProvider in development mode', async () => {
      const mockConfig = {
        get: jest.fn((key: string) => {
          if (key === 'app.env') return 'development';
          return undefined;
        }),
      } as unknown as ConfigService;

      const mockMailService = {
        sendMail: jest.fn().mockResolvedValue({ success: true, messageId: 'test-123' }),
      } as any;

      const service = new PasswordResetDeliveryService(mockConfig, mockMailService);
      const res = await service.deliverPasswordReset({
        to: 'user@example.com',
        recipientName: 'Test',
        resetToken: '123',
        expiresInMinutes: 30,
      });

      expect(res.success).toBe(true);
      expect(res.channel).toBe('log');
    });
  });
});
