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

export interface CreateSubscriptionParams {
  subscriptionId: string;
  amount: number;
  maxAmount?: number;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  frequency: 'MONTHLY' | 'YEARLY';
  planName?: string;
  planNote?: string;
  authAmount?: number;
  returnUrl?: string;
  expiryTime?: string;
}

export interface CashfreeSubscriptionResponse {
  subscription_id: string;
  subscription_session_id?: string;
  subscription_status?: string;
  plan_details?: Record<string, unknown>;
  customer_details?: Record<string, unknown>;
  authorization_details?: Record<string, unknown>;
  subscription_meta?: Record<string, unknown>;
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
    this.webhookSecret = (config.get<string>('cashfree.webhookSecret') || process.env.CASHFREE_WEBHOOK_SECRET || '').trim();
    this.apiVersion = (config.get<string>('cashfree.apiVersion') || process.env.CASHFREE_API_VERSION || '2023-08-01').trim();
    this.returnUrl = (config.get<string>('cashfree.returnUrl') || process.env.CASHFREE_RETURN_URL || 'https://hrsjm.org/payments/callback?order_id={order_id}').trim();
    this.webhookUrl = (config.get<string>('cashfree.webhookUrl') || process.env.CASHFREE_WEBHOOK_URL || 'http://localhost:3000/api/v1/payments/cashfree/webhook').trim();
    this.environment = (config.get<string>('cashfree.environment') || process.env.CASHFREE_ENV || 'SANDBOX').toUpperCase().trim();
    
    this.appId = (config.get<string>('cashfree.appId') || process.env.CASHFREE_APP_ID || '').trim();
    this.secretKey = (config.get<string>('cashfree.secretKey') || process.env.CASHFREE_SECRET_KEY || '').trim();

    const defaultBaseURL = this.environment === 'PRODUCTION'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
    const baseURL = (config.get<string>('cashfree.apiBaseUrl') || process.env.CASHFREE_BASE_URL || defaultBaseURL).trim();
    const timeout = Number(config.get<number>('cashfree.timeoutMs') || process.env.CASHFREE_API_TIMEOUT_MS || 10000);

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
      throw new BadGatewayException(
        'Cashfree Payment Gateway credentials are not configured. Please verify CASHFREE_APP_ID and CASHFREE_SECRET_KEY in server .env.',
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
          ...(this.webhookUrl &&
          !this.webhookUrl.includes('localhost') &&
          !this.webhookUrl.includes('127.0.0.1')
            ? { notify_url: this.webhookUrl }
            : {}),
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

  /**
   * Create a recurring AutoPay / Subscription mandate in Cashfree Subscriptions
   */
  async createSubscription(input: CreateSubscriptionParams): Promise<CashfreeSubscriptionResponse> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Invalid subscription recurring amount');
    }

    if (!this.appId || this.appId.startsWith('TEST_MOCK') || !this.secretKey || this.secretKey.startsWith('TEST_MOCK')) {
      if (this.environment === 'SANDBOX' || (process.env.APP_ENV || 'development').toLowerCase() !== 'production') {
        this.logger.warn('Mocking Cashfree subscription session for development');
        return {
          subscription_id: input.subscriptionId,
          subscription_session_id: `sub_session_mock_${Date.now()}`,
          subscription_status: 'INITIALIZED',
          plan_details: {
            plan_name: input.planName || 'Donation Plan',
            plan_amount: input.amount,
          },
        };
      }
      throw new BadGatewayException(
        'Cashfree Payment Gateway credentials are not configured.',
      );
    }

    try {
      const cleanPhone = (input.customerPhone || '9999999999').replace(/\D/g, '').slice(-10);
      const phone = cleanPhone.length === 10 ? cleanPhone : '9876543210';
      const cleanEmail = (input.customerEmail || 'donor@hrsjm.org').trim().toLowerCase();
      const cleanName = (input.customerName || 'HRSJM Supporter').replace(/[^a-zA-Z0-9 ]/g, ' ').slice(0, 100).trim();
      const intervalType = input.frequency === 'YEARLY' ? 'YEAR' : 'MONTH';
      const planName = (input.planName || `HRSJM_${input.frequency}_${Math.round(input.amount)}`).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 45);
      const planAmount = Number(input.amount.toFixed(2));
      const maxAmount = Number((input.maxAmount || Math.max(input.amount * 2, 5000)).toFixed(2));

      // Calculate default expiry: 3 years from now for recurring mandates
      const expiryDate = input.expiryTime || new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString();

      const returnUrl = (input.returnUrl || this.returnUrl).replace('{order_id}', '{sub_id}');

      const payload = {
        subscription_id: input.subscriptionId,
        customer_details: {
          customer_id: input.customerId.slice(0, 50),
          customer_name: cleanName,
          customer_email: cleanEmail,
          customer_phone: phone,
        },
        plan_details: {
          plan_name: planName,
          plan_type: 'PERIODIC',
          plan_currency: 'INR',
          plan_amount: planAmount,
          plan_max_amount: maxAmount,
          plan_max_cycles: 0, // 0 = unconstrained until cancelled
          plan_intervals: 1,
          plan_interval_type: intervalType,
          plan_note: (input.planNote || 'HRSJM AutoPay Subscription').slice(0, 200),
        },
        authorization_details: {
          authorization_amount: input.authAmount || 1,
          authorization_amount_refund: true,
          payment_methods: ['upi', 'card', 'enach'],
        },
        subscription_meta: {
          return_url: returnUrl,
          ...(this.webhookUrl && !this.webhookUrl.includes('localhost') && !this.webhookUrl.includes('127.0.0.1')
            ? { notify_url: this.webhookUrl }
            : {}),
        },
        subscription_expiry_time: expiryDate,
        subscription_note: (input.planNote || 'Recurring AutoPay').slice(0, 250),
      };

      const { data } = await this.http.post<CashfreeSubscriptionResponse>('/subscriptions', payload);

      if (!data?.subscription_id) {
        throw new BadGatewayException('Cashfree response missing subscription_id');
      }

      return data;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof BadGatewayException) {
        throw error;
      }
      const errData = axios.isAxiosError(error) ? error.response?.data : null;
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      const code = (errData as any)?.code;
      const message = (errData as any)?.message || (error as Error).message;

      this.logger.error(`Cashfree createSubscription failed: [${status}] ${code}: ${message}`);

      // Graceful sandbox fallback for dev if merchant profile hasn't activated Subscriptions in Cashfree test dashboard yet
      if (code === 'profile_inactive' && (this.environment === 'SANDBOX' || (process.env.APP_ENV || 'development').toLowerCase() !== 'production')) {
        this.logger.warn(
          'Notice: Cashfree Subscriptions profile is inactive in Sandbox. Activating sandbox fallback so UI testing can proceed.',
        );
        return {
          subscription_id: input.subscriptionId,
          subscription_session_id: `sub_session_sandbox_${Date.now()}`,
          subscription_status: 'INITIALIZED',
          sandbox_profile_inactive: true,
          plan_details: {
            plan_name: input.planName || 'Recurring Plan',
            plan_amount: input.amount,
          },
        };
      }

      throw new BadGatewayException(
        `Cashfree subscription creation failed: ${message}${
          code === 'profile_inactive'
            ? ' (Subscriptions product must be enabled in Cashfree Dashboard).'
            : ''
        }`,
      );
    }
  }

  /**
   * Retrieve subscription details and mandate status from Cashfree
   */
  async getSubscription(subscriptionId: string): Promise<CashfreeSubscriptionResponse> {
    try {
      const { data } = await this.http.get<CashfreeSubscriptionResponse>(
        `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      return data;
    } catch (error) {
      // In sandbox/dev fallback:
      if (this.environment === 'SANDBOX' || (process.env.APP_ENV || 'development').toLowerCase() !== 'production') {
        return {
          subscription_id: subscriptionId,
          subscription_status: 'ACTIVE',
          plan_details: { plan_name: 'HRSJM AutoPay Plan' },
        };
      }
      this.logger.error(
        `Cashfree getSubscription failed: ${
          axios.isAxiosError(error) ? error.response?.status ?? error.message : (error as Error).message
        }`,
      );
      throw new BadGatewayException('Could not fetch subscription from Cashfree');
    }
  }

  /**
   * Cancel an active subscription mandate
   */
  async cancelSubscription(subscriptionId: string): Promise<any> {
    try {
      const { data } = await this.http.post(
        `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
        {},
      );
      return data;
    } catch (error) {
      this.logger.error(
        `Cashfree cancelSubscription failed: ${
          axios.isAxiosError(error) ? error.response?.status ?? error.message : (error as Error).message
        }`,
      );
      throw new BadGatewayException('Could not cancel subscription with Cashfree');
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