import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });

  // BRD standard: all endpoints live under /api/v1
  app.setGlobalPrefix("api/v1");

  const config = new DocumentBuilder()
    .setTitle("HRSJM Backend API")
    .setDescription(
      "HRSJM NGO backend - member registration, events, donations, news and media management",
    )
    .setVersion("0.1")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`HRSJM API listening on http://localhost:${port} (docs: /docs)`);
}

bootstrap();
