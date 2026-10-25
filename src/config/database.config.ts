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
  const host = (env.DATABASE_HOST ?? 'localhost').toLowerCase().trim();
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const sslExplicitlyFalse = env.DATABASE_SSL === 'false';
  const sslRequested = env.DATABASE_SSL === 'true';

  // If SSL is explicitly false or connecting locally without SSL requested, disable SSL
  if (sslExplicitlyFalse || (isLocalhost && !sslRequested)) {
    return false;
  }

  const isProduction =
    (env.APP_ENV ?? env.NODE_ENV ?? 'development').toLowerCase() === 'production';

  // In non-production, SSL is disabled unless explicitly requested
  if (!sslRequested && !isProduction) {
    return false;
  }

  // When SSL is enabled:
  const rejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';

  const sslOptions: DatabaseSslOptions = {
    rejectUnauthorized: isLocalhost ? false : rejectUnauthorized,
  };

  if (env.DATABASE_CA_CERT) {
    sslOptions.ca = env.DATABASE_CA_CERT;
  } else if (env.DATABASE_CA_PATH) {
    if (fs.existsSync(env.DATABASE_CA_PATH)) {
      sslOptions.ca = fs.readFileSync(env.DATABASE_CA_PATH, 'utf8');
    }
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
