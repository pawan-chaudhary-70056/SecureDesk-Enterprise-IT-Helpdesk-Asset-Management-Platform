import { Module } from "@nestjs/common";
import { SlaController } from "./sla.controller";
import { SlaService } from "./sla.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [SlaController],
  providers: [SlaService],
  exports: [SlaService],
})
export class SlaModule {}
