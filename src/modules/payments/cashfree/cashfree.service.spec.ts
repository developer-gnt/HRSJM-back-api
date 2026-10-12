import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { CashfreeService } from './cashfree.service';

describe('CashfreeService', () => {
  let service: CashfreeService;
  const mockWebhookSecret = 'test_webhook_secret_key_123';

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'cashfree.webhookSecret') return mockWebhookSecret;
        if (key === 'cashfree.apiVersion') return '2023-08-01';
        if (key === 'cashfree.returnUrl') return 'https://hrsjm.org/return';
        if (key === 'cashfree.webhookUrl') return 'https://hrsjm.org/webhook';
        if (key === 'cashfree.apiBaseUrl') return 'https://sandbox.cashfree.com/pg';
        if (key === 'cashfree.appId') return 'TEST_APP';
        if (key === 'cashfree.secretKey') return 'TEST_SECRET';
        if (key === 'cashfree.timeoutMs') return 5000;
        return defaultValue;
      }),
    } as unknown as ConfigService;

    service = new CashfreeService(configService);
  });

  describe('Webhook Signature Verification', () => {
    it('should verify valid HMAC signature successfully', () => {
      const timestamp = '1710000000';
      const rawBody = Buffer.from(JSON.stringify({ data: { order_id: 'test_order' } }));
      const expected = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]))
        .digest('base64');

      const isValid = service.verifyWebhookSignature(rawBody, timestamp, expected);
      expect(isValid).toBe(true);
    });

    it('should reject invalid HMAC signature', () => {
      const timestamp = '1710000000';
      const rawBody = Buffer.from(JSON.stringify({ data: { order_id: 'test_order' } }));
      const forgedSignature = Buffer.from('invalid_signature_base64_string=').toString('base64');

      const isValid = service.verifyWebhookSignature(rawBody, timestamp, forgedSignature);
      expect(isValid).toBe(false);
    });

    it('should reject when signatures have different lengths without timing attack vulnerability', () => {
      const timestamp = '1710000000';
      const rawBody = Buffer.from('test');
      const shortSignature = 'short';

      const isValid = service.verifyWebhookSignature(rawBody, timestamp, shortSignature);
      expect(isValid).toBe(false);
    });

    it('should throw UnauthorizedException on assertWebhookSignature failure', () => {
      const rawBody = Buffer.from('body');
      expect(() => {
        service.assertWebhookSignature(rawBody, '123', 'bad_sig');
      }).toThrow(UnauthorizedException);
    });
  });

  describe('createOrder validation', () => {
    it('should throw BadRequestException if amount is non-positive or invalid', async () => {
      await expect(
        service.createOrder({
          orderId: 'test',
          amount: 0,
          customerId: 'cust_1',
          customerName: 'User',
          customerEmail: 'user@test.com',
          customerPhone: '9999999999',
          purpose: 'test',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createOrder({
          orderId: 'test',
          amount: -50,
          customerId: 'cust_1',
          customerName: 'User',
          customerEmail: 'user@test.com',
          customerPhone: '9999999999',
          purpose: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
