import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe as NestValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { json, urlencoded } from "express";
import { AppModule } from "./app/app.module";
import { applyApiPrefix } from "./app/routes";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { requestIdMiddleware } from "./common/middleware/request-id.middleware";
import { httpLoggerMiddleware } from "./common/middleware/http-logger.middleware";
import { loadConfig } from "./config/configuration";

async function bootstrap(): Promise<void> {
  // Fail fast on invalid configuration before touching the DB.
  const config = loadConfig();
  if (config.isProduction && config.JWT_ACCESS_SECRET.includes("change-me")) {
    throw new Error("Refusing to run in production with a development JWT secret");
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn", "log"],
  });

  applyApiPrefix(app);
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(httpLoggerMiddleware);
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));
  app.enableCors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  });
  app.useGlobalPipes(
    new NestValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.set("trust proxy", 1);
  app.enableShutdownHooks();

  // OpenAPI documentation (spec §23)
  const swaggerConfig = new DocumentBuilder()
    .setTitle("SecureDesk API")
    .setDescription("Enterprise IT Helpdesk & Asset Management API")
    .setVersion("1.0")
    .addBearerAuth()
    .addCookieAuth("securedesk_rt")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(config.PORT, "0.0.0.0");
  console.log(`SecureDesk API listening on http://localhost:${config.PORT}/api/v1 (docs: /api/docs)`);
}

void bootstrap();
