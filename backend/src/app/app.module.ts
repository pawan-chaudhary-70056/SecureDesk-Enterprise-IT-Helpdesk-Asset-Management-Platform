import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import configuration from "../config/configuration";
import { PrismaModule } from "../database/prisma.module";
import { JwtAuthGuard, PermissionsGuard } from "../common/guards/auth.guard";
import { HealthController } from "./health.controller";
import { AuthModule } from "../modules/auth/auth.module";
import { TicketsModule } from "../modules/tickets/tickets.module";
import { AssetsModule } from "../modules/assets/assets.module";
import { UsersModule } from "../modules/users/users.module";
import { CategoriesModule } from "../modules/categories/categories.module";
import { NotificationsModule } from "../modules/notifications/notifications.module";
import { SlaModule } from "../sla/sla.module";
import { AuditReadModule } from "../modules/audit/audit.module";
import { ReportsModule } from "../modules/reports/reports.module";
import { JobsModule } from "../jobs/jobs.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    JwtModule.register({ global: true, secret: process.env.JWT_ACCESS_SECRET }),
    PrismaModule,
    AuthModule,
    TicketsModule,
    AssetsModule,
    UsersModule,
    CategoriesModule,
    NotificationsModule,
    SlaModule,
    AuditReadModule,
    ReportsModule,
    JobsModule,
  ],
  controllers: [HealthController],
  // Global guards run for every route; Public decorator opts out of auth.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
