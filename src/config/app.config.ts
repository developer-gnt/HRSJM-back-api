import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'HRSJM',
  env: process.env.APP_ENV ?? 'development',
  port: Number(process.env.APP_PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsEnabled: process.env.CORS_ENABLED !== 'false',
}));
