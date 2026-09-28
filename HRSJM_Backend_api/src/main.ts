import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./shared/filters/http-exception.filter";
import { ApiConfigService } from "./shared/helpers/api-config.service";
import { TransformInterceptor } from "./shared/interceptors/transform.interceptor";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ApiConfigService);

  // Hardening: refuse to boot production with default credentials (BRD §18)
  if (config.isProduction) {
    if (config.jwtSecret === "changeme-dev-secret" || config.jwtSecret === "mysupersecretjwt") {
      throw new Error("Refusing to start production with a default JWT_SECRET. Set JWT_SECRET in the environment.");
    }
  }

  if (config.corsEnabled) {
    app.enableCors({
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    });
  }

  // BRD standard: all endpoints live under /api/v1
  app.setGlobalPrefix(config.apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("HRSJM Backend API")
    .setDescription(
      "HRSJM NGO backend API - auth & users (RBAC), memberships & digital ID, renewals, " +
        "documents, assistance requests, support tickets, notifications, admin dashboard, " +
        "income receipts (credit entry) and donations.",
    )
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  await app.listen(config.appPort);
  Logger.log(
    `HRSJM API listening on http://localhost:${config.appPort} (docs: /docs)`,
    "Bootstrap",
  );
}

bootstrap();