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
    dataSource = { transaction: jest.fn() };
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
});
