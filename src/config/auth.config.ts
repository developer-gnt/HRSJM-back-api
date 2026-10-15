import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
}

export const KNOWN_INSECURE_JWT_SECRETS = [
  'change-me-in-development',
  'secret',
  'jwt_secret',
  'change-me',
  'test',
  'development',
  'password',
  '123456',
  '12345678',
];

export function validateAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const isProduction =
    (env.APP_ENV ?? env.NODE_ENV ?? 'development').toLowerCase() === 'production';
  const rawSecret = env.JWT_SECRET?.trim();

  if (isProduction) {
    if (!rawSecret) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: JWT_SECRET environment variable is required and cannot be empty in production.',
      );
    }
    if (
      KNOWN_INSECURE_JWT_SECRETS.includes(rawSecret.toLowerCase()) ||
      rawSecret.length < 32
    ) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: JWT_SECRET in production must not use a known development placeholder and must be at least 32 characters long.',
      );
    }
  }

  return {
    jwtSecret: rawSecret || 'change-me-in-development',
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '1h',
    jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  };
}

export default registerAs('auth', (): AuthConfig => validateAuthConfig(process.env));
