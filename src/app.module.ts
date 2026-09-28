import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import { HealthModule } from './health/health.module';
import { AssistanceModule } from './modules/assistance/assistance.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { MembershipCategoriesModule } from './modules/membership-categories/membership-categories.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { MembershipPaymentsModule } from './modules/membership-payments/membership-payments.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { RolesModule } from './modules/roles/roles.module';
import { SupportModule } from './modules/support/support.module';
import { UsersModule } from './modules/users/users.module';
import { ExpenseEntriesModule } from './modules/expense-entries/expense-entries.module';
import { ReceiptEntriesModule } from './modules/receipt-entries/receipt-entries.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DonationsModule } from './modules/donations/donations.module';
import { DonationPaymentsModule } from './modules/donation-payments/donation-payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import paymentConfig from './config/payment.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, authConfig, paymentConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow('database'),
    }),
    HealthModule,
    AuditModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    AuthModule,
    MembershipCategoriesModule,
    MembershipsModule,
    MembershipPaymentsModule,
    AccountingModule,
    ExpenseEntriesModule,
    ReceiptEntriesModule,
    DonationsModule,
    DonationPaymentsModule,
    DocumentsModule,
    AssistanceModule,
    SupportModule,
    ReportsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
