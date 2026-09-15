import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from "../common/guards/auth.guard";
import { SlaService } from "./sla.service";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";

const createPolicySchema = z.object({
  name: z.string().trim().min(2).max(120),
  categoryId: z.string().nullish(),
  firstResponseMinutes: z.number().int().positive().max(60 * 24 * 30),
  resolutionMinutes: z.number().int().positive().max(60 * 24 * 365),
});

const updatePolicySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  firstResponseMinutes: z.number().int().positive().max(60 * 24 * 30).optional(),
  resolutionMinutes: z.number().int().positive().max(60 * 24 * 365).optional(),
  isActive: z.boolean().optional(),
});

@Controller("sla")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  @Get()
  @RequirePermissions("sla:manage", "report:read")
  list() {
    return this.sla.listPolicies();
  }

  @Post()
  @RequirePermissions("sla:manage")
  create(@Body(new ZodValidationPipe(createPolicySchema)) dto: { name: string; categoryId?: string | null; firstResponseMinutes: number; resolutionMinutes: number }) {
    return this.sla.createPolicy(dto);
  }

  @Patch(":id")
  @RequirePermissions("sla:manage")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updatePolicySchema)) dto: { name?: string; firstResponseMinutes?: number; resolutionMinutes?: number; isActive?: boolean }) {
    return this.sla.updatePolicy(id, dto);
  }
}
