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
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = Buffer.from(JSON.stringify({ data: { order_id: 'test_order' } }));
      const expected = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]))
        .digest('base64');

      const isValid = service.verifyWebhookSignature(rawBody, timestamp, expected);
      expect(isValid).toBe(true);
    });

    it('should reject invalid HMAC signature', () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = Buffer.from(JSON.stringify({ data: { order_id: 'test_order' } }));
      const forgedSignature = Buffer.from('invalid_signature_base64_string=').toString('base64');

      const isValid = service.verifyWebhookSignature(rawBody, timestamp, forgedSignature);
      expect(isValid).toBe(false);
    });

    it('should reject when raw body is altered', () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = Buffer.from(JSON.stringify({ data: { order_id: 'original_order' } }));
      const alteredBody = Buffer.from(JSON.stringify({ data: { order_id: 'tampered_order' } }));
      const signature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]))
        .digest('base64');

      const isValid = service.verifyWebhookSignature(alteredBody, timestamp, signature);
      expect(isValid).toBe(false);
    });

    it('should reject when signatures have different lengths without timing attack vulnerability', () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = Buffer.from('test');
      const shortSignature = 'short';

      const isValid = service.verifyWebhookSignature(rawBody, timestamp, shortSignature);
      expect(isValid).toBe(false);
    });

    it('should pass assertWebhookSignature with fresh timestamp and valid signature', () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = Buffer.from(JSON.stringify({ event: 'PAYMENT_SUCCESS' }));
      const validSignature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]))
        .digest('base64');

      expect(() => {
        service.assertWebhookSignature(rawBody, timestamp, validSignature);
      }).not.toThrow();
    });

    it('should throw UnauthorizedException when timestamp is missing or empty', () => {
      const rawBody = Buffer.from('body');
      expect(() => {
        service.assertWebhookSignature(rawBody, undefined, 'some_sig');
      }).toThrow(UnauthorizedException);

      expect(() => {
        service.assertWebhookSignature(rawBody, '   ', 'some_sig');
      }).toThrow('Missing required x-webhook-timestamp header');
    });

    it('should throw UnauthorizedException when signature is missing or empty', () => {
      const rawBody = Buffer.from('body');
      const timestamp = String(Math.floor(Date.now() / 1000));
      expect(() => {
        service.assertWebhookSignature(rawBody, timestamp, undefined);
      }).toThrow(UnauthorizedException);

      expect(() => {
        service.assertWebhookSignature(rawBody, timestamp, '   ');
      }).toThrow('Missing required x-webhook-signature header');
    });

    it('should throw UnauthorizedException when timestamp is invalid format', () => {
      const rawBody = Buffer.from('body');
      expect(() => {
        service.assertWebhookSignature(rawBody, 'not-a-timestamp', 'sig');
      }).toThrow('Invalid x-webhook-timestamp format');
    });

    it('should throw UnauthorizedException when timestamp is expired', () => {
      const rawBody = Buffer.from('body');
      const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 minutes ago
      expect(() => {
        service.assertWebhookSignature(rawBody, oldTimestamp, 'sig');
      }).toThrow('Webhook timestamp expired');
    });

    it('should throw BadRequestException when raw body is empty', () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      expect(() => {
        service.assertWebhookSignature(Buffer.alloc(0), timestamp, 'sig');
      }).toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException on assertWebhookSignature failure for forged signature', () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = Buffer.from('body');
      expect(() => {
        service.assertWebhookSignature(rawBody, timestamp, 'bad_sig');
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

  describe('validateUpiFormat', () => {
    it('should validate syntax correctly for valid UPI format and mark providerVerified as false', () => {
      const result = service.validateUpiFormat('99358777442@paytm');
      expect(result.valid).toBe(true);
      expect(result.formatValid).toBe(true);
      expect(result.providerVerified).toBe(false);
      expect(result.message).toContain('Format looks valid');
      expect(result.upiId).toBe('99358777442@paytm');
    });

    it('should reject invalid or malformed VPAs', () => {
      expect(service.validateUpiFormat('').valid).toBe(false);
      expect(service.validateUpiFormat('invalid').valid).toBe(false);
      expect(service.validateUpiFormat('a@b').valid).toBe(false);
      expect(service.validateUpiFormat('user@').valid).toBe(false);
      expect(service.validateUpiFormat('@bank').valid).toBe(false);
      expect(service.validateUpiFormat('   ').valid).toBe(false);
    });

    it('should trim surrounding whitespace', () => {
      const result = service.validateUpiFormat('  9888880002@upi  ');
      expect(result.valid).toBe(true);
      expect(result.upiId).toBe('9888880002@upi');
      expect(result.providerVerified).toBe(false);
    });
  });
});
