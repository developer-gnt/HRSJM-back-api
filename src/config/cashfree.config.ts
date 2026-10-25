import { registerAs } from '@nestjs/config';

export interface CashfreeConfig {
  appId: string;
  secretKey: string;
  apiVersion: string;
  webhookSecret: string;
  environment: string;
  apiBaseUrl: string;
  timeoutMs: number;
  returnUrl: string;
  webhookUrl: string;
}

export function validateCashfreeConfig(
  env: Record<string, string | undefined> = process.env,
): CashfreeConfig {
  const isAppProduction =
    (env.APP_ENV ?? env.NODE_ENV ?? 'development').toLowerCase() === 'production';
  const cashfreeEnv = (env.CASHFREE_ENV ?? 'SANDBOX').toUpperCase();
  const isCashfreeProduction = cashfreeEnv === 'PRODUCTION';

  const appId = env.CASHFREE_APP_ID?.trim();
  const secretKey = env.CASHFREE_SECRET_KEY?.trim();
  const webhookSecret = env.CASHFREE_WEBHOOK_SECRET?.trim();

  // If Cashfree environment is explicitly set to PRODUCTION, require live credentials
  if (isCashfreeProduction) {
    const missing: string[] = [];
    if (!appId || appId === 'TEST_MOCK_APP_ID') {
      missing.push('CASHFREE_APP_ID');
    }
    if (!secretKey || secretKey === 'TEST_MOCK_SECRET_KEY') {
      missing.push('CASHFREE_SECRET_KEY');
    }
    if (!webhookSecret || webhookSecret === 'hrsjm_cashfree_sandbox_webhook_secret') {
      missing.push('CASHFREE_WEBHOOK_SECRET');
    }

    if (missing.length > 0) {
      throw new Error(
        `FATAL CONFIGURATION ERROR: Production Cashfree payment configuration requires valid credentials. Missing or placeholder values for: ${missing.join(
          ', ',
        )}.`,
      );
    }
  }

  return {
    appId: appId || 'TEST_MOCK_APP_ID',
    secretKey: secretKey || 'TEST_MOCK_SECRET_KEY',
    apiVersion: env.CASHFREE_API_VERSION ?? '2023-08-01',
    webhookSecret: webhookSecret || 'hrsjm_cashfree_sandbox_webhook_secret',
    environment: cashfreeEnv,
    apiBaseUrl:
      cashfreeEnv === 'PRODUCTION'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg',
    timeoutMs: Number(env.CASHFREE_API_TIMEOUT_MS ?? 10000),
    returnUrl:
      env.CASHFREE_RETURN_URL ??
      'https://hrsjm.org/payments/callback?order_id={order_id}',
    webhookUrl:
      env.CASHFREE_WEBHOOK_URL ??
      'http://localhost:3000/api/v1/payments/cashfree/webhook',
  };
}

export default registerAs('cashfree', (): CashfreeConfig => validateCashfreeConfig(process.env));
