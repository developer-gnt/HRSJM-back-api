import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuditModule } from '../audit/audit.module';
import { RefreshTokenEntity } from '../users/entities/refresh-token.entity';
import { UserEntity } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { PasswordResetTokenEntity } from '../users/entities/password-reset-token.entity';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { PasswordResetDeliveryService } from './delivery/password-reset-delivery.service';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      RefreshTokenEntity,
      PasswordResetTokenEntity,
    ]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('auth')?.jwtSecret,
        signOptions: {
          expiresIn: configService.get('auth')?.jwtExpiresIn ?? '1h',
        },
      }),
    }),
    UsersModule,
    AuditModule,
    MailModule,
    NotificationsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard, PasswordResetDeliveryService],
  exports: [AuthService, OptionalJwtAuthGuard, PasswordResetDeliveryService],
})
export class AuthModule {}
