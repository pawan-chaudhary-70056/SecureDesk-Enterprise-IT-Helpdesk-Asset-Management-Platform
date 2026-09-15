import { Module } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { NotificationsModule } from "../modules/notifications/notifications.module";
import { SlaModule } from "../sla/sla.module";

@Module({
  imports: [NotificationsModule, SlaModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
