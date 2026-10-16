import { validateAuthConfig } from './auth.config';
import { validateCashfreeConfig } from './cashfree.config';
import { getDatabaseSslConfig } from './database.config';

describe('Configuration Validation Tests', () => {
  describe('auth.config validation', () => {
    it('should allow default placeholder in development mode', () => {
      const config = validateAuthConfig({ APP_ENV: 'development', JWT_SECRET: undefined });
      expect(config.jwtSecret).toBe('change-me-in-development');
      expect(config.jwtExpiresIn).toBe('1h');
    });

    it('should fail in production if JWT_SECRET is missing', () => {
      expect(() =>
        validateAuthConfig({ APP_ENV: 'production', JWT_SECRET: undefined }),
      ).toThrow('JWT_SECRET environment variable is required and cannot be empty in production');
    });

    it('should fail in production if JWT_SECRET is blank', () => {
      expect(() =>
        validateAuthConfig({ APP_ENV: 'production', JWT_SECRET: '   ' }),
      ).toThrow('JWT_SECRET environment variable is required and cannot be empty in production');
    });

    it('should fail in production if JWT_SECRET is a known development placeholder', () => {
      expect(() =>
        validateAuthConfig({ APP_ENV: 'production', JWT_SECRET: 'change-me-in-development' }),
      ).toThrow('must not use a known development placeholder');
    });

    it('should fail in production if JWT_SECRET is shorter than 32 characters', () => {
      expect(() =>
        validateAuthConfig({ APP_ENV: 'production', JWT_SECRET: 'too-short-secret' }),
      ).toThrow('must be at least 32 characters long');
    });

    it('should succeed in production with a valid 32+ char secret', () => {
      const validSecret = 'a-very-secure-and-long-random-jwt-secret-string-123456';
      const config = validateAuthConfig({ APP_ENV: 'production', JWT_SECRET: validSecret });
      expect(config.jwtSecret).toBe(validSecret);
    });
  });

  describe('cashfree.config validation', () => {
    it('should allow mock credentials in development/sandbox mode', () => {
      const config = validateCashfreeConfig({ APP_ENV: 'development', CASHFREE_ENV: 'SANDBOX' });
      expect(config.appId).toBe('TEST_MOCK_APP_ID');
      expect(config.apiBaseUrl).toBe('https://sandbox.cashfree.com/pg');
      expect(config.environment).toBe('SANDBOX');
    });

    it('should reject placeholder credentials when CASHFREE_ENV is PRODUCTION', () => {
      expect(() =>
        validateCashfreeConfig({
          APP_ENV: 'development',
          CASHFREE_ENV: 'PRODUCTION',
          CASHFREE_APP_ID: 'TEST_MOCK_APP_ID',
        }),
      ).toThrow('Production Cashfree payment configuration requires valid credentials');
    });

    it('should reject missing credentials when APP_ENV is production', () => {
      expect(() =>
        validateCashfreeConfig({
          APP_ENV: 'production',
          CASHFREE_ENV: 'SANDBOX',
          CASHFREE_APP_ID: undefined,
          CASHFREE_SECRET_KEY: undefined,
        }),
      ).toThrow('Missing or placeholder values for: CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_WEBHOOK_SECRET');
    });

    it('should accept valid credentials in production', () => {
      const config = validateCashfreeConfig({
        APP_ENV: 'production',
        CASHFREE_ENV: 'PRODUCTION',
        CASHFREE_APP_ID: 'CF_PROD_1234567890',
        CASHFREE_SECRET_KEY: 'cf_secret_key_prod_abcdef123456',
        CASHFREE_WEBHOOK_SECRET: 'cf_wh_sec_prod_987654321',
      });
      expect(config.appId).toBe('CF_PROD_1234567890');
      expect(config.apiBaseUrl).toBe('https://api.cashfree.com/pg');
      expect(config.environment).toBe('PRODUCTION');
    });
  });

  describe('database.config TLS validation', () => {
    it('should disable SSL in development by default', () => {
      const ssl = getDatabaseSslConfig({ APP_ENV: 'development' });
      expect(ssl).toBe(false);
    });

    it('should enforce rejectUnauthorized in production when SSL is active', () => {
      const ssl = getDatabaseSslConfig({ APP_ENV: 'production', DATABASE_SSL: 'true' }) as any;
      expect(ssl).toBeDefined();
      expect(ssl.rejectUnauthorized).toBe(true);
    });

    it('should reject rejectUnauthorized=false in production', () => {
      expect(() =>
        getDatabaseSslConfig({
          APP_ENV: 'production',
          DATABASE_SSL: 'true',
          DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
        }),
      ).toThrow('DATABASE_SSL_REJECT_UNAUTHORIZED cannot be set to false in production');
    });

    it('should attach CA cert when DATABASE_CA_CERT is provided', () => {
      const mockCert = '-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----';
      const ssl = getDatabaseSslConfig({
        APP_ENV: 'production',
        DATABASE_SSL: 'true',
        DATABASE_CA_CERT: mockCert,
      }) as any;
      expect(ssl.ca).toBe(mockCert);
      expect(ssl.rejectUnauthorized).toBe(true);
    });

    it('should fail if DATABASE_CA_PATH does not exist', () => {
      expect(() =>
        getDatabaseSslConfig({
          APP_ENV: 'production',
          DATABASE_SSL: 'true',
          DATABASE_CA_PATH: '/non/existent/path/ca.pem',
        }),
      ).toThrow('Database CA certificate file not found');
    });
  });
});
