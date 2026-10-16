import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bodyParser: false,
  });

  app.use(
    json({
      limit: '50mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  app.setGlobalPrefix('api/v1');

  // Security headers via Helmet
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  // Environment-aware, origin-restricted CORS
  const isProduction =
    (process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development').toLowerCase() ===
    'production';

  const defaultDevOrigins = [
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:8089',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8082',
    'http://127.0.0.1:8089',
  ];

  const configuredOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [];

  const allowedOrigins =
    configuredOrigins.length > 0
      ? configuredOrigins
      : isProduction
        ? [] // In production, require explicit CORS_ORIGINS
        : defaultDevOrigins;

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (e.g. Android native app, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // In non-production, allow localhost/127.0.0.1 on any port
      if (!isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      const isAllowed = allowedOrigins.some((allowed) => {
        if (allowed === '*') return true;
        if (allowed.startsWith('*.')) {
          const suffix = allowed.slice(1); // e.g. .hrsjm.org
          return origin.endsWith(suffix);
        }
        return origin === allowed;
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS origin '${origin}' not allowed by policy`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-idempotency-key',
      'x-webhook-timestamp',
      'x-webhook-signature',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger Documentation: enabled in development, disabled in production unless SWAGGER_ENABLED=true
  const swaggerEnabled =
    process.env.SWAGGER_ENABLED === 'true' || !isProduction;

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('HRSJM Backend API')
      .setDescription(
        'HRSJM Digital Membership & Donation Platform — REST API (core backend + financial engine)',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(process.env.APP_PORT ?? 3000);
  await app.listen(port);
  console.log(
    `HRSJM API running at http://localhost:${port}/api/v1 — Swagger: ${
      swaggerEnabled ? `http://localhost:${port}/docs` : 'disabled'
    }`,
  );
}

bootstrap();
