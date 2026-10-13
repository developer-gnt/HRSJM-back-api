import { registerAs } from '@nestjs/config';

export default registerAs('cashfree', () => {
  const env = (process.env.CASHFREE_ENV ?? 'SANDBOX').toUpperCase();
  return {
    appId: process.env.CASHFREE_APP_ID ?? 'TEST_MOCK_APP_ID',
    secretKey: process.env.CASHFREE_SECRET_KEY ?? 'TEST_MOCK_SECRET_KEY',
    apiVersion: process.env.CASHFREE_API_VERSION ?? '2023-08-01',
    webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET ?? 'hrsjm_cashfree_sandbox_webhook_secret',
    environment: env,
    apiBaseUrl:
      env === 'PRODUCTION'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg',
    timeoutMs: Number(process.env.CASHFREE_API_TIMEOUT_MS ?? 10000),
    returnUrl: process.env.CASHFREE_RETURN_URL ?? 'https://hrsjm.org/payments/callback?order_id={order_id}',
    webhookUrl: process.env.CASHFREE_WEBHOOK_URL ?? 'http://localhost:3000/api/v1/payments/cashfree/webhook',
  };
});
