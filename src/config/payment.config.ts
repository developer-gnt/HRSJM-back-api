import { registerAs } from '@nestjs/config';

/**
 * Payment gateway configuration (generic placeholders — the provider is TBC,
 * BRD §54 #8). No vendor specifics are hard-coded in the financial flows;
 * the gateway_name strings recorded on transactions stay informational.
 */
export default registerAs('payment', () => ({
  gatewayKey: process.env.PAYMENT_GATEWAY_KEY ?? '',
  gatewaySecret: process.env.PAYMENT_GATEWAY_SECRET ?? '',
}));
