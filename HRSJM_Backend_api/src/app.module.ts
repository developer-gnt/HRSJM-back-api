import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ApiConfigService } from "./shared/helpers/api-config.service";
import { JwtAuthGuard } from "./shared/guards/jwt-auth.guard";
import { RolesGuard } from "./shared/guards/roles.guard";
import { SharedModule } from "./shared/shared.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AssistanceModule } from "./modules/assistance/assistance.module";
import { AccountingModule } from "./modules/accounting/accounting.module";
import { ReceiptsModule } from "./modules/receipts/receipts.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { DonationsModule } from "./modules/donations/donations.module";
import { HealthModule } from "./modules/health/health.module";
import { MembershipsModule } from "./modules/memberships/memberships.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { RenewalsModule } from "./modules/renewals/renewals.module";
import { SupportModule } from "./modules/support/support.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    TypeOrmModule.forRootAsync({
      inject: [ApiConfigService],
      useFactory: (configService: ApiConfigService) => ({
        type: "postgres" as const,
        host: configService.dbHost,
        port: configService.dbPort,
        username: configService.dbUsername,
        password: configService.dbPassword,
        database: configService.dbName,
        autoLoadEntities: true,
        // Entities are registered per module phase via forFeature().
        // Production must stay on migrations (BRD rule) - SYNC_DB only in dev.
        synchronize: configService.isDevelopment,
        logging: configService.dbLogging,
        ssl: configService.dbSsl ? { rejectUnauthorized: false } : false,
      }),
    }),
    SharedModule,
    HealthModule,
    UsersModule,
    MembershipsModule,
    RenewalsModule,
    DocumentsModule,
    AssistanceModule,
    SupportModule,
    NotificationsModule,
    AdminModule,
    AccountingModule,
    ReceiptsModule,
    DonationsModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}