import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { RefreshTokenEntity } from '../../users/entities/refresh-token.entity';

// @nestjs/jwt ships ESM syntax jest cannot parse from node_modules; the real
// JwtService is replaced by a mock instance in these tests anyway.
jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtServiceMock {} }));

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const futureDate = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

describe('AuthService', () => {
  let service: AuthService;
  let usersService: Record<string, jest.Mock>;
  let jwtService: Record<string, jest.Mock>;
  let auditService: Record<string, jest.Mock>;
  let configService: { get: jest.Mock };
  let dataSource: Record<string, jest.Mock>;
  let refreshTokens: Record<string, jest.Mock>;
  let resetTokens: Record<string, jest.Mock>;

  const buildService = () =>
    new AuthService(
      usersService as never,
      jwtService as never,
      auditService as never,
      configService as never,
      dataSource as never,
      refreshTokens as never,
      resetTokens as never,
    );

  beforeEach(() => {
    usersService = {
      assertNoDuplicates: jest.fn().mockResolvedValue(undefined),
      createUserWithRole: jest.fn().mockResolvedValue({ id: 'u1', status: 'ACTIVE' }),
      findByLoginIdentifier: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(null),
      getProfile: jest.fn().mockResolvedValue({ id: 'u1', roles: [{ id: 'r1', name: 'MEMBER' }], status: 'ACTIVE' }),
      toProfile: jest.fn().mockReturnValue({ id: 'u1', roles: [{ id: 'r1', name: 'MEMBER' }] }),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('access-token') };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    configService = {
      get: jest.fn((key: string) =>
        key === 'auth'
          ? { jwtSecret: 'test-secret', jwtExpiresIn: '1h', jwtRefreshExpiresIn: '7d' }
          : { env: 'development' },
      ),
    };
    dataSource = {
      transaction: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((x) => x),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockResolvedValue(undefined),
      }),
    };
    refreshTokens = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (x) => ({ ...x, id: 'rt-new' })),
      create: jest.fn((x) => x),
    };
    resetTokens = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    service = buildService();
  });

  it('TC-AUTH-003: register rejects duplicate mobile number', async () => {
    usersService.assertNoDuplicates = jest
      .fn()
      .mockRejectedValue(
        new ConflictException({
          message: 'Mobile number already registered',
          code: 'MOBILE_NUMBER_TAKEN',
          details: null,
        }),
      );

    await expect(
      service.register(
        {
          full_name: 'Test User',
          mobile_number: '9999999999',
          password: 'password123',
          confirm_password: 'password123',
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(usersService.createUserWithRole).not.toHaveBeenCalled();
  });

  it('TC-AUTH-004: register rejects duplicate email', async () => {
    usersService.assertNoDuplicates = jest
      .fn()
      .mockRejectedValue(
        new ConflictException({
          message: 'Email already registered',
          code: 'EMAIL_TAKEN',
          details: null,
        }),
      );

    await expect(
      service.register(
        {
          full_name: 'Test User',
          mobile_number: '9999999999',
          email: 'taken@example.com',
          password: 'password123',
          confirm_password: 'password123',
        },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('TC-AUTH-005: register with DONATION_SEEKER provisions initial role USER pending admin approval', async () => {
    await service.register(
      {
        full_name: 'Donation Seeker Applicant',
        mobile_number: '9876543210',
        email: 'applicant@example.com',
        password: 'password123',
        confirm_password: 'password123',
        role_name: 'DONATION_SEEKER',
      },
      null,
      null,
    );

    expect(usersService.createUserWithRole).toHaveBeenCalledWith(
      expect.objectContaining({
        roleName: 'USER',
      }),
    );
  });

  it('TC-AUTH-012: login with wrong password throws INVALID_CREDENTIALS', async () => {
    const password_hash = await bcrypt.hash('correct-password', 10);
    usersService.findByLoginIdentifier = jest
      .fn()
      .mockResolvedValue({ id: 'u1', status: 'ACTIVE', password_hash });

    await expect(service.login('9999999999', 'wrong', null, null)).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
  });

  it('TC-AUTH-013: login with unknown user returns the same INVALID_CREDENTIALS code', async () => {
    usersService.findByLoginIdentifier = jest.fn().mockResolvedValue(null);

    await expect(service.login('nobody@example.com', 'whatever', null, null)).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('TC-AUTH-014: login with correct password on a disabled account throws ACCOUNT_DISABLED', async () => {
    const password_hash = await bcrypt.hash('correct-password', 10);
    usersService.findByLoginIdentifier = jest
      .fn()
      .mockResolvedValue({ id: 'u1', status: 'INACTIVE', password_hash });

    await expect(
      service.login('9999999999', 'correct-password', null, null),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_DISABLED' } });
  });

  it('TC-AUTH-025: refresh with a revoked token is rejected', async () => {
    refreshTokens.findOne = jest.fn().mockResolvedValue({
      id: 'rt1',
      user_id: 'u1',
      revoked_at: new Date(),
      expires_at: futureDate(),
    } as RefreshTokenEntity);

    await expect(service.refresh('raw-token', null, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('TC-AUTH-023/026: refresh rotates — old token revoked, raw new token returned', async () => {
    const raw = 'raw-refresh-token';
    const oldToken = {
      id: 'rt-old',
      user_id: 'u1',
      token_hash: sha256(raw),
      revoked_at: null,
      expires_at: futureDate(),
    } as RefreshTokenEntity;
    refreshTokens.findOne = jest.fn().mockResolvedValue(oldToken);
    usersService.findById = jest.fn().mockResolvedValue({ id: 'u1', status: 'ACTIVE' });

    const managerRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 'rt-new' })),
    };
    dataSource.transaction = jest.fn((cb) =>
      cb({ getRepository: () => managerRepo }),
    );

    const result = await service.refresh(raw, null, null);

    expect(result.access_token).toBe('access-token');
    // A brand-new opaque refresh token is returned (never the presented one)
    expect(result.refresh_token).not.toBe(raw);
    expect(result.refresh_token).toHaveLength(96);
    // The new token is stored only as its SHA-256 hash
    expect(managerRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ token_hash: sha256(result.refresh_token) }),
    );
    // The presented token is revoked and linked to its replacement
    expect(oldToken.revoked_at).toBeTruthy();
    expect(oldToken.replaced_by).toBe('rt-new');
  });

  it('TC-AUTH-028: logout is idempotent for unknown tokens', async () => {
    refreshTokens.findOne = jest.fn().mockResolvedValue(null);
    await expect(service.logout('unknown-token', null, null)).resolves.toBeUndefined();
    expect(refreshTokens.save).not.toHaveBeenCalled();
  });

  it('TC-AUTH-030: forgot password for an unknown account returns a generic result', async () => {
    usersService.findByLoginIdentifier = jest.fn().mockResolvedValue(null);

    const result = await service.forgotPassword('nobody@example.com', null, null);
    expect(result).toEqual({ delivered_mechanism: 'TBC' });
    expect(resetTokens.insert).not.toHaveBeenCalled();
  });

  it('forgot password for an existing account inserts token into database and returns dev token', async () => {
    usersService.findByLoginIdentifier = jest.fn().mockResolvedValue({
      id: 'u1',
      email: 'member@hrsjm.org',
      mobile_number: '9876543210',
    });

    const result = await service.forgotPassword('member@hrsjm.org', '127.0.0.1', 'jest-agent');
    expect(result.delivered_mechanism).toBe('TBC');
    expect(result.reset_token).toBeDefined();
    expect(resetTokens.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        token_hash: expect.any(String),
        expires_at: expect.any(Date),
      }),
    );
  });

  it('TC-AUTH-032: reset password with an unknown token throws RESET_TOKEN_INVALID', async () => {
    resetTokens.findOne = jest.fn().mockResolvedValue(null);

    await expect(
      service.resetPassword(
        { token: 'bad-token', password: 'newpassword1', confirm_password: 'newpassword1' },
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reset password with a valid token updates user password in database and revokes sessions', async () => {
    const validStoredToken = {
      id: 'tok-1',
      user_id: 'u1',
      token_hash: 'hash-abc',
      expires_at: new Date(Date.now() + 1800000), // 30 min in future
      used_at: null,
    };
    resetTokens.findOne = jest.fn().mockResolvedValue(validStoredToken);

    const mockManagerRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'u1', password_hash: 'old-hash' }),
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    };
    dataSource.transaction = jest.fn(async (cb: (manager: unknown) => Promise<unknown>) => {
      const manager = {
        getRepository: jest.fn().mockReturnValue(mockManagerRepo),
      };
      return cb(manager);
    });

    await service.resetPassword(
      { token: 'valid-token', password: 'NewStrongPassword123!', confirm_password: 'NewStrongPassword123!' },
      '127.0.0.1',
      'jest-agent',
    );

    // Verifies user password hash saved
    expect(mockManagerRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'u1',
        password_hash: expect.any(String),
      }),
    );
    // Verifies token marked used
    expect(mockManagerRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tok-1',
        used_at: expect.any(Date),
      }),
    );
    // Verifies refresh tokens revoked
    expect(mockManagerRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1' }),
      expect.objectContaining({ revoked_at: expect.any(Date) }),
    );
  });

  describe('checkDuplicates', () => {
    it('returns available: true when neither mobile nor email exist in database', async () => {
      usersService.findByLoginIdentifier = jest.fn().mockResolvedValue(null);

      const res = await service.checkDuplicates({
        mobile_number: '9876543210',
        email: 'fresh@hrsjm.org',
      });

      expect(res.available).toBe(true);
      expect(res.mobile_taken).toBe(false);
      expect(res.email_taken).toBe(false);
    });

    it('returns mobile_taken: true when mobile number is already registered in database', async () => {
      usersService.findByLoginIdentifier = jest.fn((id: string) => {
        if (id === '9876543210') return Promise.resolve({ id: 'u-existing' });
        return Promise.resolve(null);
      });

      const res = await service.checkDuplicates({
        mobile_number: '9876543210',
        email: 'fresh@hrsjm.org',
      });

      expect(res.available).toBe(false);
      expect(res.mobile_taken).toBe(true);
      expect(res.email_taken).toBe(false);
      expect(res.mobile_message).toContain('Mobile number is already registered');
    });

    it('returns email_taken: true when email address is already registered in database', async () => {
      usersService.findByLoginIdentifier = jest.fn((id: string) => {
        if (id === 'registered@hrsjm.org') return Promise.resolve({ id: 'u-existing' });
        return Promise.resolve(null);
      });

      const res = await service.checkDuplicates({
        mobile_number: '9123456789',
        email: 'registered@hrsjm.org',
      });

      expect(res.available).toBe(false);
      expect(res.mobile_taken).toBe(false);
      expect(res.email_taken).toBe(true);
      expect(res.email_message).toContain('Email address is already registered');
    });
  });
});
