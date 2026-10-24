import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

export interface CashfreeAttempt {
  cf_payment_id?: string | number;
  order_id?: string;
  payment_status?: string;
  payment_amount?: number;
  payment_currency?: string;
  payment_time?: string;
  payment_method?: Record<string, unknown> | string;
  [key: string]: unknown;
}

export interface CreateOrderParams {
  orderId: string;
  amount: number;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  purpose: string;
  idempotencyKey?: string;
  returnUrl?: string;
}

export interface CashfreeOrderResponse {
  cf_order_id?: string | number;
  order_id: string;
  entity?: string;
  order_currency?: string;
  order_amount?: number;
  order_status?: string;
  payment_session_id: string;
  order_expiry_time?: string;
  [key: string]: unknown;
}

@Injectable()
export class CashfreeService {
  private readonly logger = new Logger(CashfreeService.name);
  private readonly http: AxiosInstance;
  private readonly webhookSecret: string;
  private readonly apiVersion: string;
  private readonly returnUrl: string;
  private readonly webhookUrl: string;
  private readonly appId: string;
  private readonly secretKey: string;
  public readonly environment: string;

  constructor(config: ConfigService) {
    this.webhookSecret = config.get<string>('cashfree.webhookSecret') || '';
    this.apiVersion = config.get<string>('cashfree.apiVersion') || '2023-08-01';
    this.returnUrl = config.get<string>('cashfree.returnUrl') || 'https://hrsjm.org/payments/callback?order_id={order_id}';
    this.webhookUrl = config.get<string>('cashfree.webhookUrl') || 'http://localhost:3000/api/v1/payments/cashfree/webhook';
    this.environment = (config.get<string>('cashfree.environment') || 'SANDBOX').toUpperCase();
    
    const baseURL = config.get<string>('cashfree.apiBaseUrl') || 'https://sandbox.cashfree.com/pg';
    this.appId = config.get<string>('cashfree.appId') || '';
    this.secretKey = config.get<string>('cashfree.secretKey') || '';
    const timeout = config.get<number>('cashfree.timeoutMs', 10000);

    this.http = axios.create({
      baseURL,
      timeout,
      headers: {
        'x-client-id': this.appId,
        'x-client-secret': this.secretKey,
        'x-api-version': this.apiVersion,
        'content-type': 'application/json',
      },
    });
  }

  async createOrder(input: CreateOrderParams): Promise<CashfreeOrderResponse> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Invalid order amount');
    }

    if (!this.appId || this.appId.startsWith('TEST_MOCK') || !this.secretKey || this.secretKey.startsWith('TEST_MOCK')) {
      if (this.environment === 'SANDBOX' || (process.env.APP_ENV || 'development').toLowerCase() !== 'production') {
        const mockOrderId = input.orderId;
        const mockSessionId = `session_${mockOrderId}_${Date.now().toString(36)}`;
        return {
          order_id: mockOrderId,
          payment_session_id: mockSessionId,
          cf_order_id: `cf_${Date.now()}`,
          order_status: 'ACTIVE',
          order_amount: Number(input.amount.toFixed(2)),
          order_currency: 'INR',
          environment: 'SANDBOX',
        };
      }
      throw new BadGatewayException(
        'Cashfree Payment Gateway is not configured with valid API credentials. Please set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in server .env.',
      );
    }

    try {
      const headers: Record<string, string> = {};
      if (input.idempotencyKey) {
        headers['x-idempotency-key'] = input.idempotencyKey;
      }

      const payload = {
        order_id: input.orderId,
        order_amount: Number(input.amount.toFixed(2)),
        order_currency: 'INR',
        customer_details: {
          customer_id: input.customerId.slice(0, 50),
          customer_name: (input.customerName || 'HRSJM Supporter').slice(0, 100),
          customer_email: (input.customerEmail || 'support@hrsjm.org').slice(0, 100),
          customer_phone: input.customerPhone || '9999999999',
        },
        order_meta: {
          return_url: input.returnUrl || this.returnUrl,
          notify_url: this.webhookUrl,
        },
        order_note: (input.purpose || 'HRSJM Payment').slice(0, 250),
      };

      const { data } = await this.http.post<CashfreeOrderResponse>('/orders', payload, { headers });

      if (!data?.order_id || !data?.payment_session_id) {
        throw new BadGatewayException('Cashfree response missing order_id or payment_session_id');
      }

      return data;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof BadGatewayException) {
        throw error;
      }
      const errDetails = axios.isAxiosError(error)
        ? `${error.response?.status} - ${JSON.stringify(error.response?.data || error.message)}`
        : (error as Error).message;
      this.logger.error(`Cashfree createOrder failed: ${errDetails}`);
      throw new BadGatewayException(`Cashfree order creation failed: ${errDetails}`);
    }
  }

  async getPaymentAttempts(orderId: string): Promise<CashfreeAttempt[]> {
    if (!this.appId || this.appId.startsWith('TEST_MOCK') || !this.secretKey || this.secretKey.startsWith('TEST_MOCK')) {
      if (this.environment === 'SANDBOX' || (process.env.APP_ENV || 'development').toLowerCase() !== 'production') {
        return [
          {
            cf_payment_id: Date.now(),
            order_id: orderId,
            payment_status: 'SUCCESS',
            payment_amount: 0,
            payment_currency: 'INR',
            payment_message: 'Simulated sandbox verification',
            payment_time: new Date().toISOString(),
          } as any,
        ];
      }
    }
    try {
      const { data } = await this.http.get(`/orders/${encodeURIComponent(orderId)}/payments`);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.logger.error(
        `Cashfree payment lookup failed: ${
          axios.isAxiosError(error) ? error.response?.status ?? error.message : (error as Error).message
        }`,
      );
      throw new BadGatewayException('Could not verify payment with Cashfree');
    }
  }

  async getOrder(orderId: string): Promise<CashfreeOrderResponse> {
    try {
      const { data } = await this.http.get<CashfreeOrderResponse>(`/orders/${encodeURIComponent(orderId)}`);
      return data;
    } catch (error) {
      this.logger.error(
        `Cashfree getOrder failed: ${
          axios.isAxiosError(error) ? error.response?.status ?? error.message : (error as Error).message
        }`,
      );
      throw new BadGatewayException('Could not fetch order from Cashfree');
    }
  }

  verifyWebhookSignature(rawBody: Buffer, timestamp: string, signature: string): boolean {
    if (!rawBody?.length || !timestamp || !signature) {
      return false;
    }

    try {
      const expected = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]))
        .digest('base64');

      const expectedBuffer = Buffer.from(expected, 'utf8');
      const receivedBuffer = Buffer.from(signature, 'utf8');

      if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch {
      return false;
    }
  }

  assertWebhookSignature(
    rawBody: Buffer,
    timestamp: string | undefined,
    signature: string | undefined,
    maxAgeSeconds = 300,
  ): void {
    if (!timestamp || !timestamp.trim()) {
      throw new UnauthorizedException('Missing required x-webhook-timestamp header');
    }

    if (!signature || !signature.trim()) {
      throw new UnauthorizedException('Missing required x-webhook-signature header');
    }

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum) || tsNum <= 0) {
      throw new UnauthorizedException('Invalid x-webhook-timestamp format');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const tsSec = tsNum > 1e11 ? Math.floor(tsNum / 1000) : tsNum;
    const diffSec = Math.abs(nowSec - tsSec);
    if (diffSec > maxAgeSeconds) {
      throw new UnauthorizedException(
        `Webhook timestamp expired or out of allowed window (${diffSec}s difference, max allowed: ${maxAgeSeconds}s)`,
      );
    }

    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing raw request body for webhook verification');
    }

    if (!this.verifyWebhookSignature(rawBody, timestamp, signature)) {
      throw new UnauthorizedException('Invalid Cashfree webhook signature');
    }
  }

  /**
   * Validates UPI VPA format against standard UPI syntax.
   * Note: This validates syntax only and explicitly labels the result as not yet provider-verified,
   * avoiding false claims that a nonexistent account is verified.
   */
  validateUpiFormat(upiId: string) {
    const trimmed = typeof upiId === 'string' ? upiId.trim() : '';
    const vpaRegex = /^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/;
    const isValidFormat = vpaRegex.test(trimmed) && trimmed.length >= 5 && trimmed.length <= 100;

    return {
      valid: isValidFormat,
      formatValid: isValidFormat,
      providerVerified: false,
      message: isValidFormat
        ? 'Format looks valid. Account existence will be verified by payment provider during authorization.'
        : 'Enter a UPI ID in a supported format (e.g. username@bank)',
      upiId: trimmed,
    };
  }
}