import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";
import { AuditModule } from "../../audit/audit.module";
import { JobsModule } from "../../jobs/jobs.module";

@Module({
  imports: [AuditModule, JobsModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
