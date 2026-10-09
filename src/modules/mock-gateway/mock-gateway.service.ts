import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  CreateGatewayOrderDto,
  ProcessGatewayChargeDto,
  VerifyGatewaySignatureDto,
} from './dto/mock-gateway.dto';

export interface MockOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'attempted' | 'paid';
  key_id: string;
  gateway: string;
  created_at: string;
  notes: Record<string, any>;
}

export interface MockPaymentResponse {
  payment_id: string;
  order_id: string;
  status: 'captured' | 'failed' | 'pending';
  amount: number;
  currency: string;
  method: string;
  method_details: Record<string, any>;
  bank_reference_no: string;
  auth_code: string;
  gateway_signature: string;
  captured_at: string;
  fee: number;
  tax: number;
  error_code?: string;
  error_description?: string;
}

@Injectable()
export class MockGatewayService {
  private readonly SECRET_KEY = 'hrsjm_sandbox_secret_key_mock_pg_2026';
  private readonly KEY_ID = 'rzp_test_hrsjm_live_sandbox';
  private ordersStore = new Map<string, MockOrderResponse>();
  private paymentsStore = new Map<string, MockPaymentResponse>();

  /**
   * Generates a new realistic mock gateway order
   */
  public createOrder(dto: CreateGatewayOrderDto): MockOrderResponse {
    const timestamp = Date.now();
    const orderId = `order_mock_${timestamp}_${Math.floor(100 + Math.random() * 900)}`;

    const order: MockOrderResponse = {
      order_id: orderId,
      amount: dto.amount,
      currency: dto.currency || 'INR',
      status: 'created',
      key_id: this.KEY_ID,
      gateway: 'HRSJM NPCI & UPI Sandbox Gateway',
      created_at: new Date().toISOString(),
      notes: {
        purpose: dto.purpose || 'donation',
        title: dto.title || 'HRSJM Initiative Support',
        entity_id: dto.entity_id || null,
        customer_name: dto.customer_name || 'Donor',
        customer_phone: dto.customer_phone || null,
        customer_email: dto.customer_email || null,
      },
    };

    this.ordersStore.set(orderId, order);
    return order;
  }

  /**
   * Simulates processing of a payment against the created order
   */
  public processCharge(dto: ProcessGatewayChargeDto): MockPaymentResponse {
    // Check if order exists (or fallback create if direct)
    let order = this.ordersStore.get(dto.order_id);
    if (!order) {
      order = {
        order_id: dto.order_id,
        amount: dto.amount,
        currency: 'INR',
        status: 'created',
        key_id: this.KEY_ID,
        gateway: 'HRSJM NPCI & UPI Sandbox Gateway',
        created_at: new Date().toISOString(),
        notes: {},
      };
      this.ordersStore.set(dto.order_id, order);
    }

    // Check simulated failure conditions
    const isExplicitFail =
      dto.simulation_mode === 'failure' ||
      dto.upi_id?.toLowerCase().includes('fail') ||
      dto.card_number?.replace(/\s/g, '').endsWith('0000');

    if (isExplicitFail) {
      const failedPayment: MockPaymentResponse = {
        payment_id: `pay_mock_failed_${Date.now()}`,
        order_id: dto.order_id,
        status: 'failed',
        amount: dto.amount,
        currency: 'INR',
        method: dto.payment_method,
        method_details: {
          upi_id: dto.upi_id,
          bank: dto.bank_name,
        },
        bank_reference_no: '',
        auth_code: '',
        gateway_signature: '',
        captured_at: new Date().toISOString(),
        fee: 0,
        tax: 0,
        error_code: 'BAD_REQUEST_PAYMENT_DECLINED',
        error_description: 'Payment was declined by the simulated bank server / issuer.',
      };
      return failedPayment;
    }

    // Generate successful payment signature and identifiers
    const timestamp = Date.now();
    const paymentId = `pay_mock_${timestamp}_${Math.floor(1000 + Math.random() * 9000)}`;
    const rrn = `UPI${timestamp.toString().slice(-8)}${Math.floor(1000 + Math.random() * 9000)}`;
    const authCode = `AUTH${Math.floor(100000 + Math.random() * 900000)}`;

    const hmac = crypto.createHmac('sha256', this.SECRET_KEY);
    hmac.update(`${dto.order_id}|${paymentId}`);
    const signature = hmac.digest('hex');

    let methodDetails: Record<string, any> = {};
    if (dto.payment_method === 'upi') {
      methodDetails = {
        vpa: dto.upi_id || 'user@upi',
        app: dto.upi_app || 'Google Pay',
        npci_ref: rrn,
      };
    } else if (dto.payment_method === 'card') {
      const cleanCard = (dto.card_number || '4111222233334444').replace(/\s/g, '');
      methodDetails = {
        last4: cleanCard.slice(-4),
        network: cleanCard.startsWith('4') ? 'Visa' : 'Mastercard',
        card_holder: dto.card_holder || 'Cardholder',
      };
    } else if (dto.payment_method === 'netbanking') {
      methodDetails = {
        bank: dto.bank_name || 'HDFC Bank',
      };
    } else if (dto.payment_method === 'wallet') {
      methodDetails = {
        wallet: dto.wallet_name || 'Paytm Wallet',
      };
    }

    const successPayment: MockPaymentResponse = {
      payment_id: paymentId,
      order_id: dto.order_id,
      status: 'captured',
      amount: dto.amount,
      currency: 'INR',
      method: dto.payment_method,
      method_details: methodDetails,
      bank_reference_no: rrn,
      auth_code: authCode,
      gateway_signature: signature,
      captured_at: new Date().toISOString(),
      fee: 0, // No surcharge for non-profit donations
      tax: 0,
    };

    order.status = 'paid';
    this.paymentsStore.set(paymentId, successPayment);
    return successPayment;
  }

  /**
   * Verifies the authenticity of a payment signature
   */
  public verifySignature(dto: VerifyGatewaySignatureDto): { verified: boolean; message: string } {
    const hmac = crypto.createHmac('sha256', this.SECRET_KEY);
    hmac.update(`${dto.order_id}|${dto.payment_id}`);
    const expectedSignature = hmac.digest('hex');

    if (dto.signature === expectedSignature) {
      return { verified: true, message: 'Payment signature verified successfully.' };
    }
    throw new BadRequestException('Invalid payment signature verification failed.');
  }

  /**
   * Returns pre-loaded sandbox test credentials
   */
  public getTestCredentials() {
    return {
      gateway_mode: 'SANDBOX_SIMULATOR',
      key_id: this.KEY_ID,
      supported_methods: ['upi', 'card', 'netbanking', 'wallet'],
      test_upi_ids: [
        { handle: 'success@upi', scenario: 'Instant Success' },
        { handle: 'member@okaxis', scenario: 'Verified Member' },
        { handle: 'fail@upi', scenario: 'Simulate Bank Decline' },
      ],
      test_cards: [
        {
          number: '4111 2222 3333 4444',
          network: 'Visa',
          expiry: '12/28',
          cvv: '123',
          scenario: 'Instant Success',
        },
        {
          number: '5555 4444 3333 2222',
          network: 'Mastercard',
          expiry: '09/27',
          cvv: '888',
          scenario: 'Instant Success',
        },
        {
          number: '4000 0000 0000 0000',
          network: 'Visa',
          expiry: '01/29',
          cvv: '000',
          scenario: 'Simulate Decline',
        },
      ],
      test_banks: ['HDFC Bank', 'State Bank of India', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra'],
      test_wallets: ['Paytm Wallet', 'PhonePe Wallet', 'Amazon Pay'],
    };
  }
}
