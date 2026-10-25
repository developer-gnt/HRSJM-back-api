import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { PasswordResetDeliveryService } from '../delivery/password-reset-delivery.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuditService } from '../../audit/services/audit.service';
import { parseDurationToMs } from '../../../common/utils/parse-duration.util';
import { PasswordResetTokenEntity } from '../../users/entities/password-reset-token.entity';
import { RefreshTokenEntity } from '../../users/entities/refresh-token.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import { MembershipCategoryEntity } from '../../membership-categories/entities/membership-category.entity';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';
import { CommonStatus } from '../../../common/enums/common-status.enum';
import { UsersService, UserProfile } from '../../users/services/users.service';
import { RegisterDto } from '../dto/register.dto';
import { ChangePasswordDto, ResetPasswordDto } from '../dto/password.dto';
import { CheckDuplicatesDto } from '../dto/check-duplicates.dto';
import {
  AssistanceRequestEntity,
  AssistanceRequestStatus,
} from '../../assistance/entities/assistance-request.entity';

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokens: Repository<RefreshTokenEntity>,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly resetTokens: Repository<PasswordResetTokenEntity>,
  ) {}

  async register(
    dto: RegisterDto,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ user: UserProfile } & AuthTokens> {
    await this.usersService.assertNoDuplicates(
      dto.mobile_number,
      dto.email ?? null,
    );

    const isDonationSeekerRequest = dto.role_name === 'DONATION_SEEKER';
    // When someone creates an account as Donation Seeker, they are provisioned with
    // initial role USER while their application goes to the admin for verification/approval.
    const initialRoleName = isDonationSeekerRequest ? 'USER' : (dto.role_name ?? 'USER');

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.createUserWithRole({
      full_name: dto.full_name,
      mobile_number: dto.mobile_number,
      email: dto.email ? dto.email.toLowerCase() : null,
      password_hash,
      roleId: dto.role_id,
      // Self-service registration picks role by name (never ADMIN);
      // defaults to USER when unspecified or when seeker application is pending admin approval.
      roleName: dto.role_id ? undefined : initialRoleName,
    });

    if (isDonationSeekerRequest) {
      try {
        const assistanceRepo = this.dataSource.getRepository(AssistanceRequestEntity);
        const initialRequest = assistanceRepo.create({
          user_id: user.id,
          full_name: dto.full_name.trim(),
          mobile: dto.mobile_number.trim(),
          email: dto.email ? dto.email.trim().toLowerCase() : null,
          requested_amount: 0,
          reason: 'Donation Seeker Account Verification',
          description: 'New donation seeker registration pending administrator verification and approval.',
          status: AssistanceRequestStatus.PENDING,
          created_by: user.id,
          updated_by: user.id,
        });
        await assistanceRepo.save(initialRequest);
      } catch (err) {
        console.warn('Could not record initial assistance request for donation seeker:', err);
      }
    }

    await this.auditService.record({
      event: 'AUTH_REGISTER',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      ip,
      userAgent,
      metadata: {
        has_email: Boolean(dto.email),
        requested_role: dto.role_name,
        provisioned_role: initialRoleName,
      },
    });

    const tokens = await this.issueTokens(user, ip, userAgent);
    return { user: await this.profileOrThrow(user.id), ...tokens };
  }

  async login(
    identifier: string,
    password: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ user: UserProfile } & AuthTokens> {
    const user = await this.usersService.findByLoginIdentifier(identifier);
    const passwordOk = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!user || !passwordOk) {
      await this.auditService.record({
        event: 'AUTH_LOGIN_FAILED',
        actorId: user?.id ?? null,
        entityType: 'user',
        entityId: user?.id ?? null,
        ip,
        userAgent,
      });
      // Same generic message for unknown users and wrong passwords (no user enumeration)
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        details: null,
      });
    }

    if (user.status !== 'ACTIVE') {
      await this.auditService.record({
        event: 'AUTH_LOGIN_BLOCKED_DISABLED',
        actorId: user.id,
        entityType: 'user',
        entityId: user.id,
        ip,
        userAgent,
      });
      throw new ForbiddenException({
        message: 'Your account has been deactivated. Contact the HRSJM office.',
        code: 'ACCOUNT_DISABLED',
        details: null,
      });
    }

    // Enforce membership status gate: cannot login if pending, under review, or rejected
    await this.verifyMemberAccessOrThrow(user.id, ip, userAgent);

    const tokens = await this.issueTokens(user, ip, userAgent);
    await this.auditService.record({
      event: 'AUTH_LOGIN',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      ip,
      userAgent,
    });
    return { user: await this.profileOrThrow(user.id), ...tokens };
  }

  async refresh(
    rawRefreshToken: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ user: UserProfile } & AuthTokens> {
    const stored = await this.refreshTokens.findOne({
      where: { token_hash: sha256(rawRefreshToken) },
    });

    if (
      !stored ||
      stored.revoked_at ||
      stored.expires_at.getTime() < Date.now()
    ) {
      throw new UnauthorizedException({
        message: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN',
        details: null,
      });
    }

    const user = await this.usersService.findById(stored.user_id);
    if (!user) {
      throw new UnauthorizedException({
        message: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN',
        details: null,
      });
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException({
        message: 'Your account has been deactivated. Contact the HRSJM office.',
        code: 'ACCOUNT_DISABLED',
        details: null,
      });
    }

    await this.verifyMemberAccessOrThrow(user.id, ip, userAgent);

    // Rotation: the presented refresh token is revoked and replaced in one transaction.
    const rawToken = randomBytes(48).toString('hex');
    const profile = await this.profileOrThrow(user.id);
    const access_token = await this.signAccessToken(
      user.id,
      profile.roles.map((r) => r.name),
    );

    await this.dataSource.transaction(async (manager) => {
      const refreshTokenRepo = manager.getRepository(RefreshTokenEntity);
      const saved = await refreshTokenRepo.save(
        refreshTokenRepo.create({
          user_id: user.id,
          token_hash: sha256(rawToken),
          expires_at: this.refreshTokenExpiry(),
        }),
      );
      stored.revoked_at = new Date();
      stored.replaced_by = saved.id;
      await refreshTokenRepo.save(stored);
    });

    await this.auditService.record({
      event: 'AUTH_TOKEN_REFRESHED',
      actorId: user.id,
      entityType: 'refresh_token',
      entityId: stored.id,
      ip,
      userAgent,
    });

    return { user: profile, access_token, refresh_token: rawToken };
  }

  async logout(
    rawRefreshToken: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const stored = await this.refreshTokens.findOne({
      where: { token_hash: sha256(rawRefreshToken) },
    });

    if (stored && !stored.revoked_at) {
      stored.revoked_at = new Date();
      await this.refreshTokens.save(stored);
      await this.auditService.record({
        event: 'AUTH_LOGOUT',
        actorId: stored.user_id,
        entityType: 'refresh_token',
        entityId: stored.id,
        ip,
        userAgent,
      });
    }
    // Idempotent: unknown or already-revoked tokens still succeed (TC-AUTH-028).
  }

  async checkDuplicates(
    dto: CheckDuplicatesDto,
  ): Promise<{
    available: boolean;
    mobile_taken: boolean;
    email_taken: boolean;
    mobile_message?: string;
    email_message?: string;
  }> {
    let mobile_taken = false;
    let email_taken = false;
    let mobile_message: string | undefined;
    let email_message: string | undefined;

    const cleanMobile = dto.mobile_number
      ? dto.mobile_number.replace(/\D/g, '').slice(-10)
      : undefined;
    const cleanEmail = dto.email ? dto.email.trim().toLowerCase() : undefined;

    if (cleanMobile && cleanMobile.length === 10) {
      const userWithMobile = await this.usersService.findByLoginIdentifier(cleanMobile);
      if (userWithMobile) {
        mobile_taken = true;
        mobile_message = 'Mobile number is already registered. Please sign in or use another number.';
      }
    }

    if (cleanEmail && cleanEmail.includes('@')) {
      const userWithEmail = await this.usersService.findByLoginIdentifier(cleanEmail);
      if (userWithEmail) {
        email_taken = true;
        email_message = 'Email address is already registered. Please sign in or use another email.';
      }
    }

    return {
      available: !mobile_taken && !email_taken,
      mobile_taken,
      email_taken,
      mobile_message,
      email_message,
    };
  }

  async forgotPassword(
    identifier: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ delivered_mechanism: 'TBC'; reset_token?: string }> {
    const user = await this.usersService.findByLoginIdentifier(identifier);
    await this.auditService.record({
      event: 'AUTH_PASSWORD_RESET_REQUESTED',
      actorId: user?.id ?? null,
      entityType: 'user',
      entityId: user?.id ?? null,
      ip,
      userAgent,
      metadata: { account_found: Boolean(user) },
    });

    if (!user) return { delivered_mechanism: 'TBC' };

    const rawToken = randomBytes(32).toString('hex');
    await this.resetTokens.insert(
      this.resetTokens.create({
        user_id: user.id,
        token_hash: sha256(rawToken),
        expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      }),
    );

    // Delivery channel (email/SMS) is TBC per BRD. Outside production the raw
    // token is returned in the response for manual testing only.
    const isProduction = this.configService.get('app')?.env === 'production';
    return {
      delivered_mechanism: 'TBC',
      ...(isProduction ? {} : { reset_token: rawToken }),
    };
  }

  async resetPassword(
    dto: ResetPasswordDto,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const stored = await this.resetTokens.findOne({
      where: { token_hash: sha256(dto.token) },
    });

    if (!stored || stored.used_at || stored.expires_at.getTime() < Date.now()) {
      throw new BadRequestException({
        message: 'Invalid or expired reset token',
        code: 'RESET_TOKEN_INVALID',
        details: null,
      });
    }

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    await this.dataSource.transaction(async (manager) => {
      const user = await manager
        .getRepository(UserEntity)
        .findOne({ where: { id: stored.user_id } });
      if (!user) {
        throw new BadRequestException({
          message: 'Invalid or expired reset token',
          code: 'RESET_TOKEN_INVALID',
          details: null,
        });
      }

      user.password_hash = password_hash;
      user.updated_by = user.id;
      await manager.getRepository(UserEntity).save(user);

      stored.used_at = new Date();
      await manager.getRepository(PasswordResetTokenEntity).save(stored);

      // Revoke every still-active refresh token of the user (TC-AUTH-031).
      await manager
        .getRepository(RefreshTokenEntity)
        .update(
          { user_id: user.id, revoked_at: IsNull() },
          { revoked_at: new Date() },
        );
    });

    await this.auditService.record({
      event: 'AUTH_PASSWORD_RESET',
      actorId: stored.user_id,
      entityType: 'user',
      entityId: stored.user_id,
      ip,
      userAgent,
    });
  }

  async getOwnProfile(userId: string): Promise<UserProfile> {
    const profile = await this.usersService.getProfile(userId);
    if (!profile) {
      throw new UnauthorizedException({
        message: 'Invalid token subject',
        code: 'UNAUTHORIZED',
        details: null,
      });
    }
    if (profile.status !== 'ACTIVE') {
      throw new ForbiddenException({
        message: 'Account is disabled',
        code: 'ACCOUNT_DISABLED',
        details: null,
      });
    }
    return profile;
  }

  async updateOwnProfile(
    userId: string,
    dto: { full_name?: string; email?: string; mobile_number?: string; phone?: string; avatar?: string | null; dob?: string | null; dateOfBirth?: string | null },
  ): Promise<UserProfile> {
    await this.getOwnProfile(userId);
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        message: 'Invalid token subject',
        code: 'UNAUTHORIZED',
        details: null,
      });
    }
    const rawMobile = (dto.mobile_number || dto.phone || '').trim();
    const cleanMobile = rawMobile ? rawMobile.replace(/\D/g, '').slice(-10) : undefined;
    const cleanEmail = dto.email !== undefined ? (dto.email ? dto.email.trim().toLowerCase() : null) : undefined;
    const dobValue = dto.dob !== undefined ? dto.dob : dto.dateOfBirth;
    const updated = await this.usersService.updateProfile(user, {
      full_name: dto.full_name ? dto.full_name.trim() : undefined,
      email: cleanEmail,
      mobile_number: cleanMobile,
      avatar: dto.avatar,
      dob: dobValue !== undefined ? dobValue : undefined,
    });
    await this.auditService.record({
      event: 'AUTH_PROFILE_UPDATED',
      actorId: userId,
      entityType: 'user',
      entityId: userId,
    });
    return updated;
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        message: 'Invalid token subject',
        code: 'UNAUTHORIZED',
        details: null,
      });
    }

    const passwordOk = await bcrypt.compare(dto.current_password, user.password_hash);
    if (!passwordOk) {
      throw new BadRequestException({
        message: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD',
        details: null,
      });
    }

    if (dto.current_password === dto.new_password) {
      throw new BadRequestException({
        message: 'New password cannot be identical to current password',
        code: 'SAME_PASSWORD',
        details: null,
      });
    }

    const password_hash = await bcrypt.hash(dto.new_password, BCRYPT_ROUNDS);
    await this.usersService.updatePassword(user, password_hash);

    await this.auditService.record({
      event: 'AUTH_PASSWORD_CHANGED',
      actorId: userId,
      entityType: 'user',
      entityId: userId,
      ip,
      userAgent,
    });

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  /**
   * Loads a user profile or fails loudly — after a successful auth operation the
   * profile must exist; a miss means data inconsistency, not a client error.
   */
  private async profileOrThrow(userId: string): Promise<UserProfile> {
    const profile = await this.usersService.getProfile(userId);
    if (!profile) {
      throw new InternalServerErrorException({
        message: 'Profile not found after authentication',
        code: 'PROFILE_NOT_FOUND',
        details: null,
      });
    }
    return profile;
  }

  private refreshTokenExpiry(): Date {
    return new Date(
      Date.now() +
        parseDurationToMs(
          this.configService.get('auth')?.jwtRefreshExpiresIn ?? '7d',
        ),
    );
  }

  private async signAccessToken(
    userId: string,
    roles: string[],
  ): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, roles },
      {
        secret: this.configService.get('auth')?.jwtSecret,
        expiresIn: this.configService.get('auth')?.jwtExpiresIn ?? '1h',
      },
    );
  }

  private async issueTokens(
    user: UserEntity,
    ip: string | null,
    userAgent: string | null,
  ): Promise<AuthTokens> {
    const profile = await this.profileOrThrow(user.id);
    const access_token = await this.signAccessToken(
      user.id,
      profile.roles.map((r) => r.name),
    );

    const rawToken = randomBytes(48).toString('hex');
    const saved = await this.refreshTokens.save(
      this.refreshTokens.create({
        user_id: user.id,
        token_hash: sha256(rawToken),
        expires_at: this.refreshTokenExpiry(),
      }),
    );

    await this.auditService.record({
      event: 'AUTH_TOKEN_ISSUED',
      actorId: user.id,
      entityType: 'refresh_token',
      entityId: saved.id,
      ip,
      userAgent,
    });

    return { access_token, refresh_token: rawToken };
  }

  private async verifyMemberAccessOrThrow(
    userId: string,
    ip: string | null = null,
    userAgent: string | null = null,
  ): Promise<void> {
    const profile = await this.profileOrThrow(userId);
    const roleNames = profile.roles.map((r) => r.name);
    const isStaffOrAdmin = roleNames.some((r) =>
      [
        'SUPER_ADMIN',
        'ADMIN',
        'STATE_PRESIDENT',
        'DISTRICT_PRESIDENT',
        'CALL_CENTER_EXECUTIVE',
        'ACCOUNTANT',
      ].includes(r),
    );

    // Administrative staff are exempt from member review gates
    if (isStaffOrAdmin) {
      return;
    }

    const latestMembership = await this.dataSource
      .getRepository(MembershipEntity)
      .findOne({
        where: { user_id: userId },
        order: { created_at: 'DESC' },
      });

    if (!latestMembership) {
      return;
    }

    if (latestMembership.status === MembershipStatus.REJECTED) {
      await this.auditService.record({
        event: 'AUTH_LOGIN_BLOCKED_MEMBERSHIP_REJECTED',
        actorId: userId,
        entityType: 'user',
        entityId: userId,
        ip,
        userAgent,
      });
      throw new ForbiddenException({
        message: 'Your membership application has been rejected by administration. Access to the portal and app is denied.',
        code: 'MEMBERSHIP_REJECTED',
        details: { rejection_reason: latestMembership.rejection_reason },
      });
    }

    if (
      latestMembership.status === MembershipStatus.PENDING ||
      latestMembership.status === MembershipStatus.UNDER_REVIEW
    ) {
      await this.auditService.record({
        event: 'AUTH_LOGIN_BLOCKED_MEMBERSHIP_PENDING',
        actorId: userId,
        entityType: 'user',
        entityId: userId,
        ip,
        userAgent,
      });
      throw new ForbiddenException({
        message: 'Your membership application is currently under review. Access will be activated once approved by administration.',
        code: 'MEMBERSHIP_UNDER_REVIEW',
        details: { status: latestMembership.status },
      });
    }

    if (
      latestMembership.status === MembershipStatus.SUSPENDED ||
      latestMembership.status === MembershipStatus.CANCELLED
    ) {
      await this.auditService.record({
        event: 'AUTH_LOGIN_BLOCKED_MEMBERSHIP_SUSPENDED',
        actorId: userId,
        entityType: 'user',
        entityId: userId,
        ip,
        userAgent,
      });
      throw new ForbiddenException({
        message: 'Your membership account has been suspended. Contact the HRSJM office.',
        code: 'ACCOUNT_DISABLED',
        details: null,
      });
    }
  }
}
