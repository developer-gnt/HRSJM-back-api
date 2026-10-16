import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as fs from 'fs';
import { SnakeNamingStrategy } from './snake-naming.strategy';

export interface DatabaseSslOptions {
  rejectUnauthorized: boolean;
  ca?: string;
}

export function getDatabaseSslConfig(
  env: Record<string, string | undefined> = process.env,
): boolean | DatabaseSslOptions {
  const isProduction =
    (env.APP_ENV ?? env.NODE_ENV ?? 'development').toLowerCase() === 'production';
  const sslRequested = env.DATABASE_SSL === 'true';

  // In non-production, SSL is disabled unless explicitly requested
  if (!sslRequested && !isProduction) {
    return false;
  }

  // When SSL is enabled or running in production:
  // Certificate verification (rejectUnauthorized) must be true
  const rejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';

  if (isProduction && !rejectUnauthorized) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: Insecure database TLS configuration. DATABASE_SSL_REJECT_UNAUTHORIZED cannot be set to false in production.',
    );
  }

  const sslOptions: DatabaseSslOptions = {
    rejectUnauthorized,
  };

  if (env.DATABASE_CA_CERT) {
    sslOptions.ca = env.DATABASE_CA_CERT;
  } else if (env.DATABASE_CA_PATH) {
    if (!fs.existsSync(env.DATABASE_CA_PATH)) {
      throw new Error(
        `FATAL CONFIGURATION ERROR: Database CA certificate file not found at: ${env.DATABASE_CA_PATH}`,
      );
    }
    sslOptions.ca = fs.readFileSync(env.DATABASE_CA_PATH, 'utf8');
  }

  return sslOptions;
}

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME ?? 'hrsjm',
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    autoLoadEntities: true,
    migrationsRun: false,
    logging: process.env.DATABASE_LOGGING === 'true',
    ssl: getDatabaseSslConfig(process.env),
  }),
);
