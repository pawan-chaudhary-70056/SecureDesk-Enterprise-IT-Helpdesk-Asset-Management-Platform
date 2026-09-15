import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, RequirePermissions, PermissionsGuard } from "../../common/guards/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../../common/guards/auth.guard";
import { NotificationsService } from "./notifications.service";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

const updatePrefsSchema = z.object({
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
});

const markReadSchema = z.object({
  ids: z.array(z.string().min(1)).max(200),
});

@Controller("notifications")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("notification:read:own")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query("unreadOnly") unreadOnly?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const p = Math.max(1, Number(page ?? 1) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize ?? 25) || 25));
    const [items, counts] = await Promise.all([
      this.notifications.listMine(user.id, unreadOnly === "true", p, ps),
      this.notifications.countMine(user.id),
    ]);
    return { items, page: p, pageSize: ps, ...counts };
  }

  @Post("mark-read")
  async markRead(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(markReadSchema)) dto: { ids: string[] }) {
    await this.notifications.markRead(user.id, dto.ids);
    return { success: true };
  }

  @Post("mark-all-read")
  async markAllRead(@CurrentUser() user: RequestUser) {
    await this.notifications.markAllRead(user.id);
    return { success: true };
  }

  @Get("preferences")
  preferences(@CurrentUser() user: RequestUser) {
    return this.notifications.getPreferences(user.id);
  }

  @Patch("preferences")
  updatePreferences(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(updatePrefsSchema)) dto: { emailEnabled: boolean; inAppEnabled: boolean }) {
    return this.notifications.updatePreferences(user.id, dto);
  }
}
