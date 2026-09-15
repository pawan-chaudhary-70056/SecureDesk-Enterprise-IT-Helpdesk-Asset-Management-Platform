import { Module } from "@nestjs/common";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";
import { SlaModule } from "../../sla/sla.module";
import { AuditModule } from "../../audit/audit.module";
import { JobsModule } from "../../jobs/jobs.module";

@Module({
  imports: [SlaModule, AuditModule, JobsModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
