import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ApiConfigService } from "./shared/helpers/api-config.service";
import { SharedModule } from "./shared/shared.module";
import { HealthModule } from "./modules/health/health.module";

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
        // Phase 0 has no entities yet - they arrive with each module phase,
        // registered here as they are created.
        entities: [],
        synchronize: configService.isDevelopment,
        logging: configService.dbLogging,
        ssl: configService.dbSsl ? { rejectUnauthorized: false } : false,
      }),
    }),
    SharedModule,
    HealthModule,
  ],
})
export class AppModule {}
