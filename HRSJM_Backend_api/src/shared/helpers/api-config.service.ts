import { ConfigService } from "@nestjs/config";
import { Injectable } from "@nestjs/common";

@Injectable()
export class ApiConfigService {
  constructor(protected readonly configService: ConfigService) {}

  getNumber(key: string, fallback = 0): number {
    const value = this.configService.get(key);
    return value === undefined ? fallback : Number(value);
  }

  getBoolean(key: string, fallback = false): boolean {
    const value = this.configService.get(key);
    if (value === undefined) {
      return fallback;
    }
    return value === "true" || value === true;
  }

  getString(key: string, fallback = ""): string {
    return this.configService.get(key) ?? fallback;
  }

  get appEnv(): string {
    return this.getString("APP_ENV", "development");
  }

  get isDevelopment(): boolean {
    return this.appEnv === "development";
  }

  get isProduction(): boolean {
    return this.appEnv === "production";
  }

  get appPort(): number {
    return this.getNumber("APP_PORT", 3000);
  }

  get apiPrefix(): string {
    return this.getString("API_PREFIX", "api/v1");
  }

  get corsEnabled(): boolean {
    return this.getBoolean("CORS_ENABLED", true);
  }

  get dbHost(): string {
    return this.getString("DATABASE_HOST", "localhost");
  }

  get dbPort(): number {
    return this.getNumber("DATABASE_PORT", 5432);
  }

  get dbUsername(): string {
    return this.getString("DATABASE_USER", "postgres");
  }

  get dbPassword(): string {
    return this.getString("DATABASE_PASSWORD", "");
  }

  get dbName(): string {
    return this.getString("DATABASE_NAME", "hrsjm");
  }

  get dbSsl(): boolean {
    return this.getBoolean("DATABASE_SSL", false);
  }

  get dbLogging(): boolean {
    return this.getBoolean("DATABASE_LOGGING", false);
  }

  get documentMaxSizeBytes(): number {
    return this.getNumber("DOCUMENT_MAX_SIZE_MB", 5) * 1024 * 1024;
  }

  // Renewal policy - deliberately env-driven until HRSJM confirms the final
  // fee schedule and duration options (BRD: do not hard-code the policy).
  get renewalFeePerYear(): string {
    return this.getString("RENEWAL_FEE_PER_YEAR", "500.00");
  }

  get renewalAllowedPeriods(): number[] {
    return this.getString("RENEWAL_ALLOWED_PERIODS", "1,2,5")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  get jwtSecret(): string {
    return this.getString("JWT_SECRET", "changeme-dev-secret");
  }

  get jwtExpiresIn(): string {
    return this.getString("JWT_EXPIRES_IN", "1h");
  }

  get jwtRefreshExpiresIn(): string {
    return this.getString("JWT_REFRESH_EXPIRES_IN", "7d");
  }
}
